import { Router } from 'express';
import authRoutes           from './auth.js';
import studentRoutes        from './students.js';
import evaluatorRoutes      from './evaluators.js';
import applicationRoutes    from './applications.js';
import evaluationRoutes     from './evaluations.js';
import courseEvalRoutes     from './course-evaluations.js';
import catalogRoutes        from './catalog.js';
import notificationRoutes   from './notifications.js';
import knowledgeRoutes      from './knowledge.js';
import transcriptRoutes     from './transcripts.js';
import adminRoutes          from './admin.js';

const router = Router();

// Health check (unauthenticated)
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Demo sample files
router.get('/demo/samples/:file', (req, res, next) => {
  import('node:path').then(({ default: path }) => {
    import('node:url').then(({ fileURLToPath }) => {
      const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples');
      res.sendFile(path.join(dir, req.params.file), (err) => { if (err) next(); });
    });
  }).catch(next);
});

router.use('/auth',              authRoutes);
router.use('/students',          studentRoutes);
router.use('/evaluators',        evaluatorRoutes);
router.use('/applications',      applicationRoutes);
router.use('/evaluations',       evaluationRoutes);
router.use('/course-evaluations', courseEvalRoutes);
router.use('/catalog',           catalogRoutes);
router.use('/notifications',     notificationRoutes);
router.use('/transcripts',       transcriptRoutes);
router.use('/intake',            adminRoutes);
router.use('/admin',             adminRoutes);
router.use('/assignments',       adminRoutes);
router.use('/search',            adminRoutes);

// Knowledge base routes (equivalencies + knowledge/)
router.use('/knowledge',         knowledgeRoutes);
router.use('/equivalencies',     knowledgeRoutes);

export default router;
