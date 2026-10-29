// [R3][R7][R9][R10] Public pages, application tracking and signed-out redirects.
const { test, expect } = require('@playwright/test');

test('[R1] home page offers Apply and Track', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Start Transfer Credit Eligibility/ })).toHaveAttribute('href', '/apply');
  await expect(page.getByRole('link', { name: /Track Application/ }).first()).toHaveAttribute('href', '/track');
});

test.describe('[R3] Track Application', () => {
  test.beforeEach(async ({ page }) => page.goto('/track'));

  test('[R3] page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Track Transfer Credit Application' })).toBeVisible();
  });

  test('[R3] number and email are required', async ({ page }) => {
    await page.getByRole('button', { name: /^Track Application/ }).click();
    // The red error under each field (Input.jsx renders it as <p class="text-red-600">)
    await expect(page.locator('p.text-red-600', { hasText: 'Enter your application number' })).toBeVisible();
    await expect(page.locator('p.text-red-600', { hasText: 'Enter the email address you applied with' })).toBeVisible();
  });

  test('[R3] application number is upper-cased as you type', async ({ page }) => {
    await page.getByLabel('Application number').fill('app-2026-0001');
    await expect(page.getByLabel('Application number')).toHaveValue('APP-2026-0001');
  });
});

test('[R3] old status links open Track Application', async ({ page }) => {
  await page.goto('/status/not-a-real-token');
  await expect(page).toHaveURL(/\/track/);
});

test('[R10] public pages load without script errors or server errors', async ({ page, baseURL }) => {
  // Counts JavaScript errors and 5xx answers from this site. Blocked third-party resources (fonts, analytics)
  // and expected 401s from signed-out API calls are not app bugs, so they're ignored.
  const errors = [];
  const origin = new URL(baseURL).origin;
  page.on('pageerror', (e) => errors.push(`script error: ${e.message}`));
  page.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  for (const path of ['/', '/apply', '/track', '/eligibility', '/self-check', '/login']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

test('[R9] unknown page shows the 404 screen', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});

for (const path of ['/student', '/admin', '/admin/users', '/admin/audit', '/office', '/evaluator', '/evaluator/my-evaluations', '/evaluator/lookup']) {
  test(`[R7] ${path} redirects to login when signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}
