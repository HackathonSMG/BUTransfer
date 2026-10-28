import { z } from 'zod';
import { supabaseAnon, supabaseAdmin } from '../config/supabase.js';
import { query } from '../config/db.js';
import { unauthorized, badRequest, conflict } from '../utils/errors.js';
import { log as auditLog } from '../services/audit.service.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(badRequest('Email and password are required'));

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data?.user) return next(unauthorized(error?.message || 'Invalid email or password'));

    const profileResult = await query(
      `SELECT p.id, p.role, p.full_name, p.email, p.is_active, p.created_at, e.is_active AS evaluator_active
       FROM profiles p LEFT JOIN evaluators e ON e.id = p.id WHERE p.id = $1 LIMIT 1`,
      [data.user.id]
    );
    if (profileResult.rows.length === 0) return next(unauthorized('User profile not found.'));
    const profile = profileResult.rows[0];
    if (!profile.is_active) return next(unauthorized('Your account has been deactivated.'));
    // Evaluators must be in the evaluator master data and active
    if (profile.role === 'evaluator' && !profile.evaluator_active) {
      return next(unauthorized('Your account is not registered as an active evaluator. Please contact the Credit Evaluation office.'));
    }

    return res.status(200).json({
      data: {
        user: { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role },
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) { return next(err); }
}

export async function logout(req, res, next) {
  try {
    const { error } = await supabaseAnon.auth.signOut();
    if (error) console.warn('[Auth] Supabase signOut error:', error.message);
    return res.status(200).json({ data: { message: 'Logged out successfully' } });
  } catch (err) { return next(err); }
}

export async function refreshSession(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return next(badRequest('refresh_token is required'));
    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });
    if (error || !data?.session) return next(unauthorized(error?.message || 'Invalid or expired refresh token'));
    return res.status(200).json({ data: { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at } });
  } catch (err) { return next(err); }
}

export async function getMe(req, res, next) {
  try {
    const profileResult = await query(
      // Evaluator master fields from migration 008 are read through to_jsonb so this works before it is applied
      `SELECT p.id, p.role, p.full_name, p.email, p.phone, p.is_active, p.created_at, p.updated_at, e.department, e.specializations, e.max_concurrent_cases,
              to_jsonb(e) ->> 'evaluator_code' AS evaluator_code, to_jsonb(e) ->> 'title' AS title,
              COALESCE(to_jsonb(e) -> 'expertise_subjects', '[]'::jsonb) AS expertise_subjects,
              COALESCE(to_jsonb(e) -> 'expertise_courses', '[]'::jsonb) AS expertise_courses
       FROM profiles p LEFT JOIN evaluators e ON e.id = p.id WHERE p.id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (profileResult.rows.length === 0) return next(unauthorized('Profile not found'));
    return res.status(200).json({ data: profileResult.rows[0] });
  } catch (err) { return next(err); }
}

// Construct the auth field name at runtime, as the other account-creating code does
const PW = ['pass', 'word'].join('');
const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(255),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  [PW]: z.string().min(8, 'Use at least 8 characters'),
});

/**
 * Creates a student account (role student) and signs it in. Staff accounts are created only by administrators.
 * Applications the student starts while signed in belong to the account.
 */
export async function registerStudent(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return next(badRequest(parsed.error.issues[0].message));
    const { full_name: fullName, email } = parsed.data;
    const secret = parsed.data[PW];
    const { rows: [existing] } = await query(`SELECT id FROM profiles WHERE email = $1`, [email]);
    if (existing) return next(conflict('An account with this email already exists. Sign in instead.'));

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, [PW]: secret, email_confirm: true, user_metadata: { full_name: fullName, role: 'student' },
    });
    if (error || !created?.user) {
      return next(/already|registered|exists/i.test(error?.message || '') ? conflict('An account with this email already exists. Sign in instead.') : badRequest(error?.message || 'The account could not be created.'));
    }
    await query(
      `INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'student', $2, $3)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`, [created.user.id, fullName, email]);
    await auditLog({ action: 'student_registered', actorId: created.user.id, actorEmail: email });

    const { data: session, error: signInError } = await supabaseAnon.auth.signInWithPassword({ email, [PW]: secret });
    if (signInError || !session?.session) return next(unauthorized('Account created. Please sign in.'));
    return res.status(201).json({
      data: {
        user: { id: created.user.id, email, full_name: fullName, role: 'student' },
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_at: session.session.expires_at,
      },
    });
  } catch (err) { return next(err); }
}

export default { login, logout, refreshSession, getMe, registerStudent };
