import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Anonymous Supabase client — use for operations where you respect RLS policies.
 */
export const supabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/**
 * Admin Supabase client — uses SERVICE_ROLE_KEY to bypass RLS.
 * NEVER expose this key to the client. Use only server-side.
 */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export default { supabaseAnon, supabaseAdmin };
