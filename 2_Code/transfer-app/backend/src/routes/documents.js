import { Router } from 'express';
import multer from 'multer';
import * as documentService from '../services/document.service.js';
import * as notificationService from '../services/notification.service.js';
import { query } from '../config/db.js';
import { badRequest, notFound, unauthorized, forbidden } from '../utils/errors.js';
import { env } from '../config/env.js';
import { reviewedOf } from '../utils/reviewed.js';

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

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(badRequest('No file was uploaded'));
    const { application_id, document_type = 'other', notes } = req.body;
    if (!application_id) return next(badRequest('application_id is required'));

    let uploadedBy = null;
    let uploadSource = 'student';
    let isAuthenticated = false;
    let staffName = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { supabaseAdmin } = await import('../config/supabase.js');
      const token = authHeader.slice(7);
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) {
        const profileResult = await query(`SELECT id, role, full_name, email FROM profiles WHERE id = $1 LIMIT 1`, [data.user.id]);
        if (profileResult.rows.length > 0) {
          // Transcripts and syllabi come from the student; evaluators view them but never upload them
          if (profileResult.rows[0].role === 'evaluator') return next(forbidden('Evaluators cannot upload application documents.'));
          uploadedBy = profileResult.rows[0].id;
          uploadSource = profileResult.rows[0].role === 'student' ? 'student' : 'evaluator';
          isAuthenticated = true;
          if (uploadSource === 'evaluator') staffName = profileResult.rows[0].full_name || profileResult.rows[0].email;
        }
      }
    }

    if (!isAuthenticated) {
      const token = req.query.token;
      if (!token) return next(badRequest('Authentication required: provide a JWT or secure token'));
      const appResult = await query(`SELECT id FROM applications WHERE secure_token = $1 AND id = $2 LIMIT 1`, [token, application_id]);
      if (appResult.rows.length === 0) return next(notFound('Application'));
    }

    // Staff uploading for a student: the transcript goes with what was confirmed on the review step (as for the
    // student's own upload), and a draft created on the student's behalf says who uploaded it
    let reviewed = null;
    let documentNotes = notes || null;
    if (staffName) {
      if (document_type === 'transcript') reviewed = reviewedOf(req.body.reviewed);
      const { rows: [target] } = await query(`SELECT additional_info FROM applications WHERE id = $1 LIMIT 1`, [application_id]);
      if (!documentNotes && target?.additional_info?.submitted_on_behalf) documentNotes = `Uploaded by ${staffName} on behalf of the student`;
    }

    const document = await documentService.uploadDocument({ buffer: req.file.buffer, originalName: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype, applicationId: application_id, documentType: document_type, uploadedBy, uploadSource, notes: documentNotes, reviewed });

    const appResult = await query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [application_id]);
    if (appResult.rows.length > 0 && appResult.rows[0].assigned_evaluator_id) {
      await notificationService.documentUploaded(appResult.rows[0], document).catch(() => {});
    }

    return res.status(201).json({ data: { document_id: document.id, file_name: document.file_name, document_type: document.document_type, file_size: document.file_size, mime_type: document.mime_type, created_at: document.created_at } });
  } catch (err) { return next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    let requestorId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { supabaseAdmin } = await import('../config/supabase.js');
      const token = authHeader.slice(7);
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) requestorId = data.user.id;
    }

    if (!requestorId) {
      const token = req.query.token;
      if (!token) return next(unauthorized('Authentication required: provide a JWT or secure token'));
      const docResult = await query(
        `SELECT 1 FROM application_documents ad JOIN applications a ON a.id = ad.application_id WHERE ad.id = $1 AND a.secure_token::text = $2 LIMIT 1`,
        [req.params.id, token]
      );
      if (docResult.rows.length === 0) return next(notFound('Document'));
    }

    const { document, url } = await documentService.getDocument(req.params.id, requestorId);
    return res.status(200).json({ data: { ...document, download_url: url, url_expires_in_seconds: 3600 } });
  } catch (err) { return next(err); }
});

export default router;
