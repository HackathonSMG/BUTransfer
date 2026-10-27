/**
 * Imports the sponsor's course-match workbook (3_Data/sponsor/BU_Transfer_Program_Course_Match.json, converted
 * from the .xlsx next to it) into catalog_courses and sponsor_course_matches with data_source = 'sponsor'.
 * Sponsor values win for the fields the sponsor supplies (code, title, program, credits, requirement type);
 * descriptions and learning outcomes the sponsor does not supply are kept and marked as synthetic.
 * Prints where synthetic approved equivalencies disagree with the sponsor's matches. Safe to re-run.
 * Run after `npm run db:migrate` and `npm run db:seed:credit`.
 * Usage: node scripts/import-sponsor-data.js [path/to/BU_Transfer_Program_Course_Match.json]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const DEFAULT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../3_Data/sponsor/BU_Transfer_Program_Course_Match.json');

const { DATABASE_URL, DATABASE_SSL } = process.env;
if (!DATABASE_URL) { console.error('[Sponsor import] ERROR: DATABASE_URL is required'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
const data = JSON.parse(fs.readFileSync(process.argv[2] || DEFAULT_FILE, 'utf8'));

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    for (const c of data.courses) {
      const { rows: [row] } = await client.query(
        `INSERT INTO catalog_courses (institution, course_code, title, program, credits, credit_system, requirement_type, verified, notes, source_url,
           data_source, source_file, source_record_id, imported_at)
         VALUES ($1,$2,$3,$4,$5,'Semester',$6,$7,$8,$9,'sponsor',$10,$11,NOW())
         ON CONFLICT (institution, course_code) DO UPDATE SET title = EXCLUDED.title, program = EXCLUDED.program, credits = EXCLUDED.credits,
           requirement_type = EXCLUDED.requirement_type, verified = EXCLUDED.verified, notes = EXCLUDED.notes, source_url = EXCLUDED.source_url,
           data_source = 'sponsor', source_file = EXCLUDED.source_file, source_record_id = EXCLUDED.source_record_id, imported_at = NOW(),
           description_source = CASE WHEN catalog_courses.description IS NULL THEN NULL ELSE COALESCE(catalog_courses.description_source, 'synthetic') END
         RETURNING (xmax = 0) AS inserted`,
        [c.institution, c.course_code, c.title, c.program, c.credits, c.requirement_type, c.verified, c.notes, c.source_url,
          data.source_file, c.source_record_id],
      );
      if (row.inserted) inserted += 1;
    }

    for (const m of data.course_matches) {
      await client.query(
        `INSERT INTO sponsor_course_matches (peer_institution, peer_course, bu_course, program, match_level, notes, data_source, source_file, source_record_id, imported_at)
         VALUES ($1,$2,$3,$4,$5,$6,'sponsor',$7,$8,NOW())
         ON CONFLICT (peer_institution, peer_course, bu_course) DO UPDATE SET program = EXCLUDED.program, match_level = EXCLUDED.match_level,
           notes = EXCLUDED.notes, source_file = EXCLUDED.source_file, source_record_id = EXCLUDED.source_record_id, imported_at = NOW()`,
        [m.peer_institution, m.peer_course, m.bu_course, m.program, m.match_level, m.notes, data.source_file, m.source_record_id],
      );
    }

    // Synthetic approved equivalencies that point somewhere the sponsor's matches do not
    const { rows: conflicts } = await client.query(
      `SELECT e.eq_id, e.institution, e.course_code, e.bu_course, string_agg(s.bu_course || ' (' || s.match_level || ')', ', ') AS sponsor
       FROM equivalencies e JOIN sponsor_course_matches s ON s.peer_institution = e.institution AND s.peer_course = e.course_code
       WHERE e.data_source = 'synthetic' AND e.status = 'active'
       GROUP BY e.eq_id, e.institution, e.course_code, e.bu_course
       HAVING NOT bool_or(s.bu_course = e.bu_course)
       ORDER BY e.eq_id`,
    );

    await client.query('COMMIT');
    console.log(`[Sponsor import] ${data.courses.length} catalog courses (${inserted} new, ${data.courses.length - inserted} updated), ${data.course_matches.length} course matches from ${data.source_file}`);
    if (conflicts.length) {
      console.log(`[Sponsor import] ${conflicts.length} synthetic equivalencies disagree with the sponsor's matches (left unchanged; review them):`);
      for (const c of conflicts) console.log(`  ${c.eq_id} ${c.institution} ${c.course_code} -> ${c.bu_course}; sponsor: ${c.sponsor}`);
    } else {
      console.log('[Sponsor import] Synthetic equivalencies agree with the sponsor matches wherever both exist.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error('[Sponsor import] Fatal error:', err.message); process.exit(1); });
