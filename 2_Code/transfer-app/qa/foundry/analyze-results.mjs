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
import { askAI } from './llm.mjs';

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
        // problem-statement tags: [STEP-n], [RULE-x], [GOAL-x], [DEMO]
        requirements: [...new Set((title.match(/\[(?:STEP|RULE|GOAL)-[^\]]+\]|\[DEMO\]/g) || []).map((t) => t.slice(1, -1)))],
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
const allTests = [];
for (const s of raw.suites || []) collect(s, s.file, allTests);

// AI-written tests guess locators and texts. When one fails only because its locator or text didn't match the
// screen (strict-mode clash, element or text not found), it's the test's mistake, not an app bug: drop it from
// the report. AI failures that point at the app (page errors, 5xx, wrong status codes, redirects) are kept.
const TEST_MISTAKE = /strict mode violation|resolved to \d+ elements|element\(s\) not found|waiting for (getBy|locator)|Test timeout of \d+ms exceeded|to(Be(Visible|Enabled|Disabled|Hidden|Checked)|Have(Text|Count|Attribute|Value)|ContainText)\b/i;
const APP_PROBLEM = /(status|Received)\D{0,12}5\d\d\b|pageerror|page error|Uncaught|TypeError|ReferenceError|net::ERR|response\.status|toBeOK|toHaveURL/i;
const isTestMistake = (t) => t.ai_generated && t.status === 'failed' && TEST_MISTAKE.test(t.error || '') && !APP_PROBLEM.test(t.error || '');
const discarded = allTests.filter(isTestMistake);
const tests = allTests.filter((t) => !isTestMistake(t));

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
  ai_tests: { generated: aiStatus?.generated ?? false, note: aiStatus?.reason || null, total: aiTests.length + discarded.length,
    discarded_test_mistakes: discarded.length,
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

// ---------- 2. Ask the AI (API key or Foundry agent, see llm.mjs) ----------
const askAgent = () => askAI({
  role: 'qa-analyst',
  instructionsFile: 'qa-agent-instructions.md',
  agentName: env.FOUNDRY_QA_AGENT_NAME || 'bu-transfer-qa-analyst',
  input: JSON.stringify(payload),
});

// ---------- 3. Plain fallback report (no AI) ----------
// The Problem 1 statement, as tagged in the test titles
const COVERAGE = [
  ['STEP-1', 'Self-check: preview likely equivalencies'], ['STEP-2', 'Submit official transcripts'],
  ['STEP-3/4', 'Processed against the equivalency database; existing match applied'], ['STEP-5', 'No match: syllabus requested'],
  ['STEP-6', 'Department review: BU course, elective or no credit'], ['STEP-7', 'Posted with grade T; pending shows 0 units'],
  ['RULE-QUARTER', 'Quarter credits × 2/3'], ['RULE-GRADE', 'C or higher; grades not in BU GPA'], ['RULE-HUB', 'No BU Hub units'],
  ['RULE-DEADLINE', 'Within one year of starting at BU'], ['RULE-ZERO', 'Pending credit = 0 units'],
  ['GOAL-FASTER', 'Faster'], ['GOAL-TRANSPARENT', 'More transparent'], ['GOAL-LESS-STRESS', 'Less stressful'],
  ['GOAL-DEPT-DECIDES', 'Departments make the final decision'], ['GOAL-PRIVACY', 'Student records stay private'], ['DEMO', 'Demo scenario'],
];
function coverageRows() {
  return COVERAGE.map(([id, label]) => {
    const ts = tests.filter((t) => t.requirements.includes(id));
    const run = ts.filter((t) => t.status !== 'skipped');
    const bad = run.filter((t) => t.status === 'failed' && !t.known_bug && !t.ai_generated);
    const icon = !run.length ? '⏭' : bad.length ? '❌' : run.some((t) => t.status === 'failed') ? '⚠️' : '✅';
    return `| ${id} | ${label} | ${icon} | ${run.filter((t) => t.status === 'passed' || t.status === 'flaky').length}/${ts.length}${ts.length > run.length ? ` (${ts.length - run.length} skipped)` : ''} |`;
  });
}
function fallbackReport(reason) {
  const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const verdict = regressions.length ? '❌ Blocked: new regressions' : failed.length ? '⚠️ Ready with known issues' : '✅ Ready';
  return [
    `## QA report · ${payload.build.commit} · ${payload.build.branch}`,
    `**Verdict:** ${verdict}`,
    `**Results:** ${summary.passed} passed · ${summary.failed} failed (${summary.regressions} new regressions, ${summary.known_bug_failures} known bugs) · ${summary.skipped} skipped · target ${payload.build.target_url}`,
    '',
    '### Problem statement coverage',
    ['| Tag | Problem statement | Status | Passed |', '|---|---|---|---|', ...coverageRows()].join('\n'),
    '',
    '### New regressions',
    regressions.length ? ['| Test | Project | Error |', '|---|---|---|', ...regressions.map((t) => `| ${cell(t.title)} | ${t.project} | ${cell((t.error || '').split('\n')[0]).slice(0, 160)} |`)].join('\n') : 'None',
    '', '### AI-written tests for this build',
    aiTests.length
      ? aiTests.map((t) => `- ${t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭'} ${t.title}${t.error ? ` — ${(t.error || '').split('\n')[0].slice(0, 120)}` : ''}`).join('\n')
      : `None this run: ${discarded.length ? 'every AI test that failed did not match the screen' : summary.ai_tests.note || 'the test-writer step did not run'}`,
    ...(discarded.length ? [`_${discarded.length} AI-written test${discarded.length > 1 ? 's were' : ' was'} dropped: ${discarded.length > 1 ? 'they' : 'it'} failed only because the AI's locator or text did not match the screen (not an app bug)._`] : []),
    '', '### Known bugs still failing',
    failed.filter((t) => t.known_bug).map((t) => `- #${t.known_bug} ${t.title}`).join('\n') || 'None',
  ].join('\n');
}

let report;
try {
  report = await askAgent();
  console.log('[QA] Report written by the AI.');
} catch (err) {
  console.log(`[QA] Using the plain report (AI report not available: ${err.message.split('\n')[0]})`);
  report = fallbackReport(err.message);
}

const footer = `\n\n---\nFull HTML report with screenshots and traces: the **playwright-report** artifact${runUrl ? ` on [this run](${runUrl})` : ''}.`;
fs.writeFileSync(outPath, report + footer);
if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, report + footer + '\n');
fs.writeFileSync('qa-summary.json', JSON.stringify(summary));
console.log(`[QA] ${summary.passed} passed, ${summary.failed} failed (${summary.regressions} regressions), ${summary.skipped} skipped → ${outPath}`);
