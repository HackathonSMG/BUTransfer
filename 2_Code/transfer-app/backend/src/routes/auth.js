import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { login, logout, refreshSession, getMe, registerStudent } from '../controllers/auth.controller.js';

const router = Router();
router.post('/login', login);
router.post('/register', registerStudent);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refreshSession);
router.get('/me', requireAuth, getMe);
export default router;
