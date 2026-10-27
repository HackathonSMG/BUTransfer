process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  const r = await pool.query('SELECT current_database(), current_user, version()');
  console.log('SUCCESS:', JSON.stringify(r.rows[0]));
} catch(e) {
  console.log('FAIL:', e.code, e.message);
}
await pool.end();
