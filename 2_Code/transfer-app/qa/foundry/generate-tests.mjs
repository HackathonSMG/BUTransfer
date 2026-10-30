/**
 * The test-writer agent: writes Playwright tests for this build, tries them, fixes them, and saves the ones that
 * work to tests/generated/ai-tests.spec.js so `npx playwright test` runs them. Nothing is committed: the file only
 * exists in the CI run (it's also attached to the run as an artifact).
 *
 * 1. Looks at the real screens: opens the public pages read-only and records their structure (headings, buttons,
 *    labels, links) so the AI uses texts that exist instead of guessing.
 * 2. Asks the AI for tests (commit message, changed file names, page structure; never source code).
 * 3. Safety check on the code (must import ./guard, which blocks every write request; no files, processes, logins).
 * 4. Trial run. If tests fail, the errors go back to the AI once to fix them.
 * 5. Tests that still fail ONLY because they don't match the screen are switched off (test.skip) before the real
 *    run, so they never show up as bugs. Failures that point at the app (page errors, 5xx, redirects) are kept.
 * Never fails the build: if anything goes wrong, no AI tests are added and the reason is logged.
 *
 * Env: BASE_URL, FOUNDRY_* (see llm.mjs), FOUNDRY_TEST_AGENT_NAME, CHANGED_FILES, COMMIT_MESSAGE, GITHUB_SHA
 */
import 'dotenv/config';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { askAI, aiMode } from './llm.mjs';
import { isTestMistake, flatten } from './classify.mjs';

const env = process.env;
const OUT = 'tests/generated/ai-tests.spec.js';
const STATUS = 'tests/generated/ai-status.json';
const AGENT = env.FOUNDRY_TEST_AGENT_NAME || 'bu-transfer-test-writer';
const PAGES = ['/', '/apply', '/track', '/self-check', '/login'];

const done = (ok, reason, extra = {}) => {
  fs.writeFileSync(STATUS, JSON.stringify({ generated: ok, reason, ...extra }, null, 2));
  console.log(`[AI tests] ${ok ? 'Generated' : 'Skipped'}: ${reason}`);
  process.exit(0);
};

// Remove tests from a previous run so a failed generation never re-runs stale code
fs.rmSync(OUT, { force: true });
fs.rmSync('tests/generated/ai-rejected.js.txt', { force: true });

const changed = (env.CHANGED_FILES || '').split('\n').map((s) => s.trim()).filter(Boolean);
const appFiles = changed.filter((f) => f.startsWith('2_Code/transfer-app/frontend/') || f.startsWith('2_Code/transfer-app/backend/'));
if (!aiMode()) done(false, 'AI not configured (FOUNDRY_API_KEY or Azure login)');

// ---------- 1. Look at the real screens (read-only) ----------
async function pageSnapshots() {
  const out = {};
  if (!env.BASE_URL) return out;
  let browser;
  try {
    const pw = await import('@playwright/test');
    browser = await (pw.chromium || pw.default.chromium).launch();
    const page = await browser.newPage();
    // Same rule as guard.js: only reads reach the site
    await page.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort()));
    for (const p of PAGES) {
      try {
        await page.goto(new URL(p, env.BASE_URL).href, { waitUntil: 'networkidle', timeout: 25_000 });
        out[p] = { url_after_load: new URL(page.url()).pathname, structure: (await page.locator('body').ariaSnapshot()).slice(0, 6000) };
      } catch (e) {
        out[p] = { error: e.message.split('\n')[0] };
      }
    }
  } catch (e) {
    console.log(`[AI tests] could not read the pages (${e.message.split('\n')[0]}); the AI will use the app map only`);
  } finally {
    await browser?.close().catch(() => {});
  }
  return out;
}

// ---------- helpers ----------
const ask = async (input) => askAI({ role: 'test-writer', instructionsFile: 'test-writer-instructions.md', agentName: AGENT, input: JSON.stringify(input) });
const extract = (text) => ((text || '').match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/)?.[1] ?? text ?? '').trim();

function safetyProblems(code) {
  const problems = [];
  if (!/require\(\s*['"]\.\/guard['"]\s*\)/.test(code)) problems.push("doesn't import ./guard");
  const requires = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  if (requires.some((r) => r !== './guard')) problems.push(`imports other modules: ${requires.filter((r) => r !== './guard').join(', ')}`);
  const banned = [
    [/\bimport\s+[\w{*]/, 'ES import'], [/child_process|\bprocess\.|\beval\s*\(|\bFunction\s*\(/, 'system access'],
    [/\bfs\.|require\(['"]fs['"]\)/, 'file system'], [/\.(post|put|patch|delete)\s*\(/, 'write request'],
    // typing into the password field = a login attempt (checking the "Password is required" message is fine)
    [/getByLabel\(\s*\/?['"^]*Password[^)]*\)\s*\.(fill|type|press)|type=\\?['"]password\\?['"]\]?['"]?\)\s*\.(fill|type)/i, 'login attempt'],
    [/getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*\/?['"^]*(Confirm|Approve|Reject|Delete|Save|Submit for Credit)/i, 'clicks a write button'],
  ];
  for (const [re, label] of banned) if (re.test(code)) problems.push(label);
  try { new vm.Script(code, { filename: 'ai-tests.spec.js' }); } catch (e) { problems.push(`syntax error: ${e.message}`); }
  const count = countTests(code);
  if (count === 0) problems.push('no tests found');
  if (count > 12) problems.push(`too many tests (${count})`);
  return problems;
}
const countTests = (code) => (code.match(/\btest\s*\(\s*['"`]/g) || []).length;
const save = (code, note) => fs.writeFileSync(OUT, `// AI-generated for commit ${request.commit} by ${AGENT} (${note}). Not committed; runs once in CI.\n${code}\n`);

/** Each test's title and code: [{ title, body }]. */
function testBlocks(code) {
  const re = /\btest\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  const starts = [...code.matchAll(re)].map((m) => ({ title: m[2], at: m.index }));
  return starts.map((t, i) => ({ title: t.title, body: code.slice(t.at, starts[i + 1]?.at ?? code.length) }));
}

/** Texts a test looks for (locator names, expected texts) that are NOT on a real screen or in the app map. */
function guessedTexts(body) {
  const guessed = [];
  const calls = /\.(getByRole|getByText|getByLabel|getByPlaceholder|getByTitle|getByAltText|toHaveText|toContainText|toHaveTitle|filter)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  for (const [, fn, args] of body.matchAll(calls)) {
    // getByRole('button', { name: ... }): the role isn't a screen text, only its name is
    const scope = fn === 'getByRole' ? (args.match(/name\s*:\s*([\s\S]*)/)?.[1] || '') : args;
    for (const [, , str] of scope.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      if (str.trim().length >= 3 && !KNOWN_LOWER.includes(str.trim().toLowerCase())) guessed.push(str);
    }
    for (const [, src, flags] of scope.matchAll(/\/((?:\\.|[^\/\\\n])+)\/([a-z]*)/g)) {
      try { if (!new RegExp(src, flags.replace('g', '')).test(KNOWN)) guessed.push(`/${src}/${flags}`); } catch { guessed.push(`/${src}/`); }
    }
  }
  return guessed;
}

/** Runs only the AI tests once, no retries. Returns [{ title, status, error }] or null if it couldn't run. */
function trialRun() {
  const r = spawnSync('npx', ['playwright', 'test', '--project=ai-generated', '--reporter=json', '--retries=0'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32', timeout: 6 * 60_000,
    env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: '' },
  });
  try { return flatten(JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))); } catch { return null; }
}

/** Turns test('<title>', ...) into test.skip('<title>', ...) for the given titles. */
function switchOff(code, titles) {
  let out = code;
  for (const t of titles) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\btest\\s*\\(\\s*(['"\`])${esc}\\1`), (m, q) => `test.skip(${q}${t}${q}`);
  }
  return out;
}

// ---------- 2. Ask the AI ----------
const request = {
  commit: (env.GITHUB_SHA || 'local').slice(0, 7),
  commit_message: env.COMMIT_MESSAGE || '',
  changed_files: (appFiles.length ? appFiles : changed).map((f) => f.replace('2_Code/transfer-app/', '')).slice(0, 80),
  note: appFiles.length ? 'Write tests for the areas these files affect.' : 'No app files changed: write smoke tests for the main public pages.',
  page_structure: await pageSnapshots(),
};

const seen = Object.values(request.page_structure).filter((p) => p.structure).length;
if (!seen) done(false, 'could not read the live pages, so the AI could only guess: no AI tests this run');

// Every text an AI test may use must be on a real screen (page_structure) or in the documented app map.
const APP_MAP_TEXTS = [...fs.readFileSync(new URL('./test-writer-instructions.md', import.meta.url), 'utf8').matchAll(/"([^"\n]{3,200})"/g)].map((m) => m[1]);
const KNOWN = JSON.stringify(request.page_structure).replace(/\\"/g, '"') + '\n' + APP_MAP_TEXTS.join('\n');
const KNOWN_LOWER = KNOWN.toLowerCase();

let code;
try { code = extract(await ask(request)); } catch (err) { done(false, `AI call failed: ${err.message}`); }
if (!code) done(false, 'the AI returned no code (empty answer: the model may have used all its tokens on reasoning)');

// ---------- 3. Safety check ----------
let problems = safetyProblems(code);
if (problems.length) {
  fs.writeFileSync('tests/generated/ai-rejected.js.txt', code); // kept for the run artifact, never run
  done(false, `generated code rejected: ${problems.join('; ')}`);
}
const written = countTests(code);

// ---------- 3b. No guessing: tests that use texts not on a real screen are removed before they run ----------
const guesses = testBlocks(code).map((b) => ({ title: b.title, texts: guessedTexts(b.body) })).filter((g) => g.texts.length);
if (guesses.length) {
  code = switchOff(code, guesses.map((g) => g.title));
  for (const g of guesses) console.log(`[AI tests] removed (guessed text not on any screen: ${g.texts.join(', ')}): ${g.title}`);
}
if (guesses.length >= written) done(false, `all ${written} AI tests used texts that are not on the screens, so none were kept`, { guessed: guesses });
save(code, 'first draft');

// ---------- 4. Trial run, and one repair round ----------
let results = trialRun();
let fixed = 0;
let repairedCode = null;
const failing = (rs) => (rs || []).filter((t) => t.status === 'failed');
if (results && failing(results).length) {
  console.log(`[AI tests] trial run: ${failing(results).length} of ${results.length} failed, asking the AI to fix them`);
  try {
    const repaired = extract(await ask({
      ...request,
      mode: 'repair',
      previous_code: code,
      failures: failing(results).map((t) => ({ title: t.title, error: t.error })),
    }));
    const stillGuessing = repaired ? testBlocks(repaired).filter((b) => guessedTexts(b.body).length).map((b) => b.title) : [];
    if (repaired && !safetyProblems(repaired).length) {
      repairedCode = switchOff(repaired, stillGuessing);
      save(repairedCode, 'fixed after a trial run');
      const again = trialRun();
      if (again) {
        fixed = Math.max(0, failing(results).length - failing(again).length);
        code = repairedCode;
        results = again;
      } else {
        save(code, 'first draft'); // repaired version couldn't even run: keep the first one
      }
    } else {
      console.log('[AI tests] the fix did not pass the safety check; keeping the first version');
    }
  } catch (err) {
    console.log(`[AI tests] repair round skipped: ${err.message.split('\n')[0]}`);
  }
}

// ---------- 5. Switch off tests that still don't match the screen ----------
const mismatches = failing(results).filter((t) => isTestMistake(t.error)).map((t) => t.title);
if (mismatches.length) {
  code = switchOff(code, mismatches);
  console.log(`[AI tests] switched off ${mismatches.length} test(s) that did not match the screen: ${mismatches.join(' | ')}`);
}
save(code, results ? 'tried and fixed before this run' : 'not tried');

const removed = new Set([...guesses.map((g) => g.title), ...mismatches, ...(code.match(/\btest\.skip\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g) || []).map((m) => m.replace(/^test\.skip\s*\(\s*['"`]|['"`]$/g, ''))]);
const active = written - removed.size;
done(true,
  `${active} of ${written} tests kept${fixed ? `, ${fixed} fixed after a trial run` : ''}${removed.size ? `, ${removed.size} removed (guessed texts or did not match the screen)` : ''}`,
  { tests: active, written, fixed_after_trial: fixed, removed: [...removed], guessed: guesses, changed_files: request.changed_files,
    trial_run: results ? 'done' : 'not possible' });
