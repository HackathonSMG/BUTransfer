import { Router } from 'express';
import authRoutes from './auth.js';
import studentRoutes from './student.js';
import applicationsRoutes from './applications.js';
import documentsRoutes from './documents.js';
import evaluatorsRoutes from './evaluators.js';
import adminRoutes from './admin.js';
import notificationsRoutes from './notifications.js';
import intakeRoutes from './intake.js';
import memoryRoutes from './memory.js';
import myRoutes from './my.js';
import officeRoutes from './office.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), service: 'transfer-app-backend', version: process.env.npm_package_version || '1.0.0' });
});

router.use('/auth', authRoutes);
router.use('/student', studentRoutes);
router.use('/applications', applicationsRoutes);
router.use('/documents', documentsRoutes);
router.use('/evaluators', evaluatorsRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/intake', intakeRoutes);
router.use('/memory', memoryRoutes);
router.use('/my', myRoutes);
router.use('/office', officeRoutes);

router.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested API endpoint does not exist' } });
});

export default router;
