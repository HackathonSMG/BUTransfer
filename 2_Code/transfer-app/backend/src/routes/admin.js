import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { z } from 'zod';
import { listConflicts, recordStandard, recordResolution } from '../services/workflow/knowledge.service.js';
import { badRequest } from '../utils/errors.js';
import { filterSchema, adminCounts, startTerms } from '../services/workflow/period-counts.service.js';
import { getReports, getOverview, getAuditLogs, listCriteria, createCriterion, updateCriterion, deleteCriterion } from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth);

// Equivalency conflicts derived from decisions, equivalencies and open reviews. Administrators and the Credit
// Evaluation Office resolve them; everything else on this router is administrators only.
const CONFLICT_ROLES = requireRole('admin', 'credit_office');
router.get('/conflicts', CONFLICT_ROLES, async (_req, res, next) => {
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
router.post('/conflicts/standard', CONFLICT_ROLES, async (req, res, next) => {
  try {
    const parsed = standardSchema.safeParse(req.body);
    if (!parsed.success) return next(badRequest('Choose the source course and the standard outcome'));
    const d = parsed.data;
    const eq = await recordStandard({ institution: d.institution, courseCode: d.course_code, buCourse: d.bu_course, outcome: d.outcome, note: d.note }, req.user);
    return res.status(200).json({ data: eq });
  } catch (err) { return next(err); }
});
// Marks a conflict resolved without changing the standard (e.g. both outcomes were right for their syllabi)
router.post('/conflicts/resolve', CONFLICT_ROLES, async (req, res, next) => {
  try {
    const parsed = z.object({ institution: z.string().min(1).max(200), course_code: z.string().min(1).max(60), note: z.string().trim().min(3).max(1000) }).safeParse(req.body);
    if (!parsed.success) return next(badRequest('Choose the course and explain the resolution'));
    const d = parsed.data;
    return res.status(200).json({ data: await recordResolution({ institution: d.institution, courseCode: d.course_code, action: 'resolved', note: d.note }, req.user) });
  } catch (err) { return next(err); }
});

router.use(requireRole('admin'));
router.get('/reports', getReports);
router.get('/overview', getOverview);
// Process counts for a period and a BU start term (admin dashboard filter bar)
router.get('/counts', async (req, res, next) => {
  try {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) return next(badRequest('Use a term and dates as YYYY-MM-DD'));
    const [counts, terms] = await Promise.all([adminCounts(parsed.data), startTerms()]);
    return res.status(200).json({ data: { counts, terms, filters: parsed.data } });
  } catch (err) { return next(err); }
});
router.get('/audit-logs', getAuditLogs);
router.get('/criteria', listCriteria);
router.post('/criteria', createCriterion);
router.put('/criteria/:id', updateCriterion);
router.delete('/criteria/:id', deleteCriterion);
export default router;
