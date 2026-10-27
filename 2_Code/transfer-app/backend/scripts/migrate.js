/**
 * Migration runner - executes SQL files in supabase/migrations/ alphabetically.
 * Usage: node scripts/migrate.js
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SSL = process.env.DATABASE_SSL;

if (!DATABASE_URL) { console.error('[Migrate] ERROR: DATABASE_URL is required'); process.exit(1); }

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
  if (!fs.existsSync(migrationsDir)) { console.error(`[Migrate] Migrations directory not found: ${migrationsDir}`); process.exit(1); }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) { console.log('[Migrate] No migration files found'); return; }

  console.log(`[Migrate] Found ${files.length} migration file(s):`);
  files.forEach((f) => console.log(`  * ${f}`));
  console.log();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      // Strip the UTF-8 BOM some editors add; Postgres rejects it as a syntax error.
      const sql = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
      console.log(`[Migrate] Running: ${file} ...`);
      const start = Date.now();
      try {
        await client.query(sql);
        console.log(`[Migrate]   OK ${file} completed in ${Date.now() - start}ms`);
      } catch (err) {
        console.error(`[Migrate]   FAILED ${file}: ${err.message}`);
        throw err;
      }
    }
    console.log('\n[Migrate] All migrations completed successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => { console.error('[Migrate] Fatal error:', err.message); process.exit(1); });
