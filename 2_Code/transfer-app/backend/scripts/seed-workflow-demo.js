/**
 * Seeds the evaluation-workflow demo: the staff roster (src/data/staff-roster.json: the admin and the evaluator
 * master data) and scenario applications built on the sponsor's course codes, then assigns every evaluated
 * application that has courses without a review (including ones already in the database). Scenario
 * applications are marked data_source = 'synthetic'. Safe to re-run: existing accounts are updated, existing
 * students skipped. The same roster import is available to admins on the Evaluators page.
 * Run after `npm run db:migrate`, `npm run db:seed:credit` and `npm run db:import:sponsor`.
 * Usage: node scripts/seed-workflow-demo.js
 */
import 'dotenv/config';
import { query, pool } from '../src/config/db.js';
import * as applicationService from '../src/services/application.service.js';
import { assignPendingApplications } from '../src/services/workflow/assignment.service.js';
import { importRoster } from '../src/services/staff/roster.service.js';

// Initial password for accounts this seed creates (development only)
const DEMO_SECRET = 'Demo@1234';

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
  // Established equivalencies are applied and the rest assigned just after the evaluation is marked completed;
  // that ends by moving the application on from 'evaluation_completed'
  for (let i = 0; i < 60; i++) {
    const { rows } = await query(`SELECT status FROM applications WHERE id = $1`, [app.id]);
    if (!['evaluation_completed', 'under_evaluation', 'submitted'].includes(rows[0].status)) break;
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
  console.log('[Seed workflow] Staff roster');
  const { accounts } = await importRoster({ initialSecret: DEMO_SECRET, actor: null });
  for (const a of accounts) console.log(`  ${a.created ? 'created' : 'updated'}  ${a.role.padEnd(9)} ${a.full_name.padEnd(30)} ${a.email}`);

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
