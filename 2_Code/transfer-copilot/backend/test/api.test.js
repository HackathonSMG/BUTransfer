/**
 * API integration tests. They run against a real PostgreSQL database with the migrations applied
 * (AUTH_PROVIDER=local), reseed it, and exercise the evaluator, student and admin workflows end to end.
 *
 *   DOTENV_CONFIG_PATH=.env.test npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, withTransaction } from '../src/config/db.js';
import { loadSourceData } from '../scripts/lib/source-data.js';
import { clearAll, seedReference, seedPeople, seedApplications, processAll } from '../src/seed/seed.js';

const app = createApp();
const PW = process.env.DEMO_PASSWORD || 'TransferDemo!2026';
const tokens = {};
const login = async (email) => {
  if (tokens[email]) return tokens[email];
  const r = await request(app).post('/api/auth/login').send({ email, password: PW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  tokens[email] = r.body.session.accessToken;
  return tokens[email];
};
const as = (email) => ({
  get: async (url) => request(app).get(url).set('authorization', `Bearer ${await login(email)}`),
  post: async (url, body) => request(app).post(url).set('authorization', `Bearer ${await login(email)}`).send(body || {}),
  patch: async (url, body) => request(app).patch(url).set('authorization', `Bearer ${await login(email)}`).send(body || {}),
  upload: async (url, file) => request(app).post(url).set('authorization', `Bearer ${await login(email)}`).attach('file', file),
});
const SMITH = 'michael.smith@staff.example.org';
const PARK = 'elena.park@staff.example.org';
const DANA = 'dana.whitfield@staff.example.org';
const TOMAS = 'tomas.reyes@staff.example.org';
const MENON = 'ravi.menon@staff.example.org';
const ADMIN = 'registrar.admin@staff.example.org';
const OMAR = 'omar.haddad@students.example.org';
const DANIEL = 'daniel.kim@students.example.org';

before(async () => {
  const src = loadSourceData();
  await withTransaction(async (db) => {
    await clearAll(db);
    const ref = await seedReference(db, src);
    const people = await seedPeople(db, src, ref);
    const apps = await seedApplications(db, src, ref, people);
    await processAll(db, apps);
  });
});
after(async () => { await pool.end(); });

test('health and authentication', async () => {
  assert.equal((await request(app).get('/api/health')).body.status, 'ok');
  assert.equal((await request(app).get('/api/evaluators/me/dashboard')).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: SMITH, password: 'wrong' })).status, 401);
  const me = await as(SMITH).get('/api/auth/me');
  assert.equal(me.body.user.role, 'evaluator');
  assert.equal(me.body.user.staffCode, 'DEP-CS1');
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' })).status, 400);
});

test('role-based access', async () => {
  assert.equal((await as(OMAR).get('/api/evaluators/me/dashboard')).status, 403);
  assert.equal((await as(SMITH).get('/api/students/me/application')).status, 403);
  assert.equal((await as(SMITH).get('/api/admin/overview')).status, 403);
  const danaId = (await as(DANA).get('/api/auth/me')).body.user.evaluatorId;
  assert.equal((await as(SMITH).get(`/api/evaluators/${danaId}/metrics`)).status, 403, 'evaluators only see their own metrics');
  assert.equal((await as(ADMIN).get(`/api/evaluators/${danaId}/metrics`)).status, 200);
});

test('evaluator dashboard and My evaluations come from the database', async () => {
  const d = await as(SMITH).get('/api/evaluators/me/dashboard');
  assert.equal(d.status, 200);
  const m = d.body.metrics;
  assert.ok(m.totalEvaluations > 0 && m.seasonEvaluations > 0);
  assert.equal(m.pendingEvaluations, 6);
  assert.equal(m.activity.length, 14);
  const list = await as(SMITH).get('/api/evaluators/me/evaluations?status=open');
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 6);
  assert.ok(list.body.items.every((x) => x.kind === 'course' && x.applicationId && x.course.id));
  const filtered = await as(SMITH).get('/api/evaluators/me/evaluations?status=open&q=daniel');
  assert.equal(filtered.body.items.length, 3);
  assert.equal((await as(SMITH).get('/api/evaluators/me/evaluations?priority=Urgent')).status, 400);
});

test('department evaluators only see assigned applications', async () => {
  const mine = await as(SMITH).get('/api/applications');
  const all = await as(DANA).get('/api/applications');
  assert.ok(mine.body.items.length < all.body.items.length);
  const notMine = all.body.items.find((x) => !mine.body.items.some((y) => y.applicationId === x.applicationId));
  assert.equal((await as(SMITH).get(`/api/evaluations/${notMine.applicationId}`)).status, 403);
});

test('evaluation detail, decisions, override reason and completion', async () => {
  const daniel = (await as(SMITH).get('/api/evaluators/me/evaluations?q=daniel')).body.items[0].applicationId;
  const c = await as(SMITH).get(`/api/evaluations/${daniel}`);
  assert.equal(c.status, 200);
  assert.equal(c.body.student.name, 'Daniel Kim');
  assert.ok(c.body.attention.length > 0);
  const course = (code) => c.body.courses.find((x) => x.source.code === code);
  const cs2700 = course('CS 2700');
  assert.ok(cs2700.recommendation.reasons.length && cs2700.evidence.length && cs2700.permissions.canDecide);
  assert.equal(cs2700.routing.evaluator.name, 'Dr. Michael Smith');
  // Park cannot decide Smith's course; owner cannot either
  assert.equal((await as(PARK).patch(`/api/course-evaluations/${cs2700.id}/decision`, { action: 'accept' })).status, 403);
  // reject an accept recommendation needs a reason
  assert.equal((await as(SMITH).patch(`/api/course-evaluations/${cs2700.id}/decision`, { action: 'reject' })).status, 400);
  const acc = await as(SMITH).patch(`/api/course-evaluations/${cs2700.id}/decision`, { action: 'accept', comment: 'Together with CS 2100 this covers CS 112.', reviewSeconds: 240 });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.equal((await as(SMITH).patch(`/api/course-evaluations/${cs2700.id}/decision`, { action: 'accept' })).status, 409);
  const ds = course('DS 3000');
  const ovr = await as(SMITH).patch(`/api/course-evaluations/${ds.id}/decision`, { action: 'override', award: 'CS elective (CAS CS 2XX)', credits: 4, reason: 'Elective only.' });
  assert.equal(ovr.status, 200);
  const cs2100 = course('CS 2100');
  const rej = await as(SMITH).patch(`/api/course-evaluations/${cs2100.id}/decision`, { action: 'reject', reason: 'Program design only.' });
  assert.equal(rej.status, 200);
  const hist = await as(SMITH).get(`/api/evaluations/${daniel}/history`);
  assert.ok(hist.body.items.some((h) => h.type === 'course.differs_from_ai'));
  // metrics reflect the decisions
  const m = (await as(SMITH).get('/api/evaluators/me/metrics')).body;
  assert.equal(m.evaluatedTodayLive, 3);
  assert.equal(m.pendingEvaluations, 3);
  // owner cannot complete while CS 3800 (Park) and owner's courses are pending
  const owner = c.body.owner.name === 'Tomás Reyes' ? TOMAS : DANA;
  assert.equal((await as(owner).post(`/api/evaluations/${daniel}/complete`)).status, 422);
  const cs3800 = course('CS 3800');
  assert.equal((await as(PARK).patch(`/api/course-evaluations/${cs3800.id}/decision`, { action: 'accept' })).status, 200);
  assert.equal((await as(SMITH).post(`/api/evaluations/${daniel}/bulk`, { action: 'approve_all_and_complete' })).status, 403);
  const done = await as(owner).post(`/api/evaluations/${daniel}/bulk`, { action: 'approve_all_and_complete' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const after = (await as(owner).get(`/api/evaluations/${daniel}`)).body;
  assert.equal(after.application.status, 'completed');
  // student sees the result without AI wording
  const mineApp = (await as(DANIEL).get('/api/students/me/application')).body;
  assert.equal(mineApp.application.status, 'completed');
  const text = JSON.stringify(mineApp.courses) + JSON.stringify(mineApp.updates);
  assert.ok(!/\bAI\b|agent|automat/i.test(text), 'student view has no automation wording');
});

test('missing information: request, student upload, re-score, confirm', async () => {
  const items = (await as(MENON).get('/api/evaluators/me/evaluations?q=omar')).body.items;
  const it = items.find((x) => x.course.code === 'MATH-UA 235');
  assert.ok(it);
  const ce = it.course.id;
  assert.equal((await as(MENON).patch(`/api/course-evaluations/${ce}/decision`, { action: 'accept' })).status, 422);
  const rq = await as(MENON).post(`/api/course-evaluations/${ce}/request-information`, { message: 'Please upload the syllabus.' });
  assert.equal(rq.status, 201);
  const stu = (await as(OMAR).get('/api/students/me/application')).body;
  const c = stu.courses.find((x) => x.code === 'MATH-UA 235');
  assert.equal(c.status, 'Info requested');
  assert.ok(c.infoRequest);
  const up = await as(OMAR).upload(`/api/students/me/courses/${ce}/documents`, 'samples/MATH-UA-235_syllabus.pdf');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const detail = (await as(MENON).get(`/api/course-evaluations/${ce}`)).body;
  assert.equal(detail.recommendation.trigger, 'student_upload');
  assert.equal(detail.recommendation.award, 'Math elective (CAS MA 1XX)');
  assert.ok(detail.source.description.length > 10);
  assert.equal((await as(MENON).patch(`/api/course-evaluations/${ce}/decision`, { action: 'accept', comment: 'Counts as a math elective.' })).status, 200);
  // other students cannot upload to Omar's course
  assert.equal((await as(DANIEL).upload(`/api/students/me/courses/${ce}/documents`, 'samples/MATH-UA-235_syllabus.txt')).status, 404);
});

test('scenario runner replays TC-01..TC-06 without changing live data', async () => {
  const before = (await pool.query('select count(*)::int as n from public.evaluation_decisions')).rows[0].n;
  const r = await as(ADMIN).get('/api/admin/scenarios');
  assert.equal(r.status, 200);
  for (const sc of r.body.scenarios) assert.ok(sc.pass, `${sc.id} failed: ${JSON.stringify(sc.checks.filter((c) => !c.pass))}`);
  const afterN = (await pool.query('select count(*)::int as n from public.evaluation_decisions')).rows[0].n;
  assert.equal(afterN, before);
});

test('intake: queued paper transcript is evaluated and routed', async () => {
  const before = await as(DANA).get('/api/applications');
  assert.ok(before.body.processing.some((p) => p.student_name === 'Noah Patel'));
  const run = await as(ADMIN).post('/api/admin/intake/run');
  assert.equal(run.status, 200);
  assert.equal(run.body.processed.length, 1);
  const list = await as(ADMIN).get('/api/applications?q=noah&status=all');
  assert.equal(list.body.items.length, 1);
  const c = (await as(ADMIN).get(`/api/evaluations/${list.body.items[0].applicationId}`)).body;
  assert.ok(c.courses.some((x) => x.recommendation.exceptions.includes('Verify scanned value')));
});

test('validation and error handling', async () => {
  assert.equal((await as(SMITH).get('/api/evaluations/not-a-uuid')).status, 400);
  assert.equal((await as(SMITH).get('/api/evaluations/00000000-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await as(SMITH).patch('/api/course-evaluations/00000000-0000-0000-0000-000000000000/decision', { action: 'explode' })).status, 400);
  assert.equal((await request(app).get('/api/nope')).status, 401, 'unknown routes do not reveal themselves to anonymous callers');
  assert.equal((await as(SMITH).get('/api/nope')).status, 404);
  assert.ok(fs.existsSync('samples/MATH-UA-235_syllabus.pdf'));
});

test('evaluation detail carries comparison data the evaluator needs', async () => {
  const items = (await as(SMITH).get('/api/evaluators/me/evaluations?status=all')).body.items;
  const c = (await as(SMITH).get(`/api/course-evaluations/${items[0].course.id}`)).body;
  for (const k of ['source', 'target', 'recommendation', 'analysis', 'evidence', 'similar', 'prerequisites', 'overrideOptions', 'routing']) assert.ok(c[k] !== undefined, `missing ${k}`);
  assert.ok(['Compatible', 'Check', 'None required', 'Not in data'].includes(c.prerequisites.status));
  assert.ok(c.overrideOptions.includes('No credit'));
  assert.ok(['High', 'Medium', 'Low', 'Not scored'].includes(c.analysis.band));
});

test('notifications, search and intake status', async () => {
  const n = await as(OMAR).get('/api/notifications');
  assert.equal(n.status, 200);
  assert.ok(Array.isArray(n.body.items));
  const s = await as(DANA).get('/api/search?q=daniel');
  assert.ok(s.body.students.length >= 1);
  assert.equal((await as(OMAR).get('/api/search?q=daniel')).status, 403);
  assert.equal((await as(DANA).get('/api/intake/status')).status, 200);
  assert.equal((await request(app).get('/api/demo/samples/MATH-UA-235_syllabus.pdf')).status, 200);
  assert.equal((await request(app).get('/api/demo/samples/..%2F.env')).status, 404);
});
