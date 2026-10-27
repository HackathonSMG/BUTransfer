/**
 * Knowledge-base matcher: checks equivalencies before the TF-IDF engine.
 * Implements code-format normalisation (CS = CSC = COMP, number must agree).
 */
import { pool } from '../../config/db.js';

const SUBJECT_FAMILIES = [
  ['CS', 'CSC', 'COMP', 'CIS', 'CSCI'],
  ['MA', 'MATH', 'MTH'],
  ['CH', 'CHEM'],
  ['PH', 'PHYS', 'PHY'],
  ['EC', 'ECON'],
  ['BI', 'BIOL', 'BIO'],
  ['WR', 'ENG', 'ENGL'],
  ['PS', 'PSYC', 'PSY'],
];

function familyOf(subj) {
  const s = (subj || '').toUpperCase();
  return SUBJECT_FAMILIES.find((f) => f.includes(s)) || [s];
}

/** Parse 'CS 101' → { subject: 'CS', number: '101' } */
function parseCode(code) {
  const m = /^([A-Z]+[-\s]?[A-Z]*)\s*(\d.*)$/i.exec((code || '').trim());
  if (!m) return null;
  return { subject: m[1].replace(/[-\s]/g, '').toUpperCase(), number: m[2].replace(/[^0-9A-Za-z]/g, '').toUpperCase() };
}

function codeMatch(srcCode, eqCode) {
  const a = parseCode(srcCode), b = parseCode(eqCode);
  if (!a || !b) return false;
  if (a.number !== b.number) return false;
  const fa = familyOf(a.subject), fb = familyOf(b.subject);
  return fa.some((s) => fb.includes(s));
}

/**
 * Find an active equivalency for a source course.
 * @returns { equivalency, matchType, confidence } or null
 */
export async function findEquivalency(institutionId, courseCode, courseTitle, credits, db = pool) {
  // 1. Exact match by source_course_id
  const { rows: exact } = await db.query(
    `select e.*, sc.code as src_code, sc.title as src_title, sc.credits as src_credits
     from public.equivalencies e
     join public.courses sc on sc.id = e.source_course_id
     where sc.institution_id = $1 and lower(sc.code) = lower($2) and e.status = 'active'
     limit 1`,
    [institutionId, courseCode],
  );
  if (exact[0]) return { equivalency: exact[0], matchType: 'exact', confidence: 100 };

  // 2. Alias match
  const { rows: alias } = await db.query(
    `select e.*, sc.code as src_code, sc.title as src_title, sc.credits as src_credits, ea.match_confidence
     from public.equivalency_aliases ea
     join public.equivalencies e on e.id = ea.equivalency_id
     join public.courses sc on sc.id = ea.source_course_id
     where sc.institution_id = $1 and lower(sc.code) = lower($2) and e.status = 'active'
     limit 1`,
    [institutionId, courseCode],
  );
  if (alias[0]) return { equivalency: alias[0], matchType: 'alias', confidence: alias[0].match_confidence || 95 };

  // 3. Code-format fuzzy match (same family, same number)
  const { rows: fuzzy } = await db.query(
    `select e.*, sc.code as src_code, sc.title as src_title, sc.credits as src_credits
     from public.equivalencies e
     join public.courses sc on sc.id = e.source_course_id
     where sc.institution_id = $1 and e.status = 'active'`,
    [institutionId],
  );
  for (const row of fuzzy) {
    if (codeMatch(courseCode, row.src_code)) {
      const sameTitle = (row.src_title || '').toLowerCase() === (courseTitle || '').toLowerCase();
      const sameCredits = Math.abs(parseFloat(row.src_credits) - parseFloat(credits)) < 0.1;
      if (sameTitle || sameCredits) {
        return { equivalency: row, matchType: 'fuzzy', confidence: 98 };
      }
    }
  }

  return null;
}
