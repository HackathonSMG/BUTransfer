// [R1][R2] Transfer Credit Eligibility application at /apply (4 steps).
// Step 1 tests stop BEFORE anything is saved (every case has at least one invalid field), so they are safe on production.
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

test.describe('[R2] Step 1 · Applicant Information', () => {
  test.beforeEach(async ({ page }) => A.openApplication(page));

  test('[R2] all required fields are enforced', async ({ page }) => {
    await A.cont(page);
    for (const msg of ['Enter your first name', 'Enter your last name', 'Enter a valid email address',
      'Enter the college or university you attended', 'Select your intended program', 'Select your intended start term']) {
      await expect(page.getByText(msg)).toBeVisible();
    }
  });

  test('[R2] program and start term are required', async ({ page }) => {
    await A.fillStep1(page, { program: '', term: '' });
    await A.cont(page);
    await expect(page.getByText('Select your intended program')).toBeVisible();
    await expect(page.getByText('Select your intended start term')).toBeVisible();
    await A.atStep(page, 1);
  });

  test('[R2] invalid email is rejected', async ({ page }) => {
    await A.fillStep1(page, { email: 'bad-email', confirmEmail: 'bad-email' });
    await A.cont(page);
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await A.atStep(page, 1);
  });

  test('[R2] email and confirmation must match', async ({ page }) => {
    await A.fillStep1(page, { confirmEmail: 'other@example.com' });
    await A.cont(page);
    await expect(page.getByText('The email addresses do not match')).toBeVisible();
    await A.atStep(page, 1);
  });

  test('[R2] institution needs at least 2 characters', async ({ page }) => {
    await A.fillStep1(page, { institution: 'X' });
    await A.cont(page);
    await expect(page.getByText('Enter the college or university you attended')).toBeVisible();
  });

  test('[R2] fixing a field clears its error', async ({ page }) => {
    await A.cont(page);
    await expect(page.getByText('Enter your first name')).toBeVisible();
    await page.getByLabel('First name').fill('Test');
    await expect(page.getByText('Enter your first name')).toHaveCount(0);
  });

  test('[R1] the 4 steps are shown', async ({ page }) => {
    const steps = page.getByRole('list', { name: 'Application steps' });
    for (const s of ['Applicant Information', 'Academic Documents', 'Additional Information', 'Review & Submit']) {
      await expect(steps.getByText(s)).toBeVisible();
    }
  });
});

// Steps 2–4: these save a draft application, so they only run on local or staging (ALLOW_SUBMIT=true).
test.describe('[R1] Steps 2–4 (local/staging only)', () => {
  test.beforeEach(async ({ page }) => {
    A.requireWriteSafeSite();
    await A.openApplication(page);
    await A.fillStep1(page);
    await A.cont(page);
    await expect(page.getByRole('heading', { name: 'Academic Documents' })).toBeVisible({ timeout: 15_000 });
  });

  test('[R1] transcript is required to continue', async ({ page }) => {
    await A.cont(page);
    await expect(page.getByText('Upload your academic transcript to continue.')).toBeVisible();
  });

  test('[R1] review needs the confirmation tick', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(A.fixture('test-transcript.pdf'));
    await expect(page.getByRole('button', { name: /^Continue/ })).toBeEnabled({ timeout: 30_000 });
    await A.cont(page);
    await expect(page.getByRole('heading', { name: 'Additional Information' })).toBeVisible();
    await A.cont(page);
    await expect(page.getByRole('heading', { name: 'Review & Submit' })).toBeVisible();
    await page.getByRole('button', { name: /Submit Application/ }).click();
    await expect(page.getByText('Confirm that your information is accurate to submit.')).toBeVisible();
  });
});
