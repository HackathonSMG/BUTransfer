import { Router } from 'express';
import multer from 'multer';
import { validateSecureToken } from '../middleware/secure-token.js';
import { eligibilityCheck, submitApplication, uploadDocument, getApplicationStatus, getStudentNotifications, respondToInfoRequest } from '../controllers/student.controller.js';
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
router.post('/applications', submitApplication);
router.post('/applications/:token/documents', validateSecureToken, upload.single('file'), uploadDocument);
router.get('/status/:token', validateSecureToken, getApplicationStatus);
router.get('/status/:token/notifications', validateSecureToken, getStudentNotifications);
router.post('/status/:token/info-requests/:requestId/respond', validateSecureToken, respondToInfoRequest);

export default router;
