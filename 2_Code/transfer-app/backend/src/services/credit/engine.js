// Transfer credit engine: gives every transcript course a path and an outcome using BU policy rules,
// approved equivalencies, past evaluator decisions and content similarity to the BU catalog.
// Pure and deterministic: no I/O and no student identity, only course data.
import { TfIdf } from './tfidf.js';

export const ENGINE_VERSION = '1.0.0';
export const TARGET_INSTITUTION = 'Boston University';

const PASSING_GRADES = new Set(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C']);
const BU_ONLY = new Set(['CAS CS 320', 'CAS CS 332', 'CAS CS 350']); // R6: Group C, must be taken at BU
const ECON_UPPER_CAP = 4; // R7
const LEVELS = ['Introductory', 'Intermediate', 'Advanced'];
const SUBSTITUTIONS = { 'CAS MA 242': 'CAS CS 132', 'CAS MA 294': 'CAS CS 235', 'CAS MA 581': 'CAS CS 237' }; // R9

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
const keyOf = (institution, code) => `${norm(institution)}|${norm(code)}`;
const buCodes = (label) => String(label || '').match(/CAS [A-Z]{2} \d{3}/g) || [];
const isEconUpper = (label) => /CAS EC [2-9](\d{2}|XX)/.test(String(label || ''));
const byDate = (a, b) => String(a.decided_on).localeCompare(String(b.decided_on));
const round2 = (n) => Math.round(n * 100) / 100;

/** R2: quarter units convert at 2/3, truncated to two decimals (4 → 2.66, 5 → 3.33). */
export function buCredits(sourceCredits, creditSystem) {
  const c = Number(sourceCredits) || 0;
  return /quarter/i.test(creditSystem || '') ? Math.floor((c * 2 / 3) * 100) / 100 : c;
}

/**
 * @param {object} ref
 * @param {Array<{institution, course_code, title, program, level, description, learning_outcomes}>} ref.catalog
 * @param {Array<{eq_id, institution, course_code, bu_course, outcome}>} ref.equivalencies
 * @param {Array<{decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, decided_on}>} ref.pastDecisions
 * @param {Array<{institution, course_code, syllabus}>} [ref.syllabi]
 */
export function createEngine({ catalog, equivalencies, pastDecisions, syllabi = [] }) {
  const catalogByKey = new Map(catalog.map((c) => [keyOf(c.institution, c.course_code), c]));
  const buCatalog = catalog.filter((c) => c.institution === TARGET_INSTITUTION);
  const syllabusByKey = new Map(syllabi.map((s) => [keyOf(s.institution, s.course_code), s.syllabus]));
  const eqByKey = new Map(equivalencies.map((e) => [keyOf(e.institution, e.course_code), e]));

  const decisionsByKey = new Map();
  const combinedDecisions = []; // decisions that cover several courses together, e.g. "CS 2100+CS 2700"
  for (const d of pastDecisions) {
    const parts = String(d.course_code).split('+').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) { combinedDecisions.push({ ...d, parts }); continue; }
    const k = keyOf(d.institution, d.course_code);
    if (!decisionsByKey.has(k)) decisionsByKey.set(k, []);
    decisionsByKey.get(k).push(d);
  }

  const docText = (c, syllabus = '') => [c.title, c.title, c.description, c.learning_outcomes, syllabus].join(' ');
  const tfidf = new TfIdf(buCatalog.map((c) => docText(c)));

  // Content similarity, nudged towards BU courses in the same program and at the same level
  function closestBuCourses(course, syllabus) {
    const levelGap = (c) => Math.abs(LEVELS.indexOf(c.level) - LEVELS.indexOf(course.level));
    return tfidf.similarities(docText(course, syllabus))
      .map((sim, i) => {
        const c = buCatalog[i];
        const programBonus = c.program === course.program ? 0.05 : 0;
        const levelBonus = !course.level || !c.level ? 0 : [0.05, 0, -0.05][levelGap(c)] ?? 0;
        return { c, score: sim + programBonus + levelBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ c, score }) => ({ code: c.course_code, title: c.title, score: Math.round(score * 1000) / 1000 }));
  }

  function evaluateCourse(tc, present) {
    const grade = norm(tc.grade);
    const credits = buCredits(tc.source_credits, tc.credit_system);
    const base = {
      path: null, outcome: null, award: null, suggestion: null, bu_credits: credits, confidence: null,
      rules: [], precedent_ids: [], equivalency_id: null, candidates: [], reasons: [],
    };
    const conversion = [];
    if (/quarter/i.test(tc.credit_system || '')) {
      base.rules.push('R2');
      conversion.push(`R2: ${Number(tc.source_credits)} quarter units × 2/3 = ${credits} BU credits.`);
    }
    const result = (fields, lead = []) => ({ ...base, ...fields, rules: [...base.rules, ...(fields.rules || [])], reasons: [...lead, ...conversion] });

    if (grade === 'W') {
      return { ...result({ path: 'rule', outcome: 'no_credit', award: 'No credit', confidence: 1, rules: ['W'] }, ['Withdrawn (W): no credit was earned.']), bu_credits: 0 };
    }
    if (!PASSING_GRADES.has(grade)) {
      return result({ path: 'rule', outcome: 'no_credit', award: 'No credit', confidence: 1, rules: ['R1'] }, [`R1: grade ${tc.grade} is below the C minimum.`]);
    }

    const eq = eqByKey.get(keyOf(tc.institution, tc.course_code));
    if (eq) {
      const elective = !eq.bu_course;
      return result(
        { path: 'equivalency', outcome: elective ? 'elective' : 'transfer', award: eq.bu_course || 'Elective credit', confidence: 1, equivalency_id: eq.eq_id, rules: elective ? ['R3'] : [] },
        [`Approved equivalency ${eq.eq_id}: ${tc.course_code} → ${eq.bu_course || 'elective credit'}.`,
          ...(elective ? ['R3: counts as elective credit but earns no BU Hub units.'] : [])],
      );
    }

    const combo = combinedDecisions.find((d) => norm(d.institution) === norm(tc.institution)
      && d.parts.some((p) => norm(p) === norm(tc.course_code))
      && d.parts.every((p) => present.has(keyOf(d.institution, p))));
    if (combo) {
      const others = combo.parts.filter((p) => norm(p) !== norm(tc.course_code));
      return result(
        { path: 'review', outcome: 'pending', suggestion: `${combo.bu_awarded} (with ${others.join(' + ')})`, confidence: 0.85, precedent_ids: [combo.decision_id] },
        [`Past decision ${combo.decision_id}: ${combo.parts.join(' + ')} together = ${combo.bu_awarded}. ${combo.reason}`],
      );
    }

    const decisions = [...(decisionsByKey.get(keyOf(tc.institution, tc.course_code)) || [])].sort(byDate);
    if (decisions.length) {
      const ids = decisions.map((d) => d.decision_id);
      const buOnly = decisions.find((d) => BU_ONLY.has(norm(d.proposed_bu)));
      if (buOnly) {
        return result(
          { path: 'rule', outcome: 'elective', award: buOnly.bu_awarded || 'CS elective (CAS CS 3XX)', confidence: 1, rules: ['R6'], precedent_ids: [buOnly.decision_id] },
          [`R6: ${buOnly.proposed_bu} is a Group C course that must be taken at BU, so elective credit only (${buOnly.decision_id}).`],
        );
      }

      const awards = new Set(decisions.map((d) => d.bu_awarded));
      if (awards.size > 1) {
        const listing = decisions.map((d) => `${d.decision_id} (${d.decided_on}) → ${d.bu_awarded}`).join('; ');
        const codeSets = decisions.map((d) => buCodes(d.bu_awarded));
        const common = codeSets.reduce((acc, s) => acc.filter((c) => s.includes(c)));
        if (common.length && codeSets.some((s) => s.length > common.length)) {
          return result(
            { path: 'review', outcome: 'pending', suggestion: `${common.join(' + ')} (partial)`, confidence: 0.6, precedent_ids: ids },
            [`Past decisions disagree: ${listing}. All of them award ${common.join(' + ')}, so partial credit is suggested pending department review.`],
          );
        }
        const strongest = decisions.filter((d) => buCodes(d.bu_awarded).length).pop() || decisions.at(-1);
        return result(
          { path: 'review', outcome: 'pending', suggestion: strongest.bu_awarded, confidence: 0.55, precedent_ids: ids },
          [`Past decisions disagree: ${listing}. Department review is needed.`],
        );
      }

      const d = decisions.at(-1);
      const why = `Past decision ${d.decision_id}: ${d.reason}`;
      if (d.decision === 'No credit') return result({ path: 'precedent', outcome: 'no_credit', award: 'No credit', confidence: 0.9, precedent_ids: ids }, [why]);
      if (d.decision === 'Elective credit') return result({ path: 'precedent', outcome: 'elective', award: d.bu_awarded, confidence: 0.9, precedent_ids: ids }, [why]);
      const confident = d.decision === 'BU equivalent';
      return result({ path: 'review', outcome: 'pending', suggestion: d.bu_awarded, confidence: confident ? 0.85 : 0.7, precedent_ids: ids }, [why]);
    }

    const cat = catalogByKey.get(keyOf(tc.institution, tc.course_code));
    const description = (cat?.description || '').trim();
    const syllabus = (syllabusByKey.get(keyOf(tc.institution, tc.course_code)) || '').trim();
    if (!description && !syllabus) {
      return result({ path: 'needs_information', outcome: 'pending' }, ['No course description or syllabus on file, so the content cannot be compared. Request the syllabus.']);
    }

    const candidates = closestBuCourses({ title: cat?.title || tc.title, description, learning_outcomes: cat?.learning_outcomes, program: cat?.program, level: cat?.level }, syllabus);
    const top = candidates[0];
    if (BU_ONLY.has(top.code)) {
      return result(
        { path: 'rule', outcome: 'elective', award: 'CS elective (CAS CS 3XX)', confidence: 0.8, rules: ['R6'], candidates },
        [`R6: the closest BU course, ${top.code}, is a Group C course that must be taken at BU, so elective credit only.`],
      );
    }
    return result(
      { path: 'review', outcome: 'pending', suggestion: top.code, confidence: Math.min(0.75, round2(top.score * 1.5)), candidates },
      [`No approved equivalency or past decision. Closest BU course by content${syllabus ? ' (syllabus compared)' : ''}: ${top.code} ${top.title}.`],
    );
  }

  /**
   * Evaluates a student's courses in transcript order (the order matters for the R7 cap).
   * @param {Array<{institution, course_code, title, term, credit_system, source_credits, grade}>} courses
   * @param {{ major?: string }} context
   */
  function evaluateTranscript(courses, { major = '' } = {}) {
    const present = new Set(courses.filter((c) => PASSING_GRADES.has(norm(c.grade))).map((c) => keyOf(c.institution, c.course_code)));
    let econUpper = 0;

    const results = courses.map((tc) => {
      let r = evaluateCourse(tc, present);
      const label = r.award || r.suggestion;
      if (r.outcome !== 'no_credit' && isEconUpper(label)) {
        econUpper += 1;
        if (econUpper > ECON_UPPER_CAP) {
          r = { ...r, path: 'rule', outcome: 'no_credit', award: 'No credit', suggestion: null, confidence: 1, rules: [...r.rules, 'R7'],
            reasons: [`R7: upper-level Economics course ${econUpper}, over the cap of ${ECON_UPPER_CAP}.`, ...r.reasons] };
        } else {
          r.reasons.push(`R7: upper-level Economics course ${econUpper} of ${ECON_UPPER_CAP}.`);
        }
      }
      for (const code of buCodes(r.award || r.suggestion)) {
        if (SUBSTITUTIONS[code]) r.reasons.push(`R9: ${code} also counts toward ${SUBSTITUTIONS[code]} in the CS major.`);
        if (/biolog/i.test(major) && /^CAS BI [2-9]/.test(code)) {
          r.reasons.push('R8: counts toward the major, but at least 5 BI courses beyond BI 107/108 must still be taken at BU.');
        }
      }
      return r;
    });

    return { results, summary: summarise(results) };
  }

  return { evaluateTranscript, version: ENGINE_VERSION };
}

function summarise(results) {
  const s = { courses: results.length, transferred_credits: 0, elective_credits: 0, pending_credits: 0, no_credit_courses: 0, by_path: {} };
  for (const r of results) {
    s.by_path[r.path] = (s.by_path[r.path] || 0) + 1;
    if (r.outcome === 'transfer') s.transferred_credits += r.bu_credits;
    else if (r.outcome === 'elective') s.elective_credits += r.bu_credits;
    else if (r.outcome === 'pending') s.pending_credits += r.bu_credits;
    else s.no_credit_courses += 1;
  }
  for (const k of ['transferred_credits', 'elective_credits', 'pending_credits']) s[k] = round2(s[k]);
  return s;
}
