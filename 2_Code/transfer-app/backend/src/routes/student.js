import { Router } from 'express';
import multer from 'multer';
import { validateSecureToken } from '../middleware/secure-token.js';
import { requireAuth, optionalAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { eligibilityCheck, submitApplication, submitDraft, myApplications, uploadDocument, getApplicationStatus, getStudentNotifications, respondToInfoRequest, selfCheck, selfCheckInstitutions } from '../controllers/student.controller.js';
import { env } from '../config/env.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (env.UPLOAD_MAX_MB || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf','image/jpeg','image/jpg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  },
});

router.post('/eligibility-check', eligibilityCheck);
// Self-check: guidance from the equivalency database before applying; nothing is stored
router.get('/self-check/institutions', selfCheckInstitutions);
router.post('/self-check', selfCheck);
router.post('/applications', optionalAuth, submitApplication);
router.post('/applications/:token/submit', validateSecureToken, submitDraft);
// Student portal: the signed-in student's own applications
router.get('/me/applications', requireAuth, requireRole('student'), myApplications);
router.post('/applications/:token/documents', validateSecureToken, upload.single('file'), uploadDocument);
router.get('/status/:token', validateSecureToken, getApplicationStatus);
router.get('/status/:token/notifications', validateSecureToken, getStudentNotifications);
// A written reply (JSON) or a file such as the requested syllabus (multipart, field "file")
router.post('/status/:token/info-requests/:requestId/respond', validateSecureToken, upload.single('file'), respondToInfoRequest);

export default router;
