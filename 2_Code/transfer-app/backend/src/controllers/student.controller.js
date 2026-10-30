import { z } from 'zod';
import * as eligibilityService from '../services/eligibility.service.js';
import * as applicationService from '../services/application.service.js';
import * as documentService from '../services/document.service.js';
import * as lifecycle from '../services/workflow/lifecycle.service.js';
import * as informationService from '../services/workflow/information.service.js';
import * as selfCheckService from '../services/selfcheck.service.js';
import * as tracking from '../services/applicant/tracking.service.js';
import { readTranscript as readTranscriptFile } from '../services/credit/credit.service.js';
import { applicantStatus } from '../services/applicant/applicant-status.js';
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
  applicant_comments: z.string().max(5000).optional().nullable(),
  // true: keep it as a draft until the documents are attached (POST /applications/:token/submit)
  draft: z.boolean().optional().default(false),
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
    const { draft, ...fields } = parseResult.data;
    // A signed-in student owns the application; the account's name and email are used
    if (req.user && req.user.role !== 'student') return next(badRequest('Staff create credit evaluations from the staff portal.'));
    if (req.user) Object.assign(fields, { student_profile_id: req.user.id, student_email: req.user.email });
    const application = await applicationService.createApplication(fields, 'website', req.user?.id || null, { draft });
    const secureLink = `${env.APP_URL}/status/${application.secure_token}`;
    return res.status(201).json({
      data: { id: application.id, reference_number: application.reference_number, status: application.status, secure_link: secureLink, secure_token: application.secure_token,
        student_email: application.student_email, message: draft ? 'Your application has been started.' : 'Your application has been received.' },
    });
  } catch (err) { return next(err); }
}

const submitDraftSchema = z.object({ applicant_comments: z.string().max(5000).optional().nullable() });

// Submits a draft after its documents are attached; the transcript is required. Processing then runs on the
// server, independent of the browser.
export async function submitDraft(req, res, next) {
  try {
    const parsed = submitDraftSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const application = await applicationService.submitApplication(req.application.id, req.application.student_profile_id || null,
      { applicantComments: parsed.data.applicant_comments });
    return res.status(200).json({ data: {
      reference_number: application.reference_number, status: application.status, status_info: applicantStatus(application.status),
      student_email: application.student_email, submitted_at: new Date().toISOString(),
    } });
  } catch (err) { return next(err); }
}

const draftUpdateSchema = applicationSubmitSchema.pick({
  student_name: true, student_email: true, transfer_from_institution: true, transfer_from_program: true,
  transfer_to_program: true, transfer_to_department: true, expected_start_term: true, applicant_comments: true,
}).partial();

// The applicant went back and changed their details before submitting
export async function updateDraft(req, res, next) {
  try {
    const parsed = draftUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    // A signed-in applicant's email stays their account email
    if (req.application.student_profile_id) delete parsed.data.student_email;
    const updated = await applicationService.updateDraft(req.application.id, parsed.data);
    return res.status(200).json({ data: { reference_number: (updated || req.application).reference_number, status: 'draft' } });
  } catch (err) { return next(err); }
}

export async function removeDraftDocument(req, res, next) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.documentId)) return next(notFound('Document'));
    await documentService.removeDraftDocument(req.application, req.params.documentId);
    return res.status(204).end();
  } catch (err) { return next(err); }
}

const READABLE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

// Why a transcript couldn't be read, in the student's terms (no internal processing words)
function unreadableReason(r) {
  if (r.text_layer === false) {
    return 'This looks like a scanned copy or a photo, and the courses could not be read automatically. You can still submit it: the Credit Evaluation Office will read it and contact you if needed. If you have the digital PDF from your college, upload that instead.';
  }
  return 'No courses could be read from this file. If it is your official transcript you can still submit it, and the Credit Evaluation Office will read it; otherwise upload the transcript PDF issued by your college.';
}

// Reads one transcript before submission so the student can confirm or correct what was found. Nothing is stored.
export async function readTranscript(req, res, next) {
  try {
    if (!req.file) return next(badRequest('No file was uploaded'));
    if (!READABLE_TYPES.has(req.file.mimetype)) {
      return res.status(200).json({ data: { file_name: req.file.originalname, readable: false, reason: 'Upload the transcript as a PDF (or a JPG or PNG image).' } });
    }
    let r;
    try { r = await readTranscriptFile(req.file.buffer, { mimeType: req.file.mimetype }); } catch (err) {
      console.error('[Transcript] Read failed:', err.message);
      return res.status(200).json({ data: { file_name: req.file.originalname, readable: false, reason: 'The file could not be read as a transcript.' } });
    }
    // Courses are what matters; an institution the transcript didn't show is asked for on the review step
    const readable = r.courses.length > 0;
    return res.status(200).json({ data: {
      file_name: req.file.originalname, readable,
      reason: readable ? null : unreadableReason(r),
      institution: r.institution, credit_system: r.credit_system, student: r.student,
      // Read without a recognised course table (or by the AI reader): the student is asked to check each course
      check_carefully: readable && r.method !== 'layout',
      courses: r.courses.map((c) => ({ course_code: c.course_code, title: c.title, term: c.term, credits: c.source_credits, grade: c.grade })),
      // Plain-language notes only; the staff wording and finding types stay internal
      review_notes: readable && r.quality ? {
        summary: r.quality.student_summary,
        notes: r.quality.findings.filter((f) => f.student).map((f) => ({ severity: f.severity, text: f.student })),
      } : null,
    } });
  } catch (err) { return next(err); }
}

// -- Public student access (no account) ----------------------------------------------------------------

const emailSchema = z.object({ email: z.string().trim().email().max(320) });
const trackSchema = z.object({ application_number: z.string().trim().min(4).max(40), email: z.string().trim().email().max(320) });

// Before a new application: does this email already have one? Masked numbers only (see tracking.service).
export async function checkExistingApplications(req, res, next) {
  try {
    const parsed = emailSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Enter a valid email address'));
    return res.status(200).json({ data: await tracking.existingApplications(parsed.data.email) });
  } catch (err) { return next(err); }
}

// Emails the address its application numbers. Same response whether or not any exist.
export async function emailApplicationNumbers(req, res, next) {
  try {
    const parsed = emailSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Enter a valid email address'));
    await tracking.emailApplicationNumbers(parsed.data.email);
    return res.status(200).json({ data: { message: 'If there are transfer credit evaluations for this email address, their Transfer Credit IDs have been sent to it.' } });
  } catch (err) { return next(err); }
}

// Application number + email -> access to that application's tracking page. One generic answer for any mismatch.
export async function trackApplication(req, res, next) {
  try {
    const parsed = trackSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Enter your Transfer Credit ID and the email address you submitted with.'));
    const app = await tracking.findForTracking(parsed.data.application_number, parsed.data.email);
    if (!app) return next(notFound('Application'));
    return res.status(200).json({ data: { reference_number: app.reference_number, access_token: app.secure_token } });
  } catch (err) { return next(err); }
}

// The signed-in student's applications with their progress, from the persisted course states
export async function myApplications(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, reference_number, status, secure_token, transfer_from_institution, transfer_to_program, expected_start_term, submitted_at, created_at, decision_date
       FROM applications WHERE student_profile_id = $1 ORDER BY created_at DESC`, [req.user.id]);
    const data = [];
    for (const a of rows) {
      const courses = (await lifecycle.courseStates(a.id)).filter((c) => c.state !== 'withdrawn');
      data.push({ ...a, summary: lifecycle.summarizeCourses(courses), institutions: [...new Set(courses.map((c) => c.institution))] });
    }
    return res.status(200).json({ data });
  } catch (err) { return next(err); }
}

// What the student confirmed for a transcript on the review step (a JSON form field): { institution?, courses? }.
// Malformed or oversized input is ignored, and the transcript's own reading is stored.
function reviewedOf(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(String(raw).slice(0, 200_000));
    const courses = Array.isArray(v?.courses) && v.courses.length <= 300
      ? v.courses.map((c) => ({ course_code: c?.course_code, title: c?.title, term: c?.term, source_credits: c?.credits ?? c?.source_credits, grade: c?.grade }))
      : null;
    return { institution: typeof v?.institution === 'string' ? v.institution : null, courses };
  } catch { return null; }
}

export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return next(badRequest('No file was uploaded'));
    const { document_type = 'other', notes } = req.body;
    const application = req.application;
    const document = await documentService.uploadDocument({ buffer: req.file.buffer, originalName: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype, applicationId: application.id, documentType: document_type, uploadedBy: null, uploadSource: 'student', notes: notes || null,
      reviewed: document_type === 'transcript' ? reviewedOf(req.body.reviewed) : null });
    return res.status(201).json({ data: { document_id: document.id, file_name: document.file_name, document_type: document.document_type, file_size: document.file_size, created_at: document.created_at } });
  } catch (err) { return next(err); }
}

export async function getApplicationStatus(req, res, next) {
  try {
    const application = req.application;
    const [docsResult, infoResult, evalResult, coursesResult, results] = await Promise.all([
      query(`SELECT id, document_type, file_name, file_size, mime_type, created_at FROM application_documents WHERE application_id = $1 ORDER BY created_at ASC`, [application.id]),
      query(`SELECT ir.id, ir.items, ir.message, ir.status, ir.student_response, ir.created_at, ir.kind, ir.responded_at, ir.transcript_course_id,
                    tc.course_code, tc.title AS course_title, tc.institution AS course_institution
             FROM information_requests ir LEFT JOIN transcript_courses tc ON tc.id = ir.transcript_course_id
             WHERE ir.application_id = $1 ORDER BY ir.created_at DESC`, [application.id]),
      query(`SELECT id, status, missing_documents, completed_at FROM ai_evaluations WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1`, [application.id]),
      query(`SELECT id, institution, course_code, title, term FROM transcript_courses WHERE application_id = $1 ORDER BY position`, [application.id]),
      // Per-course status, decision and units from the persisted workflow state (lifecycle.studentView)
      lifecycle.studentView(application),
    ]);
    const isDecided = ['approved', 'rejected'].includes(application.status);
    const evalRow = evalResult.rows[0] || null;
    const progress = await tracking.trackingView(application, await lifecycle.courseStates(application.id));
    // Applicant-facing fields only: no internal ids, evaluator names, notes, scores or assignment data
    const studentView = {
      reference_number: application.reference_number, status: application.status, ...progress,
      student_name: application.student_name, student_email: application.student_email,
      student_phone: application.student_phone, applicant_comments: application.applicant_comments,
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
      results,
      info_requests: infoResult.rows,
      evaluation: evalRow ? { status: evalRow.status, completed_at: evalRow.completed_at } : null,
      created_at: application.created_at, updated_at: application.updated_at,
    };
    return res.status(200).json({ data: studentView });
  } catch (err) { return next(err); }
}

// A written reply, or (multipart) a file such as the syllabus with an optional note. The reply is linked to the
// request's course, the evaluator is notified and the course returns to their queue (information.service).
export async function respondToInfoRequest(req, res, next) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.requestId)) return next(notFound('Information request'));
    const result = await informationService.receiveInformation(req.application, req.params.requestId, {
      response: req.body?.response, file: req.file || null,
    });
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
}

export async function selfCheckInstitutions(_req, res, next) {
  try { return res.status(200).json({ data: await selfCheckService.selfCheckInstitutions() }); } catch (err) { return next(err); }
}

const selfCheckSchema = z.object({
  institution: z.string().min(2).max(255),
  courses: z.array(z.object({
    course_code: z.string().trim().min(2).max(40),
    title: z.string().max(255).optional().nullable(),
    credits: z.coerce.number().min(0).max(30).optional().nullable(),
    credit_system: z.enum(['Semester', 'Quarter']).optional().nullable(),
    grade: z.string().max(10).optional().nullable(),
  })).min(1).max(20),
});

export async function selfCheck(req, res, next) {
  try {
    const parsed = selfCheckSchema.safeParse(req.body);
    if (!parsed.success) return next(badRequest('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    return res.status(200).json({ data: await selfCheckService.selfCheck(parsed.data) });
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

export default { eligibilityCheck, readTranscript, submitApplication, submitDraft, updateDraft, removeDraftDocument, checkExistingApplications, emailApplicationNumbers, trackApplication, myApplications, uploadDocument, getApplicationStatus, getStudentNotifications, respondToInfoRequest, selfCheck, selfCheckInstitutions };
