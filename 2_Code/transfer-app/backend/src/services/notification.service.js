import { query } from '../config/db.js';

export async function sendNotification({ recipientId = null, recipientEmail = null, applicationId = null, type, title, message, data = {} }) {
  const result = await query(
    `INSERT INTO notifications (recipient_id, recipient_email, application_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [recipientId, recipientEmail, applicationId, type, title, message, JSON.stringify(data)]
  );
  return result.rows[0];
}

function buildTitle(type, referenceNumber) {
  const map = {
    application_submitted: `Application Received: ${referenceNumber}`,
    evaluation_completed: `Evaluation Ready: ${referenceNumber}`,
    information_required: `Information Needed: ${referenceNumber}`,
    decision_made: `Decision Made: ${referenceNumber}`,
    document_uploaded: `New Document: ${referenceNumber}`,
    status_changed: `Status Update: ${referenceNumber}`,
    syllabus_required: `Syllabus Needed: ${referenceNumber}`,
    credit_posted: `Transfer Credit Posted: ${referenceNumber}`,
  };
  return map[type] || `Notification: ${referenceNumber}`;
}

export async function notifyStudent(application, type, message) {
  return sendNotification({
    recipientId: application.student_profile_id || null,
    recipientEmail: application.student_email,
    applicationId: application.id,
    type,
    title: buildTitle(type, application.reference_number),
    message,
    data: { reference_number: application.reference_number },
  });
}

export async function notifyEvaluator(evaluatorId, application, type, message) {
  const profileResult = await query(`SELECT email FROM profiles WHERE id = $1 LIMIT 1`, [evaluatorId]);
  const evaluatorEmail = profileResult.rows[0]?.email || null;
  return sendNotification({
    recipientId: evaluatorId,
    recipientEmail: evaluatorEmail,
    applicationId: application.id,
    type,
    title: buildTitle(type, application.reference_number),
    message,
    data: { reference_number: application.reference_number },
  });
}

export async function applicationSubmitted(application) {
  return notifyStudent(application, 'application_submitted',
    `Your transfer application (${application.reference_number}) has been received. You can track its status using the link in your email.`);
}

export async function evaluationComplete(application, evaluationId) {
  if (application.assigned_evaluator_id) {
    await notifyEvaluator(application.assigned_evaluator_id, application, 'evaluation_completed',
      `The course evaluation for application ${application.reference_number} is complete and ready for your review.`);
  }
  return { evaluationId };
}

export async function infoRequired(application, requestId) {
  return notifyStudent(application, 'information_required',
    `Additional information is needed for your transfer application (${application.reference_number}). Open your status page to respond.`);
}

export async function decisionMade(application) {
  const outcome = application.final_decision === 'approved' ? 'approved' : 'not approved';
  return notifyStudent(application, 'decision_made',
    `A decision has been made on your transfer application (${application.reference_number}): your application has been ${outcome}.`);
}

export async function documentUploaded(application, document) {
  if (application.assigned_evaluator_id) {
    await notifyEvaluator(application.assigned_evaluator_id, application, 'document_uploaded',
      `A new document (${document.file_name}) was uploaded for application ${application.reference_number}.`);
  }
}

export default { sendNotification, notifyStudent, notifyEvaluator, applicationSubmitted, evaluationComplete, infoRequired, decisionMade, documentUploaded };
