import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator, requireStudent } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { notFound, forbidden } from '../utils/errors.js';

const router = Router();
router.use(authenticate);

// Student self-service routes
router.get('/me/application', requireStudent, async (req, res, next) => {
  try {
    const stuId = req.user.student_id;
    if (!stuId) return next(forbidden('Not a student'));
    const { rows } = await pool.query(
      `select a.*, s.full_name, s.student_number, s.intended_major,
              si.name as source_institution,
              (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id) as total_courses,
              (select coalesce(sum(ce.awarded_credits),0) from public.course_evaluations ce where ce.application_id = a.id and ce.state in ('confirmed','overridden')) as total_credits
       from public.applications a
       join public.students s on s.id = a.student_id
       join public.transcripts t on t.application_id = a.id
       join public.institutions si on si.id = t.source_institution_id
       where a.student_id = $1 order by a.submitted_at desc limit 1`,
      [stuId],
    );
    if (!rows[0]) return res.json({ application: null, courses: [] });
    const app = rows[0];

    const { rows: courses } = await pool.query(
      `select ce.id, ce.state, ce.student_status, ce.suggestion, ce.requested_credits, ce.awarded_credits,
              ce.decision_note, tc.course_code, tc.title, tc.grade, tc.source_credits
       from public.course_evaluations ce
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       where ce.application_id = $1 order by tc.line_no`,
      [app.id],
    );
    res.json({ application: app, courses });
  } catch (err) { next(err); }
});

router.get('/me/transcript', requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select tc.* from public.transcript_courses tc
       join public.applications a on a.id = tc.application_id
       where a.student_id = $1 order by tc.line_no`,
      [req.user.student_id],
    );
    res.json({ courses: rows });
  } catch (err) { next(err); }
});

router.get('/me/degree-progress', requireStudent, async (req, res, next) => {
  res.json({ progress: [], totalCredits: 0, completedCredits: 0 });
});

router.get('/me/status', requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select a.status, t.status as transcript_status, t.process_after
       from public.applications a
       join public.transcripts t on t.application_id = a.id
       where a.student_id = $1 order by a.submitted_at desc limit 1`,
      [req.user.student_id],
    );
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// Evaluator/admin: list students
router.get('/', requireEvaluator, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select s.id, s.student_number, s.intended_major, s.previous_program, s.start_term,
              p.full_name as name, p.email,
              a.id as application_id, a.status as application_status,
              (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id) as courses,
              (select count(*)::int from public.course_evaluations ce where ce.application_id = a.id
               and ce.state in ('confirmed','overridden','rejected')) as decided,
              (select coalesce(sum(ce.awarded_credits),0) from public.course_evaluations ce
               where ce.application_id = a.id and ce.state in ('confirmed','overridden')) as accepted_credits,
              si.name as previous_university
       from public.students s
       left join public.profiles p on p.id = s.profile_id
       left join public.applications a on a.student_id = s.id
       left join public.transcripts t on t.application_id = a.id
       left join public.institutions si on si.id = t.source_institution_id
       order by p.full_name limit 100`,
    );
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      number: r.student_number,
      intendedMajor: r.intended_major,
      previousUniversity: r.previous_university,
      status: r.application_status || 'no_application',
      courses: r.courses || 0,
      decided: r.decided || 0,
      acceptedCredits: Number(r.accepted_credits) || 0,
      applicationId: r.application_id || null,
    }));
    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});

router.get('/:id', requireEvaluator, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select s.*, p.full_name, p.email from public.students s
       left join public.profiles p on p.id = s.profile_id
       where s.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return next(notFound('Student not found'));
    res.json({ student: rows[0] });
  } catch (err) { next(err); }
});

export default router;
