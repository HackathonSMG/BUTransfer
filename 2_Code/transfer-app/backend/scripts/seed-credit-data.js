/**
 * Loads the transfer credit reference data (catalog, equivalencies, past decisions, rules, syllabi)
 * from the hackathon sample data. Safe to re-run: every row is upserted.
 * Usage: node scripts/seed-credit-data.js [path/to/all_data.json]
 */
import 'dotenv/config';
import pg from 'pg';
import { loadSampleData } from '../src/services/credit/sample-data.js';

const { DATABASE_URL, DATABASE_SSL } = process.env;
if (!DATABASE_URL) { console.error('[Seed credit] ERROR: DATABASE_URL is required'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
const data = loadSampleData(process.argv[2]);
const orNull = (v) => (v === '' || v === undefined ? null : v);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const syllabi = new Map(data.syllabi.map((s) => [`${s.institution}|${s.course_code}`, s.syllabus]));

    // All of this sample data is synthetic; rows the sponsor import owns keep the sponsor's title, program and credits
    for (const c of data.catalog) {
      await client.query(
        `INSERT INTO catalog_courses (institution, course_code, title, program, credits, credit_system, level, description, learning_outcomes, syllabus,
           data_source, description_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic',CASE WHEN $8::text IS NULL THEN NULL ELSE 'synthetic' END)
         ON CONFLICT (institution, course_code) DO UPDATE SET
           title = CASE WHEN catalog_courses.data_source = 'sponsor' THEN catalog_courses.title ELSE EXCLUDED.title END,
           program = CASE WHEN catalog_courses.data_source = 'sponsor' THEN catalog_courses.program ELSE EXCLUDED.program END,
           credits = CASE WHEN catalog_courses.data_source = 'sponsor' THEN catalog_courses.credits ELSE EXCLUDED.credits END,
           credit_system = EXCLUDED.credit_system, level = EXCLUDED.level, description = EXCLUDED.description,
           learning_outcomes = EXCLUDED.learning_outcomes, syllabus = EXCLUDED.syllabus, description_source = EXCLUDED.description_source`,
        [c.institution, c.course_code, c.title, c.program, c.credits, c.credit_system, c.level, orNull(c.description), orNull(c.learning_outcomes),
          syllabi.get(`${c.institution}|${c.course_code}`) || null],
      );
    }
    for (const e of data.equivalencies) {
      await client.query(
        `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, dept, approved_on, evaluator, data_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'synthetic')
         ON CONFLICT (eq_id) DO UPDATE SET institution = EXCLUDED.institution, course_code = EXCLUDED.course_code, title = EXCLUDED.title,
           bu_course = EXCLUDED.bu_course, outcome = EXCLUDED.outcome, dept = EXCLUDED.dept, approved_on = EXCLUDED.approved_on, evaluator = EXCLUDED.evaluator`,
        [e.eq_id, e.institution, e.course_code, e.title, orNull(e.bu_course), e.outcome, orNull(e.dept), orNull(e.approved_on), orNull(e.evaluator)],
      );
    }
    for (const p of data.pastDecisions) {
      await client.query(
        `INSERT INTO past_decisions (decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, credit_system, decided_on, evaluator, days_to_decision, data_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic')
         ON CONFLICT (decision_id) DO UPDATE SET institution = EXCLUDED.institution, course_code = EXCLUDED.course_code, proposed_bu = EXCLUDED.proposed_bu,
           decision = EXCLUDED.decision, bu_awarded = EXCLUDED.bu_awarded, reason = EXCLUDED.reason, credit_system = EXCLUDED.credit_system,
           decided_on = EXCLUDED.decided_on, evaluator = EXCLUDED.evaluator, days_to_decision = EXCLUDED.days_to_decision`,
        [p.decision_id, p.institution, p.course_code, orNull(p.proposed_bu), p.decision, orNull(p.bu_awarded), orNull(p.reason), orNull(p.credit_system),
          orNull(p.decided_on), orNull(p.evaluator), p.days_to_decision],
      );
    }
    for (const r of data.rules) {
      await client.query(
        `INSERT INTO transfer_rules (rule_id, rule, detail, applies_to, source) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (rule_id) DO UPDATE SET rule = EXCLUDED.rule, detail = EXCLUDED.detail, applies_to = EXCLUDED.applies_to, source = EXCLUDED.source`,
        [r.rule_id, r.rule, r.detail, r.applies_to, r.source],
      );
    }
    await client.query('COMMIT');
    console.log(`[Seed credit] Catalog ${data.catalog.length}, equivalencies ${data.equivalencies.length}, past decisions ${data.pastDecisions.length}, rules ${data.rules.length}, syllabi ${data.syllabi.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => { console.error('[Seed credit] Fatal error:', err.message); process.exit(1); });
