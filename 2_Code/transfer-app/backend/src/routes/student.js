import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { validateSecureToken } from '../middleware/secure-token.js';
import { requireAuth, optionalAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import {
  eligibilityCheck, readTranscript, submitApplication, submitDraft, updateDraft, removeDraftDocument, myApplications, uploadDocument, getApplicationStatus,
  getStudentNotifications, respondToInfoRequest, selfCheck, selfCheckInstitutions, checkExistingApplications, emailApplicationNumbers, trackApplication,
} from '../controllers/student.controller.js';
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

// Public lookups by email / application number: a tighter per-IP limit than the API's, against guessing
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.TRACK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
  keyGenerator: (req) => (req.ip || req.socket.remoteAddress || 'unknown').replace(/:\d+$/, ''),
});

router.post('/eligibility-check', eligibilityCheck);
// Self-check: guidance from the equivalency database before applying; nothing is stored
router.get('/self-check/institutions', selfCheckInstitutions);
router.post('/self-check', selfCheck);

// Reading a transcript before submission (nothing stored); CPU-bound, so limited per IP
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.TRACK_RATE_LIMIT_MAX * 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many files read. Please wait a few minutes and try again.' } },
  keyGenerator: (req) => (req.ip || req.socket.remoteAddress || 'unknown').replace(/:\d+$/, ''),
});
router.post('/transcripts/read', readLimiter, upload.single('file'), readTranscript);

// Student intake (no account needed): draft -> documents -> submit
router.post('/applications/check-email', lookupLimiter, checkExistingApplications);
router.post('/applications/email-numbers', lookupLimiter, emailApplicationNumbers);
router.post('/applications', optionalAuth, submitApplication);
router.patch('/applications/:token', validateSecureToken, updateDraft);
router.post('/applications/:token/submit', validateSecureToken, submitDraft);
router.post('/applications/:token/documents', validateSecureToken, upload.single('file'), uploadDocument);
router.delete('/applications/:token/documents/:documentId', validateSecureToken, removeDraftDocument);

// Track Application: application number + email -> the application's access token
router.post('/track', lookupLimiter, trackApplication);

// Student portal: the signed-in student's own applications (accounts created before applicant-first intake)
router.get('/me/applications', requireAuth, requireRole('student'), myApplications);
router.get('/status/:token', validateSecureToken, getApplicationStatus);
router.get('/status/:token/notifications', validateSecureToken, getStudentNotifications);
// A written reply (JSON) or a file such as the requested syllabus (multipart, field "file")
router.post('/status/:token/info-requests/:requestId/respond', validateSecureToken, upload.single('file'), respondToInfoRequest);

export default router;
