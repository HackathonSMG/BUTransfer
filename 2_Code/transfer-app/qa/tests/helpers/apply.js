// Shared steps for the 4-step application at /apply (pages/applicant/EligibilityApplication.jsx).
// IMPORTANT: clicking "Continue" on step 1 with valid details saves a DRAFT APPLICATION on the server.
// Tests that go past step 1 must call requireWriteSafeSite() so they never run against production.
const { test, expect } = require('@playwright/test');
const path = require('path');

const fixture = (name) => path.join(__dirname, '..', 'fixtures', name);

const VALID = {
  firstName: 'Test', lastName: 'Student', email: 'test.student@example.com',
  institution: 'Test Community College',
};

// The footer shows "Step N of 4" (hidden on phone widths, so this is for desktop tests).
const atStep = (page, n) => expect(page.getByText(`Step ${n} of 4`)).toBeVisible();
const cont = (page) => page.getByRole('button', { name: /^Continue/ }).click();

async function openApplication(page) {
  // The form keeps a draft in sessionStorage; start each test clean.
  await page.addInitScript(() => { try { sessionStorage.removeItem('bu.transfer.application'); } catch {} });
  await page.goto('/apply');
  await expect(page.getByRole('heading', { name: 'Applicant Information' })).toBeVisible();
}

async function fillStep1(page, data = {}) {
  const d = { ...VALID, ...data };
  await page.getByLabel('First name').fill(d.firstName);
  await page.getByLabel('Last name').fill(d.lastName);
  await page.getByLabel('Email address', { exact: false }).first().fill(d.email);
  await page.getByLabel('Confirm email address').fill(d.confirmEmail ?? d.email);
  await page.getByLabel('Previous college or university').fill(d.institution);
  // program/term: '' = leave empty, a label = choose that option, undefined = first option
  if (d.program !== '') await page.getByLabel('Intended program at BU').selectOption(d.program ? { label: d.program } : { index: 1 });
  if (d.term !== '') await page.getByLabel('Intended start term').selectOption(d.term ? { label: d.term } : { index: 1 });
}

function requireWriteSafeSite() {
  test.skip(process.env.ALLOW_SUBMIT !== 'true', 'Saves a draft application. Runs only on local/staging with ALLOW_SUBMIT=true.');
}

module.exports = { VALID, fixture, atStep, cont, openApplication, fillStep1, requireWriteSafeSite };
