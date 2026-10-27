process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check if tables exist by querying profiles
const { data, error } = await sb.from('profiles').select('id').limit(1);
if (error) {
  console.log('Tables status:', error.code, error.message);
} else {
  console.log('Tables exist! profiles rows:', data?.length);
}

// Check institutions
const { data: inst, error: e2 } = await sb.from('institutions').select('name').limit(3);
if (e2) console.log('institutions:', e2.message);
else console.log('institutions:', inst?.map(i => i.name));
