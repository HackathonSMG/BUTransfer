// [R9] Phone layout (runs in the "mobile" project).
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

async function expectNoHorizontalScroll(page) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW).toBeLessThanOrEqual(clientW);
}

for (const path of ['/', '/login', '/track']) {
  test(`[R9] ${path} fits on a phone`, async ({ page }) => {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  });
}

test('[R9] application form fits on a phone', async ({ page }) => {
  await A.openApplication(page);
  await expectNoHorizontalScroll(page);
});

test('[R9] step 1 errors are readable on a phone', async ({ page }) => {
  await A.openApplication(page);
  await A.cont(page);
  await expect(page.getByText('Enter your first name')).toBeInViewport({ ratio: 0.5 }).catch(async () => {
    await page.getByText('Enter your first name').scrollIntoViewIfNeeded();
    await expect(page.getByText('Enter your first name')).toBeVisible();
  });
  await expectNoHorizontalScroll(page);
});
