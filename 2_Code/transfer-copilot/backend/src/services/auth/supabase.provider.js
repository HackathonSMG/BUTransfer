import { supabase } from '../../config/supabase.js';
import { unauthorized } from '../../utils/errors.js';

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw unauthorized('Invalid email or password');
  return {
    session: {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt:    data.session.expires_at,
    },
    user: { id: data.user.id, email: data.user.email },
  };
}

export async function refresh(refreshToken) {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) throw unauthorized('Session expired — please sign in again');
  return {
    session: {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt:    data.session.expires_at,
    },
    user: { id: data.user.id, email: data.user.email },
  };
}
