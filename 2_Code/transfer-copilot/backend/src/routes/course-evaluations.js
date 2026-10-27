import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireEvaluator } from '../middleware/require-role.js';
import { pool } from '../config/db.js';
import { notFound, badRequest, conflict } from '../utils/errors.js';

const router = Router();
router.use(authenticate, requireEvaluator);

// GET /course-evaluations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select ce.*, tc.course_code, tc.title as course_title, tc.grade, tc.source_credits, tc.credit_system, tc.term,
              tc.description as course_description,
              ar.match_pct, ar.confidence, ar.decision as ai_decision, ar.award_label, ar.award_credits,
              ar.exceptions, ar.reasons, ar.criteria, ar.candidates,
              ar.target_code, ar.target_course_id, ar.covered_topics, ar.missing_topics,
              ar.kb_equivalency_id, ar.equivalency_code,
              si.name as source_institution, si.id as source_institution_id,
              buc.code as bu_code, buc.title as bu_title, buc.credits as bu_credits, buc.level as bu_level,
              buc.description as bu_description, buc.learning_outcomes as bu_outcomes
       from public.course_evaluations ce
       join public.transcript_courses tc on tc.id = ce.transcript_course_id
       join public.transcripts t on t.id = tc.transcript_id
       join public.institutions si on si.id = t.source_institution_id
       left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
       left join public.courses buc on buc.id = ar.target_course_id
       where ce.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return next(notFound('Course evaluation not found'));
    res.json({ courseEvaluation: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /course-evaluations/:id/decision
router.patch('/:id/decision', async (req, res, next) => {
  try {
    const { action, reason, comment, award, credits } = req.body || {};
    if (!action) return next(badRequest('action is required'));
    if (action === 'override' && !reason) return next(badRequest('reason is required for override'));
    if (action === 'reject'   && !reason) return next(badRequest('reason is required for rejection'));

    const evId = req.user.evaluator_id;
    if (!evId) return next(forbidden('Not an evaluator'));

    const { rows: ceRows } = await pool.query(
      `select ce.*, ar.decision as ai_decision, ar.award_label as ai_award, ar.match_pct as ai_match_pct
       from public.course_evaluations ce
       left join public.ai_recommendations ar on ar.id = ce.current_recommendation_id
       where ce.id = $1`,
      [req.params.id],
    );
    if (!ceRows[0]) return next(notFound('Course evaluation not found'));
    const ce = ceRows[0];

    const stateMap   = { accept: 'confirmed', reject: 'rejected', override: 'overridden', reopen: 'pending' };
    const newState   = stateMap[action] || 'pending';
    const awardLabel = action === 'reopen' ? ce.suggestion : (award || ce.suggestion);
    // differs_from_ai must only be true when audit_reason is provided (schema constraint)
    const diffFromAi = action !== 'reopen' && awardLabel !== ce.ai_award && !!ce.ai_award && !!(reason || comment);

    await pool.query(
      `update public.course_evaluations set
         state = $1, suggestion = $2, awarded_credits = $3, decision_note = $4,
         decided_by = $5, decided_at = now(), updated_at = now()
       where id = $6`,
      [newState, awardLabel, credits || ce.requested_credits, comment || null, evId, req.params.id],
    );

    await pool.query(
      `insert into public.evaluation_decisions
         (course_evaluation_id, application_id, evaluator_id, recommendation_id, action, award_label, award_credits,
          student_comment, audit_reason, ai_decision, ai_award, ai_match_pct, differs_from_ai)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [req.params.id, ce.application_id, evId, ce.current_recommendation_id, action, awardLabel,
       credits || ce.requested_credits, comment || null, reason || null,
       ce.ai_decision, ce.ai_award, ce.ai_match_pct, diffFromAi],
    );

    if (action !== 'reopen') {
      await pool.query(
        `update public.evaluator_assignments set status = 'completed', completed_at = now()
         where course_evaluation_id = $1 and evaluator_id = $2 and status in ('assigned','in_progress')`,
        [req.params.id, evId],
      );
    }

    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /course-evaluations/:id/request-information
router.post('/:id/request-information', async (req, res, next) => {
  try {
    const { message } = req.body || {};
    if (!message) return next(badRequest('message is required'));
    const evId = req.user.evaluator_id;
    const { rows } = await pool.query(`select application_id from public.course_evaluations where id = $1`, [req.params.id]);
    if (!rows[0]) return next(notFound('Course evaluation not found'));
    await pool.query(
      `insert into public.information_requests (application_id, course_evaluation_id, requested_by, message)
       values ($1, $2, $3, $4)`,
      [rows[0].application_id, req.params.id, evId, message],
    );
    await pool.query(
      `update public.course_evaluations set state = 'info_requested', updated_at = now() where id = $1`,
      [req.params.id],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /course-evaluations/:id/equivalency-check
router.get('/:id/equivalency-check', async (req, res, next) => {
  try {
    const { award } = req.query;
    const { rows } = await pool.query(
      `select e.*, sc.code as src_code, tc.code as tgt_code
       from public.course_evaluations ce
       join public.transcript_courses tc2 on tc2.id = ce.transcript_course_id
       join public.transcripts t on t.id = tc2.transcript_id
       join public.equivalencies e on e.source_course_id = tc2.course_id and e.status = 'active'
       left join public.courses sc on sc.id = e.source_course_id
       left join public.courses tc on tc.id = e.target_course_id
       where ce.id = $1 limit 1`,
      [req.params.id],
    );
    res.json({ equivalency: rows[0] || null });
  } catch (err) { next(err); }
});

export default router;
