import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });
const pass = process.env.DATABASE_URL.match(/:([^@]+)@/)[1];
const regions = ['us-east-1','us-west-1','eu-west-1','ap-southeast-1','ap-northeast-1','sa-east-1'];
for (const r of regions) {
  const url = `postgresql://postgres.srehqamxvolzvosdpzej:${pass}@aws-0-${r}.pooler.supabase.com:5432/postgres`;
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await pool.query('SELECT 1');
    console.log('SUCCESS region:', r);
    await pool.end(); break;
  } catch (e) {
    console.log(`FAIL ${r}: ${e.message.slice(0,60)}`);
  }
  await pool.end();
}
