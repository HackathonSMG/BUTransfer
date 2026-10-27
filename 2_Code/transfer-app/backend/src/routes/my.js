import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { query } from '../config/db.js';
import { badRequest } from '../utils/errors.js';
import * as reviewService from '../services/workflow/review.service.js';
import { matchLabel } from '../services/workflow/knowledge.service.js';

// The match label is decided here, not in the browser
const withLabel = (rows) => rows.map((r) => ({ ...r, match_label: matchLabel(r.match_score) }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The signed-in evaluator's own workspace. Every query is scoped to req.user.id; there is no way to ask
// for another evaluator's data here.
const router = Router();
router.use(requireAuth, requireRole('evaluator'));

const OPEN = ['new', 'in_progress', 'info_requested'];
const STATUS_FILTERS = {
  open: OPEN,
  new: ['new'],
  in_progress: ['in_progress'],
  info_requested: ['info_requested'],
  upcoming: ['queued'],
  completed: ['approved', 'rejected'],
  all: ['queued', 'new', 'in_progress', 'info_requested', 'approved', 'rejected'],
};

// One row per course review with the application, the source course and the BU target course
const REVIEW_SELECT = `
  SELECT r.id, r.status, r.priority, r.sequence, r.target_bu_course, r.match_score, r.match_basis, r.sponsor_match_level,
         r.assigned_at, r.started_at, r.completed_at, r.created_at,
         a.id AS application_id, a.reference_number, a.student_name, a.student_email, a.transfer_to_program,
         tc.institution, tc.course_code, COALESCE(src.title, tc.title) AS course_title, tc.term, tc.grade, tc.source_credits,
         bu.title AS target_title, bu.credits AS target_credits
  FROM course_reviews r
  JOIN applications a ON a.id = r.application_id
  JOIN transcript_courses tc ON tc.id = r.transcript_course_id
  LEFT JOIN catalog_courses src ON src.institution = tc.institution AND src.course_code = tc.course_code
  LEFT JOIN catalog_courses bu ON bu.institution = 'Boston University' AND bu.course_code = r.target_bu_course`;

router.get('/dashboard', async (req, res, next) => {
  try {
    const me = req.user.id;
    const [profile, counts, upNext, recent, activity] = await Promise.all([
      query(`SELECT e.evaluator_code, e.title, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases
             FROM evaluators e WHERE e.id = $1`, [me]),
      query(`SELECT status, COUNT(*)::int AS count,
                    COUNT(*) FILTER (WHERE completed_at >= DATE_TRUNC('month', NOW()))::int AS this_month
             FROM course_reviews WHERE evaluator_id = $1 GROUP BY status`, [me]),
      // Needs attention: student replies first, then high priority, then handed-over and new work, oldest first
      query(`${REVIEW_SELECT.replace('SELECT r.id,', 'SELECT ir.status AS info_status, tr.request_number, fp.full_name AS transferred_from, r.id,')}
             LEFT JOIN information_requests ir ON ir.id = r.info_request_id
             LEFT JOIN transfer_requests tr ON tr.id = r.transfer_request_id
             LEFT JOIN profiles fp ON fp.id = tr.from_evaluator_id
             WHERE r.evaluator_id = $1 AND r.status = ANY($2) AND (r.status <> 'info_requested' OR ir.status = 'responded')
             ORDER BY (ir.status = 'responded') DESC NULLS LAST, (r.priority = 'high') DESC, (r.status = 'new') DESC, r.assigned_at ASC NULLS LAST
             LIMIT 6`, [me, OPEN]),
      query(`${REVIEW_SELECT} WHERE r.evaluator_id = $1 AND r.status IN ('approved', 'rejected')
             ORDER BY r.completed_at DESC NULLS LAST LIMIT 5`, [me]),
      // Recent activity: what happened to this evaluator's work (assignments, hand-overs) and what they did
      query(`SELECT * FROM (
               SELECT n.type AS kind, n.title, n.created_at, a.reference_number FROM notifications n
               LEFT JOIN applications a ON a.id = n.application_id
               WHERE n.recipient_id = $1 AND n.type IN ('evaluation_assigned', 'transfer_request')
               UNION ALL
               SELECT al.action, NULL, al.created_at, a.reference_number FROM audit_logs al
               LEFT JOIN applications a ON a.id = al.application_id
               WHERE al.actor_id = $1 AND al.action IN ('review_decided', 'review_info_requested', 'transfer_request_created')
             ) x ORDER BY created_at DESC LIMIT 6`, [me]),
    ]);
    const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.count]));
    const n = (s) => byStatus[s] || 0;
    const { rows: [apps] } = await query(
      `SELECT COUNT(DISTINCT application_id)::int AS applications FROM course_reviews WHERE evaluator_id = $1 AND status = ANY($2)`, [me, OPEN]
    );
    return res.status(200).json({
      data: {
        profile: profile.rows[0] || null,
        counts: {
          new: n('new'), in_progress: n('in_progress'), info_requested: n('info_requested'), upcoming: n('queued'),
          approved: n('approved'), rejected: n('rejected'), completed: n('approved') + n('rejected'),
          completed_this_month: counts.rows.filter((r) => ['approved', 'rejected'].includes(r.status)).reduce((s, r) => s + r.this_month, 0),
          open: n('new') + n('in_progress') + n('info_requested'),
          open_applications: apps.applications,
        },
        up_next: withLabel(upNext.rows),
        recent_decisions: withLabel(recent.rows),
        recent_activity: activity.rows,
      },
    });
  } catch (err) { return next(err); }
});

const listSchema = z.object({
  status: z.enum(Object.keys(STATUS_FILTERS)).optional().default('open'),
  search: z.string().max(100).optional(),
});

router.get('/reviews', async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return next(badRequest('Invalid query parameters'));
    const { status, search } = parsed.data;
    const params = [req.user.id, STATUS_FILTERS[status]];
    let where = 'WHERE r.evaluator_id = $1 AND r.status = ANY($2)';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (a.student_name ILIKE $3 OR a.reference_number ILIKE $3 OR tc.course_code ILIKE $3 OR tc.institution ILIKE $3 OR r.target_bu_course ILIKE $3)`;
    }
    const [rows, counts] = await Promise.all([
      query(`${REVIEW_SELECT} ${where} ORDER BY (r.priority = 'high') DESC, r.assigned_at ASC NULLS LAST, a.reference_number LIMIT 200`, params),
      query(`SELECT status, COUNT(*)::int AS count FROM course_reviews WHERE evaluator_id = $1 GROUP BY status`, [req.user.id]),
    ]);
    const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.count]));
    const tabCounts = Object.fromEntries(Object.entries(STATUS_FILTERS).map(([k, list]) => [k, list.reduce((s, x) => s + (byStatus[x] || 0), 0)]));
    return res.status(200).json({ data: withLabel(rows.rows), meta: { counts: tabCounts } });
  } catch (err) { return next(err); }
});

// One evaluation package (only the evaluator's own; anything else is 404)
router.get('/reviews/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluation id'));
    return res.status(200).json({ data: await reviewService.getReview(req.params.id, req.user.id) });
  } catch (err) { return next(err); }
});

router.post('/reviews/:id/start', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluation id'));
    return res.status(200).json({ data: await reviewService.startReview(req.params.id, req.user) });
  } catch (err) { return next(err); }
});

const decisionSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  reason: z.string().max(2000).optional().nullable(),
});

router.post('/reviews/:id/decision', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluation id'));
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return next(badRequest('Decision must be accept or reject'));
    return res.status(200).json({ data: await reviewService.decideReview(req.params.id, parsed.data, req.user) });
  } catch (err) { return next(err); }
});

router.post('/reviews/:id/request-info', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluation id'));
    const parsed = z.object({ message: z.string().trim().min(1, 'Describe the information you need').max(2000) }).safeParse(req.body);
    if (!parsed.success) return next(badRequest(parsed.error.issues[0].message));
    return res.status(200).json({ data: await reviewService.requestInformation(req.params.id, parsed.data, req.user) });
  } catch (err) { return next(err); }
});

router.post('/reviews/:id/escalate', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluation id'));
    const parsed = z.object({ note: z.string().max(1000).optional().nullable() }).safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Note is too long'));
    return res.status(200).json({ data: await reviewService.escalate(req.params.id, parsed.data, req.user) });
  } catch (err) { return next(err); }
});

export default router;
