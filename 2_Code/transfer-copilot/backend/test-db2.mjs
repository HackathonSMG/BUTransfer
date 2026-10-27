import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

const base = process.env.DATABASE_URL;

// Try transaction pooler port 6543
const url6543 = base.replace(':5432/', ':6543/');
console.log('Trying port 6543 (Transaction Pooler)...');
const pool2 = new pg.Pool({ connectionString: url6543, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  const { rows } = await pool2.query('SELECT current_user');
  console.log('SUCCESS on 6543:', rows[0]);
} catch (e) {
  console.error('FAIL 6543:', e.code, e.message);
} finally { await pool2.end(); }

// Try Supabase direct (original URL from env example)
console.log('\nTrying direct host (db.*.supabase.co)...');
const urlDirect = base.replace('postgres.srehqamxvolzvosdpzej', 'postgres').replace('aws-0-us-east-1.pooler.supabase.com', 'db.srehqamxvolzvosdpzej.supabase.co');
const poolDirect = new pg.Pool({ connectionString: urlDirect, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  const { rows } = await poolDirect.query('SELECT current_user');
  console.log('SUCCESS direct:', rows[0]);
} catch (e) {
  console.error('FAIL direct:', e.code, e.message);
} finally { await poolDirect.end(); }
