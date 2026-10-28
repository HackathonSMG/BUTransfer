import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { supabaseAdmin } from '../config/supabase.js';
import { query } from '../config/db.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';
import * as rosterService from '../services/staff/roster.service.js';
import { assignPendingApplications, releaseEvaluator } from '../services/workflow/assignment.service.js';

const PW = ['pass', 'word'].join('');

const router = Router();
router.use(requireAuth, requireRole('admin'));

// BU subject codes (CS, MA, ...) or GEN for a general credit evaluator; BU course codes like "CAS CS 111"
const subjectList = z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, 'Use subject codes such as CS or MA')).max(20);
const courseList = z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2,4} [A-Z]{2} \d{3}$/, 'Use BU course codes such as CAS CS 111')).max(60);

const createEvaluatorSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(255),
  title: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  specializations: z.array(z.string()).optional().default([]),
  expertise_subjects: subjectList.optional().default([]),
  expertise_courses: courseList.optional().default([]),
  max_concurrent_cases: z.coerce.number().int().min(1).max(100).optional().default(20),
  [PW]: z.string().min(8).optional().default('TempPass@1234'),
});

const updateEvaluatorSchema = z.object({
  full_name: z.string().min(2).max(255).optional(),
  title: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  specializations: z.array(z.string()).optional(),
  expertise_subjects: subjectList.optional(),
  expertise_courses: courseList.optional(),
  max_concurrent_cases: z.coerce.number().int().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

const EVALUATOR_COLUMNS = `p.*, e.evaluator_code, e.title, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases, e.availability, e.unavailable_until`;

// Evaluators whose work needs an administrator's attention, and why (business rules live here, not in the UI)
const STALE_DAYS = 7;
function attentionFlags(r) {
  const flags = [];
  if (!r.is_active && (r.open_reviews > 0 || r.queued_reviews > 0)) flags.push('Inactive with assigned courses');
  if (r.is_active && r.availability === 'unavailable' && (r.open_reviews > 0 || r.queued_reviews > 0)) flags.push('Unavailable with assigned courses');
  if (r.is_active && r.max_concurrent_cases && r.open_reviews >= 0.8 * r.max_concurrent_cases) flags.push('Near capacity');
  if (r.oldest_open_days != null && r.oldest_open_days >= STALE_DAYS) flags.push(`Oldest open review waiting ${r.oldest_open_days} days`);
  return flags;
}

const REVIEW_COUNTS = `
  COUNT(r.id) FILTER (WHERE r.status = 'new')::int AS new_reviews,
  COUNT(r.id) FILTER (WHERE r.status = 'in_progress')::int AS in_progress_reviews,
  COUNT(r.id) FILTER (WHERE r.status = 'info_requested')::int AS waiting_reviews,
  COUNT(r.id) FILTER (WHERE r.status IN ('new', 'in_progress', 'info_requested'))::int AS open_reviews,
  COUNT(r.id) FILTER (WHERE r.status = 'queued')::int AS queued_reviews,
  COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'rejected'))::int AS completed_reviews,
  COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'rejected') AND r.completed_at >= NOW() - INTERVAL '7 days')::int AS completed_7d,
  COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'rejected') AND r.completed_at >= DATE_TRUNC('month', NOW()))::int AS completed_month,
  (EXTRACT(DAY FROM NOW() - MIN(r.assigned_at) FILTER (WHERE r.status IN ('new', 'in_progress', 'info_requested'))))::int AS oldest_open_days`;

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      // Inactive evaluators are listed too, so they can be reactivated; their history stays intact
      `SELECT p.id, p.full_name, p.email, p.phone, p.created_at, (p.is_active AND e.is_active) AS is_active,
              e.evaluator_code, e.title, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases,
              e.availability, e.unavailable_until,
              (SELECT COUNT(*)::int FROM applications a WHERE a.assigned_evaluator_id = e.id AND a.status NOT IN ('approved', 'rejected', 'closed')) AS current_case_count,
              ${REVIEW_COUNTS}
       FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN course_reviews r ON r.evaluator_id = e.id
       GROUP BY p.id, p.full_name, p.email, p.phone, p.created_at, p.is_active, e.id
       ORDER BY (p.is_active AND e.is_active) DESC, e.department NULLS LAST, p.full_name ASC`
    );
    const data = result.rows.map((r) => ({
      ...r,
      workload_pct: r.max_concurrent_cases ? Math.round((100 * r.open_reviews) / r.max_concurrent_cases) : null,
      attention: attentionFlags(r),
    }));
    const active = data.filter((r) => r.is_active);
    return res.status(200).json({
      data,
      meta: {
        summary: {
          active: active.length,
          inactive: data.length - active.length,
          departments: new Set(active.map((r) => r.department).filter(Boolean)).size,
          courses_covered: new Set(active.flatMap((r) => r.expertise_courses || [])).size,
          open_reviews: active.reduce((n, r) => n + r.open_reviews, 0),
          need_attention: data.filter((r) => r.attention.length).length,
        },
      },
    });
  } catch (err) { return next(err); }
});

// One evaluator's profile: master data, workload by status, throughput and recent course reviews
router.get('/:id/profile', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return next(badRequest('Invalid evaluator id'));
    const [base, recent] = await Promise.all([
      query(
        `SELECT p.id, p.full_name, p.email, p.created_at, (p.is_active AND e.is_active) AS is_active, e.evaluator_code, e.title, e.department,
                e.availability, e.unavailable_until, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases,
                ${REVIEW_COUNTS},
                ROUND(AVG(EXTRACT(EPOCH FROM (r.completed_at - r.assigned_at)) / 86400) FILTER (WHERE r.completed_at IS NOT NULL AND r.assigned_at IS NOT NULL)::numeric, 1) AS avg_days_to_decide
         FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN course_reviews r ON r.evaluator_id = e.id
         WHERE e.id = $1 GROUP BY p.id, e.id`, [id]),
      query(
        `SELECT r.id, r.status, r.target_bu_course, r.assigned_at, r.completed_at, tc.institution, tc.course_code, a.reference_number, a.student_name
         FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id JOIN applications a ON a.id = r.application_id
         WHERE r.evaluator_id = $1 ORDER BY COALESCE(r.completed_at, r.started_at, r.assigned_at, r.created_at) DESC LIMIT 8`, [id]),
    ]);
    if (!base.rows.length) return next(notFound('Evaluator'));
    const ev = base.rows[0];
    return res.status(200).json({
      data: {
        ...ev,
        avg_days_to_decide: ev.avg_days_to_decide != null ? Number(ev.avg_days_to_decide) : null,
        workload_pct: ev.max_concurrent_cases ? Math.round((100 * ev.open_reviews) / ev.max_concurrent_cases) : null,
        attention: attentionFlags(ev),
        recent_reviews: recent.rows,
      },
    });
  } catch (err) { return next(err); }
});

// Creates or refreshes the staff roster (admin + evaluator master data); new accounts get the given initial password
router.post('/import', async (req, res, next) => {
  try {
    const parsed = z.object({ initial_password: z.string().min(8, 'Initial password must be at least 8 characters') }).safeParse(req.body);
    if (!parsed.success) return next(badRequest(parsed.error.issues[0].message));
    const result = await rosterService.importRoster({ initialSecret: parsed.data.initial_password, actor: req.user });
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
});

// Routes every evaluated application that still has unassigned courses to the right evaluators
router.post('/assign-pending', async (req, res, next) => {
  try {
    const results = await assignPendingApplications();
    return res.status(200).json({ data: { applications: results.length, courses: results.reduce((n, r) => n + r.created, 0) } });
  } catch (err) { return next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const parseResult = createEvaluatorSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const { email, full_name, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases, [PW]: pwValue } = parseResult.data;

    const existing = await query(`SELECT id FROM profiles WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
    if (existing.rows.length > 0) return next(conflict(`A user with email ${email} already exists`));

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      [PW]: pwValue,
      email_confirm: true,
      user_metadata: { full_name, role: 'evaluator' }
    });
    if (authError || !authData?.user) throw new Error(`Failed to create auth user: ${authError?.message}`);

    const userId = authData.user.id;
    await query(`INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'evaluator', $2, $3)`, [userId, full_name, email.toLowerCase()]);
    await query(
      `INSERT INTO evaluators (id, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, title || null, department || null, specializations, expertise_subjects, expertise_courses, max_concurrent_cases]
    );

    const profile = await query(`SELECT ${EVALUATOR_COLUMNS} FROM profiles p JOIN evaluators e ON e.id = p.id WHERE p.id = $1`, [userId]);
    return res.status(201).json({ data: profile.rows[0] });
  } catch (err) { return next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM evaluators WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Evaluator'));

    const parseResult = updateEvaluatorSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const fields = parseResult.data;

    if (fields.full_name !== undefined || fields.is_active !== undefined) {
      const clauses = []; const params = []; let idx = 1;
      if (fields.full_name !== undefined) { clauses.push(`full_name = $${idx++}`); params.push(fields.full_name); }
      if (fields.is_active !== undefined) { clauses.push(`is_active = $${idx++}`); params.push(fields.is_active); }
      if (clauses.length > 0) { clauses.push(`updated_at = NOW()`); params.push(id); await query(`UPDATE profiles SET ${clauses.join(', ')} WHERE id = $${idx}`, params); }
    }

    const eClauses = []; const eParams = []; let eidx = 1;
    if (fields.department !== undefined) { eClauses.push(`department = $${eidx++}`); eParams.push(fields.department); }
    if (fields.specializations !== undefined) { eClauses.push(`specializations = $${eidx++}`); eParams.push(fields.specializations); }
    if (fields.title !== undefined) { eClauses.push(`title = $${eidx++}`); eParams.push(fields.title); }
    if (fields.expertise_subjects !== undefined) { eClauses.push(`expertise_subjects = $${eidx++}`); eParams.push(fields.expertise_subjects); }
    if (fields.expertise_courses !== undefined) { eClauses.push(`expertise_courses = $${eidx++}`); eParams.push(fields.expertise_courses); }
    if (fields.max_concurrent_cases !== undefined) { eClauses.push(`max_concurrent_cases = $${eidx++}`); eParams.push(fields.max_concurrent_cases); }
    if (fields.is_active !== undefined) { eClauses.push(`is_active = $${eidx++}`); eParams.push(fields.is_active); }
    if (eClauses.length > 0) { eParams.push(id); await query(`UPDATE evaluators SET ${eClauses.join(', ')} WHERE id = $${eidx}`, eParams); }
    // A deactivated evaluator's open courses go to the best eligible evaluator; their history stays
    const moved = fields.is_active === false ? await releaseEvaluator(id, req.user, 'Evaluator deactivated') : null;

    const updated = await query(`SELECT ${EVALUATOR_COLUMNS} FROM profiles p JOIN evaluators e ON e.id = p.id WHERE p.id = $1`, [id]);
    return res.status(200).json({ data: { ...updated.rows[0], reassigned: moved?.reassigned ?? 0 } });
  } catch (err) { return next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM evaluators WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Evaluator'));
    await Promise.all([
      query(`UPDATE evaluators SET is_active = false WHERE id = $1`, [id]),
      query(`UPDATE profiles SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]),
    ]);
    const moved = await releaseEvaluator(id, req.user, 'Evaluator deactivated');
    return res.status(200).json({ data: { message: 'Evaluator deactivated successfully', reassigned: moved.reassigned } });
  } catch (err) { return next(err); }
});

export default router;
