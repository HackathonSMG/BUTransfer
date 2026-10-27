/**
 * Routing service: assigns a case owner and department reviewers.
 * Algorithm: specialization +3, program expertise +1, course level +1, at capacity −5, unavailable −10.
 */
import { pool } from '../config/db.js';

async function getEvaluators(db = pool) {
  const { rows } = await db.query(
    `select e.id, e.unit, e.department_id, e.subject_codes, e.specializations,
            e.program_expertise, e.course_levels, e.target_course_pattern,
            e.max_active_load, e.is_available, e.is_active,
            coalesce(active.n, 0) as active_load
     from public.evaluators e
     left join (
       select ea.evaluator_id, count(*) as n
       from public.evaluator_assignments ea
       where ea.status in ('assigned','in_progress')
       group by ea.evaluator_id
     ) active on active.evaluator_id = e.id
     where e.is_active = true`,
  );
  return rows;
}

function score(ev, courseEval) {
  if (!ev.is_active) return -Infinity;
  let s = 0;
  const code = (courseEval.target_code || '').toUpperCase();
  const subj = code.split(/\s+/)[0] || '';

  if ((ev.subject_codes || []).some((sc) => subj.startsWith(sc.toUpperCase()))) s += 2;
  if ((ev.specializations || []).some((sp) => (courseEval.target_title || '').toLowerCase().includes(sp.toLowerCase()))) s += 3;
  if ((ev.program_expertise || []).some((pe) => (courseEval.program_area || '').toLowerCase().includes(pe.toLowerCase()))) s += 1;
  if ((ev.course_levels || []).includes(courseEval.course_level || 'Introductory')) s += 1;
  if (ev.target_course_pattern) {
    try { if (new RegExp(ev.target_course_pattern, 'i').test(code)) s += 2; } catch { /* ignore bad regex */ }
  }
  if (!ev.is_available) s -= 10;
  if (Number(ev.active_load) >= Number(ev.max_active_load)) s -= 5;
  return s;
}

export async function assignCaseOwner(applicationId, db = pool) {
  const evaluators = await getEvaluators(db);
  const ceStaff    = evaluators.filter((e) => e.unit === 'credit_evaluation');
  if (!ceStaff.length) throw new Error('No Credit Evaluation staff available');

  const lightest = ceStaff.sort((a, b) => Number(a.active_load) - Number(b.active_load))[0];

  await db.query(
    `insert into public.evaluator_assignments
       (application_id, evaluator_id, assignment_type, routing_reason, match_basis)
     values ($1, $2, 'case_owner', 'Assigned to Credit Evaluation with lightest workload', $3)`,
    [applicationId, lightest.id, JSON.stringify({ active_load: lightest.active_load })],
  );
  return lightest;
}

export async function assignDepartmentReviewer(applicationId, courseEvalId, courseEval, db = pool) {
  const evaluators = await getEvaluators(db);
  const dept       = evaluators.filter((e) => e.unit === 'department');
  if (!dept.length) return null;

  const scored  = dept.map((e) => ({ ...e, _s: score(e, courseEval) })).sort((a, b) => {
    if (b._s !== a._s) return b._s - a._s;
    return Number(a.active_load) - Number(b.active_load);
  });
  const best = scored[0];
  if (best._s <= -10) return null;

  await db.query(
    `insert into public.evaluator_assignments
       (application_id, course_evaluation_id, evaluator_id, assignment_type, routing_reason, match_basis)
     values ($1, $2, $3, 'department_review', $4, $5)`,
    [applicationId, courseEvalId, best.id,
     `Routed to ${best.unit} (score ${best._s})`,
     JSON.stringify({ score: best._s, active_load: best.active_load })],
  );
  return best;
}
