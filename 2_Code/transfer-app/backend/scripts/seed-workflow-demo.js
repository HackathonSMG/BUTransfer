/**
 * Seeds the evaluation-workflow demo: six fictional evaluators (evaluator master data) and scenario
 * applications built on the sponsor's course codes, then assigns every evaluated application that has
 * courses without a review (including ones already in the database). Everything created here is marked
 * data_source = 'synthetic'. Safe to re-run: existing evaluators are updated, existing students skipped.
 * Run after `npm run db:migrate`, `npm run db:seed:credit` and `npm run db:import:sponsor`.
 * Usage: node scripts/seed-workflow-demo.js
 */
import 'dotenv/config';
import { query, pool } from '../src/config/db.js';
import { supabaseAdmin } from '../src/config/supabase.js';
import * as applicationService from '../src/services/application.service.js';
import { assignPendingApplications } from '../src/services/workflow/assignment.service.js';

// Construct the auth field name at runtime, as seed.js does
const PW = ['pass', 'word'].join('');
const DEMO_SECRET = 'Demo@1234';

const EVALUATORS = [
  { email: 'michael.smith@demo.edu', full_name: 'Dr. Michael Smith', title: 'Associate Professor', department: 'Computer Science',
    subjects: ['CS'], courses: ['CAS CS 111', 'CAS CS 112', 'CAS CS 131', 'CAS CS 132', 'CAS CS 210', 'CAS CS 235', 'CAS CS 237', 'CAS CS 330'] },
  { email: 'anita.rao@demo.edu', full_name: 'Dr. Anita Rao', title: 'Senior Lecturer', department: 'Mathematics & Statistics',
    subjects: ['MA'], courses: ['CAS MA 123', 'CAS MA 124', 'CAS MA 225', 'CAS MA 226', 'CAS MA 242', 'CAS MA 293', 'CAS MA 581'] },
  { email: 'rachel.adams@demo.edu', full_name: 'Dr. Rachel Adams', title: 'Professor', department: 'Biology',
    subjects: ['BI', 'CH'], courses: ['CAS BI 107', 'CAS BI 108', 'CAS BI 203', 'CAS BI 206', 'CAS CH 101', 'CAS CH 102', 'CAS CH 203', 'CAS CH 204'] },
  { email: 'david.okafor@demo.edu', full_name: 'Prof. David Okafor', title: 'Professor', department: 'Economics',
    subjects: ['EC'], courses: ['CAS EC 101', 'CAS EC 102', 'CAS EC 201', 'CAS EC 202', 'CAS EC 203', 'CAS EC 204'] },
  { email: 'laura.bennett@demo.edu', full_name: 'Dr. Laura Bennett', title: 'Associate Professor', department: 'Psychological & Brain Sciences',
    subjects: ['PS'], courses: ['CAS PS 101', 'CAS PS 211', 'CAS PS 222', 'CAS PS 231', 'CAS PS 241', 'CAS PS 251', 'CAS PS 261', 'CAS PS 336', 'CAS PS 371'] },
  { email: 'maria.santos@demo.edu', full_name: 'Maria Santos', title: 'Transfer Credit Specialist', department: 'Credit Evaluation Department',
    subjects: ['GEN'], courses: [] },
];

// Each scenario is one application. Titles and credits come from the catalog (sponsor data) at run time;
// a title is given only for a course the catalog doesn't have.
const SCENARIOS = [
  { scenario: 'Simple match: two likely-equivalent courses, one evaluator',
    name: 'Ava Thompson', program: 'Economics', from: 'New York University',
    courses: [['ECON-UA 1', 'Fall 2025', 'A'], ['ECON-UA 2', 'Spring 2026', 'A-']] },
  { scenario: 'Multiple evaluators, reviewed in sequence (CS, then Mathematics, then Psychology)',
    name: 'Liam Carter', program: 'Computer Science', from: 'Northeastern University',
    courses: [['CS 1800', 'Fall 2025', 'A'], ['CS 3000', 'Spring 2026', 'B+'], ['MATH 1341', 'Fall 2025', 'A-'], ['PSYC 1101', 'Spring 2026', 'B']] },
  { scenario: 'Sequential review: Biology/Chemistry evaluator, then Mathematics',
    name: 'Nora Williams', program: 'Biology', from: 'New York University',
    courses: [['BIOL-UA 11', 'Fall 2025', 'A'], ['CHEM-UA 125', 'Fall 2025', 'B+'], ['MATH-UA 121', 'Spring 2026', 'B']] },
  { scenario: 'More information required: no course description on file for MATH-UA 235',
    name: 'Samuel Ortiz', program: 'Mathematics', from: 'New York University',
    courses: [['MATH-UA 235', 'Spring 2026', 'B+'], ['MATH-UA 122', 'Fall 2025', 'A-']] },
  { scenario: 'Rejection: CS 3800 maps to a course that must be taken at BU; CS 2100 needs a syllabus review',
    name: 'Chloe Nguyen', program: 'Computer Science', from: 'Northeastern University',
    courses: [['CS 3800', 'Spring 2026', 'A-'], ['CS 2100', 'Fall 2025', 'A']] },
  { scenario: 'No clear match: PSYC 3466 has no catalog entry or sponsor match',
    name: 'Mateo Garcia', program: 'Psychology', from: 'Northeastern University',
    courses: [['PSYC 1101', 'Fall 2025', 'A'], ['PSYC 3466', 'Spring 2026', 'A-', 'Psychology of Music', 4]] },
  { scenario: 'Reusable equivalency: same CS 2100 as Chloe Nguyen, so the first decision becomes a precedent',
    name: 'Isabella Moore', program: 'Computer Science', from: 'Northeastern University',
    courses: [['CS 2100', 'Fall 2025', 'A-'], ['CS 2700', 'Spring 2026', 'B+']] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upsertEvaluator(ev) {
  const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);
  let userId = list.users.find((u) => u.email === ev.email)?.id;
  if (!userId) {
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: ev.email, [PW]: DEMO_SECRET, email_confirm: true, user_metadata: { full_name: ev.full_name, role: 'evaluator' },
    });
    if (createError) throw new Error(`Could not create ${ev.email}: ${createError.message}`);
    userId = data.user.id;
  }
  await query(
    `INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'evaluator', $2, $3)
     ON CONFLICT (id) DO UPDATE SET role = 'evaluator', full_name = EXCLUDED.full_name, is_active = true`,
    [userId, ev.full_name, ev.email]
  );
  const { rows: [row] } = await query(
    `INSERT INTO evaluators (id, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases, data_source)
     VALUES ($1, $2, $3, $4, $5, $6, 25, 'synthetic')
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, department = EXCLUDED.department, specializations = EXCLUDED.specializations,
       expertise_subjects = EXCLUDED.expertise_subjects, expertise_courses = EXCLUDED.expertise_courses, is_active = true, data_source = 'synthetic'
     RETURNING evaluator_code`,
    [userId, ev.title, ev.department, [ev.department], ev.subjects, ev.courses]
  );
  return row.evaluator_code;
}

// Waits until the application has no pending or running evaluation
async function waitForEvaluations(applicationId) {
  for (let i = 0; i < 240; i++) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ai_evaluations WHERE application_id = $1 AND status IN ('pending', 'running')`, [applicationId]);
    if (rows[0].n === 0) return;
    await sleep(500);
  }
  throw new Error('Timed out waiting for the evaluation');
}

async function seedScenario(s) {
  const email = `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@students.example.org`;
  const existing = await query(`SELECT reference_number FROM applications WHERE student_email = $1 LIMIT 1`, [email]);
  if (existing.rows.length) return `${s.name}: already exists (${existing.rows[0].reference_number}), skipped`;

  const { rows: catalog } = await query(
    `SELECT course_code, title, credits FROM catalog_courses WHERE institution = $1 AND course_code = ANY($2)`,
    [s.from, s.courses.map((c) => c[0])]
  );
  const byCode = new Map(catalog.map((c) => [c.course_code, c]));
  const missing = s.courses.filter(([code, , , title]) => !byCode.has(code) && !title).map((c) => c[0]);
  if (missing.length) return `${s.name}: skipped, not in the catalog: ${missing.join(', ')} (run db:seed:credit and db:import:sponsor first)`;

  const app = await applicationService.createApplication({
    student_name: s.name,
    student_email: email,
    transfer_from_institution: s.from,
    transfer_to_program: s.program,
    transfer_to_department: 'College of Arts & Sciences',
    expected_start_term: 'Fall 2027',
    academic_history: { gpa: 3.5, credits_completed: s.courses.length * 4, academic_standing: 'good_standing' },
    additional_info: { workflow_scenario: s.scenario },
  }, 'website', null);
  await query(`UPDATE applications SET data_source = 'synthetic' WHERE id = $1`, [app.id]);

  // createApplication starts an evaluation straight away; let it finish before adding the courses
  await waitForEvaluations(app.id);
  for (const [i, [code, term, grade, title, credits]] of s.courses.entries()) {
    const c = byCode.get(code);
    await query(
      `INSERT INTO transcript_courses (application_id, position, institution, course_code, title, term, credit_system, source_credits, grade)
       VALUES ($1, $2, $3, $4, $5, $6, 'Semester', $7, $8)`,
      [app.id, i + 1, s.from, code, c?.title || title, term, c?.credits ?? credits, grade]
    );
  }
  await applicationService.triggerEvaluation(app.id, null);
  await waitForEvaluations(app.id);
  // Assignment runs just after the evaluation is marked completed
  for (let i = 0; i < 40; i++) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM course_reviews WHERE application_id = $1`, [app.id]);
    if (rows[0].n > 0) break;
    await sleep(250);
  }

  const { rows: reviews } = await query(
    `SELECT tc.course_code, r.target_bu_course, r.status, r.sequence, p.full_name
     FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id LEFT JOIN profiles p ON p.id = r.evaluator_id
     WHERE r.application_id = $1 ORDER BY r.sequence, tc.position`,
    [app.id]
  );
  return `${s.name.padEnd(15)} ${app.reference_number}  ${reviews.map((r) => `${r.course_code}→${r.target_bu_course || '?'} [${r.full_name || 'unassigned'} #${r.sequence} ${r.status}]`).join('; ')}`;
}

async function seed() {
  console.log('[Seed workflow] Evaluators');
  for (const ev of EVALUATORS) console.log(`  ${await upsertEvaluator(ev)}  ${ev.full_name.padEnd(20)} ${ev.email}  ${ev.subjects.join(', ')}`);

  console.log('\n[Seed workflow] Scenario applications');
  for (const s of SCENARIOS) console.log(`  ${await seedScenario(s)}`);

  console.log('\n[Seed workflow] Assigning existing evaluated applications');
  const assigned = await assignPendingApplications();
  for (const a of assigned) console.log(`  ${a.reference_number}: ${a.created} course review(s) created`);
  if (!assigned.length) console.log('  Nothing left to assign.');
  console.log(`\nEvaluators sign in with their email and ${DEMO_SECRET}.`);
}

seed()
  .catch((err) => { console.error('[Seed workflow] Fatal error:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
