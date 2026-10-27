process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const PASSWORD = 'TransferDemo!2026';

const USERS = [
  { email: 'student@demo.bu.edu',   role: 'student',   full_name: 'Maya Ortiz' },
  { email: 'admin@demo.bu.edu',     role: 'admin',     full_name: 'Registrar Admin' },
  { email: 'evaluator@demo.bu.edu', role: 'evaluator', full_name: 'Dana Whitfield' },
];

for (const u of USERS) {
  // Check if already exists
  const { data: existing } = await sb.auth.admin.listUsers({ perPage: 100 });
  const found = existing?.users?.find(x => x.email === u.email);

  if (found) {
    // Update role metadata
    const { error: ue } = await sb.auth.admin.updateUserById(found.id, {
      user_metadata: { full_name: u.full_name, role: u.role },
      app_metadata:  { role: u.role },
    });
    console.log(`UPDATED  ${u.email} (${u.role}) ${ue ? '❌ ' + ue.message : '✓'}`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role },
      app_metadata:  { role: u.role },
    });
    console.log(`CREATED  ${u.email} (${u.role}) ${error ? '❌ ' + error.message : '✓  id=' + data?.user?.id}`);
  }
}

console.log('\nDone.');
