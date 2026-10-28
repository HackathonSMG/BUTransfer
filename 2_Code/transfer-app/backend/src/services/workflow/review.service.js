// An evaluator's work on one course review: the evaluation package, opening it, the decision, information
// requests, and the hand-off of the application's remaining courses to the next evaluator.
// Decisions go through memoryService.recordCourseDecision so they feed the equivalency memory as before.
//
// The decision model follows the problem statement (step 6): a BU equivalent course (the proposed one or a
// different BU course), elective credit that counts as units, or no credit (0 units); or ask the student for
// more information (usually the syllabus) first.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification } from '../notification.service.js';
import { recordCourseDecision, recommendationOf } from '../credit/memory.service.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { courseKnowledge, matchLabel, recordResolution } from './knowledge.service.js';
import { requestCourseInformation } from './information.service.js';
import { refreshApplicationStatus, notifyCreditOffice } from './lifecycle.service.js';
import { POLICY } from '../credit/policy.js';

const OPEN = ['new', 'in_progress', 'info_requested'];
const BU_CODE = /\bCAS [A-Z]{2} \d{3}\b/g;
export const DECISIONS = ['accept', 'equivalent', 'different_course', 'elective', 'no_credit', 'reject'];

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
 * What accepting the review grants. Policy-rule outcomes keep the engine's result (e.g. elective only);
 * otherwise the review's target BU course(s) are awarded as a transfer course.
 */
function proposedOutcome(review, ev) {
  if (ev?.path === 'rule') {
    const rec = recommendationOf(ev);
    if (rec) return { outcome: rec.outcome, award: rec.award, label: rec.outcome === 'no_credit' ? 'No credit' : `Elective credit: ${rec.award}` };
  }
  if (review.target_bu_course) return { outcome: 'transfer', award: review.target_bu_course, label: `Equivalent to ${review.target_bu_course}` };
  return null;
}

/**
 * How the match is shown: a computed content similarity is a percentage; the sponsor's catalog levels and
 * approved equivalencies are named levels, not similarity scores.
 */
function matchPresentation(r) {
  if (r.match_basis === 'sponsor_match') return { kind: 'level', label: r.sponsor_match_level, percent: null };
  if (r.match_basis === 'equivalency') return { kind: 'level', label: 'Approved equivalency', percent: null };
  if (r.match_score == null) return { kind: 'none', label: null, percent: null };
  return { kind: 'score', label: matchLabel(r.match_score), percent: Math.round(Number(r.match_score) * 100) };
}

export async function getReview(reviewId, userId) {
  const r = await ownReview(reviewId, userId);
  const ev = await latestCourseEvaluation(r.transcript_course_id, r.application_id);
  const targets = String(r.target_bu_course || '').match(BU_CODE) || [];

  const [course, target, sponsor, equivalency, transcript, documents, decision, history, next, infoRequests, assignments] = await Promise.all([
    query(`SELECT tc.id, tc.institution, tc.course_code, tc.catalog_code, COALESCE(c.title, tc.title) AS title, tc.term, tc.grade, tc.source_credits, tc.credit_system,
                  c.credits AS catalog_credits, c.program, c.level, c.requirement_type, c.description, c.learning_outcomes, c.syllabus IS NOT NULL AS has_syllabus,
                  tc.syllabus_document_id, tc.syllabus_received_at, tc.repeat_of
           FROM transcript_courses tc LEFT JOIN catalog_courses c ON c.institution = tc.institution AND c.course_code = COALESCE(tc.catalog_code, tc.course_code)
           WHERE tc.id = $1`, [r.transcript_course_id]),
    targets.length
      ? query(`SELECT course_code, title, credits, program, level, requirement_type, notes, description, learning_outcomes
               FROM catalog_courses WHERE institution = 'Boston University' AND course_code = ANY($1) ORDER BY course_code`, [targets])
      : { rows: [] },
    query(`SELECT bu_course, match_level, notes FROM sponsor_course_matches sm
           JOIN transcript_courses tc ON tc.institution = sm.peer_institution AND COALESCE(tc.catalog_code, tc.course_code) = sm.peer_course WHERE tc.id = $1`, [r.transcript_course_id]),
    ev?.equivalency_id ? query(`SELECT eq_id, bu_course, outcome, TO_CHAR(approved_on, 'YYYY-MM-DD') AS approved_on FROM equivalencies WHERE eq_id = $1`, [ev.equivalency_id]) : { rows: [] },
    query(`SELECT id, institution, course_code, title, term, source_credits, credit_system, grade FROM transcript_courses
           WHERE application_id = $1 ORDER BY institution, position`, [r.application_id]),
    query(`SELECT id, file_name, document_type, created_at, transcript_course_id FROM application_documents WHERE application_id = $1 ORDER BY created_at`, [r.application_id]),
    query(`SELECT cd.action, cd.outcome, cd.bu_award, cd.bu_units, cd.decision_type, cd.reason, cd.decided_at, p.full_name AS decided_by FROM course_decisions cd
           LEFT JOIN profiles p ON p.id = cd.decided_by WHERE cd.transcript_course_id = $1`, [r.transcript_course_id]),
    query(`SELECT al.action, al.created_at, al.details, COALESCE(p.full_name, 'System') AS actor FROM audit_logs al
           LEFT JOIN profiles p ON p.id = al.actor_id
           WHERE al.application_id = $1 AND (al.details->>'review_id' = $2 OR al.action IN ('reviews_assigned', 'application_created', 'transfer_request_created'))
           ORDER BY al.created_at`, [r.application_id, reviewId]),
    query(`SELECT id FROM course_reviews WHERE evaluator_id = $1 AND status IN ('new', 'in_progress') AND id <> $2
           ORDER BY (priority = 'high') DESC, assigned_at ASC NULLS LAST LIMIT 1`, [userId, reviewId]),
    query(`SELECT ir.id, ir.kind, ir.message, ir.status, ir.student_response, ir.created_at, ir.responded_at, ir.resolved_at, ir.document_id,
                  d.file_name AS document_name
           FROM information_requests ir LEFT JOIN application_documents d ON d.id = ir.document_id
           WHERE ir.transcript_course_id = $1 OR ir.id = $2 ORDER BY ir.created_at DESC`, [r.transcript_course_id, r.info_request_id]),
    query(`SELECT ra.assigned_at, ra.ended_at, ra.reason, ra.end_reason, COALESCE(p.full_name, 'Credit Evaluation Office') AS evaluator
           FROM review_assignments ra LEFT JOIN profiles p ON p.id = ra.evaluator_id WHERE ra.review_id = $1 ORDER BY ra.assigned_at`, [reviewId]),
  ]);

  const sourceCourse = course.rows[0] || null;
  const code = sourceCourse ? (sourceCourse.catalog_code || sourceCourse.course_code) : null;
  const knowledge = sourceCourse
    ? await courseKnowledge({ institution: sourceCourse.institution, courseCode: code, targetBuCourse: r.target_bu_course })
    : null;

  const precedents = ev?.precedent_ids?.length
    ? (await query(`SELECT decision_id, decision, bu_awarded, reason, TO_CHAR(decided_on, 'YYYY-MM-DD') AS decided_on FROM past_decisions
                    WHERE decision_id = ANY($1) AND status = 'active' ORDER BY decided_on DESC NULLS LAST`, [ev.precedent_ids])).rows
    : [];

  // Courses evaluated together with this one (lecture + lab, a sequence awarded as one BU course)
  const combinedCodes = ev?.combined_with || [];
  const combined = combinedCodes.length
    ? transcript.rows.filter((t) => t.institution === sourceCourse?.institution && combinedCodes.some((c) => c.replace(/\W/g, '').toUpperCase() === t.course_code.replace(/\W/g, '').toUpperCase()))
    : [];

  const syllabusDoc = sourceCourse?.syllabus_document_id ? documents.rows.find((d) => d.id === sourceCourse.syllabus_document_id) : null;
  const missing = ev?.missing_information || [];
  const currentRequest = infoRequests.rows.find((i) => i.id === r.info_request_id) || infoRequests.rows[0] || null;
  const presentation = matchPresentation(r);

  return {
    review: {
      id: r.id, status: r.status, priority: r.priority, match_score: r.match_score, match_label: presentation.label, match_kind: presentation.kind,
      match_percent: presentation.percent, match_basis: r.match_basis,
      sponsor_match_level: r.sponsor_match_level, target_bu_course: r.target_bu_course, assigned_at: r.assigned_at,
      started_at: r.started_at, completed_at: r.completed_at, assignment_reason: r.assignment_reason,
      returned_reason: r.returned_reason, returned_at: r.returned_at,
      assignment_context: Array.isArray(r.assignment_context) && r.assignment_context.length ? r.assignment_context : (r.assignment_reason || '').split(' · ').filter(Boolean),
    },
    application: {
      id: r.application_id, reference_number: r.reference_number, student_name: r.student_name,
      transfer_from_institution: r.transfer_from_institution, transfer_to_program: r.transfer_to_program,
    },
    source_course: sourceCourse && { ...sourceCourse, bu_credits: ev?.bu_credits != null ? Number(ev.bu_credits) : null },
    target_course: target.rows[0] || null,
    target_courses: target.rows,
    proposed: proposedOutcome(r, ev),
    units: {
      // Units the decision awards unless the evaluator records others; null when the transcript shows no credits
      default: ev?.bu_credits != null ? Number(ev.bu_credits) : null,
      required: ev?.bu_credits == null,
      quarter: /quarter/i.test(sourceCourse?.credit_system || ''),
    },
    missing_information: missing,
    combined_with: combined,
    syllabus: syllabusDoc ? { document_id: syllabusDoc.id, file_name: syllabusDoc.file_name, received_at: sourceCourse.syllabus_received_at, compared: Boolean(ev?.syllabus_compared) } : null,
    evidence: {
      path: ev?.path || null,
      reasons: ev?.reasons || [],
      rules: ev?.rules || [],
      // score ranks candidates (it includes program/level adjustments); it is not shown as a percentage
      candidates: (ev?.candidates || []).slice(0, 3).map(({ code: c, title }) => ({ code: c, title })),
      sponsor_matches: sponsor.rows,
      equivalency: equivalency.rows[0] || null,
      precedents,
      // The external review step's notes, when it ran for this course (stored on course_evaluations)
      review_notes: ev?.agent_rationale || null,
      missing_information: ev?.agent_missing || null,
    },
    knowledge,
    decision: decision.rows[0] || null,
    info_request: currentRequest,
    info_requests: infoRequests.rows,
    transcript: { courses: transcript.rows, documents: documents.rows },
    history: history.rows,
    assignments: assignments.rows,
    next_review_id: next.rows[0]?.id || null,
    policy: { transfer_grade: POLICY.transferGrade, minimum_grade: POLICY.minimumGrade },
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

/** BU courses named in the evaluator's entry must exist in the BU catalog; returns them joined. */
async function validBuCourses(text) {
  const codes = [...new Set(String(text || '').toUpperCase().match(BU_CODE) || [])];
  if (!codes.length) throw badRequest('Choose the BU course, e.g. CAS CS 111.');
  const { rows } = await query(`SELECT course_code FROM catalog_courses WHERE institution = 'Boston University' AND course_code = ANY($1)`, [codes]);
  const unknown = codes.filter((c) => !rows.some((r) => r.course_code === c));
  if (unknown.length) throw badRequest(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the BU course catalog.`);
  return codes.join(' + ');
}

/**
 * Records the evaluator's decision on the course.
 *   accept / equivalent   the proposed BU course(s) (or the policy outcome the engine already reached)
 *   different_course      another BU course from the catalog (bu_course), with a reason
 *   elective              elective credit that counts as units (elective_label optional, e.g. "CS elective")
 *   no_credit / reject    no credit, 0 units, with a reason
 * units: BU units, required when the transcript shows no credits. conflict_action: use_established | override
 * when earlier decisions on this course disagree. When this evaluator has no open courses left on the
 * application, the next evaluator's queued courses are handed over by transfer request.
 */
export async function decideReview(reviewId, { decision, reason, bu_course: buCourse, elective_label: electiveLabel, units, conflict_action: conflictAction }, user) {
  const r = await ownReview(reviewId, user.id);
  if (!OPEN.includes(r.status)) throw badRequest('This evaluation has already been decided.');
  const ev = await latestCourseEvaluation(r.transcript_course_id, r.application_id);
  const why = String(reason || '').trim();
  const base = { applicationId: r.application_id, courseId: r.transcript_course_id, user, units, conflictAction: conflictAction || null };

  if (decision === 'accept' || decision === 'equivalent') {
    const proposed = proposedOutcome(r, ev);
    if (!proposed) throw badRequest('There is no proposed BU course to accept. Choose a different BU course, elective credit or no credit.');
    const rec = recommendationOf(ev);
    const sameAsEngine = rec && rec.outcome === proposed.outcome && (rec.award || null) === (proposed.award || null);
    await recordCourseDecision({
      ...base,
      decisionType: proposed.outcome === 'transfer' ? 'equivalent_course' : proposed.outcome,
      ...(sameAsEngine
        ? { action: 'approve', reason: why || null }
        : { action: 'change', outcome: proposed.outcome, buAward: proposed.award, reason: why || 'Accepted the recommended equivalency.' }),
    });
  } else if (decision === 'different_course') {
    if (!why) throw badRequest('Give the reason for choosing a different BU course.');
    const award = await validBuCourses(buCourse);
    await recordCourseDecision({ ...base, action: 'change', outcome: 'transfer', buAward: award, reason: why, decisionType: 'different_course' });
  } else if (decision === 'elective') {
    const label = String(electiveLabel || '').trim().slice(0, 120) || 'Elective credit';
    await recordCourseDecision({ ...base, action: 'change', outcome: 'elective', buAward: label, reason: why || 'Counts as elective credit.', decisionType: 'elective' });
  } else if (decision === 'no_credit' || decision === 'reject') {
    if (!why) throw badRequest('A reason is required for no credit.');
    await recordCourseDecision({ ...base, action: 'reject', reason: why, decisionType: 'no_credit' });
  } else {
    throw badRequest(`Decision must be one of: ${DECISIONS.join(', ')}.`);
  }

  // A course with a conflict: record how the evaluator settled it for this transcript
  if (conflictAction) {
    const { rows: [tc] } = await query(`SELECT institution, COALESCE(catalog_code, course_code) AS code FROM transcript_courses WHERE id = $1`, [r.transcript_course_id]);
    const { rows: [d] } = await query(`SELECT bu_award FROM course_decisions WHERE transcript_course_id = $1`, [r.transcript_course_id]);
    await recordResolution({ institution: tc.institution, courseCode: tc.code, action: conflictAction, buCourse: d?.bu_award || null, note: why || null, reviewId }, user);
    if (conflictAction === 'override') {
      await notifyCreditOffice({
        applicationId: r.application_id, type: 'equivalency_override', title: `Established equivalency overridden: ${tc.institution} ${tc.code}`,
        message: `${user.full_name} awarded ${d?.bu_award || 'a different outcome'} instead of the established equivalency. Consider recording a new standard.`,
        data: { reference_number: r.reference_number, institution: tc.institution, course_code: tc.code },
      });
    }
  }

  const { rows: [final] } = await query(`SELECT outcome FROM course_decisions WHERE transcript_course_id = $1`, [r.transcript_course_id]);
  const status = final.outcome === 'no_credit' ? 'rejected' : 'approved';
  await query(`UPDATE course_reviews SET status = $1, completed_at = NOW() WHERE id = $2`, [status, reviewId]);
  await query(`UPDATE information_requests SET status = 'resolved', resolved_at = NOW() WHERE transcript_course_id = $1 AND status <> 'resolved'`, [r.transcript_course_id]);
  await auditLog({ applicationId: r.application_id, action: 'review_decided', actorId: user.id, actorEmail: user.email,
    oldValue: { status: r.status }, newValue: { status }, details: { review_id: reviewId, decision, reason: why || null } });

  if (r.transfer_request_id) {
    await query(
      `UPDATE transfer_requests SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM course_reviews WHERE transfer_request_id = $1 AND status = ANY($2))`,
      [r.transfer_request_id, OPEN]
    );
  }

  const transfer = await handOffIfDone(r.application_id, user);
  const applicationStatus = await refreshApplicationStatus(r.application_id, user.id);
  return { status, transfer, application_status: applicationStatus };
}

/** Asks the student for the course syllabus (kind 'syllabus') or other information; the review waits for the answer. */
export async function requestInformation(reviewId, { message, kind = 'information' }, user) {
  const r = await ownReview(reviewId, user.id);
  if (!OPEN.includes(r.status)) throw badRequest('This evaluation has already been decided.');
  const text = String(message || '').trim();
  if (!text && kind !== 'syllabus') throw badRequest('Describe the information you need.');
  await requestCourseInformation({
    applicationId: r.application_id, transcriptCourseId: r.transcript_course_id, reviewId, kind: kind === 'syllabus' ? 'syllabus' : 'information',
    message: text, requestedBy: user.id, actor: user,
  });
  await auditLog({ applicationId: r.application_id, action: 'review_info_requested', actorId: user.id, actorEmail: user.email,
    oldValue: { status: r.status }, newValue: { status: 'info_requested' }, details: { review_id: reviewId, kind } });
  return { status: 'info_requested' };
}

/** When nobody has open courses left on the application, opens the next queued evaluator's courses. */
async function handOffIfDone(applicationId, user) {
  // Courses in the Credit Evaluation Office queue don't hold up the department evaluators' hand-off
  const { rows: [open] } = await query(
    `SELECT COUNT(*)::int AS n FROM course_reviews WHERE application_id = $1 AND status = ANY($2) AND evaluator_id IS NOT NULL`, [applicationId, OPEN]);
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
  // Usually one evaluator per sequence; after a reassignment a sequence can hold several, so tell each of them
  for (const evaluatorId of [...new Set(batch.map((b) => b.evaluator_id))]) {
    await sendNotification({
      recipientId: evaluatorId, applicationId, type: 'transfer_request',
      title: `Transfer Request ${tr.request_number}: ${app.reference_number}`,
      message: `${user.full_name} completed their review of ${app.student_name}'s application. ${reason}`,
      data: { reference_number: app.reference_number, transfer_request_id: tr.id },
    });
  }
  return { request_number: tr.request_number, courses: batch.length };
}

/**
 * Asks the Credit Evaluation Office (or administrators) to review a potential equivalency conflict; recorded
 * as an 'additional_review' resolution step and in the audit trail.
 */
export async function escalate(reviewId, { note }, user) {
  const r = await ownReview(reviewId, user.id);
  const { rows: [tc] } = await query(`SELECT institution, COALESCE(catalog_code, course_code) AS course_code FROM transcript_courses WHERE id = $1`, [r.transcript_course_id]);
  const text = String(note || '').trim() || 'Earlier decisions for this course disagree.';
  await auditLog({ applicationId: r.application_id, action: 'conflict_escalated', actorId: user.id, actorEmail: user.email,
    details: { review_id: reviewId, institution: tc.institution, course_code: tc.course_code, note: text } });
  await recordResolution({ institution: tc.institution, courseCode: tc.course_code, action: 'additional_review', note: text, reviewId }, user);
  const recipients = await query(`SELECT id FROM profiles WHERE role::text IN ('admin', 'credit_office') AND is_active`);
  for (const a of recipients.rows) {
    await sendNotification({
      recipientId: a.id, applicationId: r.application_id, type: 'conflict_escalated',
      title: `Equivalency review requested: ${tc.institution} ${tc.course_code}`,
      message: `${user.full_name}: ${text}`,
      data: { reference_number: r.reference_number, institution: tc.institution, course_code: tc.course_code },
    });
  }
  return { escalated: true, notified: recipients.rows.length };
}

export default { getReview, startReview, decideReview, requestInformation, escalate, DECISIONS };
