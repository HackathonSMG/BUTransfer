import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { listApplications, getApplication, createApplication, submitDraftApplication, triggerEvaluation, createInfoRequest, submitDecision, updateStatus, getAuditLog, addNote, decideCourse, approveAutomaticCourses, requireApplicationAccess } from '../controllers/applications.controller.js';

// Staff only. Evaluators see (read-only) just the applications with a course assigned to them and decide courses
// from their own reviews (/api/my); the Credit Evaluation Office and administrators manage every application.
const STAFF = ['evaluator', 'admin', 'credit_office'];
const OFFICE = ['admin', 'credit_office'];

const router = Router();
router.use(requireAuth, requireRole(...STAFF));
router.get('/', listApplications);
router.get('/:id', requireApplicationAccess, getApplication);
router.post('/', requireRole(...OFFICE), createApplication);
// A draft created for a student (draft: true) is submitted once its transcripts are uploaded
router.post('/:id/submit', requireRole(...OFFICE), submitDraftApplication);
router.post('/:id/evaluate', requireRole(...OFFICE), triggerEvaluation);
router.post('/:id/info-request', requireRole(...OFFICE), createInfoRequest);
router.post('/:id/decision', requireRole(...OFFICE), submitDecision);
router.post('/:id/courses/approve-automatic', requireRole(...OFFICE), approveAutomaticCourses);
router.post('/:id/courses/:courseId/decision', requireRole(...OFFICE), decideCourse);
router.put('/:id/status', requireRole('admin'), updateStatus);
router.get('/:id/audit-log', requireApplicationAccess, getAuditLog);
router.post('/:id/notes', requireApplicationAccess, addNote);
export default router;
