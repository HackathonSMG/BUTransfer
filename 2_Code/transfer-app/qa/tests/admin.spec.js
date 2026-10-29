// [GOAL-FASTER]-[GOAL-DEPT-DECIDES] Signed-in staff screens and role boundaries. Read-only: nothing here approves or changes data.
const { test, expect } = require('@playwright/test');

const has = (...vars) => vars.every((v) => process.env[v]);
const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};

test.describe('Admin', () => {
  test.skip(!has('ADMIN_EMAIL', 'ADMIN_PASSWORD'), 'Needs ADMIN_EMAIL / ADMIN_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('[GOAL-TRANSPARENT] overview loads without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/admin');
    await expect(page.getByText('Transfer Credit Overview')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('[GOAL-FASTER] applications list loads', async ({ page }) => {
    await page.goto('/admin/applications');
    await expect(page.getByText('Applications', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Applications could not be loaded')).toHaveCount(0);
  });

  test('[GOAL-DEPT-DECIDES] audit log page loads', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page).toHaveURL(/\/admin\/audit/);
    await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);
  });

  for (const path of ['/admin/conflicts', '/admin/reports', '/admin/criteria', '/admin/users', '/evaluator/equivalencies']) {
    test(`[GOAL-TRANSPARENT] ${path} opens`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByText('Access Denied')).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Credit Evaluation Office', () => {
  test.skip(!has('OFFICE_EMAIL', 'OFFICE_PASSWORD'), 'Needs OFFICE_EMAIL / OFFICE_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/office.json' });

  test('[GOAL-DEPT-DECIDES] /evaluator sends the office to /office', async ({ page }) => {
    await page.goto('/evaluator');
    await expect(page).toHaveURL(/\/office/);
  });

  test('[GOAL-PRIVACY] office cannot open admin-only user management', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByText('Access Denied')).toBeVisible();
  });
});

test.describe('Evaluator', () => {
  test.skip(!has('EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'), 'Needs EVALUATOR_EMAIL / EVALUATOR_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/evaluator.json' });

  test('[GOAL-FASTER] evaluator dashboard and queue load', async ({ page }) => {
    await page.goto('/evaluator/my-evaluations');
    await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);
  });

  for (const path of ['/admin', '/admin/users', '/office']) {
    test(`[GOAL-DEPT-DECIDES][GOAL-PRIVACY] evaluator gets Access Denied on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText('Access Denied')).toBeVisible();
    });
  }
});
