// Course precedent search across institutions. The decision memory answers "how was THIS course decided before?";
// this answers "how were courses LIKE this one decided?", so a course seen for the first time still arrives with
// the institution's earlier judgements on comparable courses at other colleges. Only courses that already carry
// a judgement (an active approved equivalency or past decision) are indexed, by the content of their catalog
// entry (title, description, learning outcomes, syllabus) with the same TF-IDF used to match the BU catalog.
// Evidence only: it suggests nothing and never feeds the credit engine's outcome.
import { query } from '../../config/db.js';
import { TfIdf } from './tfidf.js';
import { courseKey } from './policy.js';

const TARGET = 'Boston University';
// Below this cosine similarity two peer courses do not share meaningful content. ASSUMPTION calibrated on the
// sample catalog: same-subject introductory courses at different colleges score 0.2-0.6, unrelated ones < 0.12
export const MIN_SIMILARITY = 0.2;
const BU_CODE = /\bCAS [A-Z]{2} \d{3}\b/g;

const keyOf = (institution, code) => `${String(institution || '').trim().toUpperCase()}|${courseKey(code)}`;
const text = (c) => [c.title, c.title, c.description, c.learning_outcomes, c.syllabus].filter(Boolean).join(' ');

/** The outcome a judgement awards, as one comparable label: the BU course(s), else "Elective credit" / "No credit". */
export function awardOf({ decision, bu_awarded: awarded, bu_course: buCourse, outcome }) {
  const codes = String(awarded ?? buCourse ?? '').match(BU_CODE) || [];
  if (decision === 'No credit' || /no credit/i.test(outcome || '')) return { award: 'No credit', kind: 'no_credit' };
  if (codes.length && (decision ? decision === 'BU equivalent' : true)) return { award: codes.join(' + '), kind: 'transfer' };
  return { award: 'Elective credit', kind: 'elective' };
}

/**
 * Pure core, so it can be checked without a database.
 * @param {{ catalog: Array<{institution, course_code, title, description?, learning_outcomes?, syllabus?}>,
 *   equivalencies: Array<{eq_id, institution, course_code, bu_course, outcome}>,
 *   decisions: Array<{decision_id, institution, course_code, decision, bu_awarded, decided_on?}> }} ref
 */
export function createPrecedentIndex({ catalog, equivalencies, decisions }) {
  const judgements = new Map();
  const push = (k, j) => { if (!judgements.has(k)) judgements.set(k, []); judgements.get(k).push(j); };
  for (const e of equivalencies) push(keyOf(e.institution, e.course_code), { source: 'equivalency', id: e.eq_id, ...awardOf(e) });
  // Combined decisions ("CS 2100+CS 2700") describe a pair of courses, not either one alone
  for (const d of decisions.filter((x) => !String(x.course_code).includes('+'))) {
    push(keyOf(d.institution, d.course_code), { source: 'decision', id: d.decision_id, decided_on: d.decided_on || null, ...awardOf(d) });
  }
  const courses = catalog.filter((c) => c.institution !== TARGET && judgements.has(keyOf(c.institution, c.course_code)) && text(c).trim());
  const tfidf = courses.length ? new TfIdf(courses.map(text)) : null;

  /**
   * @param {{institution, course_code, title?, description?, learning_outcomes?, syllabus?}} course
   * @returns {{ courses: Array<{institution, course_code, title, similarity, outcomes: Array<{award, kind, count}>, judgements: number}>,
   *   tally: Array<{award, kind, count, courses}>, indexed: number }}
   */
  function similar(course, { limit = 5, min = MIN_SIMILARITY } = {}) {
    const empty = { courses: [], tally: [], indexed: courses.length };
    const query = text(course);
    if (!tfidf || !query.trim()) return empty;
    const self = keyOf(course.institution, course.course_code);
    const sims = tfidf.similarities(query);
    const found = courses
      .map((c, i) => ({ c, sim: sims[i] }))
      .filter(({ c, sim }) => sim >= min && keyOf(c.institution, c.course_code) !== self)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map(({ c, sim }) => {
        const js = judgements.get(keyOf(c.institution, c.course_code));
        const outcomes = new Map();
        for (const j of js) {
          const o = outcomes.get(j.award) || { award: j.award, kind: j.kind, count: 0 };
          o.count += 1;
          outcomes.set(j.award, o);
        }
        return { institution: c.institution, course_code: c.course_code, title: c.title, similarity: Math.round(sim * 100) / 100,
          outcomes: [...outcomes.values()].sort((a, b) => b.count - a.count), judgements: js.length };
      });
    // How the similar courses were decided, counted once per course (its most common outcome)
    const tally = new Map();
    for (const f of found) {
      const top = f.outcomes[0];
      const t = tally.get(top.award) || { award: top.award, kind: top.kind, count: 0, courses: [] };
      t.count += 1;
      t.courses.push(`${f.institution} ${f.course_code}`);
      tally.set(top.award, t);
    }
    return { courses: found, tally: [...tally.values()].sort((a, b) => b.count - a.count), indexed: courses.length };
  }

  return { similar, size: courses.length };
}

let indexPromise = null;

/** The index over the current reference data, built once and reused until invalidated. */
export function getPrecedentIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [catalog, equivalencies, decisions] = await Promise.all([
        query(`SELECT institution, course_code, title, description, learning_outcomes, syllabus FROM catalog_courses WHERE institution <> $1`, [TARGET]),
        query(`SELECT eq_id, institution, course_code, bu_course, outcome FROM equivalencies WHERE status = 'active'`),
        query(`SELECT decision_id, institution, course_code, decision, bu_awarded, TO_CHAR(decided_on, 'YYYY-MM-DD') AS decided_on
               FROM past_decisions WHERE status = 'active'`),
      ]);
      return createPrecedentIndex({ catalog: catalog.rows, equivalencies: equivalencies.rows, decisions: decisions.rows });
    })().catch((err) => { indexPromise = null; throw err; });
  }
  return indexPromise;
}

/** Rebuild on next use: called whenever equivalencies or past decisions change (with the credit engine). */
export function invalidatePrecedentIndex() {
  indexPromise = null;
}

export default { createPrecedentIndex, getPrecedentIndex, invalidatePrecedentIndex, awardOf, MIN_SIMILARITY };
