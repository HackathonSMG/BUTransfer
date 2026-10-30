// Process step 2 · Transcripts: "After admission, the student submits official final transcripts from every college attended."
// Transcript-first form (/apply): step 1 reads each transcript, step 2 shows what was read and asks only for what is missing.
// Nothing is saved before "Submit for Credit Evaluation", and blockSaving() makes sure these tests never get there,
// so they run on every build, production included, with the team's test-case transcripts (5_Test_Cases/transcripts).
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

test.beforeEach(async ({ page }) => { await A.blockSaving(page); });

const cases = A.loadCases();

test.describe('[STEP-2] Transcript submission screen', () => {
  test.skip(cases.length === 0, 'No transcripts found in 5_Test_Cases/transcripts');

  test('[STEP-2][GOAL-TRANSPARENT] shows the three submission steps', async ({ page }) => {
    // The "Submission steps" list is part of StepBand, which only renders from step 2 onward
    // (TransferCreditApplication.jsx:228,246) — step 1 (the upload screen) does not show it.
    await A.openApplication(page);
    await A.uploadTranscripts(page, [cases[0].transcripts[0].path]);
    await A.reviewDetails(page);
    const steps = page.getByRole('list', { name: 'Submission steps' });
    for (const s of ['Upload', 'Review & confirm', 'Transfer Credit ID']) await expect(steps.getByText(s)).toBeVisible();
  });

  test('[STEP-2] no account is needed and "Review details" waits for a readable transcript', async ({ page }) => {
    await A.openApplication(page);
    await expect(page).toHaveURL(/\/apply$/); // not redirected to a login
    await expect(page.getByRole('button', { name: /Review details/ })).toBeDisabled();
  });

  test('[STEP-2][GOAL-LESS-STRESS] a file that is not a transcript gets a clear message, not a dead end', async ({ page }) => {
    await A.openApplication(page);
    await page.locator('input[type="file"]').first().setInputFiles(A.fixture('not-a-transcript.txt'));
    await expect(page.getByText(/use a PDF, Word, JPG or PNG file/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Review details/ })).toBeDisabled();
  });
});

test.describe('[STEP-2] Each test-case transcript is read correctly (nothing submitted)', () => {
  test.skip(cases.length === 0, 'No transcripts found in 5_Test_Cases/transcripts');
  // Not 'serial': one transcript failing must not skip the others. Tests in a file still run one after another.
  test.setTimeout(120_000);

  for (const c of cases) {
    test(`[STEP-2][GOAL-LESS-STRESS] ${c.id} ${c.name}: courses and student details are read from the transcript${c.transcripts.length > 1 ? 's' : ''}`, async ({ page }) => {
      await A.openApplication(page);
      await A.uploadTranscripts(page, c.transcripts.map((t) => t.path));

      // Step 1: one line per transcript with the college, course count and calendar. The count and the
      // calendar are two separate chips (TransferCreditApplication.jsx:752-754), not one joined text run.
      for (const t of c.transcripts) {
        await expect(page.getByText(t.institution).first()).toBeVisible();
        await expect(page.getByText(new RegExp(`${t.courses.length} courses?$`, 'i')).first()).toBeVisible();
        await expect(page.getByText(t.calendar, { exact: true }).first()).toBeVisible();
      }
      if (c.transcripts.some((t) => /quarter/i.test(t.calendar))) {
        test.info().annotations.push({ type: 'RULE-QUARTER', description: 'Quarter-system transcript recognised as Quarter' });
      }

      // Step 2: details taken from the transcript, so the student is not asked to type them
      await A.reviewDetails(page);
      const t = c.transcripts[0];
      const field = (label) => page.locator('div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).last();
      await expect(field('Name')).toContainText(t.student);
      await expect(field('BU program')).toContainText(t.major);
      await expect(field('BU start term')).toContainText(t.start);
      await expect(page.getByText('Auto-filled').first()).toBeVisible();
      // [RULE-DEADLINE] the one-year rule is explained where the start term is shown
      await expect(page.getByText('Credit must transfer within a year of starting at BU')).toBeVisible();

      // Every course, credit and grade on the transcript is listed (open each transcript summary)
      const closed = page.getByRole('button', { name: /courses? found/i, expanded: false });
      while (await closed.count()) await closed.first().click();
      const table = A.norm(await page.locator('main').innerText());
      for (const k of c.transcripts.flatMap((x) => x.courses)) {
        expect.soft(table, `${k.code} not listed`).toContain(A.norm(k.code));
      }
      if (c.transcripts.some((x) => x.courses.some((k) => k.credits == null))) {
        await expect(page.getByText('not shown').first()).toBeVisible(); // TC13: missing credits are flagged, not guessed
      }

      // Submit stays off until the email is given and the student confirms
      await expect(page.getByRole('button', { name: /Submit for Credit Evaluation/ })).toBeDisabled();
    });
  }
});

test.describe('[STEP-2] Review & Confirm checks (nothing submitted)', () => {
  test.skip(cases.length === 0, 'No transcripts found in 5_Test_Cases/transcripts');

  test('[STEP-2] email must be valid and confirmed before submitting', async ({ page }) => {
    await A.openApplication(page);
    await A.uploadTranscripts(page, [cases[0].transcripts[0].path]);
    await A.reviewDetails(page);
    await page.getByLabel('Email address', { exact: false }).first().fill('bad-email');
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await page.getByLabel('Email address', { exact: false }).first().fill('test.student@example.com');
    await page.getByLabel('Confirm email address').fill('other@example.com');
    await expect(page.getByText('The email addresses do not match')).toBeVisible();
    await expect(page.getByRole('button', { name: /Submit for Credit Evaluation/ })).toBeDisabled();
  });

  test('[STEP-2] "Back" returns to the upload step and keeps the transcript', async ({ page }) => {
    await A.openApplication(page);
    await A.uploadTranscripts(page, [cases[0].transcripts[0].path]);
    await A.reviewDetails(page);
    await page.getByRole('button', { name: /^Back/ }).click();
    await expect(page.getByText(cases[0].transcripts[0].institution).first()).toBeVisible();
  });
});
