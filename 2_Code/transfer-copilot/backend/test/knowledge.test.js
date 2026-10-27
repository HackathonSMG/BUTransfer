/**
 * Knowledge-base scenarios, end to end through the API against a real PostgreSQL database
 * (AUTH_PROVIDER=local, STORAGE_PROVIDER=local):
 *
 *   1. Ava uploads the first Lakeshore State transcript: no equivalency, AI recommends, evaluator approves → learned
 *   2. Liam uploads the same course: reused, no department review
 *   3. Zoe: CSC 101 reused by code-format match, CS 450 low confidence → manual review, a contradictory grade → verify
 *   4. Mason: CS 450 reused from the decision made for Zoe
 *   plus duplicate protection, versioned admin changes and policy changes.
 *
 *   DOTENV_CONFIG_PATH=.env.test npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, withTransaction } from '../src/config/db.js';
import { loadSourceData } from '../scripts/lib/source-data.js';
import { clearAll, seedReference, seedPeople, seedApplications, processAll } from '../src/seed/seed.js';

const app = createApp();
const PW = process.env.DEMO_PASSWORD || 'TransferDemo!2026';
const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples/transcripts');
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
const ADMIN = 'registrar.admin@staff.example.org';
const DANA = 'dana.whitfield@staff.example.org';
const AVA = 'ava.thompson@students.example.org';
const LIAM = 'liam.carter@students.example.org';
const ZOE = 'zoe.nguyen@students.example.org';
const MASON = 'mason.reed@students.example.org';

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

/** Uploads a sample transcript as the student and waits for the processing job to finish. */
async function uploadAndProcess(email, file) {
  const up = await as(email).upload('/api/transcripts/upload', path.join(SAMPLES, file));
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.match(up.headers.location, /\/api\/transcripts\//);
  let s;
  for (let i = 0; i < 80; i += 1) {
    s = (await as(email).get(`/api/transcripts/${up.body.transcriptId}/processing-status`)).body;
    if (['completed', 'failed'].includes(s.job?.status)) break;
    await new Promise((r) => { setTimeout(r, 150); });
  }
  assert.equal(s.job.status, 'completed', JSON.stringify(s.job));
  return { ...up.body, status: s };
}
const coursesOf = async (email, applicationId) => {
  const cs = (await as(email).get(`/api/evaluations/${applicationId}`)).body;
  return { cs, by: (code) => cs.courses.find((c) => c.source.code === code) };
};

let ava; let zoe;

test('students without a request see the upload path; staff see transcript sources', async () => {
  const st = (await as(AVA).get('/api/students/me/status')).body;
  assert.equal(st.hasApplication, false);
  assert.equal(st.canUpload, true);
  const src = (await as(DANA).get('/api/transcripts/sources')).body.items;
  assert.deepEqual(src.map((x) => x.key).sort(), ['EMAIL', 'INSTITUTION_INTEGRATION', 'MANUAL_UPLOAD', 'PORTAL_UPLOAD']);
  assert.equal((await as(AVA).get('/api/transcripts/sources')).status, 403);
});

test('scenario 1: first transcript from a new school; AI recommends, the evaluator approves, the knowledge base learns', async () => {
  ava = await uploadAndProcess(AVA, 'STU-020_Ava_Thompson_Lakeshore_State.pdf');
  const stages = ava.status.job.stages.map((x) => [x.key, x.status]);
  assert.deepEqual(stages.map((x) => x[1]), Array(7).fill('done'));
  assert.equal(ava.status.job.summary.courses, 3);
  assert.equal(ava.status.job.summary.reused, 0);

  const t = (await as(AVA).get(`/api/transcripts/${ava.transcriptId}`)).body;
  assert.equal(t.source, 'PORTAL_UPLOAD');
  assert.equal(t.institution, 'Lakeshore State University');
  assert.equal(t.extraction.student.name.value, 'Ava Thompson');
  assert.deepEqual(t.courses.map((c) => c.code), ['CS 101', 'MATH 151', 'PSY 101']);
  assert.ok(t.courses.every((c) => Number(c.confidence.code.confidence) >= 90));
  assert.equal((await as(LIAM).get(`/api/transcripts/${ava.transcriptId}`)).status, 404, 'students only see their own transcript');

  const { by } = await coursesOf(SMITH, ava.applicationId);
  const cs101 = by('CS 101');
  assert.equal(cs101.evaluationPath, 'ai_recommended');
  assert.equal(cs101.recommendation.targetCode, 'CAS CS 111');
  assert.ok(cs101.recommendation.matchPct >= 85, `match ${cs101.recommendation.matchPct}`);
  assert.equal(cs101.knowledge.path, 'ai_recommended');
  assert.equal(cs101.knowledge.match, null);
  assert.equal(cs101.routing.evaluator.name, 'Dr. Michael Smith');
  assert.equal(cs101.permissions.canDecide, true);

  const check = (await as(SMITH).get(`/api/course-evaluations/${cs101.id}/equivalency-check?award=CAS%20CS%20111`)).body;
  assert.equal(check.existing.length, 0, 'nothing to duplicate yet');
  const r = await as(SMITH).patch(`/api/course-evaluations/${cs101.id}/decision`, { action: 'accept', comment: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.message, /Saved to the knowledge base as EQ-\d+/);

  // the other departments approve theirs through the evaluation-scoped endpoint
  const { cs } = await coursesOf(DANA, ava.applicationId);
  for (const c of cs.courses.filter((x) => x.source.code !== 'CS 101')) {
    const reviewer = { 'Dr. Ravi Menon': 'ravi.menon@staff.example.org', 'Dr. Marcus Hall': 'marcus.hall@staff.example.org' }[c.routing.evaluator.name];
    const d = await as(reviewer).post(`/api/evaluations/${ava.applicationId}/decision`, { courseEvaluationId: c.id, action: 'accept' });
    assert.equal(d.status, 200, JSON.stringify(d.body));
  }
  const kb = (await as(SMITH).get('/api/equivalencies/search?institution=Lakeshore%20State%20University&status=all')).body;
  assert.equal(kb.items.length, 3);
  assert.ok(kb.items.every((e) => e.origin === 'evaluator_decision' && e.status === 'active' && e.approvals === 1));
});

test('scenario 2: the same course is reused, with no department review', async () => {
  const liam = await uploadAndProcess(LIAM, 'STU-021_Liam_Carter_Lakeshore_State.pdf');
  assert.equal(liam.status.job.summary.reused, 2);
  const { by } = await coursesOf(DANA, liam.applicationId);
  const cs101 = by('CS 101');
  assert.equal(cs101.evaluationPath, 'known_equivalency');
  assert.equal(cs101.routing.routed, false, 'known equivalencies are not sent to a department');
  assert.equal(cs101.knowledge.match.type, 'exact');
  assert.equal(cs101.knowledge.match.approvedBy, 'Dr. Michael Smith');
  assert.match(cs101.knowledge.reason, /approved equivalency/);
  assert.equal(by('ECON 101').evaluationPath, 'ai_recommended');
  const eq = (await as(ADMIN).get(`/api/equivalencies/${cs101.knowledge.match.id}`)).body;
  assert.equal(eq.usage.length, 1);
  assert.equal(eq.usage[0].student, 'Liam Carter');
  // the owner confirms the known equivalency in one click; it counts as another approval
  const bulk = await as(DANA).post(`/api/evaluations/${liam.applicationId}/bulk`, { action: 'confirm_pre_approved' });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
  assert.equal((await as(ADMIN).get(`/api/equivalencies/${cs101.knowledge.match.id}`)).body.equivalency.approvals, 2);
});

test('scenario 3: code-format match reuses, a new course needs manual review, a doubtful value needs verification', async () => {
  zoe = await uploadAndProcess(ZOE, 'STU-022_Zoe_Nguyen_Lakeshore_State.pdf');
  assert.equal(zoe.status.job.summary.lowConfidence, 1);
  const { by } = await coursesOf(SMITH, zoe.applicationId);
  const csc = by('CSC 101');
  assert.equal(csc.evaluationPath, 'known_equivalency');
  assert.equal(csc.knowledge.match.type, 'fuzzy');
  assert.ok(csc.knowledge.match.confidence >= 90);
  const math = by('MATH 151');
  assert.equal(math.evaluationPath, 'manual_review', 'grade read with low confidence');
  assert.ok(math.analysis.hardExceptions.includes('Verify extracted value'));
  const cs450 = by('CS 450');
  assert.equal(cs450.evaluationPath, 'manual_review');
  assert.ok(cs450.recommendation.matchPct < 85);
  assert.match(cs450.knowledge.reason, /Manual review required/);

  // staff verify the grade against the document: corrected value, course re-evaluated, original kept
  const tr = (await as(DANA).get(`/api/transcripts/${zoe.transcriptId}`)).body;
  const line = tr.courses.find((c) => c.code === 'MATH 151');
  assert.equal(line.needsVerification, true);
  const fix = await as(DANA).patch(`/api/transcripts/${zoe.transcriptId}/courses/${line.id}`, { grade: 'A-' });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  assert.match(fix.body.message, /Re-evaluated MATH 151/);
  const after = (await as(DANA).get(`/api/transcripts/${zoe.transcriptId}`)).body.courses.find((c) => c.code === 'MATH 151');
  assert.equal(after.grade, 'A-');
  assert.equal(after.confidence.grade.corrected, 'A-');
  assert.equal(after.confidence.grade.value, 'B+');
  assert.equal(after.evaluationPath, 'known_equivalency');

  // the evaluator decides CS 450 (override with a reason); the decision is learned
  const d = await as(SMITH).patch(`/api/course-evaluations/${cs450.id}/decision`, { action: 'override', award: 'CS elective (CAS CS 3XX)', credits: 3, reason: 'Advanced AI content; no direct BU equivalent.' });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.match(d.body.message, /Saved to the knowledge base/);
});

test('scenario 4: the next student with CS 450 reuses the earlier decision', async () => {
  const mason = await uploadAndProcess(MASON, 'STU-023_Mason_Reed_Lakeshore_State.pdf');
  assert.equal(mason.status.job.summary.reused, 2);
  const { by } = await coursesOf(DANA, mason.applicationId);
  assert.equal(by('CS 450').evaluationPath, 'known_equivalency');
  assert.equal(by('CS 450').recommendation.award, 'CS elective (CAS CS 3XX)');
});

test('duplicates are refused and changes are versioned', async () => {
  const dup = await as(ADMIN).post('/api/equivalencies', { institution: 'Lakeshore State University', sourceCode: 'CS 101', award: 'CAS CS 111', reason: 'Department memo' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.details.existing[0].source.code, 'CS 101');
  assert.equal((await as(SMITH).post('/api/equivalencies', { institution: 'x', sourceCode: 'CS 1', award: 'y', reason: 'zzz' })).status, 403);

  const eq = (await as(ADMIN).get('/api/equivalencies/search?q=CS%20450&institution=Lakeshore%20State%20University')).body.items[0];
  const exp = await as(ADMIN).patch(`/api/equivalencies/${eq.id}`, { action: 'expire', reason: 'Curriculum changed for 2027' });
  assert.equal(exp.status, 200, JSON.stringify(exp.body));
  const det = (await as(ADMIN).get(`/api/equivalencies/${eq.id}`)).body;
  assert.equal(det.equivalency.status, 'expired');
  assert.equal(det.equivalency.version, 2);
  assert.deepEqual(det.versions.map((v) => v.change), ['created', 'status_changed']);
  assert.equal((await as(ADMIN).patch(`/api/equivalencies/${eq.id}`, { action: 'expire', reason: 'again' })).status, 409);

  const ins = (await as(ADMIN).get('/api/knowledge/insights')).body;
  assert.ok(ins.stats.reuses >= 4);
  assert.ok(ins.aiAccuracy.length > 0);
  assert.equal(ins.trend.length, 30);
  assert.equal((await as(SMITH).get('/api/knowledge/insights')).status, 403);
});

test('policy thresholds are versioned and validated', async () => {
  const p0 = (await as(SMITH).get('/api/knowledge/policy')).body;
  const bad = await as(ADMIN).patch('/api/knowledge/policy', { reuse_min_confidence: 60, similar_min_confidence: 80 });
  assert.equal(bad.status, 400);
  const ok = await as(ADMIN).patch('/api/knowledge/policy', { ai_recommend_min_confidence: 90 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.notEqual(ok.body.policy.policy_version, p0.policy_version);
  assert.equal((await as(SMITH).patch('/api/knowledge/policy', { ai_recommend_min_confidence: 70 })).status, 403);
});

test('upload validation, duplicates and the one-open-request rule', async () => {
  const again = await as(AVA).upload('/api/transcripts/upload', path.join(SAMPLES, 'STU-020_Ava_Thompson_Lakeshore_State.pdf'));
  assert.equal(again.status, 409);
  const bad = await request(app).post('/api/transcripts/upload').set('authorization', `Bearer ${await login(MASON)}`).attach('file', Buffer.from('x'), 'evil.exe');
  assert.equal(bad.status, 400);
  assert.equal((await as(SMITH).upload('/api/transcripts/upload', path.join(SAMPLES, 'STU-023_Mason_Reed_Lakeshore_State.pdf'))).status, 403, 'department evaluators do not upload');
  assert.ok(fs.existsSync(SAMPLES));
});

test('dashboards show AI processing → historical knowledge → human review', async () => {
  const d = (await as(SMITH).get('/api/evaluators/me/dashboard')).body;
  assert.ok(d.flow.reused >= 4);
  assert.ok(d.flow.courses >= d.flow.reused);
  const o = (await as(ADMIN).get('/api/admin/overview')).body;
  assert.ok(o.knowledge.learned >= 4);
});
