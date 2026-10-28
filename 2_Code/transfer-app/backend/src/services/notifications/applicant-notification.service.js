// Applicant notifications: the one place the workflow tells an applicant something. Each call records an in-app
// notification (shown on the tracking page) and queues its email on the same row; the email outbox delivers it.
//
// Applicant-visible events, and only these, notify the applicant:
//   application_received   the application is submitted                          (application.service)
//   information_required   a syllabus or other information is requested           (information.service, application.service)
//   department_review      courses first go to department evaluators              (status -> under_evaluator_review, once)
//   final_review           every course decided; Credit Office final review        (status -> ready_for_posting, once)
//   credit_posted          some courses posted while others are still pending      (lifecycle.postCredits)
//   decision_available     the evaluation is complete and the result is posted    (status -> credit_posted / approved / rejected)
//   application_closed     the Credit Evaluation Office closes the application    (status -> closed)
// Internal transitions (submitted -> under_evaluation -> evaluation_completed, decisions returned for rework,
// reassignments) are not announced. Nothing here throws: a notification failure never stops the workflow.
import { query } from '../../config/db.js';
import { isSuppressedAddress } from '../email.service.js';
import { renderApplicantEmail } from './applicant-templates.js';
import { deliver } from './email-outbox.service.js';
import { applicantStatus } from '../applicant/applicant-status.js';

// Status the application enters -> the event it announces. once: announced the first time only.
const STATUS_EVENTS = {
  under_evaluator_review: { event: 'department_review', once: true },
  ready_for_posting: { event: 'final_review', once: true },
  credit_posted: { event: 'decision_available', once: true },
  approved: { event: 'decision_available', once: true },
  rejected: { event: 'decision_available', once: true },
  closed: { event: 'application_closed', once: true },
};

async function detailFor(event, applicationId) {
  if (event === 'department_review') {
    const { rows: [r] } = await query(
      `SELECT COUNT(*)::int AS n FROM course_reviews WHERE application_id = $1 AND status IN ('queued', 'new', 'in_progress', 'info_requested')`, [applicationId]);
    return { courses_in_review: r.n };
  }
  if (event === 'decision_available') {
    const { rows: [r] } = await query(
      `SELECT COALESCE(SUM(units), 0)::float AS units, COUNT(*) FILTER (WHERE outcome <> 'no_credit')::int AS awarded
       FROM credit_postings WHERE application_id = $1`, [applicationId]);
    return r.awarded || r.units ? { units: Math.round(r.units * 100) / 100, awarded: r.awarded } : {};
  }
  return {};
}

async function record({ applicationId = null, recipientId = null, email, event, ctx }) {
  const rendered = renderApplicantEmail(event, ctx);
  const suppressed = isSuppressedAddress(email);
  const { rows: [n] } = await query(
    `INSERT INTO notifications (recipient_id, recipient_email, application_id, type, title, message, data, email_status, email_next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'pending' THEN NOW() + INTERVAL '2 minutes' END) RETURNING id`,
    [recipientId, email, applicationId, event, rendered.title, rendered.message,
      JSON.stringify({ reference_number: ctx.reference_number, ...(ctx.detail || {}), email: { subject: rendered.subject, text: rendered.text, html: rendered.html } }),
      suppressed ? 'suppressed' : 'pending']);
  // Sent straight away; the outbox worker retries it if this attempt fails or never runs
  if (!suppressed) setImmediate(() => { deliver(n.id).catch(() => {}); });
  return n.id;
}

/**
 * Notifies the applicant of one event on their application. Never throws.
 * @param {string} applicationId
 * @param {string} event one of the events listed above
 * @param {object} [detail] event-specific values for the template (e.g. { items } for information_required)
 * @returns {Promise<string|null>} the notification id, or null when nothing was recorded
 */
export async function notifyApplicant(applicationId, event, detail = null) {
  try {
    const { rows: [app] } = await query(
      `SELECT id, reference_number, status, student_name, student_email, student_profile_id FROM applications WHERE id = $1`, [applicationId]);
    if (!app?.student_email || app.status === 'draft') return null;
    const ctx = {
      name: app.student_name, reference_number: app.reference_number, status_label: applicantStatus(app.status).label,
      detail: detail || await detailFor(event, applicationId),
    };
    return await record({ applicationId, recipientId: app.student_profile_id, email: app.student_email, event, ctx });
  } catch (err) {
    console.error(`[Applicant notification] ${event} for application ${applicationId} failed:`, err.message);
    return null;
  }
}

/** Called whenever an application's status is persisted; announces applicant-visible transitions only. */
export async function onStatusChange(applicationId, fromStatus, toStatus) {
  try {
    const rule = STATUS_EVENTS[toStatus];
    if (!rule || fromStatus === toStatus) return null;
    if (rule.once) {
      const { rows } = await query(`SELECT 1 FROM notifications WHERE application_id = $1 AND type = $2 AND recipient_email IS NOT NULL LIMIT 1`,
        [applicationId, rule.event]);
      if (rows.length) return null;
    }
    return await notifyApplicant(applicationId, rule.event);
  } catch (err) {
    console.error(`[Applicant notification] status ${fromStatus} -> ${toStatus} for ${applicationId} failed:`, err.message);
    return null;
  }
}

/** Emails an address the numbers of its applications (from the "existing application" check). Never throws. */
export async function sendApplicationLookup(email, applications) {
  try {
    if (!applications.length) return null;
    const ctx = { name: applications[0].student_name, reference_number: applications[0].reference_number, status_label: '', detail: {
      applications: applications.map((a) => ({
        reference_number: a.reference_number, status_label: applicantStatus(a.status).label,
        submitted: new Date(a.submitted_at || a.created_at).toDateString(),
      })),
    } };
    return await record({ email, event: 'application_lookup', ctx });
  } catch (err) {
    console.error('[Applicant notification] application lookup email failed:', err.message);
    return null;
  }
}

export default { notifyApplicant, onStatusChange, sendApplicationLookup };
