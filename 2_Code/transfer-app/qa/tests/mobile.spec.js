// Phone layout (runs in the "mobile" project): most students check status on a phone.
const { test, expect } = require('@playwright/test');

async function expectNoHorizontalScroll(page) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW).toBeLessThanOrEqual(clientW);
}

for (const path of ['/', '/apply', '/track', '/self-check', '/login']) {
  test(`[GOAL-LESS-STRESS] ${path} fits on a phone`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalScroll(page);
  });
}
