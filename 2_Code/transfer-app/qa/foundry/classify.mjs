// Decides whether an AI-written test failed because of the APP or because of the TEST itself.
// AI tests guess locators and texts; when one fails only because its locator or text didn't match the screen
// (strict-mode clash, element or text not found, timeout waiting for a locator), it's the test's mistake.
// Failures that point at the app (page errors, 5xx, wrong status codes, redirects) always count.
const TEST_MISTAKE = /strict mode violation|resolved to \d+ elements|element\(s\) not found|waiting for (getBy|locator)|Test timeout of \d+ms exceeded|to(Be(Visible|Enabled|Disabled|Hidden|Checked)|Have(Text|Count|Attribute|Value)|ContainText)\b/i;
const APP_PROBLEM = /(status|Received)\D{0,12}5\d\d\b|pageerror|page error|Uncaught|TypeError|ReferenceError|net::ERR|response\.status|toBeOK|toHaveURL/i;

export const isTestMistake = (error) => TEST_MISTAKE.test(error || '') && !APP_PROBLEM.test(error || '');

/** Flat list of { title, status, error } from a Playwright JSON report. */
export function flatten(report) {
  const out = [];
  const walk = (suite, prefix) => {
    const here = suite.title && !/\.spec\.js$/.test(suite.title) ? [...prefix, suite.title] : prefix;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const last = t.results?.[t.results.length - 1] || {};
        out.push({
          title: spec.title,
          fullTitle: [...here, spec.title].join(' › '),
          status: t.status === 'expected' ? 'passed' : t.status === 'unexpected' ? 'failed' : t.status === 'flaky' ? 'flaky' : 'skipped',
          error: String(last.error?.message || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 8).join('\n').slice(0, 800),
        });
      }
    }
    for (const s of suite.suites || []) walk(s, here);
  };
  for (const s of report.suites || []) walk(s, []);
  return out;
}
