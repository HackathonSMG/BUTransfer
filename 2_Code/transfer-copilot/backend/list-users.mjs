process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data, error } = await sb.auth.admin.listUsers({ perPage: 100 });
if (error) { console.error('Error:', error.message); process.exit(1); }

const users = data.users;
console.log(`Total users: ${users.length}\n`);
users.forEach(u => {
  const meta = u.user_metadata || {};
  const role = meta.role || u.app_metadata?.role || '(none)';
  console.log(`Email: ${u.email}`);
  console.log(`  ID:   ${u.id}`);
  console.log(`  Role: ${role}`);
  console.log(`  Name: ${meta.full_name || meta.name || '(none)'}`);
  console.log(`  Created: ${u.created_at}`);
  console.log('');
});
