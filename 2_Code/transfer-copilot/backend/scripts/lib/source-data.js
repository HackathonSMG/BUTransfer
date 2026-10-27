/**
 * Loads all seed CSVs from the data/ directory and returns them as arrays of plain objects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DATA_DIR = path.join(ROOT, 'data');

function csv(relPath) {
  const full = path.join(DATA_DIR, relPath);
  if (!fs.existsSync(full)) { console.warn(`[seed] CSV not found: ${full}`); return []; }
  return parse(fs.readFileSync(full, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
}

export function loadSourceData() {
  return {
    students:          csv('students.csv'),
    transcripts:       csv('transcripts.csv'),
    equivalencies:     csv('equivalency_db.csv'),
    pastDecisions:     csv('past_decisions.csv'),
    syllabi:           csv('syllabi.csv'),
    rules:             csv('rules.csv'),
    worksheetMatch:    csv('worksheet_course_match.csv'),
    worksheetPrograms: csv('worksheet_programs.csv'),
    buCourses:         csv('worksheet/bu_courses.csv'),
    nuCourses:         csv('worksheet/northeastern_courses.csv'),
    nyuCourses:        csv('worksheet/nyu_courses.csv'),
    programs:          csv('worksheet/programs.csv'),
  };
}
