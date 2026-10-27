import { createClient } from '@supabase/supabase-js';
import env from './env.js';

/** Public client — anon key. Used for signInWithPassword and verifying access tokens. */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Service-role client — bypasses RLS. Used by seed scripts and Storage uploads. */
export const supabaseAdmin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
