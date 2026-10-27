import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { z } from 'zod';
import { listConflicts, recordStandard } from '../services/workflow/knowledge.service.js';
import { badRequest } from '../utils/errors.js';
import { getReports, getOverview, getAuditLogs, listCriteria, createCriterion, updateCriterion, deleteCriterion } from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/reports', getReports);
router.get('/overview', getOverview);

// Equivalency conflicts derived from decisions, equivalencies and open reviews
router.get('/conflicts', async (_req, res, next) => {
  try { return res.status(200).json({ data: await listConflicts() }); } catch (err) { return next(err); }
});

const standardSchema = z.object({
  institution: z.string().min(1).max(200),
  course_code: z.string().min(1).max(60),
  outcome: z.enum(['BU equivalent', 'Elective credit', 'No credit']).default('BU equivalent'),
  bu_course: z.string().max(200).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

// Records the standard equivalency that resolves a conflict; applies to future transcripts only
router.post('/conflicts/standard', async (req, res, next) => {
  try {
    const parsed = standardSchema.safeParse(req.body);
    if (!parsed.success) return next(badRequest('Choose the source course and the standard outcome'));
    const d = parsed.data;
    const eq = await recordStandard({ institution: d.institution, courseCode: d.course_code, buCourse: d.bu_course, outcome: d.outcome, note: d.note }, req.user);
    return res.status(200).json({ data: eq });
  } catch (err) { return next(err); }
});
router.get('/audit-logs', getAuditLogs);
router.get('/criteria', listCriteria);
router.post('/criteria', createCriterion);
router.put('/criteria/:id', updateCriterion);
router.delete('/criteria/:id', deleteCriterion);
export default router;
