/**
 * npm run db:seed — (re)creates all demo data in the database at DATABASE_URL.
 *
 *  - Supabase Auth users for every demo account (service-role key, server-side only); with
 *    AUTH_PROVIDER=local the local auth.users shim is used instead
 *  - reference data: sponsor worksheet first (institutions, programs, course codes/titles/credits,
 *    course-match levels), Synthetic Data where the worksheet has nothing (descriptions, students, ...)
 *  - applications + transcripts, evaluated and routed by the same intake service the API uses
 *
 * Existing application data is replaced. Auth users are updated in place, never deleted.
 */
import env from '../src/config/env.js';
import { pool, withTransaction } from '../src/config/db.js';
import { loadSourceData } from './lib/source-data.js';
import { clearAll, seedReference, seedPeople, seedApplications, processAll } from '../src/seed/seed.js';

async function main() {
  const src = loadSourceData();
  const t0 = Date.now();
  await withTransaction(async (db) => {
    await clearAll(db);
    const ref = await seedReference(db, src);
    console.log('reference data: institutions, programs, catalog, worksheet matches, equivalencies, past decisions, rules, seasons');
    const people = await seedPeople(db, src, ref);
    console.log(`people: ${Object.keys(people.evaluators).length} evaluators, ${Object.keys(people.students).length} students, 1 administrator (auth: ${env.AUTH_PROVIDER})`);
    const apps = await seedApplications(db, src, ref, people);
    await processAll(db, apps);
    console.log(`applications: ${Object.keys(apps).length} (evaluated and routed by the intake agent; 1 waiting in the intake queue)`);
  });
  const { rows } = await pool.query(`select status, count(*)::int as n from public.applications group by status order by status`);
  console.log('application status:', rows.map((r) => `${r.status} ${r.n}`).join(', '));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Demo password for every account: ${env.DEMO_MODE ? env.DEMO_PASSWORD : '(DEMO_PASSWORD)'}`);
  await pool.end();
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
