import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });
const url = new URL(process.env.DATABASE_URL);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const host = url.hostname;
const port = parseInt(url.port) || 5432;
const database = url.pathname.replace('/', '');
console.log('Parsed user:', user);
console.log('Parsed host:', host);
console.log('Parsed port:', port);
console.log('Password has special chars:', /[@#$&+,/:;=?@[\]%]/.test(url.password));

// Test with explicit params (bypasses URL parsing issues)
for (const ssl of [{ rejectUnauthorized: false }, false]) {
  const pool = new pg.Pool({ user, password, host, port, database, ssl, connectionTimeoutMillis: 10000 });
  try {
    const r = await pool.query('SELECT current_user');
    console.log(`SUCCESS (ssl=${!!ssl}):`, r.rows[0]);
    await pool.end(); break;
  } catch(e) {
    console.log(`FAIL (ssl=${JSON.stringify(ssl)}):`, e.code, e.message.slice(0,80));
  }
  await pool.end();
}
