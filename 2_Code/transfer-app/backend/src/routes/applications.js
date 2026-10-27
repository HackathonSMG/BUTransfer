import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { listApplications, getApplication, createApplication, triggerEvaluation, createInfoRequest, submitDecision, updateStatus, getAuditLog, addNote, decideCourse, approveAutomaticCourses } from '../controllers/applications.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', listApplications);
router.get('/:id', getApplication);
router.post('/', requireRole('evaluator', 'admin'), createApplication);
router.post('/:id/evaluate', requireRole('evaluator', 'admin'), triggerEvaluation);
router.post('/:id/info-request', requireRole('evaluator', 'admin'), createInfoRequest);
router.post('/:id/decision', requireRole('evaluator', 'admin'), submitDecision);
router.post('/:id/courses/approve-automatic', requireRole('evaluator', 'admin'), approveAutomaticCourses);
router.post('/:id/courses/:courseId/decision', requireRole('evaluator', 'admin'), decideCourse);
router.put('/:id/status', requireRole('admin'), updateStatus);
router.get('/:id/audit-log', requireRole('evaluator', 'admin'), getAuditLog);
router.post('/:id/notes', requireRole('evaluator', 'admin'), addNote);
export default router;
