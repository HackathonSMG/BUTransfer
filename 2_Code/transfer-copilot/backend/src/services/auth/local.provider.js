import { pool } from '../../config/db.js';
import { unauthorized } from '../../utils/errors.js';
import * as jose from 'jose';
import env from '../../config/env.js';

function secret() {
  return new TextEncoder().encode(env.LOCAL_JWT_SECRET || 'dev-secret-at-least-32-characters!!');
}

export async function login(email, password) {
  const { rows } = await pool.query(`select id, email from auth.users where email = $1 and raw_user_meta_data->>'password' = $2`, [email, password]);
  if (!rows[0]) throw unauthorized('Invalid email or password');
  const token = await new jose.SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(rows[0].id)
    .setExpirationTime('1h')
    .sign(secret());
  const refreshToken = await new jose.SignJWT({ email, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(rows[0].id)
    .setExpirationTime('7d')
    .sign(secret());
  return {
    session: { accessToken: token, refreshToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    user: { id: rows[0].id, email },
  };
}

export async function refresh(refreshToken) {
  const { payload } = await jose.jwtVerify(refreshToken, secret()).catch(() => { throw unauthorized('Refresh token invalid'); });
  if (payload.type !== 'refresh') throw unauthorized('Not a refresh token');
  const newToken = await new jose.SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('1h')
    .sign(secret());
  const newRefresh = await new jose.SignJWT({ email: payload.email, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('7d')
    .sign(secret());
  return {
    session: { accessToken: newToken, refreshToken: newRefresh, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    user: { id: payload.sub, email: payload.email },
  };
}
