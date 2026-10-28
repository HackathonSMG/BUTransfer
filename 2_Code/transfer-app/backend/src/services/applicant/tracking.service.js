// Public, account-free access for applicants. An application is only ever opened with its application number
// AND the email it was submitted with; either one alone reveals nothing. The existing-application check shows
// masked numbers only, and can email the full numbers to the address itself.
import { query } from '../../config/db.js';
import { applicantStatus, buildProgress, FINISHED_STATUSES } from './applicant-status.js';
import { sendApplicationLookup } from '../notifications/applicant-notification.service.js';

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const normalizeReference = (r) => String(r || '').trim().toUpperCase().replace(/\s+/g, '');

/** APP-2026-0042 -> APP-2026-••42 */
export const maskReference = (ref) => String(ref).replace(/^(.*-)(\d+)$/, (_, head, n) => `${head}${'•'.repeat(Math.max(n.length - 2, 1))}${n.slice(-2)}`);

/**
 * The application with this number submitted with this email, or null. Drafts are never returned.
 * Comparison is case-insensitive; the same answer (null) is given for a wrong number and a wrong email.
 */
export async function findForTracking(referenceNumber, email) {
  const ref = normalizeReference(referenceNumber);
  const addr = normalizeEmail(email);
  if (!ref || !addr) return null;
  const { rows: [app] } = await query(
    `SELECT id, reference_number, secure_token, status FROM applications
     WHERE UPPER(reference_number) = $1 AND LOWER(student_email) = $2 AND status <> 'draft' LIMIT 1`, [ref, addr]);
  return app || null;
}

async function submittedFor(email) {
  const { rows } = await query(
    `SELECT reference_number, status, student_name, submitted_at, created_at FROM applications
     WHERE LOWER(student_email) = $1 AND status <> 'draft' ORDER BY COALESCE(submitted_at, created_at) DESC LIMIT 10`, [normalizeEmail(email)]);
  return rows;
}

/**
 * Submitted applications for an email, for the pre-submission check. Numbers are masked: the full number plus the
 * email would open the application, so it is only ever sent to the address itself (emailApplicationNumbers).
 */
export async function existingApplications(email) {
  const rows = await submittedFor(email);
  const applications = rows.map((a) => {
    const s = applicantStatus(a.status);
    return {
      masked_reference: maskReference(a.reference_number),
      submitted_at: a.submitted_at || a.created_at,
      status_label: s.label,
      tone: s.tone,
      active: !FINISHED_STATUSES.includes(a.status),
    };
  });
  return { exists: applications.length > 0, has_active: applications.some((a) => a.active), applications };
}

/** Emails the address the numbers of its applications. Returns nothing, whether or not any exist. */
export async function emailApplicationNumbers(email) {
  const rows = await submittedFor(email);
  if (rows.length) await sendApplicationLookup(normalizeEmail(email), rows);
}

/** Status changes in order, from the audit trail (every status change is recorded there). */
export async function statusHistory(applicationId) {
  const { rows } = await query(
    `SELECT new_value->>'status' AS status, created_at AS at FROM audit_logs
     WHERE application_id = $1 AND action = 'status_changed' AND new_value ? 'status' ORDER BY created_at, id`, [applicationId]);
  return rows.filter((r) => r.status);
}

/** Status presentation, progress timeline and applicant-visible history for the tracking page. */
export async function trackingView(app, courses) {
  const [history, { rows: [evaluation] }] = await Promise.all([
    statusHistory(app.id),
    query(`SELECT status FROM ai_evaluations WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1`, [app.id]),
  ]);
  const progress = buildProgress(app, { courses, history, evaluationDone: evaluation?.status === 'completed' });
  // The history shown to the applicant: one entry per applicant-facing label change
  const timeline = [];
  for (const h of history) {
    const s = applicantStatus(h.status);
    if (h.status === 'draft' || timeline[timeline.length - 1]?.label === s.label) continue;
    timeline.push({ label: s.label, at: h.at });
  }
  return { status_info: applicantStatus(app.status), progress, status_history: timeline };
}

export default { findForTracking, existingApplications, emailApplicationNumbers, statusHistory, trackingView, maskReference, normalizeReference };
