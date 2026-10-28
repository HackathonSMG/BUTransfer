// [R9] Phone layout (runs in the "mobile" project).
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

async function expectNoHorizontalScroll(page) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW).toBeLessThanOrEqual(clientW);
}

test('[R9] login page fits on a phone', async ({ page }) => {
  await page.goto('/login');
  await expectNoHorizontalScroll(page);
});

test('[R9] application form fits on a phone', async ({ page }) => {
  await A.openApplication(page);
  await expectNoHorizontalScroll(page);
});

test('[R9][BUG #6] long email does not overlap other values on the review page', async ({ page }) => {
  await A.goToDocuments(page);
  await A.uploadInput(page, 0).setInputFiles(A.fixture('test-transcript.pdf'));
  await A.next(page);
  await A.atStep(page, 5);
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => el.children.length === 0 && el.textContent.trim())
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim()));
  expect(overflowing, `Text spilling out of its box: ${overflowing.join(', ')}`).toEqual([]);
});
