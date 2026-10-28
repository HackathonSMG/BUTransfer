// Shared steps for the 5-step application at /apply (pages/student/ApplicationForm.jsx).
const { expect } = require('@playwright/test');
const path = require('path');

const fixture = (name) => path.join(__dirname, '..', 'fixtures', name);

const VALID = {
  firstName: 'Test', lastName: 'Student', email: 'test.student@example.com', phone: '+1 (617) 555-0142',
  dob: '2004-05-14', address: '1 Test St, Boston, MA 02215', institution: 'Test Community College',
  major: 'Computer Science', gpa: '3.5', credits: '60', program: 'computer_science', term: 'fall_2027',
};

// The footer shows "Step N of 5" on every step.
const atStep = (page, n) => expect(page.getByText(`Step ${n} of 5`)).toBeVisible();
const next = (page) => page.getByRole('button', { name: 'Next' }).click();

async function openApplication(page) {
  await page.goto('/apply');
  await atStep(page, 1);
}

async function fillStep1(page, data = {}) {
  const d = { ...VALID, ...data };
  await page.getByRole('textbox', { name: 'First Name' }).fill(d.firstName);
  await page.getByRole('textbox', { name: 'Last Name' }).fill(d.lastName);
  await page.getByPlaceholder('you@example.com').fill(d.email);
  await page.getByPlaceholder('+1 (555) 000-0000').fill(d.phone);
  await page.locator('input[type="date"]').fill(d.dob);
  await page.getByPlaceholder('Street, City, State, ZIP').fill(d.address);
}

async function fillStep2(page, data = {}) {
  const d = { ...VALID, ...data };
  await page.getByPlaceholder('e.g., University of Massachusetts Boston').fill(d.institution);
  await page.getByPlaceholder('e.g., Computer Science').fill(d.major);
  await page.getByPlaceholder('e.g., 3.50').fill(d.gpa);
  await page.getByPlaceholder('e.g., 60').fill(d.credits);
}

async function fillStep3(page, data = {}) {
  const d = { ...VALID, ...data };
  await page.locator('select').nth(0).selectOption(d.program);
  await page.locator('select').nth(1).selectOption(d.term);
}

// Upload boxes in order: 0 transcript, 1 ID, 2 syllabi, 3 other documents.
const uploadInput = (page, index) => page.locator('input[type="file"]').nth(index);

async function goToDocuments(page) {
  await openApplication(page);
  await fillStep1(page); await next(page); await atStep(page, 2);
  await fillStep2(page); await next(page); await atStep(page, 3);
  await fillStep3(page); await next(page); await atStep(page, 4);
}

module.exports = { VALID, fixture, atStep, next, openApplication, fillStep1, fillStep2, fillStep3, uploadInput, goToDocuments };
