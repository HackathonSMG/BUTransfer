// Staff sign-in (pages/auth/Login.jsx). Students never need an account.
const { test, expect } = require('@playwright/test');

test.describe('[GOAL-PRIVACY] Staff login', () => {
  test.beforeEach(async ({ page }) => page.goto('/login'));

  test('[GOAL-PRIVACY] shows required-field errors when submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('[GOAL-PRIVACY] wrong credentials show an error and stay on login', async ({ page }) => {
    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByLabel(/^Password/).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('[STEP-2][GOAL-LESS-STRESS] students are told they do not need an account', async ({ page }) => {
    await expect(page.getByText(/You don't need an account/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Track your transfer credit', exact: true })).toHaveAttribute('href', '/track');
    await expect(page.getByRole('link', { name: 'submit transcripts', exact: true })).toHaveAttribute('href', '/apply');
  });
});
