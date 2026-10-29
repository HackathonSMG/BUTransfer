// API checks. Nothing here creates or changes data: every write below is refused before it does anything,
// because it has no staff sign-in. Safe on every build, production included.
const { test, expect } = require('@playwright/test');

const NO_ID = '00000000-0000-0000-0000-000000000000';

test.describe('[GOAL-DEPT-DECIDES] Only signed-in staff can decide credit', () => {
  // Problem statement: "Academic departments make the final decision. Your solution must leave that decision with them."
  const decisionEndpoints = [
    `/api/applications/${NO_ID}/decision`,                       // Credit Office final decision
    `/api/applications/${NO_ID}/courses/${NO_ID}/decision`,      // per-course decision
    `/api/applications/${NO_ID}/courses/approve-automatic`,      // batch approval of established equivalencies
    `/api/my/reviews/${NO_ID}/decision`,                         // department evaluator's decision
  ];
  for (const path of decisionEndpoints) {
    test(`[GOAL-DEPT-DECIDES] POST ${path.replace(NO_ID, ':id').replace(NO_ID, ':id')} without staff sign-in → 401/403`, async ({ request }) => {
      const res = await request.post(path, { data: { decision: 'approved', comments: 'qa probe' } });
      expect([401, 403]).toContain(res.status());
    });
  }

  test('[GOAL-DEPT-DECIDES] a fake staff token cannot decide', async ({ request }) => {
    const res = await request.post(`/api/applications/${NO_ID}/decision`, { headers: { Authorization: 'Bearer not-a-real-token' }, data: {} });
    expect(res.status()).toBe(401);
  });
});

test.describe('[GOAL-PRIVACY] Student records are private', () => {
  // Problem statement: "Student records are private."
  for (const path of ['/api/applications', '/api/admin/overview', '/api/admin/audit-logs', '/api/admin/conflicts',
    '/api/evaluators', '/api/my/dashboard', '/api/my/reviews', '/api/office/applications', '/api/auth/me']) {
    test(`[GOAL-PRIVACY] GET ${path} without sign-in → 401/403`, async ({ request }) => {
      expect([401, 403]).toContain((await request.get(path)).status());
    });
  }

  test('[GOAL-PRIVACY] an unknown status link reveals nothing', async ({ request }) => {
    const res = await request.get(`/api/student/status/${NO_ID}`);
    expect([400, 401, 403, 404]).toContain(res.status());
  });

  test('[GOAL-PRIVACY] tracking needs a matching Transfer Credit ID and email', async ({ request }) => {
    const res = await request.post('/api/student/track', { data: { application_number: 'TC-0000-0000', email: 'nobody@example.com' } });
    expect([400, 404, 429]).toContain(res.status());
  });
});

test('[GOAL-TRANSPARENT] health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).status).toBe('ok');
});

test('[GOAL-PRIVACY][BUG #10] email intake does not accept the default example secret', async ({ request }) => {
  // routes/intake.js falls back to 'change-me-intake-secret'. The empty body means nothing is created either way.
  const res = await request.post('/api/intake/email', { headers: { 'x-intake-secret': 'change-me-intake-secret' }, data: {} });
  expect(res.status(), 'Set INTAKE_EMAIL_SECRET in the App Service settings').toBe(401);
});
