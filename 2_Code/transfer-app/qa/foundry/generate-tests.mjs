/**
 * Asks the Foundry agent "bu-transfer-test-writer" to write Playwright tests for this build, checks them,
 * and saves them to tests/generated/ai-tests.spec.js so `npx playwright test` runs them straight away.
 * Nothing is committed: the file only exists in the CI run (it's also attached to the run as an artifact).
 *
 * Sent to the agent: commit message and changed file names only (no source code).
 * Safety: the code must import from ./guard (blocks every write request) and passes a static check first.
 * Never fails the build: if anything goes wrong, no AI tests are added and the reason is logged.
 *
 * Env: FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_TEST_AGENT_NAME, CHANGED_FILES, COMMIT_MESSAGE, GITHUB_SHA
 */
import 'dotenv/config';
import fs from 'node:fs';
import vm from 'node:vm';
import { askAI, aiMode } from './llm.mjs';

const env = process.env;
const OUT = 'tests/generated/ai-tests.spec.js';
const STATUS = 'tests/generated/ai-status.json';

const done = (ok, reason, extra = {}) => {
  fs.writeFileSync(STATUS, JSON.stringify({ generated: ok, reason, ...extra }, null, 2));
  console.log(`[AI tests] ${ok ? 'Generated' : 'Skipped'}: ${reason}`);
  process.exit(0);
};

// Remove tests from a previous run so a failed generation never re-runs stale code
fs.rmSync(OUT, { force: true });

const changed = (env.CHANGED_FILES || '').split('\n').map((s) => s.trim()).filter(Boolean);
const appFiles = changed.filter((f) => f.startsWith('2_Code/transfer-app/frontend/') || f.startsWith('2_Code/transfer-app/backend/'));
if (!aiMode()) done(false, 'AI not configured (QA_AGENT_SECRET, FOUNDRY_API_KEY or Azure login)');

const request = {
  commit: (env.GITHUB_SHA || 'local').slice(0, 7),
  commit_message: env.COMMIT_MESSAGE || '',
  changed_files: (appFiles.length ? appFiles : changed).map((f) => f.replace('2_Code/transfer-app/', '')).slice(0, 80),
  note: appFiles.length ? 'Write tests for the areas these files affect.' : 'No app files changed: write smoke tests for the main public pages.',
};

// ---------- Ask the AI (API key or Foundry agent, see llm.mjs) ----------
let text;
try {
  text = await askAI({
    role: 'test-writer',
    instructionsFile: 'test-writer-instructions.md',
    agentName: env.FOUNDRY_TEST_AGENT_NAME || 'bu-transfer-test-writer',
    input: JSON.stringify(request),
  });
} catch (err) {
  done(false, `AI call failed: ${err.message}`);
}

// ---------- Extract and check the code ----------
const match = (text || '').match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
const code = (match ? match[1] : text || '').trim();
if (!code) done(false, 'agent returned no code');

const problems = [];
if (!/require\(\s*['"]\.\/guard['"]\s*\)/.test(code)) problems.push("doesn't import ./guard");
const requires = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
if (requires.some((r) => r !== './guard')) problems.push(`imports other modules: ${requires.filter((r) => r !== './guard').join(', ')}`);
const banned = [
  [/\bimport\s+[\w{*]/, 'ES import'], [/child_process|\bprocess\.|\beval\s*\(|\bFunction\s*\(/, 'system access'],
  [/\bfs\.|require\(['"]fs['"]\)/, 'file system'], [/\.(post|put|patch|delete)\s*\(/, 'write request'],
  [/password|fill\([^)]*['"]\S*@\S*['"][^)]*\)[\s\S]{0,80}Sign In/i, 'login attempt'],
  [/getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*['"](Confirm|Approve|Reject|Delete|Save)/i, 'clicks a write button'],
];
for (const [re, label] of banned) if (re.test(code)) problems.push(label);
try { new vm.Script(code, { filename: 'ai-tests.spec.js' }); } catch (e) { problems.push(`syntax error: ${e.message}`); }
const count = (code.match(/\btest\s*\(\s*['"`]/g) || []).length;
if (count === 0) problems.push('no tests found');
if (count > 12) problems.push(`too many tests (${count})`);

if (problems.length) done(false, `generated code rejected: ${problems.join('; ')}`);

fs.writeFileSync(OUT, `// AI-generated for commit ${request.commit} by ${env.FOUNDRY_TEST_AGENT_NAME || 'bu-transfer-test-writer'}. Not committed; runs once in CI.\n${code}\n`);
done(true, `${count} tests written to ${OUT}`, { tests: count, changed_files: request.changed_files });
