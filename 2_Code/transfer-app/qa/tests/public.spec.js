// Public pages, the status page and signed-out protection.
const { test, expect } = require('@playwright/test');

test('[STEP-1][STEP-2][GOAL-TRANSPARENT] home page links to submit, preview and track', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Submit Transcripts for Evaluation/ })).toHaveAttribute('href', '/apply');
  await expect(page.getByRole('link', { name: /Preview Course Credit/ })).toHaveAttribute('href', '/self-check');
  await expect(page.getByRole('link', { name: /Track Transfer Credit/ }).first()).toHaveAttribute('href', '/track');
});

test.describe('[GOAL-TRANSPARENT] Transfer Credit Status (/track)', () => {
  test.beforeEach(async ({ page }) => page.goto('/track'));

  test('[GOAL-TRANSPARENT] page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Transfer Credit Status' })).toBeVisible();
  });

  test('[GOAL-PRIVACY] both the Transfer Credit ID and the email are required', async ({ page }) => {
    await page.getByRole('button', { name: /^Check Status/ }).click();
    await expect(page.locator('p.text-red-600', { hasText: 'Enter your Transfer Credit ID' })).toBeVisible();
    await expect(page.locator('p.text-red-600', { hasText: 'Enter the email address you submitted with' })).toBeVisible();
  });

  test('[GOAL-TRANSPARENT] the Transfer Credit ID is upper-cased as you type', async ({ page }) => {
    await page.getByLabel('Transfer Credit ID').fill('tc-2026-0001');
    await expect(page.getByLabel('Transfer Credit ID')).toHaveValue('TC-2026-0001');
  });
});

test('[GOAL-TRANSPARENT] old links open the status page', async ({ page }) => {
  await page.goto('/status/not-a-real-token');
  await expect(page).toHaveURL(/\/track/);
  await page.goto('/eligibility');
  await expect(page).toHaveURL(/\/self-check/);
});

test('[GOAL-TRANSPARENT] public pages load without script or server errors', async ({ page, baseURL }) => {
  const errors = [];
  const origin = new URL(baseURL).origin;
  page.on('pageerror', (e) => errors.push(`script error: ${e.message}`));
  page.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  for (const path of ['/', '/apply', '/track', '/self-check', '/login']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

test('unknown page shows the 404 screen', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});

for (const path of ['/student', '/admin', '/admin/users', '/admin/audit', '/office', '/evaluator', '/evaluator/my-evaluations', '/evaluator/lookup']) {
  test(`[GOAL-PRIVACY] ${path} redirects to login when signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}
