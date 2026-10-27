/**
 * Database reset script - drops all tables in reverse dependency order.
 * Usage: node scripts/reset.js
 * Set FORCE_RESET=true to skip confirmation prompt.
 */
import 'dotenv/config';
import readline from 'readline';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SSL = process.env.DATABASE_SSL;
const FORCE_RESET = process.env.FORCE_RESET === 'true';

if (!DATABASE_URL) { console.error('[Reset] ERROR: DATABASE_URL is required'); process.exit(1); }

const TABLES_TO_DROP = ['notifications','audit_logs','information_requests','ai_evaluations','application_documents','applications','eligibility_criteria','evaluators','profiles'];
const ENUMS_TO_DROP = ['info_req_status','ai_eval_status','document_type','application_source','application_status','user_role'];

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });

async function confirm() {
  if (FORCE_RESET) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('\n[Reset] WARNING: This will DROP the following tables (CASCADE):');
    TABLES_TO_DROP.forEach((t) => console.log(`  - ${t}`));
    console.log('\n[Reset] This action is IRREVERSIBLE. Type "yes" to confirm: ');
    rl.question('', (answer) => { rl.close(); resolve(answer.trim().toLowerCase() === 'yes'); });
  });
}

async function reset() {
  const confirmed = await confirm();
  if (!confirmed) { console.log('\n[Reset] Aborted - no changes made.'); process.exit(0); }

  console.log('\n[Reset] Starting database reset...\n');
  const client = await pool.connect();
  try {
    await client.query(`DROP FUNCTION IF EXISTS set_updated_at() CASCADE`);
    await client.query(`DROP FUNCTION IF EXISTS get_my_role() CASCADE`);
    await client.query(`DROP FUNCTION IF EXISTS is_evaluator_or_admin() CASCADE`);
    console.log('[Reset] Dropped functions');

    for (const table of TABLES_TO_DROP) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`[Reset] Dropped table: ${table}`);
    }
    for (const enumType of ENUMS_TO_DROP) {
      await client.query(`DROP TYPE IF EXISTS ${enumType} CASCADE`);
      console.log(`[Reset] Dropped type: ${enumType}`);
    }

    console.log('\n[Reset] Database reset complete.');
    console.log('[Reset] Run "npm run db:migrate" to recreate the schema.');
    console.log('[Reset] Run "npm run db:seed" to add demo data.');
  } catch (err) {
    console.error('[Reset] ERROR during reset:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch((err) => { console.error('[Reset] Fatal error:', err.message); process.exit(1); });
