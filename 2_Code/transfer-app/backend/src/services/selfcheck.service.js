// Student self-check (Problem 1, step 1): before or while applying, a student previews how their courses are
// likely to be treated, from the same equivalency database, past decisions and BU course-match catalog the
// Credit Evaluation Office uses. It is guidance only: nothing is stored and nothing here is an official decision.
import { query } from '../config/db.js';
import { POLICY, gradeEligibility, courseKey, buCredits } from './credit/policy.js';
import { badRequest } from '../utils/errors.js';

const BU = 'Boston University';
const MAX_COURSES = 20;

/** Institutions with course information on file, for the self-check form. */
export async function selfCheckInstitutions() {
  const { rows } = await query(
    `SELECT institution, COUNT(*)::int AS courses FROM (
       SELECT institution, course_code FROM catalog_courses WHERE institution <> $1
       UNION SELECT institution, course_code FROM equivalencies WHERE status = 'active'
     ) x GROUP BY institution ORDER BY institution`, [BU]);
  return rows;
}

const SPONSOR_GUIDANCE = {
  'Likely equivalent': { status: 'likely', note: 'Listed as a likely equivalent. A department evaluator confirms it.' },
  'Partial - syllabus review': { status: 'maybe', note: 'A possible match. The department will probably need the syllabus.' },
  'Must be taken at BU': { status: 'maybe', note: 'The matching BU course must be taken at BU. The course may still count as elective credit.' },
};

/**
 * @param {{ institution: string, courses: Array<{course_code, title?, credits?, credit_system?, grade?}> }} input
 */
export async function selfCheck({ institution, courses }) {
  if (!institution) throw badRequest('Choose the college you attended.');
  if (!Array.isArray(courses) || !courses.length) throw badRequest('Add at least one course.');
  if (courses.length > MAX_COURSES) throw badRequest(`Check up to ${MAX_COURSES} courses at a time.`);

  const [catalog, equivalencies, decisions, sponsor, buTitles] = await Promise.all([
    query(`SELECT course_code, title, description IS NOT NULL AND description <> '' AS has_description FROM catalog_courses WHERE institution = $1`, [institution]),
    query(`SELECT course_code, bu_course, outcome FROM equivalencies WHERE institution = $1 AND status = 'active'`, [institution]),
    query(`SELECT course_code, decision, bu_awarded, decided_on FROM past_decisions WHERE institution = $1 AND status = 'active' ORDER BY decided_on DESC NULLS LAST`, [institution]),
    query(`SELECT peer_course, bu_course, match_level FROM sponsor_course_matches WHERE peer_institution = $1`, [institution]),
    query(`SELECT course_code, title FROM catalog_courses WHERE institution = $1`, [BU]),
  ]);
  const byKey = (rows, field = 'course_code') => {
    const m = new Map();
    for (const r of rows) { const k = courseKey(r[field]); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  const cat = byKey(catalog.rows);
  const eq = byKey(equivalencies.rows);
  const dec = byKey(decisions.rows);
  const sp = byKey(sponsor.rows, 'peer_course');
  const titleOf = new Map(buTitles.rows.map((r) => [r.course_code, r.title]));
  const withTitle = (award) => (titleOf.get(award) ? `${award} ${titleOf.get(award)}` : award);

  const results = courses.map((c) => {
    const code = String(c.course_code || '').trim();
    const k = courseKey(code);
    const notes = [];
    let status;
    let likely = null;
    let summary;

    const e = eq.get(k)?.[0];
    const d = dec.get(k) || [];
    const s = (sp.get(k) || []).sort((a, b) => Object.keys(SPONSOR_GUIDANCE).indexOf(a.match_level) - Object.keys(SPONSOR_GUIDANCE).indexOf(b.match_level))[0];
    const known = cat.get(k)?.[0];
    if (e) {
      status = 'established';
      likely = e.outcome === 'No credit' ? 'No credit' : e.bu_course && e.outcome !== 'Elective credit' ? withTitle(e.bu_course) : 'Elective credit';
      summary = 'This course has an established equivalency. It is normally applied without a syllabus.';
    } else if (d.length) {
      const awards = [...new Set(d.map((x) => x.bu_awarded).filter((x) => x && x !== '—'))];
      status = awards.length > 1 ? 'maybe' : 'previously_evaluated';
      likely = awards.length === 1 ? withTitle(awards[0]) : d[0].decision;
      summary = awards.length > 1
        ? 'This course has been evaluated before with different results, so a department evaluator will review it.'
        : 'This course has been evaluated before. A department evaluator confirms the result for your transcript.';
    } else if (s) {
      status = SPONSOR_GUIDANCE[s.match_level]?.status || 'maybe';
      likely = withTitle(s.bu_course);
      summary = SPONSOR_GUIDANCE[s.match_level]?.note || 'A possible match.';
    } else if (known?.has_description) {
      status = 'maybe';
      summary = 'Not evaluated before. A department evaluator will compare its description with BU courses; a syllabus may be requested.';
    } else {
      status = 'syllabus_needed';
      summary = 'We have no description of this course. Expect to send the syllabus so the department can compare it.';
    }

    if (c.grade) {
      const g = gradeEligibility(c.grade);
      if (g.eligible === false) notes.push(`With grade ${g.grade || c.grade}, this course would not earn credit (BU requires ${POLICY.minimumGrade} or higher).`);
      else if (g.grade === 'P') notes.push(`A Pass grade is reviewed by the department to confirm it meets the ${POLICY.minimumGrade} minimum.`);
      else if (g.eligible === null) notes.push('The final grade will be needed before credit can be awarded.');
    }
    // An established "No credit" equivalency earns nothing, whatever the course's credits
    const units = e?.outcome === 'No credit' ? 0 : buCredits(c.credits, c.credit_system);
    if (units != null && /quarter/i.test(c.credit_system || '')) notes.push(`Quarter credits convert to two-thirds: ${Number(c.credits)} quarter credits = ${units} BU credits.`);

    return {
      course_code: code,
      title: c.title || known?.title || null,
      status,
      likely_bu_course: likely,
      estimated_units: units,
      summary,
      notes,
      syllabus_recommended: ['maybe', 'syllabus_needed'].includes(status),
    };
  });

  return {
    institution,
    disclaimer: 'Self-check only. This is not an official transfer credit decision; academic departments make the final decision after you submit your official transcripts.',
    documents: [
      'Official final transcripts from every college you attended.',
      ...(results.some((r) => r.syllabus_recommended) ? ['Syllabi for the courses marked as needing one (course topics, learning outcomes, contact hours).'] : []),
    ],
    policy_notes: [
      `Grades of ${POLICY.minimumGrade} or higher are usually required for credit. External grades do not count toward your BU GPA.`,
      `Transfer courses are posted with a grade of ${POLICY.transferGrade} and do not earn BU Hub units.`,
      'Credits must be transferred within one year of starting at BU.',
    ],
    results,
  };
}

export default { selfCheck, selfCheckInstitutions };
