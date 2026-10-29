// The transfer credit lifecycle after the engine has evaluated an application (Problem 1, steps 3-7):
//   step 4  established equivalencies (and deterministic policy outcomes) are applied by the Credit Evaluation
//           Office without department work, unless earlier decisions conflict
//   steps 5-6  everything else goes to a department evaluator (assignment.service, review.service)
//   step 7  the Credit Evaluation Office posts decided courses: grade T, BU units, not in the BU GPA, no Hub units
// It also derives each course's state (for the student and for staff), the application status from those
// states, the one-year deadline, and duplicate-application detection. All state is read from the database.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification } from '../notification.service.js';
import { notifyApplicant, onStatusChange } from '../notifications/applicant-notification.service.js';
import { POLICY, transferDeadline } from '../credit/policy.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { courseKnowledge } from './knowledge.service.js';
import { invalidateEngine } from '../credit/credit.service.js';
import { assignApplication } from './assignment.service.js';

export const OPEN_REVIEW = ['queued', 'new', 'in_progress', 'info_requested'];
// Policy outcomes that need no academic judgement: grade below the minimum, withdrawn, a repeated course
const DETERMINISTIC_RULES = ['R1', 'W', 'REPEAT'];
const AUTO_APPLY = process.env.AUTO_APPLY_ESTABLISHED !== 'false';
// Statuses this service must not move an application out of
const FROZEN = ['draft', 'closed', 'validation_failed'];

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const strip = (t) => String(t || '').replace(/^(R\d+|W|REPEAT|PASS|GRADE|CREDITS):\s*/, '');

/** People who run the Credit Evaluation Office queue: credit office staff, or administrators when there are none. */
export async function creditOfficeRecipients() {
  const { rows } = await query(`SELECT id, role FROM profiles WHERE role::text IN ('credit_office', 'admin') AND is_active`);
  const office = rows.filter((r) => r.role === 'credit_office');
  return (office.length ? office : rows).map((r) => r.id);
}

export async function notifyCreditOffice({ applicationId, type, title, message, data = {} }) {
  for (const id of await creditOfficeRecipients()) {
    await sendNotification({ recipientId: id, applicationId, type, title, message, data });
  }
}

// ---------------------------------------------------------------------------------------------
// Step 4: established equivalencies and deterministic policy outcomes
// ---------------------------------------------------------------------------------------------

/**
 * Records the outcome of every undecided course that the equivalency database or a deterministic policy rule
 * already settles. An established equivalency is held for a department evaluator when earlier decisions on
 * the same course conflict with it.
 * @returns {Promise<{applied: number, held: Map<string, string>}>} held: transcript course id -> why it needs review
 */
export async function applyEstablished(applicationId) {
  const held = new Map();
  if (!AUTO_APPLY) return { applied: 0, held };
  const { rows } = await query(
    `SELECT tc.id, tc.institution, COALESCE(tc.catalog_code, tc.course_code) AS code, tc.course_code,
            ce.id AS evaluation_id, ce.path, ce.outcome, ce.award, ce.bu_credits, ce.rules, ce.reasons, ce.equivalency_id
     FROM transcript_courses tc
     JOIN LATERAL (SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
                   WHERE ce.transcript_course_id = tc.id AND ae.status IN ('completed', 'running') ORDER BY ae.created_at DESC LIMIT 1) ce ON true
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     WHERE tc.application_id = $1 AND cd.id IS NULL AND (r.id IS NULL OR r.status IN ('queued', 'new')) AND r.returned_at IS NULL
     ORDER BY tc.position`,
    [applicationId]
  );
  const applied = [];
  for (const c of rows) {
    let decision = null;
    if (c.path === 'equivalency' && ['transfer', 'elective'].includes(c.outcome) && c.bu_credits != null) {
      const k = await courseKnowledge({ institution: c.institution, courseCode: c.code });
      const blocking = k.conflicts.filter((x) => x.type !== 'match_divergence');
      if (blocking.length) {
        held.set(c.id, `Established equivalency needs confirmation: ${blocking.map((x) => x.summary).join(' ')}`);
        continue;
      }
      decision = {
        outcome: c.outcome, award: c.award, units: c.bu_credits, type: 'established_equivalency', via: 'established_equivalency',
        reason: `Established equivalency ${c.equivalency_id} applied by the Credit Evaluation Office.`,
      };
    } else if (c.path === 'rule' && c.outcome === 'no_credit' && (c.rules || []).some((r) => DETERMINISTIC_RULES.includes(r))) {
      decision = { outcome: 'no_credit', award: null, units: 0, type: 'policy_rule', via: 'policy_rule', reason: strip((c.reasons || [])[0]) || 'Transfer credit policy.' };
    }
    if (!decision) continue;
    const { rowCount } = await query(
      `INSERT INTO course_decisions (application_id, transcript_course_id, course_evaluation_id, action, outcome, bu_award, reason, recommendation,
         matched_recommendation, decision_type, bu_units, decided_via)
       VALUES ($1, $2, $3, 'approve', $4, $5, $6, $7, true, $8, $9, $10) ON CONFLICT (transcript_course_id) DO NOTHING`,
      [applicationId, c.id, c.evaluation_id, decision.outcome, decision.award, decision.reason, decision.award || 'No credit', decision.type, decision.units, decision.via]
    );
    if (!rowCount) continue;
    // A review created before this ran (e.g. on an older application) is no longer needed
    await query(`UPDATE course_reviews SET status = 'withdrawn', completed_at = NOW() WHERE transcript_course_id = $1 AND status IN ('queued', 'new')`, [c.id]);
    applied.push({ course: c.course_code, outcome: decision.outcome, award: decision.award, via: decision.via });
  }
  if (applied.length) {
    await auditLog({ applicationId, action: 'established_outcomes_applied', details: { courses: applied } });
  }
  return { applied: applied.length, held };
}

// ---------------------------------------------------------------------------------------------
// Course states
// ---------------------------------------------------------------------------------------------

const COURSE_STATE_SQL = `
  SELECT tc.id, tc.position, tc.institution, tc.course_code, tc.catalog_code, COALESCE(src.title, tc.title) AS title, tc.term,
         tc.credit_system, tc.source_credits, tc.grade, tc.repeat_of, tc.syllabus_received_at, tc.syllabus_document_id,
         ce.path, ce.outcome AS engine_outcome, ce.award AS engine_award, ce.suggestion, ce.bu_credits, ce.reasons, ce.rules,
         ce.missing_information, ce.combined_with,
         r.id AS review_id, r.status AS review_status, r.queue, r.evaluator_id, pe.full_name AS evaluator_name, r.target_bu_course,
         r.assignment_reason, r.assigned_at, r.returned_reason, r.returned_at,
         cd.id AS decision_id, cd.outcome, cd.bu_award, cd.bu_units, cd.reason AS decision_reason, cd.decision_type, cd.decided_via,
         cd.decided_at, pd.full_name AS decided_by_name,
         cp.id AS posting_id, cp.units AS posted_units, cp.transfer_grade, cp.posted_at, cp.bu_course AS posted_course,
         ir.id AS info_id, ir.kind AS info_kind, ir.status AS info_status, ir.message AS info_message, ir.created_at AS info_requested_at,
         ir.responded_at AS info_responded_at, ir.student_response AS info_response
  FROM transcript_courses tc
  LEFT JOIN catalog_courses src ON src.institution = tc.institution AND src.course_code = COALESCE(tc.catalog_code, tc.course_code)
  LEFT JOIN LATERAL (SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
                     WHERE ce.transcript_course_id = tc.id ORDER BY ae.created_at DESC LIMIT 1) ce ON true
  LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
  LEFT JOIN profiles pe ON pe.id = r.evaluator_id
  LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
  LEFT JOIN profiles pd ON pd.id = cd.decided_by
  LEFT JOIN credit_postings cp ON cp.transcript_course_id = tc.id
  LEFT JOIN LATERAL (SELECT * FROM information_requests WHERE transcript_course_id = tc.id ORDER BY created_at DESC LIMIT 1) ir ON true
  WHERE tc.application_id = $1
  ORDER BY tc.position`;

/**
 * Where one course stands. state is one of: posted, decided, information_requested, information_received,
 * department_review, waiting_for_review, credit_office_review, withdrawn, processing.
 */
function stateOf(c) {
  if (c.posting_id) return 'posted';
  if (c.decision_id) return 'decided';
  if (c.review_status === 'withdrawn') return 'withdrawn';
  if (c.info_id && c.info_status === 'pending') return 'information_requested';
  if (c.info_id && c.info_status === 'responded' && OPEN_REVIEW.includes(c.review_status)) return 'information_received';
  if (c.review_id && c.queue === 'credit_office') return 'credit_office_review';
  if (['new', 'in_progress', 'info_requested'].includes(c.review_status)) return 'department_review';
  if (c.review_status === 'queued') return 'waiting_for_review';
  return 'processing';
}

const decisionLabel = (outcome, award) => (outcome === 'transfer' ? `BU equivalent: ${award}`
  : outcome === 'elective' ? (award && !/^elective credit$/i.test(award) ? `Elective credit: ${award}` : 'Elective credit')
    : outcome === 'no_credit' ? 'No credit' : null);

/** Units the course carries now: posted units, decided units, or 0 while pending (POLICY.pendingUnits). */
function unitsOf(c, state) {
  if (state === 'posted') return { units: Number(c.posted_units), units_status: 'posted' };
  if (state === 'decided') return { units: c.outcome === 'no_credit' ? 0 : Number(c.bu_units ?? c.bu_credits ?? 0), units_status: 'approved' };
  return { units: POLICY.pendingUnits, units_status: 'pending' };
}

export async function courseStates(applicationId) {
  const { rows } = await query(COURSE_STATE_SQL, [applicationId]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((c) => {
    const state = stateOf(c);
    const outcome = state === 'posted' || state === 'decided' ? c.outcome : null;
    const award = c.posted_course ?? c.bu_award;
    return {
      ...c,
      source_credits: c.source_credits == null ? null : Number(c.source_credits),
      bu_credits: c.bu_credits == null ? null : Number(c.bu_credits),
      state,
      ...unitsOf(c, state),
      decision: outcome ? decisionLabel(outcome, award) : null,
      repeat_of_course: c.repeat_of ? byId.get(c.repeat_of)?.course_code || null : null,
    };
  });
}

/**
 * Counts over course states, for the student and the staff views.
 * credits_posted: BU units posted to the record (awarded). credits_approved: decided, not yet posted.
 * credits_accepted = both. credits_pending: BU units of courses still being evaluated, as converted from the
 * transcript (they show 0 units until decided); a course whose credits are missing is counted in
 * pending_without_credits instead of being treated as 0.
 */
export function summarizeCourses(courses) {
  const s = {
    courses: courses.length, decided: 0, posted: 0, pending: 0, needs_student_action: 0, credits_posted: 0, credits_approved: 0, credits_pending_source: 0,
    courses_accepted: 0, courses_equivalent: 0, courses_elective: 0, courses_not_accepted: 0, credits_accepted: 0, credits_pending: 0, pending_without_credits: 0,
    courses_awaiting_syllabus: 0, courses_in_department_review: 0,
  };
  for (const c of courses) {
    if (c.state === 'withdrawn') continue;
    if (c.state === 'posted' || c.state === 'decided') {
      s.decided += 1;
      if (c.state === 'posted') { s.posted += 1; s.credits_posted += c.units; } else s.credits_approved += c.units;
      if (c.outcome === 'transfer') { s.courses_accepted += 1; s.courses_equivalent += 1; }
      else if (c.outcome === 'elective') { s.courses_accepted += 1; s.courses_elective += 1; }
      else s.courses_not_accepted += 1;
    } else {
      s.pending += 1;
      if (c.state === 'information_requested') s.needs_student_action += 1;
      if (c.state === 'information_requested' && c.info_kind === 'syllabus') s.courses_awaiting_syllabus += 1;
      if (['department_review', 'information_received', 'waiting_for_review', 'credit_office_review'].includes(c.state)) s.courses_in_department_review += 1;
      if (c.bu_credits == null) s.pending_without_credits += 1; else s.credits_pending += c.bu_credits;
    }
  }
  s.credits_posted = round2(s.credits_posted);
  s.credits_approved = round2(s.credits_approved);
  s.credits_accepted = round2(s.credits_posted + s.credits_approved);
  s.credits_pending = round2(s.credits_pending);
  s.credits_pending_source = s.credits_pending;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Application status
// ---------------------------------------------------------------------------------------------

/**
 * Sets the application status from its courses: information_required while the student owes something,
 * under_evaluator_review while courses are undecided, ready_for_posting once every course is decided,
 * credit_posted once every course is posted. Applications that were never evaluated are left alone.
 */
export async function refreshApplicationStatus(applicationId, actorId = null) {
  const { rows: [app] } = await query(`SELECT id, reference_number, status, student_name, student_email, student_profile_id FROM applications WHERE id = $1`, [applicationId]);
  if (!app || FROZEN.includes(app.status)) return app?.status || null;
  const courses = (await courseStates(applicationId)).filter((c) => c.state !== 'withdrawn');
  if (!courses.length || courses.every((c) => c.state === 'processing')) return app.status;

  let next;
  if (courses.every((c) => c.state === 'posted')) next = 'credit_posted';
  else if (courses.every((c) => ['posted', 'decided'].includes(c.state))) next = 'ready_for_posting';
  else if (courses.some((c) => c.state === 'information_requested')) next = 'information_required';
  else next = 'under_evaluator_review';
  if (next === app.status) return next;

  // Only one caller moves the status: evaluators finishing their courses at the same moment would otherwise all
  // see the old status and each log the change and notify the student and the Credit Evaluation Office
  const { rowCount } = await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3`, [next, applicationId, app.status]);
  if (!rowCount) return (await query(`SELECT status FROM applications WHERE id = $1`, [applicationId])).rows[0]?.status || next;
  await auditLog({ applicationId, action: 'status_changed', actorId, oldValue: { status: app.status }, newValue: { status: next }, details: { reason: 'Course progress' } });
  await onStatusChange(applicationId, app.status, next);
  if (next === 'ready_for_posting') {
    await notifyCreditOffice({
      applicationId, type: 'ready_for_posting', title: `Ready to post: ${app.reference_number}`,
      message: `Every course on ${app.student_name}'s application has a decision. The transfer credit can be posted.`,
      data: { reference_number: app.reference_number },
    });
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Step 7: posting
// ---------------------------------------------------------------------------------------------

export function deadlineFor(application, asOf = new Date()) {
  const d = transferDeadline(application.expected_start_term, asOf);
  return { ...d, exception: application.deadline_exception || null };
}

/** Why the application's decided courses cannot be posted yet (empty when they can). */
export function postingBlockers(application, courses, asOf = new Date()) {
  const blockers = [];
  const deadline = deadlineFor(application, asOf);
  if (deadline.status === 'passed' && !application.deadline_exception) {
    blockers.push({ type: 'deadline', message: `The one-year transfer deadline (${deadline.deadline}) has passed. Record an exception to post.` });
  }
  if (application.duplicate_status === 'suspected') {
    blockers.push({ type: 'duplicate', message: 'This application may duplicate another one. Resolve that first.' });
  }
  if (application.status === 'closed') blockers.push({ type: 'closed', message: 'The application is closed.' });
  if (!courses.some((c) => c.state === 'decided')) blockers.push({ type: 'nothing', message: 'No decided courses are waiting to be posted.' });
  return blockers;
}

/**
 * Posts every decided, unposted course to the student's record: grade T (none for no credit), the decided BU
 * units, never counted in the BU GPA, no BU Hub units.
 */
export async function postCredits(applicationId, user) {
  const { rows: [app] } = await query(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
  if (!app) throw notFound('Application');
  const courses = await courseStates(applicationId);
  const blockers = postingBlockers(app, courses);
  if (blockers.length) throw badRequest(blockers.map((b) => b.message).join(' '));

  const posted = [];
  for (const c of courses.filter((x) => x.state === 'decided')) {
    const units = c.outcome === 'no_credit' ? 0 : Number(c.bu_units ?? c.bu_credits);
    if (Number.isNaN(units) || (c.outcome !== 'no_credit' && c.bu_units == null && c.bu_credits == null)) {
      throw badRequest(`${c.course_code} has no BU units recorded. The evaluator must record the units first.`);
    }
    const { rowCount } = await query(
      `INSERT INTO credit_postings (application_id, transcript_course_id, course_decision_id, outcome, bu_course, units, transfer_grade, source_grade,
         counts_in_gpa, hub_units, posted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10) ON CONFLICT (transcript_course_id) DO NOTHING`,
      [applicationId, c.id, c.decision_id, c.outcome, c.outcome === 'no_credit' ? null : c.bu_award, units,
        c.outcome === 'no_credit' ? null : POLICY.transferGrade, c.grade, POLICY.transferHubUnits, user.id]
    );
    if (rowCount) posted.push({ course: c.course_code, outcome: c.outcome, units });
  }
  const status = await refreshApplicationStatus(applicationId, user.id);
  if (status === 'credit_posted') {
    await query(`UPDATE applications SET posted_at = NOW(), final_decision = 'credit_posted', decision_date = NOW() WHERE id = $1`, [applicationId]);
  }
  const total = round2(posted.reduce((n, p) => n + p.units, 0));
  await auditLog({ applicationId, action: 'credit_posted', actorId: user.id, actorEmail: user.email, details: { courses: posted, units: total } });
  // A complete posting is announced by the status change (decision_available); a partial one is announced here
  if (status !== 'credit_posted' && posted.length) await notifyApplicant(applicationId, 'credit_posted', { courses: posted.length, units: total });
  return { posted: posted.length, units: total, status };
}

/**
 * Final review: the Credit Evaluation Office sends a course's decision back before it is posted. The decision is
 * removed (kept in the audit trail, and its precedent revoked) and the course reopens for the evaluator who decided
 * it, with the reason; a course settled automatically is assigned to an evaluator. Posted courses cannot be returned.
 */
export async function returnToEvaluator(transcriptCourseId, reason, user) {
  const text = String(reason || '').trim();
  if (!text) throw badRequest('Give the reason for returning the decision.');
  const { rows: [c] } = await query(
    `SELECT cd.*, tc.course_code, cp.id AS posting_id, r.id AS review_id, r.evaluator_id AS review_evaluator, p.full_name AS evaluator_name
     FROM course_decisions cd JOIN transcript_courses tc ON tc.id = cd.transcript_course_id
     LEFT JOIN credit_postings cp ON cp.transcript_course_id = tc.id
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN profiles p ON p.id = r.evaluator_id
     WHERE cd.transcript_course_id = $1`, [transcriptCourseId]);
  if (!c) throw notFound('Course decision');
  if (c.posting_id) throw badRequest('This course has already been posted to the student record.');

  if (c.past_decision_id) await query(`UPDATE past_decisions SET status = 'revoked' WHERE decision_id = $1`, [c.past_decision_id]);
  await query(`DELETE FROM course_decisions WHERE id = $1`, [c.id]);
  invalidateEngine();

  if (c.review_id) {
    await query(
      `UPDATE course_reviews SET status = 'new', completed_at = NULL, started_at = NULL, assigned_at = NOW(), returned_reason = $1, returned_at = NOW(),
         queue = CASE WHEN evaluator_id IS NULL THEN 'credit_office' ELSE 'evaluator' END
       WHERE id = $2`, [text, c.review_id]);
  } else {
    // Settled automatically (established equivalency or policy outcome): an evaluator now reviews it
    await assignApplication(c.application_id, { held: new Map([[transcriptCourseId, `Returned by the Credit Evaluation Office: ${text}`]]) });
    // A returned course opens for its evaluator now rather than waiting behind the hand-off order
    await query(
      `UPDATE course_reviews SET returned_reason = $1, returned_at = NOW(),
         status = CASE WHEN status = 'queued' THEN 'new' ELSE status END, assigned_at = COALESCE(assigned_at, NOW())
       WHERE transcript_course_id = $2`, [text, transcriptCourseId]);
  }
  const { rows: [review] } = await query(
    `SELECT r.id, r.evaluator_id, a.reference_number, a.student_name FROM course_reviews r JOIN applications a ON a.id = r.application_id
     WHERE r.transcript_course_id = $1`, [transcriptCourseId]);
  if (review?.evaluator_id) {
    await sendNotification({
      recipientId: review.evaluator_id, applicationId: c.application_id, type: 'decision_returned',
      title: `Decision returned: ${c.course_code} (${review.reference_number})`,
      message: `${user.full_name} returned the decision on ${c.course_code} for ${review.student_name}: ${text}`,
      data: { reference_number: review.reference_number, review_id: review.id },
    });
  }
  await auditLog({ applicationId: c.application_id, action: 'decision_returned', actorId: user.id, actorEmail: user.email,
    oldValue: { outcome: c.outcome, bu_award: c.bu_award, bu_units: c.bu_units, decision_type: c.decision_type, decided_via: c.decided_via, reason: c.reason },
    details: { course_code: c.course_code, reason: text, review_id: review?.id || null } });
  const status = await refreshApplicationStatus(c.application_id, user.id);
  return { course_code: c.course_code, review_id: review?.id || null, evaluator: c.evaluator_name || null, application_status: status };
}

export async function recordDeadlineException(applicationId, reason, user) {
  const text = String(reason || '').trim();
  if (!text) throw badRequest('Give the reason for the exception.');
  const { rowCount } = await query(
    `UPDATE applications SET deadline_exception = $1, deadline_exception_by = $2, updated_at = NOW() WHERE id = $3`, [text, user.id, applicationId]);
  if (!rowCount) throw notFound('Application');
  await auditLog({ applicationId, action: 'deadline_exception_recorded', actorId: user.id, actorEmail: user.email, details: { reason: text } });
  return { deadline_exception: text };
}

// ---------------------------------------------------------------------------------------------
// Duplicate applications
// ---------------------------------------------------------------------------------------------

/**
 * Flags an application that appears to duplicate an earlier active one from the same applicant (same email, or
 * same name and date of birth). Nothing is deleted; the Credit Evaluation Office decides. An application whose
 * evaluation is finished (posted, decided or closed) is not a duplicate candidate: applying again after a
 * completed evaluation, e.g. with coursework taken since, is a new evaluation.
 */
export async function detectDuplicate(applicationId) {
  const { rows: [app] } = await query(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
  if (!app || app.duplicate_status || app.status === 'draft') return null;
  const { rows: [other] } = await query(
    `SELECT id, reference_number, transfer_from_institution, expected_start_term, submitted_at, created_at, status, LOWER(student_email) = LOWER($2) AS same_email
     FROM applications
     WHERE id <> $1 AND status NOT IN ('closed', 'draft', 'credit_posted', 'approved', 'rejected') AND COALESCE(duplicate_status, '') <> 'confirmed'
       AND (created_at < $5 OR (created_at = $5 AND reference_number < $6))
       AND (LOWER(student_email) = LOWER($2) OR ($3::date IS NOT NULL AND date_of_birth = $3::date AND LOWER(student_name) = LOWER($4)))
     ORDER BY created_at, reference_number LIMIT 1`,
    [app.id, app.student_email, app.date_of_birth, app.student_name, app.created_at, app.reference_number]
  );
  if (!other) return null;
  const sameInstitution = other.transfer_from_institution?.toLowerCase() === app.transfer_from_institution?.toLowerCase();
  const reason = `Same student (${other.same_email ? 'email address' : 'name and date of birth'}) as ${other.reference_number}`
    + `, ${sameInstitution ? `also from ${app.transfer_from_institution}` : `which is from ${other.transfer_from_institution}`}`
    + `${other.expected_start_term === app.expected_start_term ? `, same start term (${app.expected_start_term || 'not given'})` : ''}.`;
  await query(`UPDATE applications SET duplicate_of = $1, duplicate_status = 'suspected', duplicate_reason = $2 WHERE id = $3`, [other.id, reason, app.id]);
  await auditLog({ applicationId: app.id, action: 'duplicate_suspected', details: { duplicate_of: other.reference_number, reason } });
  await notifyCreditOffice({
    applicationId: app.id, type: 'duplicate_suspected', title: `Potential duplicate application: ${app.reference_number}`,
    message: reason, data: { reference_number: app.reference_number, duplicate_of: other.reference_number },
  });
  return { duplicate_of: other.reference_number, reason };
}

/** The two applications side by side, with the transcript courses they share. */
export async function duplicateComparison(application) {
  if (!application.duplicate_of) return null;
  const { rows: [other] } = await query(
    `SELECT id, reference_number, status, student_name, student_email, transfer_from_institution, transfer_to_program, expected_start_term, submitted_at,
            (SELECT COUNT(*)::int FROM transcript_courses WHERE application_id = a.id) AS courses
     FROM applications a WHERE id = $1`, [application.duplicate_of]);
  if (!other) return null;
  const { rows: shared } = await query(
    `SELECT DISTINCT a.institution, a.course_code FROM transcript_courses a JOIN transcript_courses b
       ON b.application_id = $2 AND LOWER(b.institution) = LOWER(a.institution)
      AND UPPER(REGEXP_REPLACE(b.course_code, '[^A-Za-z0-9]', '', 'g')) = UPPER(REGEXP_REPLACE(a.course_code, '[^A-Za-z0-9]', '', 'g'))
     WHERE a.application_id = $1 ORDER BY 1, 2`, [application.id, other.id]);
  return { status: application.duplicate_status, reason: application.duplicate_reason, other, shared_courses: shared };
}

/** keep_separate: both applications continue. close_duplicate: this one is closed and its open reviews withdrawn. */
export async function resolveDuplicate(applicationId, { action, note }, user) {
  const { rows: [app] } = await query(`SELECT id, duplicate_status, status FROM applications WHERE id = $1`, [applicationId]);
  if (!app) throw notFound('Application');
  if (!app.duplicate_status) throw badRequest('This application is not flagged as a duplicate.');
  if (action === 'keep_separate') {
    await query(`UPDATE applications SET duplicate_status = 'not_duplicate', updated_at = NOW() WHERE id = $1`, [applicationId]);
  } else if (action === 'close_duplicate') {
    await query(`UPDATE applications SET duplicate_status = 'confirmed', status = 'closed', updated_at = NOW() WHERE id = $1`, [applicationId]);
    await query(`UPDATE course_reviews SET status = 'withdrawn', completed_at = NOW() WHERE application_id = $1 AND status = ANY($2)`, [applicationId, OPEN_REVIEW]);
    await query(`UPDATE information_requests SET status = 'resolved', resolved_at = NOW() WHERE application_id = $1 AND status <> 'resolved'`, [applicationId]);
    await auditLog({ applicationId, action: 'status_changed', actorId: user.id, actorEmail: user.email, oldValue: { status: app.status }, newValue: { status: 'closed' }, details: { reason: 'Closed as a duplicate' } });
    await onStatusChange(applicationId, app.status, 'closed');
  } else {
    throw badRequest('Action must be keep_separate or close_duplicate.');
  }
  await auditLog({ applicationId, action: 'duplicate_resolved', actorId: user.id, actorEmail: user.email,
    oldValue: { duplicate_status: app.duplicate_status, status: app.status }, details: { action, note: note || null } });
  return { action };
}

// ---------------------------------------------------------------------------------------------
// The student's view
// ---------------------------------------------------------------------------------------------

const STUDENT_STAGE = {
  posted: { label: 'Posted to your record', tone: 'done' },
  decided: { label: 'Decided, in final review', tone: 'done' },
  information_requested: { label: 'Action needed', tone: 'action' },
  information_received: { label: 'Received, under department review', tone: 'progress' },
  department_review: { label: 'Under department review', tone: 'progress' },
  waiting_for_review: { label: 'Waiting for department review', tone: 'waiting' },
  credit_office_review: { label: 'With the Credit Evaluation Department', tone: 'progress' },
  processing: { label: 'Being processed', tone: 'waiting' },
};

function studentExplanation(c) {
  switch (c.state) {
    case 'posted':
    case 'decided': {
      const posted = c.state === 'posted';
      const after = posted ? '' : ' The Credit Evaluation Office is completing the final review before it is posted to your record.';
      if (c.outcome === 'no_credit') {
        if (c.repeat_of_course) return `You passed this course more than once; credit is awarded once, for the other attempt.${after}`;
        // A policy rule's reason is written for the applicant; an evaluator's reason is an internal note
        const policy = c.decided_via === 'policy_rule' || c.decision_type === 'policy_rule';
        return (policy && strip(c.decision_reason)
          ? `This course does not earn transfer credit. ${strip(c.decision_reason)}`
          : 'This course was reviewed by the academic department and does not meet the requirements for transfer credit at Boston University.') + after;
      }
      const what = c.outcome === 'transfer' ? `It transfers as ${c.bu_award}` : `It counts as ${/^elective credit$/i.test(c.bu_award || '') ? 'elective credit' : `elective credit (${c.bu_award})`}`;
      return `${what} with ${c.units} BU credit${c.units === 1 ? '' : 's'} and a grade of ${POLICY.transferGrade}.${after}`;
    }
    case 'information_requested':
      return c.info_kind === 'syllabus'
        ? 'We need the syllabus for this course to compare it with BU courses. Upload it below.'
        : `We need more information about this course: ${c.info_message}`;
    case 'information_received':
      return `We received your ${c.info_kind === 'syllabus' ? 'syllabus' : 'reply'} on ${new Date(c.info_responded_at).toDateString()}. The department is reviewing it.`;
    case 'department_review': {
      const missing = c.missing_information || [];
      if (missing.includes('grade')) return 'The final grade could not be read from your transcript. The department will confirm it before deciding. Until then the course shows 0 units.';
      if (missing.includes('credits')) return 'The credits for this course are not shown on your transcript. The department will confirm them before deciding. Until then the course shows 0 units.';
      return 'A department evaluator is reviewing this course. Until then it shows 0 units.';
    }
    case 'waiting_for_review':
      return 'This course is waiting for a department evaluator. Until then it shows 0 units.';
    case 'credit_office_review':
      return 'The Credit Evaluation Department is arranging the right reviewer for this course. Until then it shows 0 units.';
    default:
      return 'We are processing this course. Until it is evaluated it shows 0 units.';
  }
}

/** The transfer result column the applicant sees: outcome, a short result and the type of credit. */
function applicantResult(c) {
  if (!['posted', 'decided'].includes(c.state)) {
    return { outcome: null, result_label: `Pending — ${POLICY.pendingUnits} BU units currently awarded`, credit_type: null };
  }
  if (c.outcome === 'transfer') return { outcome: 'transfer', result_label: c.bu_award, credit_type: 'BU course equivalent' };
  if (c.outcome === 'elective') {
    return { outcome: 'elective', result_label: c.bu_award && !/^elective credit$/i.test(c.bu_award) ? c.bu_award : 'Elective credit', credit_type: 'Elective credit' };
  }
  return { outcome: 'no_credit', result_label: 'Not accepted for transfer credit', credit_type: null };
}

/** Student-facing application progress and per-course results; no internal names, scores or provenance. */
export async function studentView(application) {
  const courses = await courseStates(application.id);
  const visible = courses.filter((c) => c.state !== 'withdrawn');
  const summary = summarizeCourses(visible);
  const deadline = deadlineFor(application);
  return {
    summary,
    deadline: { status: deadline.status, deadline: deadline.deadline, explanation: deadline.explanation },
    policy_notes: [
      `Transfer courses are posted with a grade of ${POLICY.transferGrade}. External grades do not count toward your BU GPA.`,
      'Transfer courses do not earn BU Hub general education units.',
      'A course that has not been evaluated yet shows 0 units.',
    ],
    courses: visible.map((c) => ({
      id: c.id,
      institution: c.institution,
      course_code: c.course_code,
      title: c.title,
      term: c.term,
      source_credits: c.source_credits,
      credit_system: c.credit_system,
      grade: c.grade,
      status: c.state,
      status_label: STUDENT_STAGE[c.state]?.label || 'Being processed',
      tone: STUDENT_STAGE[c.state]?.tone || 'waiting',
      decision: c.decision,
      ...applicantResult(c),
      bu_course: ['posted', 'decided'].includes(c.state) && c.outcome !== 'no_credit' ? c.bu_award : null,
      units: c.units,
      units_status: c.units_status,
      transfer_grade: c.state === 'posted' ? c.transfer_grade : null,
      counts_in_gpa: false,
      hub_units: POLICY.transferHubUnits,
      explanation: studentExplanation(c),
      information_request: c.state === 'information_requested'
        ? { id: c.info_id, kind: c.info_kind, message: c.info_message, requested_at: c.info_requested_at } : null,
    })),
  };
}

export default {
  applyEstablished, courseStates, summarizeCourses, refreshApplicationStatus, deadlineFor, postingBlockers, postCredits,
  recordDeadlineException, returnToEvaluator, detectDuplicate, duplicateComparison, resolveDuplicate, studentView, notifyCreditOffice, creditOfficeRecipients,
};
