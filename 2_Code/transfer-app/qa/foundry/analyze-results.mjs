/**
 * Reads the Playwright JSON results, asks the Foundry agent "bu-transfer-qa-analyst" to write the QA report,
 * saves qa-report.md and adds it to the GitHub run's Summary page.
 * If Foundry can't be reached, it writes a plain report instead, so the build never breaks on the AI step.
 * Sends only test titles, statuses, short error messages and changed file names: never source code or secrets.
 *
 * Usage: node foundry/analyze-results.mjs [test-results/results.json] [qa-report.md]
 * Env:   FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_QA_AGENT_NAME, BASE_URL, CHANGED_FILES, COMMIT_MESSAGE (+ GitHub's own vars)
 */
import 'dotenv/config';
import fs from 'node:fs';
import { DefaultAzureCredential } from '@azure/identity';
import { AIProjectClient } from '@azure/ai-projects';

const [resultsPath = 'test-results/results.json', outPath = 'qa-report.md'] = process.argv.slice(2);
const env = process.env;

// ---------- 1. Flatten the Playwright JSON report ----------
function collect(suite, file, out) {
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const last = t.results?.[t.results.length - 1] || {};
      const status = t.status === 'expected' ? 'passed' : t.status === 'unexpected' ? 'failed' : t.status === 'flaky' ? 'flaky' : 'skipped';
      const title = [...(suite.title && suite.title !== file ? [suite.title] : []), spec.title].join(' › ');
      const bug = title.match(/BUG #(\d+)/);
      out.push({
        title,
        file: spec.file || file,
        project: t.projectName,
        status,
        duration_ms: last.duration ?? 0,
        requirements: [...new Set(title.match(/R\d+/g) || [])],
        known_bug: bug ? Number(bug[1]) : null,
        ai_generated: t.projectName === 'ai-generated' || title.includes('[AI]'),
        skip_reason: status === 'skipped' ? (t.annotations || []).map((a) => a.description).filter(Boolean).join('; ') || undefined : undefined,
        error: status === 'failed'
          ? String(last.error?.message || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n').slice(0, 600)
          : undefined,
      });
    }
  }
  for (const child of suite.suites || []) collect(child, file || child.file, out);
}

if (!fs.existsSync(resultsPath)) {
  const msg = `## QA report\n**Verdict:** ❌ Blocked: the tests didn't produce results (${resultsPath} missing). Check the "Run Playwright tests" step log.`;
  fs.writeFileSync(outPath, msg);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, msg + '\n');
  fs.writeFileSync('qa-summary.json', JSON.stringify({ regressions: 1, known_bug_failures: 0 }));
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const tests = [];
for (const s of raw.suites || []) collect(s, s.file, tests);

const count = (st) => tests.filter((t) => t.status === st).length;
const failed = tests.filter((t) => t.status === 'failed');
// AI-written tests may themselves be wrong, so their failures are reported separately, never as regressions
const regressions = failed.filter((t) => !t.known_bug && !t.ai_generated);
const aiTests = tests.filter((t) => t.ai_generated);
let aiStatus = null;
try { aiStatus = JSON.parse(fs.readFileSync('tests/generated/ai-status.json', 'utf8')); } catch {}
const summary = {
  total: tests.length, passed: count('passed'), failed: failed.length, flaky: count('flaky'), skipped: count('skipped'),
  regressions: regressions.length, known_bug_failures: failed.filter((t) => t.known_bug).length,
  ai_tests: { generated: aiStatus?.generated ?? false, note: aiStatus?.reason || null, total: aiTests.length,
    passed: aiTests.filter((t) => t.status === 'passed').length, failed: aiTests.filter((t) => t.status === 'failed').length },
};

const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
const payload = {
  build: {
    commit: (env.GITHUB_SHA || 'local').slice(0, 7), branch: env.GITHUB_REF_NAME || 'local',
    message: env.COMMIT_MESSAGE || null, run_url: runUrl, target_url: env.BASE_URL || null,
  },
  changed_files: (env.CHANGED_FILES || '').split('\n').filter(Boolean).slice(0, 100),
  summary,
  tests,
};

// ---------- 2. Ask the Foundry agent ----------
async function askAgent() {
  if (!env.FOUNDRY_PROJECT_ENDPOINT) throw new Error('FOUNDRY_PROJECT_ENDPOINT not set');
  const project = new AIProjectClient(env.FOUNDRY_PROJECT_ENDPOINT, new DefaultAzureCredential());
  const client = project.getOpenAIClient();
  const agentRef = { body: { agent_reference: { type: 'agent_reference', name: env.FOUNDRY_QA_AGENT_NAME || 'bu-transfer-qa-analyst' } } };
  const conversation = await client.conversations.create();
  try {
    const response = await client.responses.create({ conversation: conversation.id, input: JSON.stringify(payload) }, agentRef);
    const text = response.output_text
      || (response.output || []).filter((i) => i.type === 'message').flatMap((m) => m.content || []).map((c) => c.text || '').join('\n');
    if (!text.trim()) throw new Error('Agent returned an empty report');
    return text.trim();
  } finally {
    await client.conversations.delete(conversation.id).catch(() => {});
  }
}

// ---------- 3. Plain fallback report (no AI) ----------
function fallbackReport(reason) {
  const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const verdict = regressions.length ? '❌ Blocked: new regressions' : failed.length ? '⚠️ Ready with known issues' : '✅ Ready';
  return [
    `## QA report · ${payload.build.commit} · ${payload.build.branch}`,
    `**Verdict:** ${verdict}`,
    `**Results:** ${summary.passed} passed · ${summary.failed} failed (${summary.regressions} new regressions, ${summary.known_bug_failures} known bugs) · ${summary.skipped} skipped · target ${payload.build.target_url}`,
    '', `_AI analysis unavailable (${reason}); showing the plain summary._`, '',
    '### New regressions',
    regressions.length ? ['| Test | Project | Error |', '|---|---|---|', ...regressions.map((t) => `| ${cell(t.title)} | ${t.project} | ${cell((t.error || '').split('\n')[0]).slice(0, 160)} |`)].join('\n') : 'None',
    '', '### AI-written tests for this build',
    aiTests.length ? aiTests.map((t) => `- ${t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭'} ${t.title}${t.error ? ` — ${(t.error || '').split('\n')[0].slice(0, 120)}` : ''}`).join('\n')
      : `None (${summary.ai_tests.note || 'not generated'})`,
    '', '### Known bugs still failing',
    failed.filter((t) => t.known_bug).map((t) => `- #${t.known_bug} ${t.title}`).join('\n') || 'None',
  ].join('\n');
}

let report;
try {
  report = await askAgent();
  console.log('[QA] Report written by the Foundry agent.');
} catch (err) {
  console.warn(`[QA] Foundry agent unavailable: ${err.message}`);
  report = fallbackReport(err.message);
}

const footer = `\n\n---\nFull HTML report with screenshots and traces: the **playwright-report** artifact${runUrl ? ` on [this run](${runUrl})` : ''}.`;
fs.writeFileSync(outPath, report + footer);
if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, report + footer + '\n');
fs.writeFileSync('qa-summary.json', JSON.stringify(summary));
console.log(`[QA] ${summary.passed} passed, ${summary.failed} failed (${summary.regressions} regressions), ${summary.skipped} skipped → ${outPath}`);
