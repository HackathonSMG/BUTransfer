process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

console.log('ANON KEY:', process.env.SUPABASE_ANON_KEY?.substring(0, 30) + '...');
console.log('URL:', process.env.SUPABASE_URL);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data, error } = await sb.auth.signInWithPassword({
  email: 'student@demo.bu.edu',
  password: 'TransferDemo!2026'
});

if (error) {
  console.log('ERROR:', error.message, error.status);
} else {
  console.log('SUCCESS! User:', data.user?.email, 'Session:', !!data.session);
}
