// Shared helpers for the transcript-first submission at /apply (pages/applicant/TransferCreditApplication.jsx)
// and for the team's test-case transcripts in 5_Test_Cases/transcripts.
//
// Step 1 "Upload" reads each file with POST /api/student/transcripts/read, which stores NOTHING.
// Step 2 "Review & confirm" only shows what was read. Data is saved ONLY when "Submit for Credit Evaluation"
// is clicked, so tests that stop before that are safe on production. blockSaving() enforces it.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const fixture = (name) => path.join(__dirname, '..', 'fixtures', name);
// qa/tests/helpers → repo root (BUTransfer) → 5_Test_Cases/transcripts. TRANSCRIPT_DIR overrides it.
const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || path.resolve(__dirname, '../../../../../5_Test_Cases/transcripts');
const CASES_FILE = path.join(TRANSCRIPT_DIR, 'transcripts.json');

// "CS2000", "cs-1800" and "CS 2000" count as the same code
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Test cases from transcripts.json, grouped by TC id (TC16 and TC26 have one transcript per college). */
function loadCases() {
  if (!fs.existsSync(CASES_FILE)) return [];
  const byCase = new Map();
  for (const t of JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'))) {
    const id = t.file.match(/^(TC\d+)/)[1];
    if (!byCase.has(id)) byCase.set(id, { id, name: t.file.replace(/^TC\d+_/, '').replace(/_[^_]+\.pdf$/, '').replace(/_/g, ' '), transcripts: [] });
    byCase.get(id).transcripts.push({ ...t, path: path.join(TRANSCRIPT_DIR, t.file) });
  }
  return [...byCase.values()];
}

/** Fails the test if the page tries to create or submit an application (keeps production clean). */
async function blockSaving(page) {
  await page.route(/\/api\/student\/applications/, (route) => {
    if (route.request().method() === 'GET') return route.continue();
    return route.fulfill({ status: 418, contentType: 'application/json', body: '{"error":{"message":"Blocked by QA: tests never submit on this site"}}' });
  });
}

async function openApplication(page) {
  await page.goto('/apply');
  await expect(page.getByRole('heading', { name: 'Upload your official transcripts' })).toBeVisible();
}

/** Adds files in step 1 and waits until each one has been read. */
async function uploadTranscripts(page, files) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByRole('button', { name: /Review details/ })).toBeEnabled({ timeout: 60_000 });
}

const reviewDetails = async (page) => {
  await page.getByRole('button', { name: /Review details/ }).click();
  await expect(page.getByRole('heading', { name: 'Check what we read' })).toBeVisible();
};

function requireWriteSafeSite() {
  test.skip(process.env.ALLOW_SUBMIT !== 'true', 'Submits a real application. Runs only on local/staging with ALLOW_SUBMIT=true.');
}

module.exports = { fixture, norm, loadCases, blockSaving, openApplication, uploadTranscripts, reviewDetails, requireWriteSafeSite, TRANSCRIPT_DIR };
