/**
 * Applicant demo scenarios for Track Application. Advances sample-student applications (seed-sample-students.js)
 * through the real evaluator and Credit Evaluation Office services, so each one shows a different applicant view:
 *   B  existing application for the same email   Leah Chen      left in department review (try her email on /apply)
 *   C  additional information required (syllabus) Daniel Kim     a syllabus is requested on one course
 *   D  multiple courses, mixed outcomes            Sofia Martinez accepted, not accepted and still-pending courses
 *   E  completed, transfer credit awarded          Priya Shah     every course decided and posted
 * Scenario A (a normal new application) is submitted live through /apply during the demo.
 * The applicants use @students.example.org addresses: reserved, so no email is ever sent for them.
 * Safe to re-run: an application already past the scenario's state is left alone.
 * Run after db:seed:samples and db:seed:workflow.  Usage: node scripts/seed-applicant-demo.js
 */
import 'dotenv/config';
import { query, pool } from '../src/config/db.js';
import { decideReview, startReview, requestInformation } from '../src/services/workflow/review.service.js';
import { postCredits } from '../src/services/workflow/lifecycle.service.js';

const OPEN = ['new', 'in_progress'];
const userOf = async (id) => (await query(`SELECT id, email, full_name, role FROM profiles WHERE id = $1`, [id])).rows[0];

async function appFor(name) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@students.example.org`;
  const { rows: [app] } = await query(`SELECT id, reference_number, status, student_email FROM applications WHERE student_email = $1 ORDER BY created_at LIMIT 1`, [email]);
  return app || null;
}

async function openReviews(applicationId) {
  const { rows } = await query(
    `SELECT r.id, r.status, r.evaluator_id, tc.course_code FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
     WHERE r.application_id = $1 AND r.status = ANY($2) AND r.evaluator_id IS NOT NULL ORDER BY r.sequence, tc.position`, [applicationId, OPEN]);
  return rows;
}

// The evaluator's own decision: accept the proposed BU course, else elective credit, else no credit
async function decide(review, preferred = 'equivalent') {
  const user = await userOf(review.evaluator_id);
  if (review.status === 'new') await startReview(review.id, user);
  const attempts = preferred === 'no_credit'
    ? [{ decision: 'no_credit', reason: 'Content does not meet the requirements of the BU course.' }]
    : [{ decision: 'equivalent' }, { decision: 'elective', elective_label: 'General elective', reason: 'No direct BU equivalent; awarded as elective credit.' }];
  for (const a of attempts) {
    try { await decideReview(review.id, a, user); return a.decision; } catch { /* try the next outcome */ }
  }
  return null;
}

// Decides open reviews round by round (sequential hand-offs open the next evaluator's courses) until `keepOpen` remain
async function decideAll(applicationId, { keepOpen = 0, noCredit = 0 } = {}) {
  const done = [];
  for (let round = 0; round < 10; round++) {
    const open = await openReviews(applicationId);
    const pendingTotal = (await query(`SELECT COUNT(*)::int n FROM course_reviews WHERE application_id = $1 AND status IN ('queued', 'new', 'in_progress')`, [applicationId])).rows[0].n;
    if (!open.length || pendingTotal <= keepOpen) break;
    for (const r of open.slice(0, Math.max(pendingTotal - keepOpen, 0))) {
      const outcome = await decide(r, done.filter((d) => d.outcome === 'no_credit').length < noCredit ? 'no_credit' : 'equivalent');
      done.push({ course: r.course_code, outcome });
    }
  }
  return done;
}

const creditOffice = async () => (await query(`SELECT id, email, full_name, role FROM profiles WHERE role::text = 'credit_office' AND is_active ORDER BY created_at LIMIT 1`)).rows[0];

async function scenarioC() {
  const app = await appFor('Daniel Kim');
  if (!app) return 'C  Daniel Kim: no application (run db:seed:samples)';
  const { rows: [pending] } = await query(`SELECT 1 FROM information_requests WHERE application_id = $1 AND status = 'pending' LIMIT 1`, [app.id]);
  if (!pending) {
    const [review] = await openReviews(app.id);
    if (!review) return `C  Daniel Kim ${app.reference_number}: no open course to request a syllabus for (${app.status})`;
    const user = await userOf(review.evaluator_id);
    if (review.status === 'new') await startReview(review.id, user);
    await requestInformation(review.id, { kind: 'syllabus', message: `Please upload the syllabus for ${review.course_code}, including weekly topics and learning outcomes.` }, user);
  }
  return line('C', 'Daniel Kim', 'syllabus requested', app.id);
}

async function scenarioD() {
  const app = await appFor('Sofia Martinez');
  if (!app) return 'D  Sofia Martinez: no application (run db:seed:samples)';
  if (!['credit_posted', 'ready_for_posting'].includes(app.status)) await decideAll(app.id, { keepOpen: 1, noCredit: 1 });
  return line('D', 'Sofia Martinez', 'mixed outcomes', app.id);
}

async function scenarioE() {
  const app = await appFor('Priya Shah');
  if (!app) return 'E  Priya Shah: no application (run db:seed:samples)';
  if (app.status !== 'credit_posted') {
    await decideAll(app.id);
    const office = await creditOffice();
    if (!office) return 'E  Priya Shah: no Credit Evaluation Office account (import the staff roster first)';
    try { await postCredits(app.id, office); } catch (err) { return `E  Priya Shah ${app.reference_number}: could not post yet: ${err.message}`; }
  }
  return line('E', 'Priya Shah', 'completed', app.id);
}

async function scenarioB() {
  const app = await appFor('Leah Chen');
  if (!app) return 'B  Leah Chen: no application (run db:seed:samples)';
  return line('B', 'Leah Chen', 'existing application', app.id);
}

async function line(code, name, what, id) {
  const { rows: [a] } = await query(`SELECT reference_number, status, student_email FROM applications WHERE id = $1`, [id]);
  return `${code}  ${what.padEnd(22)} ${name.padEnd(15)} ${a.reference_number}  ${a.student_email}  (${a.status})`;
}

async function main() {
  console.log('[Applicant demo] Track with the application number and email shown:');
  for (const s of [scenarioB, scenarioC, scenarioD, scenarioE]) console.log(`  ${await s()}`);
  console.log('  A  submit a new application live at /apply');
}

main().catch((err) => { console.error('[Applicant demo] Failed:', err.message); process.exitCode = 1; }).finally(() => pool.end());
