import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { getNotifications, markRead, markAllRead } from '../controllers/notifications.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', getNotifications);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
export default router;
