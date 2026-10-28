// @ts-check
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// Safety guard: never run record-creating tests against the production Azure slot.
if (process.env.ALLOW_SUBMIT === 'true' && /azurewebsites\.net/.test(BASE_URL)) {
  throw new Error('ALLOW_SUBMIT=true is not allowed against the production site. Use local dev or a staging copy.');
}

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/artifacts',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }], // read by foundry/analyze-results.mjs
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /(admin|mobile)\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
    { name: 'staff', use: { ...devices['Desktop Chrome'] }, testMatch: /admin\.spec\.js/, dependencies: ['setup'] },
  ],
});
