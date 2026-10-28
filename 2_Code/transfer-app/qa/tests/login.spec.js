// [R7] Staff login (pages/auth/Login.jsx).
const { test, expect } = require('@playwright/test');

test.describe('[R7] Staff login', () => {
  test('[R7] shows required-field errors when submitted empty', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('[R7][BUG #7] shows the app\'s own error for an invalid email', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('your@bu.edu').fill('notanemail');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('[R7] wrong credentials show an error and stay on login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('your@bu.edu').fill('nobody@example.com');
    await page.getByPlaceholder('••••••••').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid email or password|invalid login|credentials/i).first()).toBeVisible();
  });

  test('[R1] student link opens the application form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Submit a Transfer Application' }).click();
    await expect(page).toHaveURL(/\/apply/);
  });
});
