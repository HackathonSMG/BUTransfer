import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import * as memoryService from '../services/credit/memory.service.js';

// The decision memory: equivalencies and precedents. Evaluators can read it; only admins revoke or restore.
const router = Router();
router.use(requireAuth, requireRole('evaluator', 'admin', 'credit_office'));

router.get('/', async (_req, res, next) => {
  try {
    return res.status(200).json({ data: await memoryService.getMemory() });
  } catch (err) { return next(err); }
});

router.put('/:kind/:id/status', requireRole('admin', 'credit_office'), async (req, res, next) => {
  try {
    const result = await memoryService.setMemoryStatus(req.params.kind, req.params.id, req.body?.status, req.user);
    return res.status(200).json({ data: result });
  } catch (err) { return next(err); }
});

export default router;
