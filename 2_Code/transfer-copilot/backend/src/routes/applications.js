import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { notFound } from '../utils/errors.js';

const router = Router();
router.use(authenticate, requireEvaluator);

const APP_SELECT = `
  select a.id, a.reference, a.status, a.submitted_at, a.internal_notes, a.intake_channel,
         s.full_name as student_name, s.student_number, s.intended_major,
         si.name as source_institution, si.id as source_institution_id,
         ep.full_name as owner_name, e.id as owner_id,
         (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id) as total_courses,
         (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id
          and ce.state in ('confirmed','overridden','rejected')) as decided_courses,
         (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id
          and ce.state = 'pending') as pending_courses,
         (select coalesce(sum(ce.awarded_credits),0) from public.course_evaluations ce
          where ce.application_id = a.id and ce.state in ('confirmed','overridden')) as accepted_credits
  from public.applications a
  join public.students s on s.id = a.student_id
  join public.transcripts t on t.application_id = a.id
  join public.institutions si on si.id = t.source_institution_id
  left join public.evaluator_assignments ea
    on ea.application_id = a.id and ea.assignment_type = 'case_owner'
    and ea.course_evaluation_id is null
    and ea.status in ('assigned','in_progress')
  left join public.evaluators e on e.id = ea.evaluator_id
  left join public.profiles ep on ep.id = e.profile_id
`;

function toItem(r) {
  const totalCourses  = r.total_courses || 0;
  const decidedCourses = r.decided_courses || 0;
  const pendingCourses = r.pending_courses || 0;
  const priority = pendingCourses === 0 ? 'Low' : totalCourses > 4 ? 'High' : 'Medium';
  return {
    applicationId: r.id,
    status: r.status,
    reference: r.reference,
    receivedAt: r.submitted_at,
    previousUniversity: r.source_institution,
    targetProgram: r.intended_major || 'Undeclared',
    student: { name: r.student_name, number: r.student_number },
    owner: { name: r.owner_name || 'Unassigned', id: r.owner_id || null },
    summary: { courses: totalCourses, decided: decidedCourses, acceptedCredits: r.accepted_credits || 0 },
    priority,
    open: r.status === 'in_review',
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${APP_SELECT} order by a.submitted_at desc limit 100`);
    const items = rows.map(toItem);
    const openCount = items.filter((x) => x.open).length;
    res.json({ items, processing: [], subjects: [], open: openCount, total: items.length });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${APP_SELECT} where a.id = $1`, [req.params.id]);
    if (!rows[0]) return next(notFound('Application not found'));
    res.json({ application: toItem(rows[0]), raw: rows[0] });
  } catch (err) { next(err); }
});

export default router;
