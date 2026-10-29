// Process steps 3–7 end to end with the team's test-case transcripts: submit as the student, then follow the
// application on the Transfer Credit Status page the way the student would.
//
// These SUBMIT REAL APPLICATIONS, so they run only on local/staging with ALLOW_SUBMIT=true (never on production).
// The staff decisions (department review, final posting) are covered by 5_Test_Cases/transcripts/run_scenarios.mjs.
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

// What the problem statement says each case must show the student (from scenario_results.json)
const EXPECT = {
  TC01: { tags: '[STEP-3/4][GOAL-FASTER]', text: [/CAS CS 111/] },                              // established equivalencies applied
  TC02: { tags: '[STEP-3/4][STEP-6]', text: [/Elective/i] },                                       // established elective credit
  TC04: { tags: '[RULE-GRADE]', text: [/not accepted|no credit/i] },                              // D and C- earn no credit
  TC05: { tags: '[STEP-5][GOAL-LESS-STRESS]', text: [/syllabus/i] },                              // "maybe" → syllabus requested
  TC14: { tags: '[STEP-5]', text: [/syllabus/i] },                                                 // unknown course → syllabus
  TC16: { tags: '[RULE-QUARTER]', text: [/3\.33/] },                                               // 5 quarter credits → 3.33 BU
  TC17: { tags: '[STEP-6][GOAL-TRANSPARENT]', text: [/Department Review/i] },                      // courses with department evaluators
};

const cases = A.loadCases();

test.describe('[STEP-3/4][STEP-5][STEP-6][STEP-7] Test-case transcripts from upload to status (local/staging only)', () => {
  test.skip(cases.length === 0, 'No transcripts found in 5_Test_Cases/transcripts');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  for (const c of cases) {
    const exp = EXPECT[c.id] || { tags: '', text: [] };
    test(`[STEP-2][STEP-7][RULE-ZERO][GOAL-DEPT-DECIDES]${exp.tags} ${c.id} ${c.name}: submit and follow the status`, async ({ page }) => {
      A.requireWriteSafeSite();
      const email = `qa.${c.id.toLowerCase()}.${Date.now()}@example.com`;

      await A.openApplication(page);
      await A.uploadTranscripts(page, c.transcripts.map((t) => t.path));
      await A.reviewDetails(page);
      await page.getByLabel('Email address', { exact: false }).first().fill(email);
      await page.getByLabel('Confirm email address').fill(email);
      await page.getByRole('checkbox').last().check();
      await page.getByRole('button', { name: /Submit for Credit Evaluation/ }).click();

      // A previous run with the same student may be found; continue with a new evaluation
      const another = page.getByRole('button', { name: /Continue with a new evaluation/ });
      if (await another.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await another.click();
        await page.getByRole('button', { name: /Submit for Credit Evaluation/ }).click();
      }

      await expect(page.getByRole('heading', { name: 'Credit Evaluation Submitted' })).toBeVisible({ timeout: 60_000 });
      const id = (await page.locator('span.font-mono').first().textContent()).trim();
      test.info().annotations.push({ type: 'Transfer Credit ID', description: `${c.id} → ${id} (${email})` });

      // Transfer Credit Status, as the student sees it
      await page.goto(`/track?id=${encodeURIComponent(id)}`);
      await page.getByLabel('Transfer Credit ID').fill(id);
      await page.getByLabel('Email address').first().fill(email);
      await page.getByRole('button', { name: /^Check Status/ }).click();
      await expect(page.getByText(id).first()).toBeVisible({ timeout: 20_000 });

      // [GOAL-TRANSPARENT] every course on the transcript is listed, with BU units
      const codes = [...new Set(c.transcripts.flatMap((t) => t.courses.map((k) => A.norm(k.code))))];
      await expect.poll(async () => {
        await page.reload().catch(() => {});
        const text = A.norm(await page.locator('main').innerText());
        return codes.filter((k) => !text.includes(k));
      }, { message: `courses missing on the status page for ${c.id}`, timeout: 180_000, intervals: [10_000] }).toEqual([]);

      // [RULE-ZERO] pending courses show 0 units until decided; [GOAL-DEPT-DECIDES] the student is told who decides
      await expect(page.getByText(/0 units until decided|0 BU units until they are reviewed/).first()).toBeVisible();
      await expect(page.getByText('Academic departments make the final decision on every course.')).toBeVisible();
      // [RULE-DEADLINE] the one-year deadline is shown once credit is being evaluated
      await expect.soft(page.getByText(/one year/i).first()).toBeVisible();

      // Case-specific outcome from the problem statement
      for (const re of exp.text) {
        await expect.poll(async () => { await page.reload().catch(() => {}); return re.test(await page.locator('main').innerText()); },
          { message: `${c.id}: expected ${re} on the status page`, timeout: 120_000, intervals: [10_000] }).toBe(true);
      }
    });
  }
});
