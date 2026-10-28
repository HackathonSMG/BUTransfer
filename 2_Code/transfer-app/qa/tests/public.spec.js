// [R3][R7][R9][R10] Public pages and signed-out redirects.
const { test, expect } = require('@playwright/test');

test('[R3] status page with an invalid link shows a clear message', async ({ page }) => {
  await page.goto('/status/not-a-real-token');
  await expect(page.getByRole('heading', { name: 'Application Not Found' })).toBeVisible();
});

test('[R10] public pages load without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const path of ['/', '/apply', '/eligibility', '/self-check', '/login']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

test('[R9] unknown page shows the 404 screen', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});

for (const path of ['/admin', '/admin/users', '/admin/audit', '/office', '/evaluator', '/evaluator/my-evaluations']) {
  test(`[R7] ${path} redirects to login when signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}
