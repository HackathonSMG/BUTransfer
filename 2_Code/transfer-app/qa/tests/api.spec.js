// [R7] API protection checks. Read-only: nothing here creates or changes data, so it's safe on any site.
const { test, expect } = require('@playwright/test');

test.describe('[R7] Staff API endpoints reject requests without a session', () => {
  const endpoints = [
    '/api/applications', '/api/admin/overview', '/api/admin/audit-logs', '/api/admin/conflicts',
    '/api/evaluators', '/api/my/dashboard', '/api/my/reviews', '/api/office/applications', '/api/auth/me',
  ];
  for (const path of endpoints) {
    test(`[R7] GET ${path} → 401 or 403`, async ({ request }) => {
      const res = await request.get(path);
      expect([401, 403]).toContain(res.status());
    });
  }

  test('[R7] a fake bearer token is rejected', async ({ request }) => {
    const res = await request.get('/api/applications', { headers: { Authorization: 'Bearer not-a-real-token' } });
    expect(res.status()).toBe(401);
  });
});

test('[R10] health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).status).toBe('ok');
});

test('[R7][BUG #10] email intake does not accept the default example secret', async ({ request }) => {
  // routes/intake.js falls back to 'change-me-intake-secret'. The empty body means nothing is created:
  // 400 would prove the default secret works; 401 means it is rejected (what we want).
  const res = await request.post('/api/intake/email', { headers: { 'x-intake-secret': 'change-me-intake-secret' }, data: {} });
  expect(res.status(), 'Set INTAKE_EMAIL_SECRET in the App Service settings').toBe(401);
});

test('[R3] status API rejects an unknown token', async ({ request }) => {
  const res = await request.get('/api/student/status/00000000-0000-0000-0000-000000000000');
  expect([400, 401, 403, 404]).toContain(res.status());
});
