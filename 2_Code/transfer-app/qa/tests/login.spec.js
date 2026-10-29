// [R7] Staff login (pages/auth/Login.jsx).
const { test, expect } = require('@playwright/test');

test.describe('[R7] Staff login', () => {
  test.beforeEach(async ({ page }) => page.goto('/login'));

  test('[R7] shows required-field errors when submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('[R7] shows the app\'s own error for an invalid email', async ({ page }) => {
    await page.getByLabel('Email address').fill('notanemail');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('[R7] wrong credentials show an error and stay on login', async ({ page }) => {
    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByLabel(/^Password/).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('[R1] applicants are pointed to Track and Apply (no account needed)', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Track your application' })).toHaveAttribute('href', '/track');
    await expect(page.getByRole('link', { name: 'start one' })).toHaveAttribute('href', '/apply');
  });
});
