import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import * as memoryService from '../services/credit/memory.service.js';
import * as equivalencyAdmin from '../services/credit/equivalency-admin.service.js';
import { badRequest } from '../utils/errors.js';

// The decision memory: equivalencies and precedents. Evaluators can read it and propose equivalencies; the Credit
// Evaluation Office and administrators approve proposals, add, revoke and restore; administrators import in bulk.
const router = Router();
router.use(requireAuth, requireRole('evaluator', 'admin', 'credit_office'));

const MANAGERS = requireRole('admin', 'credit_office');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okType = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype);
    if (okType || /\.csv$/i.test(file.originalname || '')) cb(null, true);
    else cb(badRequest('Choose a .csv file.'), false);
  },
});
// The global handler words a size error with the general upload limit; this import has its own
const singleCsv = (req, res, next) => csvUpload.single('file')(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return next(badRequest('The CSV file must be 2 MB or smaller.'));
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest('Upload the CSV in the "file" field.'));
  return next(err);
});

router.get('/', async (_req, res, next) => {
  try {
    return res.status(200).json({ data: await memoryService.getMemory() });
  } catch (err) { return next(err); }
});

// BU catalog search for the add / propose forms
router.get('/bu-courses', async (req, res, next) => {
  try {
    return res.status(200).json({ data: await equivalencyAdmin.searchBuCourses(req.query.search) });
  } catch (err) { return next(err); }
});

// Proposals: evaluators see their own, the office and administrators see all
router.get('/proposals', async (req, res, next) => {
  try {
    return res.status(200).json({ data: await equivalencyAdmin.listProposals(req.user, { status: req.query.status }) });
  } catch (err) { return next(err); }
});

router.post('/proposals', async (req, res, next) => {
  try {
    return res.status(201).json({ data: await equivalencyAdmin.propose(req.body || {}, req.user) });
  } catch (err) { return next(err); }
});

router.post('/proposals/:id/approve', MANAGERS, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid proposal id'));
    return res.status(200).json({ data: await equivalencyAdmin.approveProposal(req.params.id, req.body || {}, req.user) });
  } catch (err) { return next(err); }
});

router.post('/proposals/:id/reject', MANAGERS, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid proposal id'));
    return res.status(200).json({ data: await equivalencyAdmin.rejectProposal(req.params.id, req.body || {}, req.user) });
  } catch (err) { return next(err); }
});

// Direct add by the office or an administrator; replacing a different active equivalency needs replace: true
router.post('/equivalencies', MANAGERS, async (req, res, next) => {
  try {
    return res.status(201).json({ data: await equivalencyAdmin.addEquivalency(req.body || {}, req.user) });
  } catch (err) { return next(err); }
});

// Bulk import (administrators): preview a CSV, then commit the previewed rows
router.post('/equivalencies/import/preview', requireRole('admin'), singleCsv, async (req, res, next) => {
  try {
    if (!req.file) return next(badRequest('Choose a CSV file to import.'));
    return res.status(200).json({ data: await equivalencyAdmin.previewImport(req.file.buffer, req.user) });
  } catch (err) { return next(err); }
});

router.post('/equivalencies/import/commit', requireRole('admin'), async (req, res, next) => {
  try {
    return res.status(200).json({ data: await equivalencyAdmin.commitImport(req.body || {}, req.user) });
  } catch (err) { return next(err); }
});

router.put('/:kind/:id/status', MANAGERS, async (req, res, next) => {
  try {
    const result = await memoryService.setMemoryStatus(req.params.kind, req.params.id, req.body?.status, req.user);
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
});

export default router;
