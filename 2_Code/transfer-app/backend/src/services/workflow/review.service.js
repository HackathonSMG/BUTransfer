// An evaluator's work on one course review: the evaluation package, opening it, the decision, information
// requests, and the hand-off of the application's remaining courses to the next evaluator.
// Decisions go through memoryService.recordCourseDecision so they feed the equivalency memory as before.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification } from '../notification.service.js';
import { createInfoRequest } from '../application.service.js';
import { recordCourseDecision, recommendationOf } from '../credit/memory.service.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { courseKnowledge, matchLabel } from './knowledge.service.js';

const OPEN = ['new', 'in_progress', 'info_requested'];

async function ownReview(reviewId, userId) {
  const { rows: [r] } = await query(
    `SELECT r.*, a.reference_number, a.student_name, a.transfer_from_institution, a.transfer_to_program
     FROM course_reviews r JOIN applications a ON a.id = r.application_id WHERE r.id = $1 AND r.evaluator_id = $2`,
    [reviewId, userId]
  );
  if (!r) throw notFound('Evaluation');
  return r;
}

async function latestCourseEvaluation(transcriptCourseId, applicationId) {
  const { rows: [ev] } = await query(
    `SELECT ce.* FROM course_evaluations ce
     WHERE ce.transcript_course_id = $1
       AND ce.ai_evaluation_id = (SELECT id FROM ai_evaluations WHERE application_id = $2 ORDER BY created_at DESC LIMIT 1)`,
    [transcriptCourseId, applicationId]
  );
  return ev || null;
}

/**
 * What accepting the review grants. Policy-rule outcomes keep the engine's result (e.g. no credit);
 * otherwise the review's target BU course is awarded as a transfer course.
 */
function proposedOutcome(review, ev) {
  if (ev?.path === 'rule') {
    const rec = recommendationOf(ev);
    if (rec) return { outcome: rec.outcome, award: rec.award, label: rec.outcome === 'no_credit' ? 'No credit' : `Elective credit: ${rec.award}` };
  }
  if (review.target_bu_course) return { outcome: 'transfer', award: review.target_bu_course, label: `Equivalent to ${review.target_bu_course}` };
  return null;
}

export async function getReview(reviewId, userId) {
  const r = await ownReview(reviewId, userId);
  const ev = await latestCourseEvaluation(r.transcript_course_id, r.application_id);

  const [course, target, sponsor, equivalency, transcript, documents, decision, history, next, infoRequest] = await Promise.all([
    query(`SELECT tc.institution, tc.course_code, COALESCE(c.title, tc.title) AS title, tc.term, tc.grade, tc.source_credits, tc.credit_system,
                  c.credits AS catalog_credits, c.program, c.level, c.requirement_type, c.description, c.learning_outcomes, c.syllabus IS NOT NULL AS has_syllabus
           FROM transcript_courses tc LEFT JOIN catalog_courses c ON c.institution = tc.institution AND c.course_code = tc.course_code
           WHERE tc.id = $1`, [r.transcript_course_id]),
    r.target_bu_course
      ? query(`SELECT course_code, title, credits, program, level, requirement_type, notes, description, learning_outcomes
               FROM catalog_courses WHERE institution = 'Boston University' AND course_code = $1`, [r.target_bu_course])
      : { rows: [] },
    query(`SELECT bu_course, match_level, notes FROM sponsor_course_matches sm
           JOIN transcript_courses tc ON tc.institution = sm.peer_institution AND tc.course_code = sm.peer_course WHERE tc.id = $1`, [r.transcript_course_id]),
    ev?.equivalency_id ? query(`SELECT eq_id, bu_course, outcome, TO_CHAR(approved_on, 'YYYY-MM-DD') AS approved_on FROM equivalencies WHERE eq_id = $1`, [ev.equivalency_id]) : { rows: [] },
    query(`SELECT id, institution, course_code, title, term, source_credits, credit_system, grade FROM transcript_courses
           WHERE application_id = $1 ORDER BY institution, position`, [r.application_id]),
    query(`SELECT id, file_name, document_type, created_at FROM application_documents WHERE application_id = $1 ORDER BY created_at`, [r.application_id]),
    query(`SELECT cd.action, cd.outcome, cd.bu_award, cd.reason, cd.decided_at, p.full_name AS decided_by FROM course_decisions cd
           LEFT JOIN profiles p ON p.id = cd.decided_by WHERE cd.transcript_course_id = $1`, [r.transcript_course_id]),
    query(`SELECT al.action, al.created_at, al.details, COALESCE(p.full_name, 'System') AS actor FROM audit_logs al
           LEFT JOIN profiles p ON p.id = al.actor_id
           WHERE al.application_id = $1 AND (al.details->>'review_id' = $2 OR al.action IN ('reviews_assigned', 'application_created', 'transfer_request_created'))
           ORDER BY al.created_at`, [r.application_id, reviewId]),
    query(`SELECT id FROM course_reviews WHERE evaluator_id = $1 AND status IN ('new', 'in_progress') AND id <> $2
           ORDER BY (priority = 'high') DESC, assigned_at ASC NULLS LAST LIMIT 1`, [userId, reviewId]),
    r.info_request_id
      ? query(`SELECT message, status, student_response, created_at, resolved_at FROM information_requests WHERE id = $1`, [r.info_request_id])
      : { rows: [] },
  ]);

  const sourceCourse = course.rows[0] || null;
  const knowledge = sourceCourse
    ? await courseKnowledge({ institution: sourceCourse.institution, courseCode: sourceCourse.course_code, targetBuCourse: r.target_bu_course })
    : null;

  const precedents = ev?.precedent_ids?.length
    ? (await query(`SELECT decision_id, decision, bu_awarded, reason, TO_CHAR(decided_on, 'YYYY-MM-DD') AS decided_on FROM past_decisions
                    WHERE decision_id = ANY($1) AND status = 'active' ORDER BY decided_on DESC NULLS LAST`, [ev.precedent_ids])).rows
    : [];

  return {
    review: {
      id: r.id, status: r.status, priority: r.priority, match_score: r.match_score, match_label: matchLabel(r.match_score), match_basis: r.match_basis,
      sponsor_match_level: r.sponsor_match_level, target_bu_course: r.target_bu_course, assigned_at: r.assigned_at,
      started_at: r.started_at, completed_at: r.completed_at, assignment_reason: r.assignment_reason,
    },
    application: {
      id: r.application_id, reference_number: r.reference_number, student_name: r.student_name,
      transfer_from_institution: r.transfer_from_institution, transfer_to_program: r.transfer_to_program,
    },
    source_course: sourceCourse,
    target_course: target.rows[0] || null,
    proposed: proposedOutcome(r, ev),
    evidence: {
      path: ev?.path || null,
      reasons: ev?.reasons || [],
      rules: ev?.rules || [],
      candidates: (ev?.candidates || []).slice(0, 3),
      sponsor_matches: sponsor.rows,
      equivalency: equivalency.rows[0] || null,
      precedents,
      // The external review step's notes, when it ran for this course (stored on course_evaluations)
      review_notes: ev?.agent_rationale || null,
      missing_information: ev?.agent_missing || null,
    },
    knowledge,
    decision: decision.rows[0] || null,
    info_request: infoRequest.rows[0] || null,
    transcript: { courses: transcript.rows, documents: documents.rows },
    history: history.rows,
    next_review_id: next.rows[0]?.id || null,
  };
}

/** Opening a new review moves it to In Progress. */
export async function startReview(reviewId, user) {
  const r = await ownReview(reviewId, user.id);
  if (r.status !== 'new') return { status: r.status };
  await query(`UPDATE course_reviews SET status = 'in_progress', started_at = NOW() WHERE id = $1`, [reviewId]);
  if (r.transfer_request_id) {
    await query(`UPDATE transfer_requests SET status = 'accepted', accepted_at = NOW() WHERE id = $1 AND status = 'pending'`, [r.transfer_request_id]);
  }
  await auditLog({ applicationId: r.application_id, action: 'review_started', actorId: user.id, actorEmail: user.email,
    oldValue: { status: 'new' }, newValue: { status: 'in_progress' }, details: { review_id: reviewId } });
  return { status: 'in_progress' };
}

/**
 * Accept or reject the proposed outcome. A rejection needs a reason. When this evaluator has no open
 * courses left on the application, the next evaluator's queued courses are handed over by transfer request.
 */
export async function decideReview(reviewId, { decision, reason }, user) {
  const r = await ownReview(reviewId, user.id);
  if (!OPEN.includes(r.status)) throw badRequest('This evaluation has already been decided.');
  const ev = await latestCourseEvaluation(r.transcript_course_id, r.application_id);

  if (decision === 'accept') {
    const proposed = proposedOutcome(r, ev);
    if (!proposed) throw badRequest('There is no proposed BU course to accept. Reject the course or request more information.');
    const rec = recommendationOf(ev);
    const sameAsEngine = rec && rec.outcome === proposed.outcome && (rec.award || null) === (proposed.award || null);
    await recordCourseDecision({
      applicationId: r.application_id, courseId: r.transcript_course_id, user,
      ...(sameAsEngine
        ? { action: 'approve' }
        : { action: 'change', outcome: proposed.outcome, buAward: proposed.award, reason: String(reason || '').trim() || 'Accepted the recommended equivalency.' }),
    });
  } else if (decision === 'reject') {
    if (!String(reason || '').trim()) throw badRequest('A reason is required to reject a course.');
    await recordCourseDecision({ applicationId: r.application_id, courseId: r.transcript_course_id, action: 'reject', reason, user });
  } else {
    throw badRequest('Decision must be accept or reject.');
  }

  const status = decision === 'accept' ? 'approved' : 'rejected';
  await query(`UPDATE course_reviews SET status = $1, completed_at = NOW() WHERE id = $2`, [status, reviewId]);
  await auditLog({ applicationId: r.application_id, action: 'review_decided', actorId: user.id, actorEmail: user.email,
    oldValue: { status: r.status }, newValue: { status }, details: { review_id: reviewId, reason: reason || null } });

  if (r.transfer_request_id) {
    await query(
      `UPDATE transfer_requests SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM course_reviews WHERE transfer_request_id = $1 AND status = ANY($2))`,
      [r.transfer_request_id, OPEN]
    );
  }

  const transfer = await handOffIfDone(r.application_id, user);
  return { status, transfer };
}

/** Asks the student for more information about this course; the review waits until it's decided. */
export async function requestInformation(reviewId, { message }, user) {
  const r = await ownReview(reviewId, user.id);
  if (!OPEN.includes(r.status)) throw badRequest('This evaluation has already been decided.');
  const text = String(message || '').trim();
  if (!text) throw badRequest('Describe the information you need.');
  const { rows: [tc] } = await query(`SELECT institution, course_code, title FROM transcript_courses WHERE id = $1`, [r.transcript_course_id]);
  const request = await createInfoRequest(
    r.application_id,
    [{ type: 'course_information', description: `${tc.course_code} ${tc.title || ''} (${tc.institution}): ${text}`.replace(/\s+/g, ' '), is_blocking: false }],
    text,
    user.id
  );
  await query(`UPDATE course_reviews SET status = 'info_requested', info_request_id = $1 WHERE id = $2`, [request.id, reviewId]);
  await auditLog({ applicationId: r.application_id, action: 'review_info_requested', actorId: user.id, actorEmail: user.email,
    oldValue: { status: r.status }, newValue: { status: 'info_requested' }, details: { review_id: reviewId, info_request_id: request.id } });
  return { status: 'info_requested' };
}

/** When nobody has open courses left on the application, opens the next queued evaluator's courses. */
async function handOffIfDone(applicationId, user) {
  const { rows: [open] } = await query(`SELECT COUNT(*)::int AS n FROM course_reviews WHERE application_id = $1 AND status = ANY($2)`, [applicationId, OPEN]);
  if (open.n > 0) return null;
  const { rows: queued } = await query(
    `SELECT r.id, r.evaluator_id, r.sequence, r.priority, tc.course_code FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
     WHERE r.application_id = $1 AND r.status = 'queued' AND r.evaluator_id IS NOT NULL ORDER BY r.sequence, tc.position`,
    [applicationId]
  );
  if (!queued.length) return null;
  const sequence = queued[0].sequence;
  const batch = queued.filter((q) => q.sequence === sequence);
  const toEvaluator = batch[0].evaluator_id;

  const { rows: decided } = await query(
    `SELECT tc.course_code, r.status, r.target_bu_course, cd.bu_award FROM course_reviews r
     JOIN transcript_courses tc ON tc.id = r.transcript_course_id LEFT JOIN course_decisions cd ON cd.transcript_course_id = r.transcript_course_id
     WHERE r.application_id = $1 AND r.status IN ('approved', 'rejected') ORDER BY r.completed_at`,
    [applicationId]
  );
  const reason = `${batch.length} remaining course${batch.length === 1 ? '' : 's'} (${batch.map((b) => b.course_code).join(', ')}) need${batch.length === 1 ? 's' : ''} review in your subject area.`;
  const { rows: [tr] } = await query(
    `INSERT INTO transfer_requests (application_id, from_evaluator_id, to_evaluator_id, sequence, priority, reason, previous_decisions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (application_id, sequence) DO NOTHING RETURNING id, request_number`,
    [applicationId, user.id, toEvaluator, sequence, batch.some((b) => b.priority === 'high') ? 'high' : 'normal', reason,
      JSON.stringify(decided.map((d) => ({ course: d.course_code, status: d.status, award: d.bu_award || d.target_bu_course })))]
  );
  if (!tr) return null;
  await query(`UPDATE course_reviews SET status = 'new', assigned_at = NOW(), transfer_request_id = $1 WHERE id = ANY($2)`, [tr.id, batch.map((b) => b.id)]);

  const { rows: [app] } = await query(`SELECT reference_number, student_name FROM applications WHERE id = $1`, [applicationId]);
  await auditLog({ applicationId, action: 'transfer_request_created', actorId: user.id, actorEmail: user.email,
    newValue: { to_evaluator_id: toEvaluator, request_number: tr.request_number }, details: { transfer_request_id: tr.id, courses: batch.length } });
  await sendNotification({
    recipientId: toEvaluator, applicationId, type: 'transfer_request',
    title: `Transfer Request ${tr.request_number}: ${app.reference_number}`,
    message: `${user.full_name} completed their review of ${app.student_name}'s application. ${reason}`,
    data: { reference_number: app.reference_number, transfer_request_id: tr.id },
  });
  return { request_number: tr.request_number, courses: batch.length };
}

/** Flags a course for administrator attention (e.g. a conflict with earlier decisions); notifies every active admin. */
export async function escalate(reviewId, { note }, user) {
  const r = await ownReview(reviewId, user.id);
  const { rows: [tc] } = await query(`SELECT institution, course_code FROM transcript_courses WHERE id = $1`, [r.transcript_course_id]);
  const text = String(note || '').trim() || 'Earlier decisions for this course disagree.';
  await auditLog({ applicationId: r.application_id, action: 'conflict_escalated', actorId: user.id, actorEmail: user.email,
    details: { review_id: reviewId, institution: tc.institution, course_code: tc.course_code, note: text } });
  const { rows: admins } = await query(`SELECT id FROM profiles WHERE role = 'admin' AND is_active`);
  for (const a of admins) {
    await sendNotification({
      recipientId: a.id, applicationId: r.application_id, type: 'conflict_escalated',
      title: `Equivalency review requested: ${tc.institution} ${tc.course_code}`,
      message: `${user.full_name}: ${text}`,
      data: { reference_number: r.reference_number, institution: tc.institution, course_code: tc.course_code },
    });
  }
  return { escalated: true, notified: admins.length };
}

export default { getReview, startReview, decideReview, requestInformation, escalate };
