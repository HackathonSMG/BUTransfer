// Course-level information requests: the "maybe -> syllabus" loop (Problem 1, step 5).
// A request belongs to one transcript course. The student answers from their status page (a syllabus upload or
// a written reply); the answer is linked to the course, a syllabus is read and compared with the BU catalog,
// the course's review returns to the evaluator's queue and the evaluator is notified.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification, notifyStudent } from '../notification.service.js';
import { uploadDocument } from '../document.service.js';
import { extractText } from '../credit/transcript-parser.js';
import { rematchCourse } from '../credit/credit.service.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { notifyCreditOffice, refreshApplicationStatus } from './lifecycle.service.js';

/**
 * Opens a request for one course and moves its review to "waiting on the student".
 * @param {{ applicationId, transcriptCourseId, reviewId?, kind: 'syllabus'|'information', message, requestedBy?: string|null }} input
 */
export async function requestCourseInformation({ applicationId, transcriptCourseId, reviewId = null, kind, message, requestedBy = null, actor = null }) {
  const { rows: [tc] } = await query(
    `SELECT tc.course_code, tc.title, tc.institution, a.* FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id
     WHERE tc.id = $1 AND tc.application_id = $2`, [transcriptCourseId, applicationId]);
  if (!tc) throw notFound('Transcript course');
  const { rows: [open] } = await query(
    `SELECT id FROM information_requests WHERE transcript_course_id = $1 AND status = 'pending' LIMIT 1`, [transcriptCourseId]);
  if (open) throw badRequest('This course already has an open request to the student.');

  const what = kind === 'syllabus' ? 'Course syllabus' : 'Course information';
  const text = String(message || '').trim() || (kind === 'syllabus'
    ? `Please upload the syllabus for ${tc.course_code} ${tc.title || ''} so the department can compare it with BU courses.`.replace(/\s+/g, ' ')
    : 'Please provide more information about this course.');
  const { rows: [request] } = await query(
    `INSERT INTO information_requests (application_id, requested_by, items, message, transcript_course_id, kind)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [applicationId, requestedBy, JSON.stringify([{ type: kind, description: `${what}: ${tc.course_code} ${tc.title || ''} (${tc.institution})`.replace(/\s+/g, ' ').trim(), is_blocking: true }]),
      text, transcriptCourseId, kind]
  );
  if (reviewId) {
    await query(`UPDATE course_reviews SET status = 'info_requested', info_request_id = $1 WHERE id = $2`, [request.id, reviewId]);
  }
  await notifyStudent(tc, kind === 'syllabus' ? 'syllabus_required' : 'information_required',
    kind === 'syllabus'
      ? `Please upload the syllabus for ${tc.course_code} ${tc.title || ''} from your status page. Until it is reviewed, the course shows 0 units.`.replace(/\s+/g, ' ')
      : `More information is needed about ${tc.course_code}: ${text}`);
  await auditLog({ applicationId, action: kind === 'syllabus' ? 'syllabus_requested' : 'info_request_created', actorId: actor?.id || requestedBy || null,
    actorEmail: actor?.email || null, details: { info_request_id: request.id, course_code: tc.course_code, review_id: reviewId, automatic: !requestedBy && !actor } });
  await refreshApplicationStatus(applicationId, actor?.id || null);
  return request;
}

/**
 * The student's answer to a course request: a file (a syllabus), a written reply, or both.
 * @param {object} application the application row (already authorised by the student's secure link)
 */
export async function receiveInformation(application, requestId, { response, file }) {
  const { rows: [req] } = await query(
    `SELECT ir.*, tc.course_code, tc.title FROM information_requests ir LEFT JOIN transcript_courses tc ON tc.id = ir.transcript_course_id
     WHERE ir.id = $1 AND ir.application_id = $2`, [requestId, application.id]);
  if (!req) throw notFound('Information request');
  if (req.status === 'resolved') throw badRequest('This request has already been closed.');
  const reply = String(response || '').trim();
  if (!file && !reply) throw badRequest('Upload the document or write a reply.');
  if (req.kind === 'syllabus' && !file && !reply) throw badRequest('Upload the syllabus.');

  let document = null;
  if (file) {
    document = await uploadDocument({
      buffer: file.buffer, originalName: file.originalname, fileSize: file.size, mimeType: file.mimetype, applicationId: application.id,
      documentType: req.kind === 'syllabus' ? 'syllabus' : 'supporting', uploadedBy: null, uploadSource: 'student',
      notes: req.course_code ? `For ${req.course_code}` : null,
    });
    await query(`UPDATE application_documents SET transcript_course_id = $1, information_request_id = $2 WHERE id = $3`,
      [req.transcript_course_id, req.id, document.id]);
  }

  await query(
    `UPDATE information_requests SET status = 'responded', responded_at = NOW(), student_response = COALESCE($1, student_response), document_id = COALESCE($2, document_id)
     WHERE id = $3`, [reply || (document ? `Uploaded ${document.file_name}` : null), document?.id || null, req.id]);

  // A syllabus is linked to its course and read, then the course is compared again with the BU catalog
  let compared = false;
  if (req.transcript_course_id && document && req.kind === 'syllabus') {
    let text = null;
    if (file.mimetype === 'application/pdf') {
      try { text = (await extractText(file.buffer)).slice(0, 20000) || null; } catch (err) { console.error('[Syllabus] Could not read text:', err.message); }
    }
    await query(`UPDATE transcript_courses SET syllabus_document_id = $1, syllabus_text = COALESCE($2, syllabus_text), syllabus_received_at = NOW() WHERE id = $3`,
      [document.id, text, req.transcript_course_id]);
    if (text) compared = Boolean(await rematchCourse(req.transcript_course_id));
  }

  // The course goes back to whoever holds it, who is told the student answered
  if (req.transcript_course_id) {
    const { rows: [review] } = await query(`SELECT id, evaluator_id, status, queue FROM course_reviews WHERE transcript_course_id = $1`, [req.transcript_course_id]);
    if (review && review.status === 'info_requested') {
      await query(`UPDATE course_reviews SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [review.id]);
    }
    const note = {
      applicationId: application.id, type: 'information_received',
      title: `${req.kind === 'syllabus' ? 'Syllabus received' : 'Student replied'}: ${req.course_code} (${application.reference_number})`,
      message: `${application.student_name} answered the request for ${req.course_code}${document ? ` and uploaded ${document.file_name}` : ''}.${compared ? ' The syllabus was compared with the BU catalog.' : ''}`,
      data: { reference_number: application.reference_number, review_id: review?.id || null },
    };
    if (review?.evaluator_id) await sendNotification({ recipientId: review.evaluator_id, ...note });
    else await notifyCreditOffice(note);
  }

  await auditLog({ applicationId: application.id, action: req.kind === 'syllabus' ? 'syllabus_received' : 'info_request_responded', actorEmail: application.student_email,
    details: { info_request_id: req.id, course_code: req.course_code || null, document_id: document?.id || null, compared } });
  await refreshApplicationStatus(application.id);
  return { status: 'responded', document_id: document?.id || null, compared };
}

export default { requestCourseInformation, receiveInformation };
