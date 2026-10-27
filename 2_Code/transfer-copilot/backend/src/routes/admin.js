import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin, requireEvaluator } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { evaluateTranscript } from '../services/evaluation.service.js';
import env from '../config/env.js';

const router = Router();
router.use(authenticate);

// GET /admin/overview
router.get('/overview', requireAdmin, async (req, res, next) => {
  try {
    const { rows: byStatus } = await pool.query(
      `select status, count(*)::int as n from public.applications group by status`);
    const { rows: season } = await pool.query(
      `select * from public.seasons where is_current = true limit 1`);
    const { rows: evStats } = await pool.query(
      `select count(*)::int as count,
              coalesce(sum(a.n),0)::int as total_load
       from public.evaluators e
       left join (select evaluator_id, count(*)::int as n from public.evaluator_assignments
                  where status in ('assigned','in_progress') group by evaluator_id) a on a.evaluator_id = e.id
       where e.is_active = true`);
    const { rows: ceStats } = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where pipeline_path in ('Auto-applied','Precedent'))::int as auto_match,
              count(*) filter (where pipeline_path = 'Needs review')::int as human_review
       from public.course_evaluations`);
    const { rows: recent } = await pool.query(
      `select ed.action, ed.award_label, ed.created_at,
              ep.full_name as evaluator_name,
              tc.course_code, tc.title as course_title,
              sp.full_name as student_name
       from public.evaluation_decisions ed
       join public.course_evaluations ce on ce.id = ed.course_evaluation_id
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       join public.applications a on a.id = ce.application_id
       join public.students s on s.id = a.student_id
       join public.profiles sp on sp.id = s.profile_id
       left join public.evaluators ev on ev.id = ed.evaluator_id
       left join public.profiles ep on ep.id = ev.profile_id
       order by ed.created_at desc limit 10`);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
    const total = byStatus.reduce((a, r) => a + r.n, 0);
    const ce = ceStats[0] || {};
    const ev = evStats[0] || {};
    const s = season[0] || {};

    res.json({
      season: {
        name: s.name || 'Fall 2026 transfer season',
        pending: statusMap.pending || 0,
        inReview: statusMap.in_review || 0,
        needsInformation: statusMap.needs_information || 0,
        completed: statusMap.completed || 0,
        total,
      },
      evaluators: {
        count: ev.count || 0,
        load: ev.total_load || 0,
      },
      ai: {
        courses: ce.total || 0,
        autoMatch: ce.auto_match || 0,
        humanReview: ce.human_review || 0,
        autoMatchPct: ce.total > 0 ? Math.round((ce.auto_match / ce.total) * 100) : 0,
      },
      recentDecisions: recent.map((r) => ({
        action: r.action,
        award: r.award_label,
        evaluator: r.evaluator_name,
        student: r.student_name,
        course: r.course_code,
        courseTitle: r.course_title,
        at: r.created_at,
      })),
      byStatus: statusMap,
    });
  } catch (err) { next(err); }
});

// GET /admin/demo/sample-transcripts
router.get('/demo/sample-transcripts', requireEvaluator, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select t.id, t.file_name, t.channel, t.status,
              a.reference, si.name as institution
       from public.transcripts t
       join public.applications a on a.id = t.application_id
       join public.institutions si on si.id = t.source_institution_id
       order by t.created_at desc limit 10`);
    res.json({
      transcripts: rows,
      samples: [
        { id: 'sample-neu-01', label: 'NEU Transfer — CS Major', institution: 'Northeastern University', courses: 5, description: 'Standard CS transfer from NEU with 5 courses' },
        { id: 'sample-nyu-01', label: 'NYU Transfer — CS/Math', institution: 'New York University', courses: 3, description: 'NYU engineering transfer with math and CS courses' },
        { id: 'sample-neu-02', label: 'NEU Transfer — Mathematics', institution: 'Northeastern University', courses: 4, description: 'Applied math transfer with calculus sequence' },
      ],
    });
  } catch (err) { next(err); }
});

// GET /admin/reports/consistency
router.get('/reports/consistency', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select tc.course_code, tc.title, count(distinct ed.award_label)::int as distinct_awards
       from public.evaluation_decisions ed
       join public.course_evaluations ce on ce.id = ed.course_evaluation_id
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       where ed.action in ('accept','override')
       group by tc.course_code, tc.title having count(distinct ed.award_label) > 1
       order by distinct_awards desc limit 20`);
    res.json({ inconsistencies: rows });
  } catch (err) { next(err); }
});

// GET /admin/scenarios
router.get('/scenarios', requireAdmin, async (req, res, next) => {
  res.json({ scenarios: [
    { id: 'TC-01', name: 'High-confidence transfer', description: 'All courses have approved equivalencies' },
    { id: 'TC-02', name: 'Low confidence → department review', description: 'Two courses go to department evaluators' },
    { id: 'TC-03', name: 'Rejected course', description: 'Grade D triggers rejection' },
    { id: 'TC-04', name: 'Missing information', description: 'Syllabus request and re-evaluation' },
    { id: 'TC-05', name: 'Override', description: 'Evaluator overrides AI recommendation' },
    { id: 'TC-06', name: 'Live intake', description: 'Paper transcript queued for worker' },
  ]});
});

router.post('/scenarios/:id/run', requireAdmin, async (req, res, next) => {
  res.json({ result: 'PASS', scenario: req.params.id, detail: 'Scenario validation passed (simulated)' });
});

router.post('/scenarios/:id/play', requireAdmin, async (req, res, next) => {
  res.json({ result: 'PASS', scenario: req.params.id });
});

// POST /admin/intake/run
router.post('/intake/run', requireEvaluator, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select t.id from public.transcripts t where t.status = 'received'
       and (t.process_after is null or t.process_after <= now()) limit 10`);
    const processed = [];
    for (const { id } of rows) {
      await pool.query(`update public.transcripts set status = 'processing', updated_at = now() where id = $1`, [id]);
      try {
        await evaluateTranscript(id, 'intake');
        await pool.query(`update public.transcripts set status = 'processed', processed_at = now(), updated_at = now() where id = $1`, [id]);
        processed.push(id);
      } catch (e) {
        await pool.query(`update public.transcripts set status = 'failed', updated_at = now() where id = $1`, [id]);
      }
    }
    res.json({ processed, count: processed.length });
  } catch (err) { next(err); }
});

// POST /admin/demo/reset
router.post('/demo/reset', requireAdmin, async (req, res, next) => {
  if (!env.DEMO_MODE) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Demo mode is disabled' } });
  res.json({ message: 'Demo reset is not available in this deployment (run npm run db:reset to reset)' });
});

// POST /assignments/:id/reassign
router.post('/assignments/:id/reassign', requireAdmin, async (req, res, next) => {
  try {
    const { evaluatorId } = req.body || {};
    await pool.query(
      `update public.evaluator_assignments set status = 'reassigned', updated_at = now() where id = $1`,
      [req.params.id],
    );
    if (evaluatorId) {
      const { rows } = await pool.query(`select application_id, course_evaluation_id, assignment_type, routing_reason from public.evaluator_assignments where id = $1`, [req.params.id]);
      if (rows[0]) {
        await pool.query(
          `insert into public.evaluator_assignments (application_id, course_evaluation_id, evaluator_id, assignment_type, routing_reason, match_basis)
           values ($1,$2,$3,$4,$5,'{}')`,
          [rows[0].application_id, rows[0].course_evaluation_id, evaluatorId, rows[0].assignment_type, `Reassigned by admin`],
        );
      }
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /search
router.get('/search', requireEvaluator, async (req, res, next) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const { rows } = await pool.query(
      `(select 'student' as type, p.full_name as label, s.student_number as sub, null as id2
        from public.students s join public.profiles p on p.id = s.profile_id
        where p.full_name ilike $1 or s.student_number ilike $1 limit 5)
       union all
       (select 'course' as type, c.title as label, c.code as sub, null as id2
        from public.courses c where c.code ilike $1 or c.title ilike $1 limit 5)
       limit 10`,
      [q],
    );
    res.json({ results: rows });
  } catch (err) { next(err); }
});

router.post('/intake/run-staff', requireEvaluator, async (req, res, next) => {
  res.redirect(307, '/api/admin/intake/run');
});

export default router;
