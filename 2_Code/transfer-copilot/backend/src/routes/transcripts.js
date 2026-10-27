import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { pool } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import env from '../config/env.js';
import { evaluateTranscript } from '../services/evaluation.service.js';
import { assignCaseOwner } from '../services/routing.service.js';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// POST /transcripts/upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(badRequest('No file provided'));
    const { studentId, source } = req.body || {};

    let targetStudentId;
    if (req.user.role === 'student') {
      const { rows } = await pool.query(`select id from public.students where profile_id = $1`, [req.user.id]);
      if (!rows[0]) return next(notFound('Student record not found'));
      targetStudentId = rows[0].id;
    } else {
      if (!studentId) return next(badRequest('studentId is required for staff uploads'));
      targetStudentId = studentId;
    }

    // Find or create application
    const { rows: appRows } = await pool.query(
      `select a.id from public.applications a
       where a.student_id = $1 and a.status not in ('completed','withdrawn')
       order by a.submitted_at desc limit 1`,
      [targetStudentId],
    );

    let appId;
    if (appRows[0]) {
      appId = appRows[0].id;
    } else {
      const { rows: season } = await pool.query(`select id from public.seasons where is_current = true limit 1`);
      const { rows: inst } = await pool.query(`select id from public.institutions where is_target = true limit 1`);
      const refNum = `TCR-${new Date().getFullYear().toString().slice(2)}-${Math.floor(Math.random() * 9000) + 1000}`;
      const { rows: newApp } = await pool.query(
        `insert into public.applications (reference, student_id, season_id, target_institution_id, intake_channel)
         values ($1,$2,$3,$4,'online') returning id`,
        [refNum, targetStudentId, season[0]?.id, inst[0]?.id],
      );
      appId = newApp[0].id;
    }

    // Find source institution (default to first non-target)
    const { rows: srcInst } = await pool.query(
      `select id from public.institutions where is_target = false limit 1`);
    const srcInstId = srcInst[0]?.id;

    // Create transcript record
    const { rows: txRows } = await pool.query(
      `insert into public.transcripts (application_id, source_institution_id, channel, file_name, status, source, data_source)
       values ($1,$2,'online',$3,'received',$4,'extracted') returning id`,
      [appId, srcInstId, req.file.originalname, source || 'PORTAL_UPLOAD'],
    );
    const transcriptId = txRows[0].id;

    // Queue processing
    await pool.query(
      `update public.transcripts set process_after = now() where id = $1`, [transcriptId]);

    res.status(201)
      .set('Location', `/api/transcripts/${transcriptId}`)
      .json({ id: transcriptId, applicationId: appId });
  } catch (err) { next(err); }
});

// GET /transcripts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`select * from public.transcripts where id = $1`, [req.params.id]);
    if (!rows[0]) return next(notFound('Transcript not found'));
    res.json({ transcript: rows[0] });
  } catch (err) { next(err); }
});

// GET /transcripts/:id/courses
router.get('/:id/courses', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select * from public.transcript_courses where transcript_id = $1 order by line_no`,
      [req.params.id],
    );
    res.json({ courses: rows });
  } catch (err) { next(err); }
});

// GET /transcripts/:id/processing-status
router.get('/:id/processing-status', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`select status, processed_at from public.transcripts where id = $1`, [req.params.id]);
    if (!rows[0]) return next(notFound('Transcript not found'));
    const tx = rows[0];

    const stages = [
      { key: 'received',   label: 'Transcript received',      status: 'complete', detail: 'File accepted' },
      { key: 'reading',    label: 'Reading document',          status: tx.status === 'received' ? 'pending' : 'complete', detail: 'Parsing PDF / text' },
      { key: 'extracting', label: 'Extracting courses',        status: tx.status === 'processed' ? 'complete' : tx.status === 'processing' ? 'running' : 'pending', detail: 'AI extraction' },
      { key: 'evaluating', label: 'Evaluating courses',        status: tx.status === 'processed' ? 'complete' : 'pending', detail: 'Running rules and knowledge-base lookup' },
      { key: 'routing',    label: 'Assigning to evaluators',   status: tx.status === 'processed' ? 'complete' : 'pending', detail: 'Routing engine' },
      { key: 'ready',      label: 'Ready for review',          status: tx.status === 'processed' ? 'complete' : 'pending', detail: '' },
    ];
    res.json({ status: tx.status, stages, processedAt: tx.processed_at });
  } catch (err) { next(err); }
});

// POST /transcripts/:id/process — re-run
router.post('/:id/process', async (req, res, next) => {
  try {
    await pool.query(`update public.transcripts set status = 'processing', updated_at = now() where id = $1`, [req.params.id]);
    evaluateTranscript(req.params.id, 'reevaluation').then(() => {
      pool.query(`update public.transcripts set status = 'processed', processed_at = now(), updated_at = now() where id = $1`, [req.params.id]);
    }).catch((e) => {
      pool.query(`update public.transcripts set status = 'failed', updated_at = now() where id = $1`, [req.params.id]);
    });
    res.status(202).json({ message: 'Processing started' });
  } catch (err) { next(err); }
});

// GET /transcripts/sources
router.get('/sources', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select t.id, t.channel, t.status, t.received_at, t.process_after,
              a.id as application_id, s.full_name as student_name
       from public.transcripts t
       join public.applications a on a.id = t.application_id
       join public.students st on st.id = a.student_id
       join public.profiles s on s.id = st.profile_id
       order by t.received_at desc limit 50`);
    res.json({ sources: rows });
  } catch (err) { next(err); }
});

export default router;
