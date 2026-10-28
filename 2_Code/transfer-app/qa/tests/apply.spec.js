// [R1][R2] Student transfer application at /apply.
const { test, expect } = require('@playwright/test');
const A = require('./helpers/apply');

test.describe('[R2] Step 1 · Personal information', () => {
  test.beforeEach(async ({ page }) => A.openApplication(page));

  test('[R2] required fields are enforced', async ({ page }) => {
    await A.next(page);
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Valid email address is required')).toBeVisible();
  });

  test('[R2] invalid email is rejected', async ({ page }) => {
    await A.fillStep1(page, { email: 'bad-email' });
    await A.next(page);
    await expect(page.getByText('Valid email address is required')).toBeVisible();
    await A.atStep(page, 1);
  });

  test('[R2][BUG #5] phone number with letters is rejected', async ({ page }) => {
    await A.fillStep1(page, { phone: 'abc' });
    await A.next(page);
    await A.atStep(page, 1);
  });

  test('[R2][BUG #4] date of birth in the future is rejected', async ({ page }) => {
    await A.fillStep1(page, { dob: '2030-01-01' });
    await A.next(page);
    await A.atStep(page, 1);
  });

  test('[R1] valid data moves to step 2', async ({ page }) => {
    await A.fillStep1(page);
    await A.next(page);
    await A.atStep(page, 2);
  });
});

test.describe('[R2] Step 2 · Academic background', () => {
  test.beforeEach(async ({ page }) => {
    await A.openApplication(page);
    await A.fillStep1(page);
    await A.next(page);
  });

  for (const gpa of ['5.5', '-1']) {
    test(`[R2] GPA ${gpa} is rejected`, async ({ page }) => {
      await A.fillStep2(page, { gpa });
      await A.next(page);
      await expect(page.getByText('Valid GPA (0.0–4.0) is required')).toBeVisible();
    });
  }

  test('[R2][BUG #2] negative total credits are rejected', async ({ page }) => {
    await A.fillStep2(page, { credits: '-10' });
    await A.next(page);
    await A.atStep(page, 2);
  });

  test('[R1] Previous keeps step 1 data', async ({ page }) => {
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(A.VALID.firstName);
  });
});

test('[R2] Step 3 · program and start term are required', async ({ page }) => {
  await A.openApplication(page);
  await A.fillStep1(page); await A.next(page);
  await A.fillStep2(page); await A.next(page);
  await A.next(page);
  await expect(page.getByText('Program is required')).toBeVisible();
  await expect(page.getByText('Expected start term is required')).toBeVisible();
});

test.describe('[R1][R2] Step 4 · Documents', () => {
  test.beforeEach(async ({ page }) => A.goToDocuments(page));

  test('[R1] transcript is required', async ({ page }) => {
    await A.next(page);
    await expect(page.getByText('Official transcript is required')).toBeVisible();
  });

  test('[R2][BUG #1] a .txt file is refused on the Documents step', async ({ page }) => {
    await A.uploadInput(page, 0).setInputFiles(A.fixture('not-a-transcript.txt'));
    await A.next(page);
    await A.atStep(page, 4);
  });

  test('[R2][BUG #3] help text matches the file types each box accepts', async ({ page }) => {
    const inputs = page.locator('input[type="file"]');
    const helpTexts = page.getByText(/^Accepted:/);
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const accept = ((await inputs.nth(i).getAttribute('accept')) || '').toLowerCase();
      const help = (await helpTexts.nth(i).textContent()) || '';
      for (const type of ['PDF', 'DOC', 'DOCX', 'JPG', 'PNG']) {
        if (new RegExp(`\\b${type}\\b`).test(help)) {
          expect.soft(accept, `box ${i + 1} says ${type} but does not accept it`).toContain(`.${type.toLowerCase()}`);
        }
      }
    }
  });

  test('[R2][BUG #8] a transcript over the server limit (10 MB) is rejected before submit', async ({ page }) => {
    await A.uploadInput(page, 0).setInputFiles({ name: 'big-transcript.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(15 * 1024 * 1024, 32) });
    await expect(page.getByText(/exceeds \d+MB limit/)).toBeVisible();
  });

  test('[R9][BUG #9] upload boxes can be reached with the keyboard', async ({ page }) => {
    const zone = page.getByText('Click or drag & drop to upload').first().locator('xpath=..');
    const focusable = await zone.evaluate((el) => el.tabIndex >= 0 || ['button', 'link'].includes(el.getAttribute('role')));
    expect(focusable).toBeTruthy();
  });

  test('[R1] PDF transcript and syllabus appear on the review page', async ({ page }) => {
    await A.uploadInput(page, 0).setInputFiles(A.fixture('test-transcript.pdf'));
    await A.uploadInput(page, 2).setInputFiles(A.fixture('test-syllabus.pdf'));
    await expect(page.getByText('test-transcript.pdf')).toBeVisible();
    await A.next(page);
    await A.atStep(page, 5);
    await expect(page.getByText('Transcript: test-transcript.pdf')).toBeVisible();
    await expect(page.getByText('1 syllabus file(s)')).toBeVisible();
  });
});

test.describe('[R1] Step 5 · Review & submit', () => {
  test.beforeEach(async ({ page }) => {
    await A.goToDocuments(page);
    await A.uploadInput(page, 0).setInputFiles(A.fixture('test-transcript.pdf'));
    await A.next(page);
  });

  test('[R1] review shows what the student entered', async ({ page }) => {
    for (const v of [A.VALID.firstName, A.VALID.email, A.VALID.institution, 'Computer Science', 'Fall 2027']) {
      await expect(page.getByText(v, { exact: true }).first()).toBeVisible();
    }
  });

  test('[R2] submit is blocked until the confirmation box is ticked', async ({ page }) => {
    // Safe on any site: the form validates step 5 before calling the API.
    await page.getByRole('button', { name: 'Submit Application' }).click();
    await expect(page.getByText('You must confirm the information is accurate')).toBeVisible();
    await A.atStep(page, 5);
  });

  test('[R1] submits a test application (only with ALLOW_SUBMIT=true)', async ({ page }) => {
    test.skip(process.env.ALLOW_SUBMIT !== 'true', 'Creates a record. Set ALLOW_SUBMIT=true on local or staging to run.');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Submit Application' }).click();
    await expect(page).toHaveURL(/\/apply\/confirm/, { timeout: 20_000 });
  });
});
