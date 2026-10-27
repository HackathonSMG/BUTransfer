import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator, requireAdmin } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { notFound, conflict } from '../utils/errors.js';

const router = Router();
router.use(authenticate, requireEvaluator);

router.get('/stats', async (req, res, next) => {
  try {
    const { rows: byStatus } = await pool.query(
      `select status, count(*)::int as n from public.equivalencies group by status`);
    const { rows: origins } = await pool.query(
      `select origin, count(*)::int as n from public.equivalencies group by origin`);
    const { rows: ceStats } = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where pipeline_path = 'Auto-applied')::int as auto_applied,
              count(*) filter (where pipeline_path = 'Precedent')::int as precedent,
              count(*) filter (where pipeline_path = 'Needs review')::int as needs_review
       from public.course_evaluations`);
    const { rows: studentStats } = await pool.query(
      `select count(distinct a.student_id)::int as n from public.applications a
       join public.course_evaluations ce on ce.application_id = a.id
       join public.equivalencies eq on eq.target_code = ce.suggestion and eq.status = 'active'`);
    const { rows: seasonStats } = await pool.query(
      `select count(*)::int as n from public.equivalencies
       where approved_on >= date_trunc('year', current_date)`);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
    const ce = ceStats[0] || {};
    const activeEq = statusMap.active || 0;
    const underReview = statusMap.under_review || 0;
    const rejected = statusMap.rejected || 0;
    const reuses = (ce.auto_applied || 0) + (ce.precedent || 0);
    const reusesSeason = seasonStats[0]?.n || 0;
    const hoursSaved = Math.round(reuses * 0.13 * 10) / 10;
    const reuseRate = ce.total > 0 ? Math.round((reuses / ce.total) * 100) : 0;

    res.json({
      active: activeEq,
      learned: activeEq,
      aliases: 0,
      reuses,
      reusesSeason,
      studentsBenefited: studentStats[0]?.n || reuses,
      reuseRate,
      paths: { total: ce.total || 0, autoApplied: ce.auto_applied || 0, precedent: ce.precedent || 0, needsReview: ce.needs_review || 0 },
      hoursSaved,
      assumptions: 0,
      underReview,
      rejected,
      origins: Object.fromEntries(origins.map((r) => [r.origin, r.n])),
    });
  } catch (err) { next(err); }
});

router.get('/policy', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`select * from public.evaluation_policies where is_current = true limit 1`);
    res.json({ policy: rows[0] || null });
  } catch (err) { next(err); }
});

router.patch('/policy', requireAdmin, async (req, res, next) => {
  try {
    const { reuse_min_confidence, similar_min_confidence, auto_close_known, auto_close_min_approvals } = req.body || {};
    await pool.query(
      `update public.evaluation_policies set
         reuse_min_confidence = coalesce($1, reuse_min_confidence),
         similar_min_confidence = coalesce($2, similar_min_confidence),
         auto_close_known = coalesce($3, auto_close_known),
         auto_close_min_approvals = coalesce($4, auto_close_min_approvals),
         updated_by = $5
       where is_current = true`,
      [reuse_min_confidence, similar_min_confidence, auto_close_known, auto_close_min_approvals, req.user.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/insights', requireAdmin, async (req, res, next) => {
  try {
    const { rows: frequent } = await pool.query(
      `select tc.course_code, tc.title, count(*)::int as reviews
       from public.course_evaluations ce
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       where ce.pipeline_path = 'Needs review'
       group by tc.course_code, tc.title order by reviews desc limit 10`);
    res.json({ frequentManualReviews: frequent });
  } catch (err) { next(err); }
});

// GET /equivalencies/search
router.get('/equivalencies/search', async (req, res, next) => {
  try {
    const { q, status, institution, origin, cursor } = req.query;
    let sql = `select eq.*, sc.code as source_code, sc.title as source_title,
                      si.name as source_institution, si.short_name as source_inst_short,
                      tc.code as target_code, tc.title as target_title
               from public.equivalencies eq
               left join public.courses sc on sc.id = eq.source_course_id
               left join public.institutions si on si.id = sc.institution_id
               left join public.courses tc on tc.id = eq.target_course_id
               where 1=1`;
    const params = [];
    if (q) { sql += ` and (sc.code ilike $${params.push('%'+q+'%')} or sc.title ilike $${params.push('%'+q+'%')} or tc.code ilike $${params.push('%'+q+'%')} or eq.code ilike $${params.push('%'+q+'%')})`; }
    if (status) sql += ` and eq.status = $${params.push(status)}`;
    if (institution) sql += ` and si.name ilike $${params.push('%'+institution+'%')}`;
    if (origin) sql += ` and eq.origin = $${params.push(origin)}`;
    sql += ` order by eq.approved_on desc limit 51`;
    const { rows } = await pool.query(sql, params);

    const { rows: statusCounts } = await pool.query(
      `select status, count(*)::int as n from public.equivalencies group by status`);
    const { rows: instRows } = await pool.query(
      `select distinct i.name from public.equivalencies eq
       left join public.courses sc on sc.id = eq.source_course_id
       left join public.institutions i on i.id = sc.institution_id
       where i.name is not null order by i.name`);

    res.json({
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]?.id : null,
      byStatus: Object.fromEntries(statusCounts.map((r) => [r.status, r.n])),
      institutions: instRows.map((r) => r.name),
    });
  } catch (err) { next(err); }
});

// GET /equivalencies/:id
router.get('/equivalencies/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select eq.*, sc.code as source_code, sc.title as source_title,
              si.name as source_institution,
              tc.code as target_code, tc.title as target_title
       from public.equivalencies eq
       left join public.courses sc on sc.id = eq.source_course_id
       left join public.institutions si on si.id = sc.institution_id
       left join public.courses tc on tc.id = eq.target_course_id
       where eq.id = $1`,
      [req.params.id]);
    if (!rows[0]) return next(notFound('Equivalency not found'));
    res.json({ equivalency: rows[0], versions: [], usage: [] });
  } catch (err) { next(err); }
});

// POST /equivalencies
router.post('/equivalencies', requireAdmin, async (req, res, next) => {
  try {
    const { source_course_id, target_course_id, award_label, award_credits, approved_by_label } = req.body || {};
    const { rows: dup } = await pool.query(
      `select id from public.equivalencies where source_course_id = $1 and status = 'active'`, [source_course_id]);
    if (dup[0]) return next(conflict('An active equivalency already exists for this course', { existing: dup[0].id }));
    const code = `EQ-${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `insert into public.equivalencies (code, source_course_id, target_course_id, award_label, award_credits, approved_on, origin, status, approved_by_label)
       values ($1,$2,$3,$4,$5,current_date,'evaluator_decision','active',$6) returning id`,
      [code, source_course_id, target_course_id || null, award_label, award_credits || null, approved_by_label || req.user.full_name],
    );
    res.status(201).json({ id: rows[0].id, code });
  } catch (err) { next(err); }
});

// PATCH /equivalencies/:id
router.patch('/equivalencies/:id', requireAdmin, async (req, res, next) => {
  try {
    const { status, status_reason } = req.body || {};
    await pool.query(
      `update public.equivalencies set status = coalesce($1, status), status_reason = coalesce($2, status_reason), updated_at = now() where id = $3`,
      [status, status_reason, req.params.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
