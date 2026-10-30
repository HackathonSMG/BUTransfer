import { z } from 'zod';
import * as applicationService from '../services/application.service.js';
import * as auditService from '../services/audit.service.js';
import * as memoryService from '../services/credit/memory.service.js';
import * as lifecycle from '../services/workflow/lifecycle.service.js';
import { badRequest, notFound } from '../utils/errors.js';
import { query } from '../config/db.js';

const listQuerySchema = z.object({
  status: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  assigned_evaluator_id: z.string().uuid().optional(),
  // Ownership (ownership.service): operational stage, an evaluator / department holding an open course, minimum age
  stage: z.string().max(40).optional(),
  owner_id: z.string().uuid().optional(),
  department: z.string().max(200).optional(),
  min_age_days: z.coerce.number().int().min(1).max(365).optional(),
  date_from: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  date_to: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional().default('created_at'),
  order: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('DESC'),
});

const evaluatorSubmitSchema = z.object({
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
  // true: keep it as a draft until the transcripts are attached (POST /applications/:id/submit). Default: submitted now
  draft: z.boolean().optional().default(false),
  // true: staff uploading a transcript on the student's behalf (recorded on the application and in the audit log)
  on_behalf: z.boolean().optional().default(false),
});

const ROLE_LABELS = { admin: 'Administrator', credit_office: 'Credit Evaluation Office', evaluator: 'Evaluator' };
const roleLabel = (role) => ROLE_LABELS[role] || role;

const infoRequestSchema = z.object({
  items: z.array(z.object({ type: z.string().min(1), description: z.string().min(1), is_blocking: z.boolean().optional().default(false) })).min(1),
  message: z.string().max(2000).optional().default(''),
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comments: z.string().max(3000).optional().default(''),
});

const statusUpdateSchema = z.object({
  status: z.enum(['draft','submitted','information_required','under_evaluation','evaluation_completed','under_evaluator_review','validation_failed','ready_for_posting','credit_posted','approved','rejected','closed']),
  reason: z.string().max(500).optional().default('Manual status update'),
});

export async function listApplications(req, res, next) {
  try {
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) return next(badRequest('Invalid query parameters'));
    const { status, source, search, assigned_evaluator_id, date_from, date_to, stage, owner_id, department, min_age_days, page, limit, sort, order } = parseResult.data;
    // Evaluators (Application Lookup) see only applications with a course assigned to them, as on the details page
    const reviewerId = req.user.role === 'evaluator' ? req.user.id : undefined;
    const [result, stats, ownership] = await Promise.all([
      applicationService.listApplications({ status, source, search, assignedEvaluatorId: assigned_evaluator_id, reviewerId, dateFrom: date_from, dateTo: date_to,
        stage, ownerId: owner_id, department, minAgeDays: min_age_days, page, limit, sort, order }),
      applicationService.getApplicationStats(),
      reviewerId ? null : applicationService.getOwnershipStats(),
    ]);
    return res.status(200).json({ data: result.applications, meta: { total: result.total, page: result.page, limit: result.limit, pages: result.pages },
      stats: { ...stats, ...(ownership && { ownership }) } });
  } catch (err) { return next(err); }
}

/** Evaluators may open an application only when one of its courses is assigned to them. */
export async function requireApplicationAccess(req, _res, next) {
  try {
    if (req.user.role !== 'evaluator') return next();
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return next(notFound('Application'));
    const { rows } = await query(`SELECT 1 FROM course_reviews WHERE application_id = $1 AND evaluator_id = $2 LIMIT 1`, [req.params.id, req.user.id]);
    return rows.length ? next() : next(notFound('Application'));
  } catch (err) { return next(err); }
}

export async function getApplication(req, res, next) {
  try {
    const application = await applicationService.getApplicationById(req.params.id);
    return res.status(200).json({ data: application });
  } catch (err) { return next(err); }
}

export async function createApplication(req, res, next) {
  try {
    const parseResult = evaluatorSubmitSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const { draft, on_behalf: onBehalf, ...fields } = parseResult.data;
    // Who submitted on the student's behalf comes from the session, never from the request
    const { submitted_on_behalf: _ignored, ...additionalInfo } = fields.additional_info || {};
    fields.additional_info = onBehalf
      ? { ...additionalInfo, submitted_on_behalf: { by_id: req.user.id, by_name: req.user.full_name || req.user.email, by_role: req.user.role, at: new Date().toISOString() } }
      : additionalInfo;
    const application = await applicationService.createApplication(fields, 'evaluator_submitted', req.user.id, { draft });
    return res.status(201).json({ data: application });
  } catch (err) { return next(err); }
}

const staffSubmitSchema = z.object({ applicant_comments: z.string().max(5000).optional().nullable() });

// Staff submit a draft they created for a student (after uploading the transcripts). Same checks and processing as
// the student's own submission: a transcript is required, the student receives the confirmation email, duplicate
// detection and the evaluation start.
export async function submitDraftApplication(req, res, next) {
  try {
    const parsed = staffSubmitSchema.safeParse(req.body || {});
    if (!parsed.success) return next(badRequest('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return next(notFound('Application'));
    const name = req.user.full_name || req.user.email;
    const application = await applicationService.submitApplication(req.params.id, req.user.id, {
      applicantComments: parsed.data.applicant_comments,
      reason: `Submitted by ${name} (${roleLabel(req.user.role)}) on behalf of the student`,
    });
    return res.status(200).json({ data: { id: application.id, reference_number: application.reference_number, status: application.status, student_email: application.student_email } });
  } catch (err) { return next(err); }
}

export async function triggerEvaluation(req, res, next) {
  try {
    const result = await applicationService.triggerEvaluation(req.params.id, req.user.id);
    return res.status(202).json({ data: result, meta: { message: 'Evaluation started.' } });
  } catch (err) { return next(err); }
}

export async function createInfoRequest(req, res, next) {
  try {
    const parseResult = infoRequestSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const infoRequest = await applicationService.createInfoRequest(req.params.id, parseResult.data.items, parseResult.data.message, req.user.id);
    return res.status(201).json({ data: infoRequest });
  } catch (err) { return next(err); }
}

export async function submitDecision(req, res, next) {
  try {
    const parseResult = decisionSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    await applicationService.submitDecision(req.params.id, parseResult.data.decision, parseResult.data.comments, req.user.id);
    const updated = await applicationService.getApplicationById(req.params.id);
    return res.status(200).json({ data: updated, meta: { message: `Application ${parseResult.data.decision} successfully` } });
  } catch (err) { return next(err); }
}

export async function updateStatus(req, res, next) {
  try {
    const parseResult = statusUpdateSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    await applicationService.updateApplicationStatus(req.params.id, parseResult.data.status, req.user.id, parseResult.data.reason);
    const updated = await applicationService.getApplicationById(req.params.id);
    return res.status(200).json({ data: updated });
  } catch (err) { return next(err); }
}

export async function getAuditLog(req, res, next) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const appCheck = await query(`SELECT id FROM applications WHERE id = $1 LIMIT 1`, [id]);
    if (appCheck.rows.length === 0) return next(notFound('Application'));
    const { rows, total } = await auditService.getApplicationAuditLog(id, { page, limit });
    return res.status(200).json({ data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { return next(err); }
}

export async function addNote(req, res, next) {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note || !note.trim()) return next(badRequest('Note text is required'));
    await applicationService.addNote(id, note.trim(), req.user.id, req.user.email);
    const updated = await applicationService.getApplicationById(id);
    return res.status(200).json({ data: updated });
  } catch (err) { return next(err); }
}

const courseDecisionSchema = z.object({
  action: z.enum(['approve', 'change', 'reject']),
  outcome: z.enum(['transfer', 'elective', 'no_credit']).optional(),
  bu_award: z.string().max(200).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
});

export async function decideCourse(req, res, next) {
  try {
    const parseResult = courseDecisionSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const { action, outcome, bu_award, reason } = parseResult.data;
    const result = await memoryService.recordCourseDecision({
      applicationId: req.params.id, courseId: req.params.courseId, action, outcome, buAward: bu_award, reason, units: req.body?.units, user: req.user,
    });
    await lifecycle.refreshApplicationStatus(req.params.id, req.user.id);
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
}

export async function approveAutomaticCourses(req, res, next) {
  try {
    const result = await memoryService.approveAutomatic(req.params.id, req.user);
    await lifecycle.refreshApplicationStatus(req.params.id, req.user.id);
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
}

export default { listApplications, getApplication, createApplication, submitDraftApplication, triggerEvaluation, createInfoRequest, submitDecision, updateStatus, getAuditLog, addNote, decideCourse, approveAutomaticCourses };
