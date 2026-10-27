import { supabaseAdmin } from '../config/supabase.js';
import { query } from '../config/db.js';
import { unauthorized } from '../utils/errors.js';

/**
 * Middleware that validates a Supabase JWT and attaches req.user.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(unauthorized('No authentication token provided'));
    }
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return next(unauthorized('Invalid or expired authentication token'));
    }
    const supabaseUser = data.user;
    const profileResult = await query(
      `SELECT id, role, full_name, email, is_active FROM profiles WHERE id = $1 LIMIT 1`,
      [supabaseUser.id]
    );
    if (profileResult.rows.length === 0) {
      return next(unauthorized('User profile not found. Please contact an administrator.'));
    }
    const profile = profileResult.rows[0];
    if (!profile.is_active) {
      return next(unauthorized('Your account has been deactivated.'));
    }
    req.user = { id: profile.id, email: profile.email, role: profile.role, full_name: profile.full_name };
    req.accessToken = token;
    return next();
  } catch (err) {
    return next(unauthorized('Authentication failed'));
  }
}

export default requireAuth;
