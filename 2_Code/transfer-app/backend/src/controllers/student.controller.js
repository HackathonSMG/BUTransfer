import { z } from 'zod';
import * as eligibilityService from '../services/eligibility.service.js';
import * as applicationService from '../services/application.service.js';
import * as documentService from '../services/document.service.js';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../utils/errors.js';

const eligibilityCheckSchema = z.object({
  gpa: z.coerce.number().min(0).max(4.0).optional().nullable(),
  credits: z.coerce.number().int().min(0).optional().nullable(),
  institution: z.string().min(2).max(255).optional().nullable(),
  program: z.string().min(2).max(255).optional().nullable(),
  hasTranscripts: z.boolean().optional().default(false),
});

const applicationSubmitSchema = z.object({
  student_name: z.string().min(2).max(255),
  student_email: z.string().email(),
  student_phone: z.string().max(30).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  transfer_from_institution: z.string().min(2).max(500),
  transfer_from_program: z.string().max(255).optional().nullable(),
  transfer_to_program: z.string().min(2).max(255),
  transfer_to_department: z.string().max(255).optional().nullable(),
  expected_start_term: z.string().max(50).optional().nullable(),
  academic_history: z.record(z.any()).optional().default({}),
  personal_statement: z.string().max(5000).optional().nullable(),
  additional_info: z.record(z.any()).optional().default({}),
  student_profile_id: z.string().uuid().optional().nullable(),
});

export async function eligibilityCheck(req, res, next) {
  try {
    const parseResult = eligibilityCheckSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const result = await eligibilityService.checkEligibility(parseResult.data);
    return res.status(200).json({ data: result, meta: { checked_at: new Date().toISOString() } });
  } catch (err) { return next(err); }
}

export async function submitApplication(req, res, next) {
  try {
    const parseResult = applicationSubmitSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const application = await applicationService.createApplication(parseResult.data, 'website', null);
    const secureLink = `${env.APP_URL}/status/${application.secure_token}`;
    return res.status(201).json({
      data: { id: application.id, reference_number: application.reference_number, status: application.status, secure_link: secureLink, student_email: application.student_email, message: 'Your application has been received.' },
    });
  } catch (err) { return next(err); }
}

export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return next(badRequest('No file was uploaded'));
    const { document_type = 'other', notes } = req.body;
    const application = req.application;
    const document = await documentService.uploadDocument({ buffer: req.file.buffer, originalName: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype, applicationId: application.id, documentType: document_type, uploadedBy: null, uploadSource: 'student', notes: notes || null });
    return res.status(201).json({ data: { document_id: document.id, file_name: document.file_name, document_type: document.document_type, file_size: document.file_size, created_at: document.created_at } });
  } catch (err) { return next(err); }
}

export async function getApplicationStatus(req, res, next) {
  try {
    const application = req.application;
    const [docsResult, infoResult, evalResult, coursesResult] = await Promise.all([
      query(`SELECT id, document_type, file_name, file_size, mime_type, created_at FROM application_documents WHERE application_id = $1 ORDER BY created_at ASC`, [application.id]),
      query(`SELECT id, items, message, status, student_response, created_at FROM information_requests WHERE application_id = $1 ORDER BY created_at DESC`, [application.id]),
      query(`SELECT id, status, confidence_score, missing_documents, completed_at FROM ai_evaluations WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1`, [application.id]),
      // Courses read from the transcript only; per-course recommendations stay internal until an evaluator decides
      query(`SELECT id, institution, course_code, title, term FROM transcript_courses WHERE application_id = $1 ORDER BY position`, [application.id]),
    ]);
    const isDecided = ['approved', 'rejected'].includes(application.status);
    const evalRow = evalResult.rows[0] || null;
    const studentView = {
      id: application.id, reference_number: application.reference_number, status: application.status,
      student_name: application.student_name, student_email: application.student_email,
      student_phone: application.student_phone, date_of_birth: application.date_of_birth,
      transfer_from_institution: application.transfer_from_institution,
      transfer_from_program: application.transfer_from_program,
      transfer_to_program: application.transfer_to_program,
      transfer_to_department: application.transfer_to_department,
      expected_start_term: application.expected_start_term, submitted_at: application.submitted_at,
      decision_date: application.decision_date, academic_history: application.academic_history,
      personal_statement: application.personal_statement,
      final_decision: isDecided ? application.final_decision : null,
      evaluator_comments: isDecided ? application.evaluator_comments : null,
      documents: docsResult.rows,
      courses: coursesResult.rows,
      info_requests: infoResult.rows,
      evaluation: evalRow ? {
        id: evalRow.id, status: evalRow.status,
        confidence_score: evalRow.confidence_score,
        missing_documents: evalRow.missing_documents,
        completed_at: evalRow.completed_at,
      } : null,
      created_at: application.created_at, updated_at: application.updated_at,
    };
    return res.status(200).json({ data: studentView });
  } catch (err) { return next(err); }
}

export async function respondToInfoRequest(req, res, next) {
  try {
    const application = req.application;
    const { requestId } = req.params;
    const { response: studentResponse } = req.body;
    if (!studentResponse || !studentResponse.trim()) return next(badRequest('Response text is required'));
    const result = await query(
      `UPDATE information_requests SET student_response = $1, status = 'responded', resolved_at = NOW() WHERE id = $2 AND application_id = $3 RETURNING *`,
      [studentResponse.trim(), requestId, application.id]
    );
    if (result.rows.length === 0) return next(notFound('Information request'));
    return res.status(200).json({ data: result.rows[0] });
  } catch (err) { return next(err); }
}

export async function getStudentNotifications(req, res, next) {
  try {
    const application = req.application;
    const result = await query(
      `SELECT id, type, title, message, is_read, sent_at, read_at, created_at FROM notifications WHERE application_id = $1 AND (recipient_email = $2 OR recipient_id = $3) ORDER BY created_at DESC LIMIT 50`,
      [application.id, application.student_email, application.student_profile_id || '00000000-0000-0000-0000-000000000000']
    );
    return res.status(200).json({ data: result.rows, meta: { total: result.rows.length } });
  } catch (err) { return next(err); }
}

export default { eligibilityCheck, submitApplication, uploadDocument, getApplicationStatus, getStudentNotifications, respondToInfoRequest };
