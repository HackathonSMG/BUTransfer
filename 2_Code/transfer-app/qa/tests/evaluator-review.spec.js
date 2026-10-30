// [GOAL-DEPT-DECIDES] Department evaluator review/decision flow: ownership, validation, and the decision
// vocabulary enforced by backend/src/services/workflow/review.service.js. API-level only: a review id never
// belongs to the anonymous caller, so every call below is rejected before it can change anything (safe on any
// build, production included). UI checks use the EVALUATOR_* storage state for what the signed-in evaluator
// actually sees, no seeded review required.
const { test, expect } = require('@playwright/test');

const has = (...vars) => vars.every((v) => process.env[v]);
const NO_ID = '00000000-0000-0000-0000-000000000000';

test.describe('[GOAL-DEPT-DECIDES] Review decision endpoints reject anonymous callers', () => {
  // my.js:25 — router.use(requireAuth, requireRole('evaluator')) gates the whole router. A request with no
  // Authorization header fails at requireAuth (authenticate.js:9-11: unauthorized('No authentication token
  // provided')), which utils/errors.js defines as exactly status 401 — never 403 for a missing token.
  const endpoints = [
    ['post', `/api/my/reviews/${NO_ID}/start`],
    ['post', `/api/my/reviews/${NO_ID}/decision`],
    ['post', `/api/my/reviews/${NO_ID}/check`],
    ['post', `/api/my/reviews/${NO_ID}/request-info`],
    ['post', `/api/my/reviews/${NO_ID}/reassign`],
    ['post', `/api/my/reviews/${NO_ID}/escalate`],
    ['get', `/api/my/reviews/${NO_ID}`],
  ];
  for (const [method, path] of endpoints) {
    test(`${method.toUpperCase()} ${path.replace(NO_ID, ':id')} without sign-in → 401`, async ({ request }) => {
      const res = await request[method](path, { data: {} });
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('[GOAL-DEPT-DECIDES] A review id that is not yours is "not found", not "forbidden"', () => {
  // review.service.js ownReview() (line ~38-46): SELECT ... WHERE r.id = $1 AND r.evaluator_id = $2; no row means
  // notFound('Evaluation') — a 404, deliberately not a 403, so probing another evaluator's review id does not
  // confirm the review exists. Needs a signed-in evaluator so the request clears auth and reaches ownReview().
  test.skip(!has('EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'), 'Needs EVALUATOR_EMAIL / EVALUATOR_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/evaluator.json' });

  test('a non-existent review id → 404, not 403', async ({ request }) => {
    const res = await request.get(`/api/my/reviews/${NO_ID}`);
    expect(res.status()).toBe(404);
  });
});

test.describe('[GOAL-DEPT-DECIDES] /decision validates the body with zod before ownReview() runs', () => {
  // routes/my.js POST /reviews/:id/decision: decisionSchema = z.object({ decision: z.enum(reviewService.DECISIONS), ... }).
  // The route calls decisionSchema.safeParse(req.body) and returns badRequest(...) (400) on failure BEFORE calling
  // reviewService.decideReview() — so for an invalid/missing decision, ownReview() never runs and the review id's
  // ownership is never checked. (Confirmed by reading my.js:168-182, not assumed from review.service.js alone.)
  test.skip(!has('EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'), 'Needs EVALUATOR_EMAIL / EVALUATOR_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/evaluator.json' });

  test('an unknown decision string is rejected at the route, before ownership is checked', async ({ request }) => {
    const res = await request.post(`/api/my/reviews/${NO_ID}/decision`, { data: { decision: 'approve_everything' } });
    expect(res.status()).toBe(400);
  });

  test('a missing decision field is rejected at the route, before ownership is checked', async ({ request }) => {
    const res = await request.post(`/api/my/reviews/${NO_ID}/decision`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('a valid decision value on a review you do not own reaches ownReview() and is 404', async ({ request }) => {
    // decision: 'no_credit' passes decisionSchema (it's in reviewService.DECISIONS), so the route calls
    // reviewService.decideReview(), which calls ownReview() first (review.service.js:286) — NO_ID is never
    // owned by the test evaluator, so this is 404, not 403.
    const res = await request.post(`/api/my/reviews/${NO_ID}/decision`, { data: { decision: 'no_credit', reason: 'qa probe' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('[GOAL-DEPT-DECIDES] /reassign validates the reason with zod before ownReview() runs', () => {
  // routes/my.js POST /reviews/:id/reassign: reason: z.enum(Object.keys(reviewService.REASSIGN_REASONS)), validated
  // by the route (my.js:223-226) before reviewService.requestReassignment() — and therefore before ownReview() —
  // is ever called. An unlisted reason is 400 at the route layer, not 404 from the service.
  test.skip(!has('EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'), 'Needs EVALUATOR_EMAIL / EVALUATOR_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/evaluator.json' });

  test('an unlisted reassignment reason is rejected at the route, before ownership is checked', async ({ request }) => {
    const res = await request.post(`/api/my/reviews/${NO_ID}/reassign`, { data: { reason: 'i_feel_like_it' } });
    expect(res.status()).toBe(400);
  });
});

test.describe('[GOAL-FASTER][GOAL-TRANSPARENT] Evaluator UI surfaces', () => {
  // UI-only, read-only smoke checks against pages that exist whether or not this evaluator has open reviews.
  test.skip(!has('EVALUATOR_EMAIL', 'EVALUATOR_PASSWORD'), 'Needs EVALUATOR_EMAIL / EVALUATOR_PASSWORD (test account)');
  test.use({ storageState: 'playwright/.auth/evaluator.json' });

  test('[GOAL-TRANSPARENT] my-evaluations queue loads without an error banner', async ({ page }) => {
    await page.goto('/evaluator/my-evaluations');
    await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);
  });

  test('[GOAL-FASTER] equivalencies knowledge base offers "Propose equivalency", not "Add equivalency"', async ({ page }) => {
    // Equivalencies.jsx: role === 'evaluator' shows "Propose equivalency" (admin/credit_office get "Add
    // equivalency" instead) — MANAGERS-gated UI mirrors the 403 the backend returns to a non-manager.
    await page.goto('/evaluator/equivalencies');
    await expect(page.getByRole('button', { name: 'Propose equivalency' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add equivalency', exact: true })).toHaveCount(0);
  });

  test("[GOAL-PRIVACY] evaluator cannot approve or reject an equivalency proposal (manager-only)", async ({ request }) => {
    // routes/memory.js:14 — const MANAGERS = requireRole('admin', 'credit_office'); applied as route middleware
    // on POST /proposals/:id/approve and /reject (memory.js:60,67). require-role.js throws forbidden() (403) for
    // any role not in that list, so a signed-in evaluator always gets 403 here, regardless of whether NO_ID exists.
    const approve = await request.post(`/api/memory/proposals/${NO_ID}/approve`, { data: {} });
    const reject = await request.post(`/api/memory/proposals/${NO_ID}/reject`, { data: { review_note: 'qa probe' } });
    for (const res of [approve, reject]) expect(res.status()).toBe(403);
  });
});
