// Signs in once per test role and saves each session (playwright/.auth/<role>.json).
// Credentials come only from .env (locally) or GitHub secrets (CI).
const { test: setup, expect } = require('@playwright/test');
const fs = require('fs');

const ROLES = {
  admin: ['ADMIN_EMAIL', 'ADMIN_PASSWORD'],
  office: ['OFFICE_EMAIL', 'OFFICE_PASSWORD'],
  evaluator: ['EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'],
};

for (const [role, [emailVar, passVar]] of Object.entries(ROLES)) {
  setup(`sign in as test ${role}`, async ({ page }) => {
    const file = `playwright/.auth/${role}.json`;
    fs.mkdirSync('playwright/.auth', { recursive: true });
    if (!process.env[emailVar] || !process.env[passVar]) {
      fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
      setup.skip(true, `${emailVar} / ${passVar} not set`);
    }
    await page.goto('/login');
    await page.getByPlaceholder('your@bu.edu').fill(process.env[emailVar]);
    await page.getByPlaceholder('••••••••').fill(process.env[passVar]);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await page.context().storageState({ path: file });
  });
}
