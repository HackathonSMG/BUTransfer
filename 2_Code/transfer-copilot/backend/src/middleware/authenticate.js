import { pool } from '../config/db.js';
import { supabase } from '../config/supabase.js';
import { unauthorized } from '../utils/errors.js';
import env from '../config/env.js';
import * as jose from 'jose';

async function verifyLocalToken(token) {
  if (!env.LOCAL_JWT_SECRET) throw unauthorized('LOCAL_JWT_SECRET not configured');
  const secret = new TextEncoder().encode(env.LOCAL_JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);
  return { id: payload.sub, email: payload.email };
}

async function verifySupabaseToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw unauthorized('Invalid or expired token');
  return data.user;
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice(7);

    let userId, email;
    if (env.AUTH_PROVIDER === 'local') {
      const u = await verifyLocalToken(token);
      userId = u.id; email = u.email;
    } else {
      const u = await verifySupabaseToken(token);
      userId = u.id; email = u.email;
    }

    const { rows } = await pool.query(
      `select p.id, p.role, p.full_name, p.email, p.is_active,
              e.id as evaluator_id, s.id as student_id
       from public.profiles p
       left join public.evaluators e on e.profile_id = p.id
       left join public.students  s on s.profile_id  = p.id
       where p.id = $1`,
      [userId],
    );
    if (!rows[0]) throw unauthorized('Profile not found');
    if (!rows[0].is_active) throw unauthorized('Account is disabled');

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
