import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { getReports, getOverview, getAuditLogs, listCriteria, createCriterion, updateCriterion, deleteCriterion } from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/reports', getReports);
router.get('/overview', getOverview);
router.get('/audit-logs', getAuditLogs);
router.get('/criteria', listCriteria);
router.post('/criteria', createCriterion);
router.put('/criteria/:id', updateCriterion);
router.delete('/criteria/:id', deleteCriterion);
export default router;
