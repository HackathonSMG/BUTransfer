import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

const url = process.env.DATABASE_URL;
console.log('Connecting to:', url.replace(/:([^:@]+)@/, ':***@'));

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  const { rows } = await pool.query('SELECT current_database(), current_user, version()');
  console.log('SUCCESS:', rows[0]);
} catch (e) {
  console.error('ERROR code:', e.code);
  console.error('ERROR msg:', e.message);
} finally {
  await pool.end();
}
