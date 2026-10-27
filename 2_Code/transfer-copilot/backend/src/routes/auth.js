import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import { pool } from '../config/db.js';
import { supabaseAdmin } from '../config/supabase.js';
import { badRequest } from '../utils/errors.js';
import env from '../config/env.js';
import * as supabaseProvider from '../services/auth/supabase.provider.js';
import * as localProvider from '../services/auth/local.provider.js';

async function getProfileById(userId) {
  if (!supabaseAdmin) return {};
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, email, evaluators(id, unit, subject_codes, specializations, avatar_tone), students(id, student_number)')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return {};
  return {
    id: data.id, role: data.role, full_name: data.full_name, email: data.email,
    evaluator_id: data.evaluators?.[0]?.id ?? null,
    unit: data.evaluators?.[0]?.unit ?? null,
    subject_codes: data.evaluators?.[0]?.subject_codes ?? null,
    specializations: data.evaluators?.[0]?.specializations ?? null,
    avatar_tone: data.evaluators?.[0]?.avatar_tone ?? null,
    student_id: data.students?.[0]?.id ?? null,
    student_number: data.students?.[0]?.student_number ?? null,
  };
}

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function provider() {
  return env.AUTH_PROVIDER === 'local' ? localProvider : supabaseProvider;
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw badRequest('email and password are required');
    const result = await provider().login(email, password);
    const profile = await getProfileById(result.user.id);
    res.json({ ...result, user: { ...result.user, ...profile } });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw badRequest('refreshToken is required');
    const result = await provider().refresh(refreshToken);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const profile = await getProfileById(req.user.id);
    res.json({ user: { ...req.user, ...profile } });
  } catch (err) { next(err); }
});

router.post('/logout', authenticate, (req, res) => res.status(204).end());

router.get('/demo-accounts', async (req, res, next) => {
  if (!env.DEMO_MODE) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Demo mode is disabled' } });
  try {
    if (!supabaseAdmin) return res.json({ accounts: [], password: env.DEMO_PASSWORD });
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, role, evaluators(unit, avatar_tone, title, subject_codes), students(student_number)')
      .eq('is_active', true)
      .order('role')
      .limit(30);
    const accounts = (data || []).map((p) => ({
      email: p.email, full_name: p.full_name, role: p.role,
      unit: p.evaluators?.[0]?.unit,
      avatar_tone: p.evaluators?.[0]?.avatar_tone,
      title: p.evaluators?.[0]?.title,
      subject_codes: p.evaluators?.[0]?.subject_codes,
      student_number: p.students?.[0]?.student_number,
    }));
    res.json({ accounts, password: env.DEMO_PASSWORD });
  } catch (err) { next(err); }
});

export default router;
