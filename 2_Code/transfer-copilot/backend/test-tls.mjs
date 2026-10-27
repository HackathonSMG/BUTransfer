process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });

// Test supabase-js auth
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
console.log('Auth listUsers:', error ? 'FAIL: ' + error.message : 'OK, users: ' + data?.users?.length);

// Test pg with pooler
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  const r = await pool.query('SELECT current_database()');
  console.log('pg pool: OK -', r.rows[0]);
} catch(e) {
  console.log('pg pool FAIL:', e.code, e.message);
}
await pool.end();
