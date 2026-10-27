import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator } from '../middleware/require-role.js';
import { pool, withTransaction } from '../config/db.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';
import { invalidateMatcher } from '../services/engine/recommender.js';

const router = Router();
router.use(authenticate, requireEvaluator);

function parseJson(v) {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function matchBand(pct) {
  if (!pct) return { risk: 'high', band: 'C', bandText: 'Low confidence — manual review required' };
  if (pct >= 85) return { risk: 'low',    band: 'A', bandText: 'High confidence — auto-approved' };
  if (pct >= 65) return { risk: 'medium', band: 'B', bandText: 'Medium confidence — review recommended' };
  return { risk: 'high', band: 'C', bandText: 'Low confidence — manual review required' };
}

function buildCourse(r, canDecide) {
  const pct      = r.match_pct ?? null;
  const band     = matchBand(pct);
  const criteria = parseJson(r.criteria) || [];
  const reasons  = parseJson(r.reasons) || [];
  const covered  = parseJson(r.covered_topics) || [];
  const missing  = parseJson(r.missing_topics) || [];
  const exceptions = parseJson(r.exceptions) || [];

  const decided = r.decided_at != null;
  const isRejected = r.state === 'rejected';

  return {
    id: r.id,
    state: r.state,
    statusLabel: decided
      ? (isRejected ? 'Rejected' : 'Credit confirmed')
      : r.state === 'info_requested' ? 'Information requested'
      : 'Awaiting decision',
    evaluationPath: r.evaluation_path || r.pipeline_path || 'Needs review',
    suggestion: r.suggestion,
    credits: r.requested_credits,

    source: {
      code:             r.course_code,
      title:            r.course_title || r.title,
      grade:            r.grade,
      requestedCredits: r.requested_credits,
      sourceCredits:    r.source_credits,
      creditSystem:     r.credit_system || 'Semester',
      term:             r.term,
      description:      r.course_description || null,
      learningOutcomes: null,
      institution:      r.source_institution,
      dataSource:       'transcript',
    },

    target: {
      code:             r.bu_code || r.target_code || r.suggestion,
      title:            r.bu_title || null,
      credits:          r.bu_credits || r.requested_credits,
      requirement:      r.requirement_group || null,
      description:      r.bu_description || null,
      learningOutcomes: r.bu_outcomes || null,
      prerequisites:    null,
    },

    recommendation: {
      decision:         r.ai_decision || 'No recommendation',
      award:            r.award_label || r.suggestion,
      credits:          r.award_credits || r.requested_credits,
      matchPct:         pct,
      confidence:       r.confidence || 'Low',
      criteria,
      reasons,
      coveredTopics:    covered,
      missingTopics:    missing,
      exceptions,
      equivalencyCode:  r.equivalency_code || null,
      knowledgeMatch:   r.equivalency_code ? { code: r.equivalency_code } : null,
      rejectCause:      isRejected ? (exceptions[0] || 'Insufficient content overlap') : null,
    },

    analysis: {
      ...band,
      outcomePct: pct ? Math.round(pct * 0.9) : null,
      creditPct:  100,
      missingInfo: [],
      hardExceptions: exceptions.filter((e) => Array.isArray(e) ? e[0] === 'stop' : false),
    },

    evidence:    [],
    similar:     {},

    permissions: {
      canDecide: canDecide && !decided,
      canReopen: decided,
    },

    routing: {
      evaluator: r.assigned_to_name
        ? { name: r.assigned_to_name, department: r.assigned_to_dept || 'Credit Evaluation' }
        : null,
    },

    prerequisites: { status: 'Not in data' },

    decision: decided ? {
      by:   r.decided_by_name || 'Evaluator',
      at:   r.decided_at,
      note: r.decision_note || null,
    } : null,

    overrideOptions: [r.bu_code || r.suggestion, 'No credit'].filter(Boolean),
    infoReceivedAt: null,
  };
}

// GET /evaluations/:id — case summary + courses (full DTO for case.js)
router.get('/:id', async (req, res, next) => {
  try {
    const evId = req.user.evaluator_id;
    const { rows: appRows } = await pool.query(
      `select a.id, a.reference, a.status, a.submitted_at, a.internal_notes,
              sp.full_name as student_name, s.student_number, s.intended_major, s.previous_program,
              si.name as source_institution, si.id as source_institution_id,
              ep.full_name as owner_name, oe.id as owner_id,
              seas.name as season_name
       from public.applications a
       join public.students s on s.id = a.student_id
       join public.profiles sp on sp.id = s.profile_id
       join public.transcripts t on t.application_id = a.id
       join public.institutions si on si.id = t.source_institution_id
       left join public.evaluator_assignments ea2
         on ea2.application_id = a.id and ea2.assignment_type = 'case_owner'
         and ea2.course_evaluation_id is null
         and ea2.status in ('assigned','in_progress')
       left join public.evaluators oe on oe.id = ea2.evaluator_id
       left join public.profiles ep on ep.id = oe.profile_id
       left join public.seasons seas on seas.is_current = true
       where a.id = $1`,
      [req.params.id],
    );
    if (!appRows[0]) return next(notFound('Application not found'));
    const app = appRows[0];

    const { rows: courseRows } = await pool.query(
      `select ce.id, ce.state, ce.student_status, ce.suggestion, ce.requested_credits, ce.awarded_credits,
              ce.pipeline_path, ce.decision_note, ce.decided_at, ce.decided_by,
              tc.course_code, tc.title as course_title, tc.grade, tc.source_credits,
              tc.credit_system, tc.term, tc.description as course_description,
              ar.match_pct, ar.confidence, ar.decision as ai_decision, ar.award_label, ar.award_credits,
              ar.evaluation_path, ar.exceptions, ar.reasons, ar.criteria,
              ar.target_code, ar.target_course_id, ar.covered_topics, ar.missing_topics,
              ar.equivalency_code, ar.kb_equivalency_id,
              buc.code as bu_code, buc.title as bu_title, buc.credits as bu_credits,
              buc.description as bu_description, buc.learning_outcomes as bu_outcomes,
              buc.requirement_group,
              ea.evaluator_id as assigned_to,
              ep2.full_name as assigned_to_name,
              ev2.unit as assigned_to_dept,
              dp.full_name as decided_by_name,
              si2.name as source_institution
       from public.course_evaluations ce
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       join public.transcripts t on t.application_id = ce.application_id
       join public.institutions si2 on si2.id = t.source_institution_id
       left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
       left join public.courses buc on buc.id = ar.target_course_id
       left join public.evaluator_assignments ea
         on ea.course_evaluation_id = ce.id
         and ea.status in ('assigned','in_progress')
       left join public.evaluators ev2 on ev2.id = ea.evaluator_id
       left join public.profiles ep2 on ep2.id = ev2.profile_id
       left join public.evaluators devEv on devEv.id = ce.decided_by
       left join public.profiles dp on dp.id = devEv.profile_id
       where ce.application_id = $1 order by tc.line_no`,
      [req.params.id],
    );

    const isOwner = app.owner_id === evId;
    const courses = courseRows.map((r) => buildCourse(r, isOwner));
    const pendingCount = courses.filter((c) => c.state === 'pending').length;

    res.json({
      evaluation: {
        id: app.id,
        reference: app.reference,
        status: app.status,
        receivedAt: app.submitted_at,
        notes: app.internal_notes || '',
        student: {
          name: app.student_name,
          number: app.student_number,
          intendedMajor: app.intended_major,
          previousProgram: app.previous_program,
        },
        sourceInstitution: { name: app.source_institution, id: app.source_institution_id },
        targetProgram: { name: app.intended_major || 'Undeclared' },
        owner: { name: app.owner_name || 'Unassigned', id: app.owner_id },
        season: { name: app.season_name || 'Fall 2026 transfer season' },
        permissions: {
          canDecide: isOwner,
          canComplete: isOwner && pendingCount === 0,
          canRequestInfo: isOwner,
          canReopen: isOwner,
        },
        infoRequests: [],
        priority: pendingCount > 3 ? 'High' : pendingCount > 0 ? 'Medium' : 'Low',
      },
      courses,
      upNext: null,
    });
  } catch (err) { next(err); }
});

// GET /evaluations/:id/courses
router.get('/:id/courses', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select ce.id, ce.state, ce.student_status, ce.suggestion, ce.requested_credits, ce.awarded_credits,
              ce.pipeline_path, ce.decision_note, ce.decided_at,
              tc.course_code, tc.title, tc.grade, tc.source_credits, tc.credit_system, tc.term,
              ar.match_pct, ar.confidence, ar.decision as ai_decision, ar.award_label,
              ar.exceptions, ar.reasons, ar.criteria, ar.target_code, ar.target_course_id,
              ar.kb_equivalency_id, ar.equivalency_code,
              ea.evaluator_id as assigned_to,
              ep.full_name as assigned_to_name
       from public.course_evaluations ce
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
       left join public.evaluator_assignments ea on ea.course_evaluation_id = ce.id and ea.status in ('assigned','in_progress')
       left join public.evaluators e on e.id = ea.evaluator_id
       left join public.profiles ep on ep.id = e.profile_id
       where ce.application_id = $1 order by tc.line_no`,
      [req.params.id],
    );
    res.json({ courses: rows });
  } catch (err) { next(err); }
});

// GET /evaluations/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select * from public.evaluation_history where application_id = $1 order by created_at`,
      [req.params.id],
    );
    res.json({ history: rows });
  } catch (err) { next(err); }
});

// GET /evaluations/:id/transcript
router.get('/:id/transcript', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select tc.* from public.transcript_courses tc
       join public.transcripts t on t.id = tc.transcript_id
       where t.application_id = $1 order by tc.line_no`,
      [req.params.id],
    );
    res.json({ courses: rows });
  } catch (err) { next(err); }
});

// POST /evaluations/:id/open
router.post('/:id/open', async (req, res, next) => {
  try {
    const evId = req.user.evaluator_id;
    await pool.query(
      `update public.evaluator_assignments set status = 'in_progress', started_at = now()
       where application_id = $1 and evaluator_id = $2 and assignment_type = 'case_owner'`,
      [req.params.id, evId],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /evaluations/:id/complete
router.post('/:id/complete', async (req, res, next) => {
  try {
    const evId = req.user.evaluator_id;
    await pool.query(
      `update public.evaluator_assignments set status = 'completed', completed_at = now()
       where application_id = $1 and evaluator_id = $2 and assignment_type = 'case_owner'`,
      [req.params.id, evId],
    );
    await pool.query(
      `update public.applications set status = 'completed', completed_at = now(), completed_by = $1, updated_at = now()
       where id = $2`,
      [evId, req.params.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// PATCH /evaluations/:id/notes
router.patch('/:id/notes', async (req, res, next) => {
  try {
    const { notes } = req.body || {};
    await pool.query(`update public.applications set internal_notes = $1, updated_at = now() where id = $2`, [notes || '', req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /evaluations/:id/request-information (case-level)
router.post('/:id/request-information', async (req, res, next) => {
  try {
    const { message, courseEvaluationId } = req.body || {};
    if (!message) return next(badRequest('message is required'));
    const evId = req.user.evaluator_id;
    await pool.query(
      `insert into public.information_requests (application_id, course_evaluation_id, requested_by, message)
       values ($1, $2, $3, $4)`,
      [req.params.id, courseEvaluationId || null, evId, message],
    );
    await pool.query(
      `update public.applications set status = 'needs_information', updated_at = now() where id = $1`,
      [req.params.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /evaluations/:id/bulk — bulk-decide multiple courses
router.post('/:id/bulk', async (req, res, next) => {
  try {
    const { decisions } = req.body || {};
    if (!Array.isArray(decisions) || decisions.length === 0) return next(badRequest('decisions array required'));
    const evId = req.user.evaluator_id;
    let processed = 0;
    for (const d of decisions) {
      const { courseEvaluationId, action, award, credits, comment } = d;
      if (!courseEvaluationId || !action) continue;
      const { rows } = await pool.query(
        `select ce.*, ar.decision as ai_decision, ar.award_label as ai_award, ar.match_pct as ai_match_pct
         from public.course_evaluations ce
         left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
         where ce.id = $1 and ce.application_id = $2`,
        [courseEvaluationId, req.params.id],
      );
      if (!rows[0]) continue;
      const ce = rows[0];
      const stateMap = { accept: 'confirmed', reject: 'rejected', override: 'overridden' };
      const newState = stateMap[action] || 'confirmed';
      const awardLabel = award || ce.suggestion;
      const diffFromAi = awardLabel !== ce.ai_award;
      await pool.query(
        `update public.course_evaluations set state = $1, suggestion = $2, awarded_credits = $3,
         decision_note = $4, decided_by = $5, decided_at = now(), updated_at = now() where id = $6`,
        [newState, awardLabel, credits || ce.requested_credits, comment || null, evId, courseEvaluationId],
      );
      await pool.query(
        `insert into public.evaluation_decisions
           (course_evaluation_id, application_id, evaluator_id, recommendation_id, action, award_label, award_credits,
            student_comment, ai_decision, ai_award, ai_match_pct, differs_from_ai)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [courseEvaluationId, req.params.id, evId, ce.current_recommendation_id, action, awardLabel,
         credits || ce.requested_credits, comment || null,
         ce.ai_decision, ce.ai_award, ce.ai_match_pct, diffFromAi],
      );
      processed++;
    }
    res.json({ processed });
  } catch (err) { next(err); }
});

export default router;
