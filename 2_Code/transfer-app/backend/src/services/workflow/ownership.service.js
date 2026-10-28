// Who has an application and what is holding it up, for staff. Nothing new is stored here: the current owner of a
// course is its course_reviews row (evaluator_id, status, assigned_at, assignment_reason; queue 'credit_office'
// with no evaluator = unassigned), and every assignment it has had is a review_assignments row (the open row,
// ended_at IS NULL, is the current one). This derives the application's operational stage from those rows and
// its status, and is used by the staff queue, Application Lookup and the internal details pages. Applicants never
// see any of it.
import { query } from '../../config/db.js';

const OPEN = `('queued', 'new', 'in_progress', 'info_requested')`;
const UNAVAILABLE = `(e.is_active = false OR (e.availability = 'unavailable' AND (e.unavailable_until IS NULL OR e.unavailable_until >= CURRENT_DATE)))`;

/** Where an application is, for staff (derived from the application status and its course reviews). */
export const STAGES = {
  draft: { label: 'Draft', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'neutral' },
  needs_attention: { label: 'Needs Attention', tone: 'bad' },
  unassigned: { label: 'Unassigned', tone: 'bad' },
  reassignment_required: { label: 'Reassignment Required', tone: 'bad' },
  pending_review: { label: 'Pending Evaluator Review', tone: 'info' },
  in_review: { label: 'In Review', tone: 'info' },
  waiting_for_applicant: { label: 'Waiting for Applicant', tone: 'warn' },
  credit_office_review: { label: 'Credit Office Review', tone: 'info' },
  completed: { label: 'Completed', tone: 'ok' },
  closed: { label: 'Closed', tone: 'neutral' },
};

/**
 * Applications with their ownership columns, usable as `FROM ${OWNERSHIP_FROM}` (alias a). Adds:
 * open_reviews, unassigned_reviews, reassign_reviews, in_review_reviews, owners_count, current_owner_id,
 * current_owner_name, current_owner_department, pending_course, pending_review_status, pending_since, stage,
 * needs_attention.
 * The current owner is the open review that is being worked on now: not one queued behind a hand-off, then the
 * earliest in the review order.
 */
export const OWNERSHIP_FROM = `(
  SELECT a0.*, rv.open_reviews, rv.unassigned_reviews, rv.reassign_reviews, rv.in_review_reviews, rv.owners_count,
         cur.owner_id AS current_owner_id, cur.owner_name AS current_owner_name, cur.owner_department AS current_owner_department,
         cur.pending_course, cur.pending_review_status, cur.pending_since,
         CASE
           WHEN a0.status = 'draft' THEN 'draft'
           WHEN a0.status = 'closed' THEN 'closed'
           WHEN a0.status IN ('credit_posted', 'approved', 'rejected') THEN 'completed'
           WHEN a0.status = 'validation_failed' THEN 'needs_attention'
           WHEN rv.reassign_reviews > 0 THEN 'reassignment_required'
           WHEN rv.unassigned_reviews > 0 THEN 'unassigned'
           WHEN a0.status IN ('submitted', 'under_evaluation') THEN 'processing'
           WHEN a0.status = 'evaluation_completed' AND rv.open_reviews = 0 THEN 'needs_attention'
           WHEN a0.status = 'information_required' THEN 'waiting_for_applicant'
           WHEN a0.status = 'ready_for_posting' THEN 'credit_office_review'
           WHEN rv.in_review_reviews > 0 THEN 'in_review'
           WHEN rv.open_reviews > 0 THEN 'pending_review'
           ELSE 'processing'
         END AS stage
  FROM applications a0
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE r.status IN ${OPEN})::int AS open_reviews,
           COUNT(*) FILTER (WHERE r.status IN ${OPEN} AND r.evaluator_id IS NULL)::int AS unassigned_reviews,
           COUNT(*) FILTER (WHERE r.status IN ${OPEN} AND r.evaluator_id IS NOT NULL AND ${UNAVAILABLE})::int AS reassign_reviews,
           COUNT(*) FILTER (WHERE r.status = 'in_progress')::int AS in_review_reviews,
           COUNT(DISTINCT r.evaluator_id) FILTER (WHERE r.status IN ${OPEN})::int AS owners_count
    FROM course_reviews r LEFT JOIN evaluators e ON e.id = r.evaluator_id WHERE r.application_id = a0.id
  ) rv ON true
  LEFT JOIN LATERAL (
    SELECT r.evaluator_id AS owner_id, p.full_name AS owner_name, e.department AS owner_department, tc.course_code AS pending_course,
           r.status AS pending_review_status, COALESCE(r.assigned_at, r.created_at) AS pending_since
    FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
    LEFT JOIN evaluators e ON e.id = r.evaluator_id LEFT JOIN profiles p ON p.id = r.evaluator_id
    WHERE r.application_id = a0.id AND r.status IN ${OPEN}
    ORDER BY (r.status = 'queued'), r.sequence, r.assigned_at NULLS LAST, tc.position
    LIMIT 1
  ) cur ON true
) a`;

/** Stages that need someone in the office to act (not an SLA: only states the workflow cannot move on from). */
export const ATTENTION_STAGES = ['needs_attention', 'unassigned', 'reassignment_required'];

/** One course review as staff see it. */
function reviewState(r) {
  const open = ['queued', 'new', 'in_progress', 'info_requested'].includes(r.status);
  if (open && !r.evaluator_id) return { key: 'unassigned', label: 'Unassigned', tone: 'bad' };
  if (open && (r.evaluator_active === false || r.evaluator_unavailable)) return { key: 'reassignment_required', label: 'Reassignment Required', tone: 'bad' };
  return {
    queued: { key: 'queued', label: 'Waiting for hand-off', tone: 'neutral' },
    new: { key: 'pending_review', label: 'Pending Review', tone: 'info' },
    in_progress: { key: 'in_review', label: 'In Review', tone: 'info' },
    info_requested: { key: 'waiting_for_applicant', label: 'Waiting for Applicant', tone: 'warn' },
    approved: { key: 'completed', label: 'Completed', tone: 'ok' },
    rejected: { key: 'completed', label: 'Completed', tone: 'ok' },
    withdrawn: { key: 'withdrawn', label: 'Withdrawn', tone: 'neutral' },
  }[r.status] || { key: r.status, label: r.status, tone: 'neutral' };
}

/** Why a course has no evaluator (or needs a new one), from its recorded assignment reason. */
export function unassignedReason(reasonText, { unavailable = false } = {}) {
  const t = String(reasonText || '');
  if (unavailable || /unavailable|released|deactivat|inactive/i.test(t)) return 'Evaluator unavailable';
  if (/No subject specialist/i.test(t)) return 'No subject specialist';
  if (/Returned by the Credit Evaluation Office/i.test(t)) return 'Returned for another review';
  if (/confirmation|conflict/i.test(t)) return 'Established equivalency needs confirmation';
  if (/no catalog|unknown course|not in the catalog/i.test(t)) return 'Unknown course';
  return 'Manual assignment required';
}

/**
 * Everything staff need to see who has an application: stage, current owners, blocking courses, every course's
 * review with its evaluator, and the assignment history.
 */
export async function ownershipView(applicationId) {
  const [{ rows: [app] }, { rows: courses }, { rows: assignments }] = await Promise.all([
    query(`SELECT a.id, a.status, a.stage, a.open_reviews, a.owners_count FROM ${OWNERSHIP_FROM} WHERE a.id = $1`, [applicationId]),
    query(
      `SELECT tc.id AS transcript_course_id, tc.course_code, tc.title, tc.institution, tc.position,
              r.id AS review_id, r.status, r.queue, r.sequence, r.evaluator_id, r.target_bu_course, r.assigned_at, r.started_at, r.completed_at,
              r.assignment_reason, r.assignment_context, r.returned_reason, r.created_at AS review_created_at,
              p.full_name AS evaluator_name, p.email AS evaluator_email, e.department AS evaluator_department, e.title AS evaluator_title,
              (p.is_active AND e.is_active) AS evaluator_active,
              (e.availability = 'unavailable' AND (e.unavailable_until IS NULL OR e.unavailable_until >= CURRENT_DATE)) AS evaluator_unavailable,
              cd.decided_via, cd.outcome AS decision_outcome
       FROM transcript_courses tc
       LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
       LEFT JOIN evaluators e ON e.id = r.evaluator_id LEFT JOIN profiles p ON p.id = r.evaluator_id
       LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
       WHERE tc.application_id = $1 ORDER BY r.sequence NULLS LAST, tc.position`, [applicationId]),
    query(
      `SELECT ra.review_id, ra.evaluator_id, ra.reason, ra.assigned_at, ra.ended_at, ra.end_reason, tc.course_code,
              p.full_name AS evaluator_name, e.department AS evaluator_department, ab.full_name AS assigned_by_name
       FROM review_assignments ra JOIN course_reviews r ON r.id = ra.review_id JOIN transcript_courses tc ON tc.id = r.transcript_course_id
       LEFT JOIN profiles p ON p.id = ra.evaluator_id LEFT JOIN evaluators e ON e.id = ra.evaluator_id LEFT JOIN profiles ab ON ab.id = ra.assigned_by
       WHERE r.application_id = $1 ORDER BY ra.assigned_at, ra.id`, [applicationId]),
  ]);
  if (!app) return null;

  const rows = courses.map((c) => {
    const state = c.review_id
      ? reviewState(c)
      : c.decided_via ? { key: 'completed', label: c.decided_via === 'established_equivalency' ? 'Completed (established equivalency)' : 'Completed (policy rule)', tone: 'ok' }
        : { key: 'not_reviewed', label: 'Not routed for review', tone: 'neutral' };
    const unassigned = ['unassigned', 'reassignment_required'].includes(state.key);
    return {
      transcript_course_id: c.transcript_course_id, review_id: c.review_id, course_code: c.course_code, title: c.title, institution: c.institution,
      target_bu_course: c.target_bu_course, state: state.key, state_label: state.label, tone: state.tone,
      evaluator: c.evaluator_id ? { id: c.evaluator_id, name: c.evaluator_name, email: c.evaluator_email, department: c.evaluator_department, title: c.evaluator_title } : null,
      assigned_at: c.assigned_at, started_at: c.started_at, completed_at: c.completed_at,
      pending_since: ['queued', 'new', 'in_progress', 'info_requested'].includes(c.status) ? (c.assigned_at || c.review_created_at) : null,
      assignment_reason: c.assignment_reason, assignment_context: c.assignment_context || [], returned_reason: c.returned_reason,
      unassigned_reason: unassigned ? unassignedReason(c.assignment_reason, { unavailable: state.key === 'reassignment_required' }) : null,
    };
  });

  // Blocking completion: every open course; the current owner(s) are those working on one now
  const blocking = rows.filter((r) => r.pending_since);
  const active = blocking.filter((r) => r.state !== 'queued');
  const owners = [];
  for (const r of active) {
    const key = r.evaluator?.id || 'office';
    let o = owners.find((x) => x.key === key);
    if (!o) owners.push(o = { key, name: r.evaluator?.name || 'Credit Evaluation Office (unassigned)', department: r.evaluator?.department || null, unassigned: !r.evaluator, courses: [] });
    o.courses.push(r.course_code);
  }
  const evaluatorCount = new Set(blocking.filter((r) => r.evaluator).map((r) => r.evaluator.id)).size;
  const stage = STAGES[app.stage] || { label: app.stage, tone: 'neutral' };
  const summary = blocking.length
    ? `${blocking.length} course${blocking.length === 1 ? '' : 's'} pending${evaluatorCount ? ` with ${evaluatorCount} evaluator${evaluatorCount === 1 ? '' : 's'}` : ''}`
      + (blocking.some((r) => !r.evaluator) ? `, ${blocking.filter((r) => !r.evaluator).length} unassigned` : '')
    : app.stage === 'credit_office_review' ? 'Every course decided; final review by the Credit Evaluation Office'
      : app.stage === 'completed' ? 'Evaluation complete' : 'No course is with an evaluator';

  // History: first assignment of a course = Assigned (or routed to the office), later ones = Reassigned; completions after
  const seen = new Set();
  const history = [];
  for (const h of assignments) {
    const first = !seen.has(h.review_id);
    seen.add(h.review_id);
    history.push({
      at: h.assigned_at, course_code: h.course_code,
      evaluator: h.evaluator_name || null, department: h.evaluator_department || null,
      action: h.evaluator_id ? (first ? 'Assigned' : 'Reassigned') : (first ? 'Routed to Credit Evaluation Office' : 'Returned to Credit Evaluation Office'),
      reason: h.reason, by: h.assigned_by_name || 'Automatic',
      ended_at: h.ended_at, end_reason: h.end_reason,
    });
  }
  for (const r of rows.filter((x) => x.completed_at && x.state === 'completed')) {
    history.push({ at: r.completed_at, course_code: r.course_code, evaluator: r.evaluator?.name || null, department: r.evaluator?.department || null,
      action: 'Review completed', reason: null, by: r.evaluator?.name || null });
  }
  history.sort((x, y) => new Date(x.at) - new Date(y.at));

  return {
    stage: app.stage, stage_label: stage.label, tone: stage.tone, summary,
    owners: owners.map(({ key, ...o }) => o),
    blocking, courses: rows, history,
    needs_attention: ATTENTION_STAGES.includes(app.stage),
  };
}

export default { OWNERSHIP_FROM, STAGES, ATTENTION_STAGES, ownershipView, unassignedReason };
