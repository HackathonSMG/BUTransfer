import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator, requireAdmin } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { notFound, forbidden } from '../utils/errors.js';

const router = Router();
router.use(authenticate, requireEvaluator);

// GET /evaluators/me/dashboard
router.get('/me/dashboard', async (req, res, next) => {
  try {
    const evId = req.user.evaluator_id;
    if (!evId) return next(forbidden('Not an evaluator'));

    const { rows: ev } = await pool.query(`select * from public.evaluators where id = $1`, [evId]);
    if (!ev[0]) return next(notFound('Evaluator not found'));
    const e = ev[0];

    const { rows: pending } = await pool.query(
      `select count(*)::int as n from public.evaluator_assignments ea
       where ea.evaluator_id = $1 and ea.status in ('assigned','in_progress')`, [evId]);

    const { rows: today } = await pool.query(
      `select count(*)::int as n from public.evaluation_decisions ed
       where ed.evaluator_id = $1 and ed.created_at >= current_date`, [evId]);

    const { rows: activity } = await pool.query(
      `select day::text, decisions, 0 as live, decisions as historical
       from public.evaluator_daily_stats
       where evaluator_id = $1 order by day desc limit 14`, [evId]);

    const { rows: highPri } = await pool.query(
      `select count(*)::int as n from public.course_evaluations ce
       join public.evaluator_assignments ea on ea.course_evaluation_id = ce.id
       where ea.evaluator_id = $1 and ea.status in ('assigned','in_progress')
         and ce.state = 'pending'`, [evId]);

    const { rows: seasonal } = await pool.query(
      `select count(*)::int as n from public.evaluation_decisions ed
       where ed.evaluator_id = $1`, [evId]);

    const { rows: season } = await pool.query(
      `select name from public.seasons where is_current = true limit 1`);

    const { rows: txStats } = await pool.query(
      `select count(distinct t.id)::int as transcripts,
              count(tc.id)::int as courses
       from public.transcripts t
       left join public.transcript_courses tc on tc.transcript_id = t.id`);

    const { rows: eqStats } = await pool.query(
      `select count(*)::int as n from public.equivalencies`);

    const activityAsc = [...activity].reverse();
    const pendingN = pending[0]?.n || 0;
    const todayN = today[0]?.n || 0;
    const prevDay = activity[1] || { day: null, decisions: 0 };
    const thisWeek = activity.slice(0, 7).reduce((a, x) => a + (x.decisions || 0), 0);
    const prevWeek = activity.slice(7, 14).reduce((a, x) => a + (x.decisions || 0), 0);
    const totalEvaluations = (e.historical_decisions || 0) + (seasonal[0]?.n || 0);
    const seasonEvaluations = seasonal[0]?.n || 0;
    const assigned = pendingN + seasonEvaluations;
    const completionRate = assigned > 0 ? Math.round((seasonEvaluations / assigned) * 100) : 100;
    const courses = txStats[0]?.courses || 0;
    const transcripts = txStats[0]?.transcripts || 0;
    const equivalencies = eqStats[0]?.n || 0;

    res.json({
      metrics: {
        unit: e.unit,
        full_name: e.full_name,
        evaluator: { specializations: e.specializations || [], programExpertise: e.program_expertise || [] },
        season: { name: season[0]?.name || 'Fall 2026 transfer season' },
        pendingEvaluations: pendingN,
        evaluatedToday: todayN,
        evaluatedTodayLive: 0,
        previousWorkingDay: prevDay,
        activity: activityAsc,
        highPriority: highPri[0]?.n || 0,
        missingInformation: 0,
        queueBreakdown: { high: highPri[0]?.n || 0 },
        confidence: { high: 0, medium: 0, low: 0 },
        totalEvaluations,
        seasonEvaluations,
        completionRate,
        thisWeek,
        previousWeek: prevWeek,
        averageReviewMinutes: 8,
        averageReviewSource: 'estimate',
        measuredDecisions: 0,
      },
      flow: {
        courses,
        transcripts,
        transcriptsWeek: 0,
        reused: Math.min(equivalencies, courses),
        equivalencies,
        learned: 0,
        aiRecommended: Math.max(0, courses - equivalencies),
        manualReview: 0,
        myOpenByPath: { ai_recommended: pendingN, manual_review: 0 },
        hoursSaved: Math.round(equivalencies * 0.13),
      },
      upNext: [],
      totalItems: pendingN,
    });
  } catch (err) { next(err); }
});

// GET /evaluators/me/evaluations
router.get('/me/evaluations', async (req, res, next) => {
  try {
    const evId = req.user.evaluator_id;
    if (!evId) return next(forbidden('Not an evaluator'));
    const { q } = req.query;
    let sql = `
      select ce.id, ce.state, ce.student_status, ce.suggestion, ce.requested_credits, ce.awarded_credits,
             ce.pipeline_path, tc.course_code, tc.title as course_title, tc.grade, tc.source_credits,
             ar.match_pct, ar.confidence, ar.decision as ai_decision, ar.evaluation_path,
             a.id as application_id, a.reference, a.status as app_status, a.submitted_at,
             sp.full_name as student_name, s.student_number,
             si.name as source_institution,
             ea.status as assignment_status, ea.assignment_type,
             ev.full_name as evaluator_name, ev.unit as evaluator_unit
      from public.evaluator_assignments ea
      join public.course_evaluations ce on ce.id = ea.course_evaluation_id
      join public.transcript_courses tc on tc.id = ce.transcript_course_id
      join public.applications a on a.id = ce.application_id
      join public.students s on s.id = a.student_id
      join public.profiles sp on sp.id = s.profile_id
      join public.transcripts t on t.application_id = a.id
      join public.institutions si on si.id = t.source_institution_id
      left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
      join public.evaluators ev on ev.id = ea.evaluator_id
      where ea.evaluator_id = $1 and ea.status in ('assigned','in_progress')
    `;
    const params = [evId];
    if (q) {
      sql += ` and (sp.full_name ilike $${params.push('%'+q+'%')} or tc.course_code ilike $${params.push('%'+q+'%')} or si.name ilike $${params.push('%'+q+'%')})`;
    }
    sql += ` order by ce.updated_at desc limit 100`;

    const { rows } = await pool.query(sql, params);
    const open = rows.filter((r) => r.assignment_status === 'in_progress').length;

    const evaluator = rows[0]
      ? { name: rows[0].evaluator_name, unit: rows[0].evaluator_unit }
      : { name: req.user.full_name, unit: req.user.unit };

    res.json({
      items: rows.map((r) => ({
        kind: 'course',
        id: r.id,
        applicationId: r.application_id,
        reference: r.reference,
        status: r.state,
        priority: r.match_pct >= 85 ? 'Low' : r.match_pct >= 65 ? 'Medium' : 'High',
        matchPct: r.match_pct,
        risk: r.match_pct < 65 ? 'high' : r.match_pct < 85 ? 'medium' : 'low',
        reason: r.ai_decision || '',
        evaluationPath: r.evaluation_path || r.pipeline_path,
        receivedAt: r.submitted_at,
        previousUniversity: r.source_institution,
        student: { name: r.student_name, number: r.student_number },
        course: { id: r.id, code: r.course_code, title: r.course_title, targetCode: r.suggestion, award: r.suggestion },
        open: r.assignment_status === 'in_progress',
      })),
      subjects: [],
      processing: [],
      evaluator,
      open,
      total: rows.length,
    });
  } catch (err) { next(err); }
});

// GET /evaluators
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const myEvId = req.user.evaluator_id;
    const { rows } = await pool.query(
      `select e.id, e.staff_code, e.unit, e.title, e.subject_codes, e.specializations,
              e.program_expertise, e.avatar_tone, e.historical_decisions,
              e.is_available, e.is_active, e.max_active_load, e.data_source,
              p.full_name, p.email,
              coalesce(a.n,0) as active_load,
              d.name as department_name
       from public.evaluators e
       join public.profiles p on p.id = e.profile_id
       left join (select evaluator_id, count(*)::int as n from public.evaluator_assignments
                  where status in ('assigned','in_progress') group by evaluator_id) a on a.evaluator_id = e.id
       left join public.departments d on d.id = e.department_id
       where e.is_active = true
       order by e.unit, p.full_name`);

    const items = rows.map((r) => ({
      id: r.id,
      name: r.full_name,
      email: r.email,
      title: r.title || 'Credit Evaluator',
      department: r.department_name || r.unit,
      unit: r.unit,
      subjects: r.subject_codes || [],
      specializations: r.specializations || [],
      programExpertise: r.program_expertise || [],
      workload: r.active_load,
      maxActiveLoad: r.max_active_load || 20,
      available: r.is_available !== false,
      isMe: r.id === myEvId,
      dataSource: r.data_source,
      activeItems: [],
      avatarTone: r.avatar_tone,
    }));

    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});

// PATCH /evaluators/:id
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { is_available, is_active, max_active_load } = req.body || {};
    await pool.query(
      `update public.evaluators set
         is_available = coalesce($1, is_available),
         is_active = coalesce($2, is_active),
         max_active_load = coalesce($3, max_active_load),
         updated_at = now()
       where id = $4`,
      [is_available, is_active, max_active_load, req.params.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
