/**
 * Applies the SQL migrations in supabase/migrations (in file-name order) to DATABASE_URL.
 *
 *   npm run db:migrate             apply pending migrations
 *   npm run db:migrate -- --reset  drop the app schema first (destroys data)
 *
 * With AUTH_PROVIDER=local the local Supabase shim (auth schema, roles) is applied first.
 * You can also paste the migration files into the Supabase SQL editor, or use `supabase db push`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from '../src/config/env.js';
import { pool } from '../src/config/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    if (env.AUTH_PROVIDER === 'local') {
      await client.query(fs.readFileSync(path.join(root, 'supabase/local/000_supabase_shim.sql'), 'utf8'));
      console.log('applied local Supabase shim (auth schema + roles)');
    }
    if (process.argv.includes('--reset')) {
      await client.query(fs.readFileSync(path.join(root, 'supabase/reset.sql'), 'utf8'));
      console.log('dropped application schema');
    }
    await client.query(`create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now());
      alter table public.app_migrations enable row level security;`);
    const done = new Set((await client.query('select name from public.app_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query('begin');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('insert into public.app_migrations (name) values ($1)', [f]);
        await client.query('commit');
        console.log(`applied ${f}`);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${f}: ${e.message}`);
      }
    }
    console.log('migrations up to date');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
