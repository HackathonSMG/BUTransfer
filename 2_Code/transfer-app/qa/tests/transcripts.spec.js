// [R1][R3][R5] End-to-end runs with the team's test-case transcripts (5_Test_Cases/transcripts/*.pdf).
// For each test case: apply through /apply as the student in transcripts.json, upload that case's transcript(s),
// submit, then open Track Application and check that every course on the transcript appears.
//
// These SUBMIT REAL APPLICATIONS, so they run only on local/staging with ALLOW_SUBMIT=true (never on production).
// Expected decisions per case (accept / elective / no credit / information required ...) are checked by
// 5_Test_Cases/transcripts/run_scenarios.mjs against the database; these tests cover the screens a student uses.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const A = require('./helpers/apply');

const DIR = path.resolve(__dirname, '../../../../5_Test_Cases/transcripts');
const CASES_FILE = path.join(DIR, 'transcripts.json');

// The form's program list (lib/application.js); other majors go to the closest program.
const PROGRAMS = ['Computer Science', 'Business Administration', 'Engineering', 'Liberal Arts', 'Sciences', 'Education', 'Communication'];
const programFor = (major) => PROGRAMS.includes(major) ? major
  : ['Mathematics', 'Biology', 'Psychology', 'Chemistry', 'Physics'].includes(major) ? 'Sciences' : 'Liberal Arts';

// "CS2000", "cs-1800" and "CS 2000" count as the same course code
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Group the transcripts by test case: TC16 and TC26 have one transcript per institution
const cases = [];
if (fs.existsSync(CASES_FILE)) {
  const byCase = new Map();
  for (const t of JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'))) {
    const id = t.file.match(/^(TC\d+)/)[1];
    if (!byCase.has(id)) byCase.set(id, { id, name: t.file.replace(/^TC\d+_/, '').replace(/_[^_]+\.pdf$/, '').replace(/_/g, ' '), transcripts: [] });
    byCase.get(id).transcripts.push(t);
  }
  cases.push(...byCase.values());
}

test.describe('[R1][R3] Test-case transcripts through the student screens (local/staging only)', () => {
  test.skip(cases.length === 0, `No transcripts found at ${CASES_FILE}`);
  test.describe.configure({ mode: 'serial' }); // one application at a time, like a real student
  test.setTimeout(240_000);

  for (const c of cases) {
    test(`[R1][R3] ${c.id} ${c.name}: apply with transcript${c.transcripts.length > 1 ? 's' : ''} and track it`, async ({ page }) => {
      A.requireWriteSafeSite();
      const t = c.transcripts[0];
      const [first, ...rest] = t.student.split(' ');
      const email = `qa.${c.id.toLowerCase()}.${Date.now()}@example.com`;

      // Step 1: applicant details from transcripts.json
      await A.openApplication(page);
      await A.fillStep1(page, {
        firstName: first, lastName: rest.join(' ') || 'Test', email,
        institution: t.institution, program: programFor(t.major), term: t.start,
      });
      await A.cont(page);
      await expect(page.getByRole('heading', { name: 'Academic Documents' })).toBeVisible({ timeout: 20_000 });

      // Step 2: upload this case's transcript PDF(s) into the "Academic Transcript" box
      const files = c.transcripts.map((x) => path.join(DIR, x.file));
      // Found by its visible title: the box's aria-label is a React element, so it reads "[object Object]"
      // (DocumentDropzone.jsx, <section aria-label={title}>)
      const transcriptBox = page.locator('section').filter({ hasText: 'Academic Transcript' }).first();
      await transcriptBox.locator('input[type="file"]').setInputFiles(files);
      for (const x of c.transcripts) {
        await expect(transcriptBox.getByText(x.file)).toBeVisible();
      }
      await expect(transcriptBox.getByText('Uploaded')).toHaveCount(files.length, { timeout: 90_000 });

      // Steps 3–4: continue, confirm and submit
      await A.cont(page);
      await expect(page.getByRole('heading', { name: 'Additional Information' })).toBeVisible();
      await A.cont(page);
      await expect(page.getByRole('heading', { name: 'Review & Submit' })).toBeVisible();
      for (const x of c.transcripts) await expect(page.getByText(x.file).first()).toBeVisible();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /Submit Application/ }).click();

      // Confirmation page shows the application number
      await expect(page.getByRole('heading', { name: 'Application Submitted' })).toBeVisible({ timeout: 30_000 });
      const number = (await page.locator('span.font-mono').first().textContent()).trim();
      expect(number).toMatch(/\w+-\d+/);
      test.info().annotations.push({ type: 'application', description: `${c.id} → ${number} (${email})` });

      // Track it and wait until every transcript course is listed
      await page.goto(`/track?application=${encodeURIComponent(number)}`);
      await page.getByLabel('Application number').fill(number);
      await page.getByLabel('Email address').first().fill(email);
      await page.getByRole('button', { name: /^Track Application/ }).click();
      await expect(page.getByText(number).first()).toBeVisible({ timeout: 20_000 });

      const expected = [...new Set(c.transcripts.flatMap((x) => x.courses.map((k) => norm(k.code))))];
      await expect.poll(async () => {
        const text = norm(await page.locator('main').innerText());
        return expected.filter((code) => !text.includes(code));
      }, { message: `courses not shown on the tracking page for ${c.id}`, timeout: 120_000, intervals: [5_000] }).toEqual([]);

      await expect(page.getByRole('heading', { name: /Transfer Credit Summary/ })).toBeVisible();
    });
  }
});
