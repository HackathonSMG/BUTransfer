// Process step 1 · Self-check: "The student previews likely course equivalencies" (problem statement, step 1).
// /self-check stores nothing (services/selfcheck.service.js), so these run on every build, production included.
const { test, expect } = require('@playwright/test');

async function check(page, institution, courses) {
  await page.goto('/self-check');
  await expect(page.getByRole('heading', { name: 'Course Credit Self-Check' })).toBeVisible();
  await page.getByRole('combobox').first().selectOption({ label: institution });
  for (const [i, c] of courses.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add a course' }).click();
    await page.getByLabel('Course code').nth(i).fill(c.code);
    if (c.credits != null) await page.getByLabel('Credits').nth(i).fill(String(c.credits));
    if (c.system) await page.getByLabel('Credit system').nth(i).selectOption(c.system);
    if (c.grade) await page.getByLabel('Grade').nth(i).fill(c.grade);
  }
  await page.getByRole('button', { name: 'Check my courses' }).click();
  await expect(page.getByRole('heading', { name: 'What to send' })).toBeVisible({ timeout: 20_000 });
}

test.describe('[STEP-1] Self-check: preview likely equivalencies before applying', () => {
  test('[STEP-1] page loads and lists colleges with course information', async ({ page }) => {
    await page.goto('/self-check');
    await expect(page.getByRole('heading', { name: 'Course Credit Self-Check' })).toBeVisible();
    await expect.poll(async () => page.getByRole('combobox').first().locator('option').count(), { timeout: 15_000 }).toBeGreaterThan(1);
  });

  test('[STEP-1][STEP-3/4][GOAL-FASTER] an already-evaluated course shows its established BU equivalent', async ({ page }) => {
    // TC01 / scenario S01: Northeastern CS 2000 → CAS CS 111 (established equivalency)
    await check(page, 'Northeastern University', [{ code: 'CS 2000', credits: 5, grade: 'A' }]);
    await expect(page.getByText('Established equivalency').first()).toBeVisible();
    await expect(page.getByText(/Likely BU credit:\s*CAS CS 111/)).toBeVisible();
  });

  test('[STEP-1][STEP-5][GOAL-LESS-STRESS] an unknown course says a syllabus may be needed, before applying', async ({ page }) => {
    // TC14 / scenario S14: CS 4973 is not in the catalog or the equivalency data
    await check(page, 'Northeastern University', [{ code: 'CS 4973', credits: 4, grade: 'A' }]);
    await expect(page.getByText(/syllabus/i).first()).toBeVisible();
  });

  test('[RULE-QUARTER] a 4-credit quarter course becomes 2.66 BU credits', async ({ page }) => {
    // Problem statement: "Credits convert at two-thirds of a semester credit (a 4-credit quarter course becomes 2.66 BU credits)."
    await check(page, 'Pacific Coast State University', [{ code: 'ECON 100A', credits: 4, system: 'Quarter', grade: 'A' }]);
    await expect(page.getByText('Quarter credits convert to two-thirds: 4 quarter credits = 2.66 BU credits.')).toBeVisible();
  });

  test('[RULE-QUARTER] a 5-credit quarter course becomes 3.33 BU credits', async ({ page }) => {
    // TC16 / scenario S16: "5 qtr → 3.33 BU"
    await check(page, 'Pacific Coast State University', [{ code: 'PSYC 1', credits: 5, system: 'Quarter', grade: 'B' }]);
    await expect(page.getByText(/5 quarter credits = 3\.33 BU credits/)).toBeVisible();
  });

  test('[RULE-GRADE] a grade below C earns no credit', async ({ page }) => {
    // Problem statement: "Many BU schools require a C or higher for credit." (TC04: BIOL-UA 11 grade D)
    await check(page, 'New York University', [{ code: 'BIOL-UA 11', credits: 4, grade: 'D' }]);
    await expect(page.getByText(/With grade D, this course would not earn credit \(BU requires C or higher\)/)).toBeVisible();
  });

  test('[RULE-GRADE] a Pass grade goes to the department to confirm', async ({ page }) => {
    await check(page, 'Northeastern University', [{ code: 'MATH 1341', credits: 4, grade: 'P' }]);
    await expect(page.getByText(/A Pass grade is reviewed by the department/)).toBeVisible();
  });

  test('[GOAL-DEPT-DECIDES][RULE-HUB][RULE-DEADLINE][RULE-GRADE] the preview states the rules and that departments decide', async ({ page }) => {
    await check(page, 'Northeastern University', [{ code: 'CS 2000', credits: 5, grade: 'A' }]);
    await expect(page.getByText(/not an official transfer credit decision; academic departments make the final decision/)).toBeVisible();
    await expect(page.getByText(/External grades do not count toward your BU GPA/)).toBeVisible();
    await expect(page.getByText(/posted with a grade of T and do not earn BU Hub units/)).toBeVisible();
    await expect(page.getByText(/within one year of starting at BU/)).toBeVisible();
  });

  test('[DEMO] demo scenario: six courses get a clear outcome each (existing, maybe, quarter)', async ({ page }) => {
    // Problem statement demo: a community college transfer with six courses, three with existing equivalencies,
    // two "maybe", one from a quarter-system school. Riverside courses from TC02/TC15/TC16, the quarter course from TC16.
    await check(page, 'Riverside Community College', [
      { code: 'CSC 110', credits: 4, grade: 'A' }, { code: 'ENG 101', credits: 3, grade: 'B+' }, { code: 'MAT 151', credits: 4, grade: 'B+' },
      { code: 'PHIL 101', credits: 3, grade: 'A-' }, { code: 'MUS 110', credits: 3, grade: 'B+' },
    ]);
    const statuses = page.locator('li').filter({ has: page.locator('span.font-mono') });
    await expect(statuses).toHaveCount(5);
    await expect(page.getByText(/Established equivalency|Evaluated before/).first()).toBeVisible();
    await expect(page.getByText(/Department review|Syllabus needed|Likely match/).first()).toBeVisible();
    await check(page, 'Pacific Coast State University', [{ code: 'MATH 19A', credits: 5, system: 'Quarter', grade: 'B+' }]);
    await expect(page.getByText(/5 quarter credits = 3\.33 BU credits/)).toBeVisible();
  });
});
