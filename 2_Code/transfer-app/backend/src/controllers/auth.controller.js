import { supabaseAnon } from '../config/supabase.js';
import { query } from '../config/db.js';
import { unauthorized, badRequest } from '../utils/errors.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(badRequest('Email and password are required'));

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data?.user) return next(unauthorized(error?.message || 'Invalid email or password'));

    const profileResult = await query(
      `SELECT id, role, full_name, email, is_active, created_at FROM profiles WHERE id = $1 LIMIT 1`,
      [data.user.id]
    );
    if (profileResult.rows.length === 0) return next(unauthorized('User profile not found.'));
    const profile = profileResult.rows[0];
    if (!profile.is_active) return next(unauthorized('Your account has been deactivated.'));

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
      `SELECT p.id, p.role, p.full_name, p.email, p.phone, p.is_active, p.created_at, p.updated_at, e.department, e.specializations, e.max_concurrent_cases
       FROM profiles p LEFT JOIN evaluators e ON e.id = p.id WHERE p.id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (profileResult.rows.length === 0) return next(unauthorized('Profile not found'));
    return res.status(200).json({ data: profileResult.rows[0] });
  } catch (err) { return next(err); }
}

export default { login, logout, refreshSession, getMe };
