// Transfer credit engine: gives every transcript course a path and an outcome using BU policy rules,
// approved equivalencies, past evaluator decisions and content similarity to the BU catalog.
// Pure and deterministic: no I/O and no student identity, only course data.
import { TfIdf } from './tfidf.js';
import { POLICY, gradeEligibility, isPassed, gradeRank, courseKey, buCredits as convertCredits } from './policy.js';

export const ENGINE_VERSION = '1.1.0';
export const TARGET_INSTITUTION = 'Boston University';

const BU_ONLY = new Set(['CAS CS 320', 'CAS CS 332', 'CAS CS 350']); // R6: Group C, must be taken at BU
const ECON_UPPER_CAP = 4; // R7
const LEVELS = ['Introductory', 'Intermediate', 'Advanced'];
// Below this TF-IDF cosine similarity the closest BU course is not a credible match. ASSUMPTION calibrated on the
// sample data: genuine content matches score 0.28-0.85, while an unrelated course (ceramics vs CAS CS 320) scores 0.19
const MIN_SIMILARITY = 0.25;
const SUBSTITUTIONS = { 'CAS MA 242': 'CAS CS 132', 'CAS MA 294': 'CAS CS 235', 'CAS MA 581': 'CAS CS 237' }; // R9

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
// Course codes compare without spaces, hyphens or case (CS1800 = CS 1800), see policy.courseKey
const keyOf = (institution, code) => `${norm(institution)}|${courseKey(code)}`;
const buCodes = (label) => String(label || '').match(/CAS [A-Z]{2} \d{3}/g) || [];
const isEconUpper = (label) => /CAS EC [2-9](\d{2}|XX)/.test(String(label || ''));
const byDate = (a, b) => String(a.decided_on).localeCompare(String(b.decided_on));
const round2 = (n) => Math.round(n * 100) / 100;

const TERM_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3 };
const termOrder = (t) => {
  const m = /(winter|spring|summer|fall)\D*(\d{4})/i.exec(String(t || ''));
  return m ? Number(m[2]) * 10 + TERM_ORDER[m[1].toLowerCase()] : 0;
};

/** R2: quarter units convert at 2/3, truncated to two decimals (4 → 2.66, 5 → 3.33); null when credits are missing. */
export function buCredits(sourceCredits, creditSystem) {
  return convertCredits(sourceCredits, creditSystem);
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
        return { c, sim, score: sim + programBonus + levelBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      // score ranks the candidates (it includes the program/level nudges); similarity is the plain content overlap
      .map(({ c, sim, score }) => ({ code: c.course_code, title: c.title, score: Math.round(score * 1000) / 1000, similarity: Math.round(sim * 1000) / 1000 }));
  }

  /** The catalog code a transcript code refers to (CS1800 -> CS 1800), or null when the course is unknown. */
  function knownCode(institution, code) {
    const k = keyOf(institution, code);
    return catalogByKey.get(k)?.course_code || eqByKey.get(k)?.course_code || decisionsByKey.get(k)?.[0]?.course_code || null;
  }

  function evaluateCourse(tc, present, extraSyllabus) {
    const credits = buCredits(tc.source_credits, tc.credit_system);
    const base = {
      path: null, outcome: null, award: null, suggestion: null, bu_credits: credits, confidence: null,
      rules: [], precedent_ids: [], equivalency_id: null, candidates: [], reasons: [], missing: [],
    };
    const conversion = [];
    if (/quarter/i.test(tc.credit_system || '') && credits != null) {
      base.rules.push('R2');
      conversion.push(`R2: ${Number(tc.source_credits)} quarter units × 2/3 = ${credits} BU credits.`);
    }
    const result = (fields, lead = []) => ({ ...base, ...fields, rules: [...base.rules, ...(fields.rules || [])], reasons: [...lead, ...conversion] });

    // R1 / W: grades that cannot earn credit end here. Grades an evaluator must confirm (Pass, missing, unreadable)
    // and missing credits are matched as usual, then held
    const grade = gradeEligibility(tc.grade);
    if (grade.eligible === false) {
      const r = result({ path: 'rule', outcome: 'no_credit', award: 'No credit', confidence: 1, rules: [grade.rule] }, [grade.reason]);
      return grade.rule === 'W' ? { ...r, bu_credits: 0 } : r;
    }
    const holds = [];
    if (grade.eligible === null) holds.push({ path: grade.missing ? 'needs_information' : 'review', rule: grade.rule, reason: grade.reason, missing: grade.missing });
    if (credits == null) {
      holds.push({ path: 'needs_information', rule: 'CREDITS', reason: 'Credits are not shown on the transcript, so the BU units cannot be calculated. They are not assumed to be zero.', missing: 'credits' });
    }
    const matched = matchCourse(tc, present, result, extraSyllabus);
    if (!holds.length) return matched;
    // Keep what matching found as the suggestion; the course waits for an evaluator or for the missing information
    return {
      ...matched,
      path: holds.some((h) => h.path === 'needs_information') ? 'needs_information' : 'review',
      outcome: 'pending',
      award: null,
      suggestion: matched.outcome === 'no_credit' ? matched.suggestion : (matched.award || matched.suggestion),
      confidence: matched.confidence != null ? Math.min(matched.confidence, 0.7) : null,
      rules: [...holds.map((h) => h.rule), ...matched.rules],
      reasons: [...holds.map((h) => h.reason), ...matched.reasons],
      missing: holds.map((h) => h.missing).filter(Boolean),
    };
  }

  // Equivalency, combined and single past decisions, then content similarity
  function matchCourse(tc, present, result, extraSyllabus) {
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
      && d.parts.some((p) => courseKey(p) === courseKey(tc.course_code))
      && d.parts.every((p) => present.has(keyOf(d.institution, p))));
    if (combo) {
      const others = combo.parts.filter((p) => courseKey(p) !== courseKey(tc.course_code));
      return result(
        { path: 'review', outcome: 'pending', suggestion: `${combo.bu_awarded} (with ${others.join(' + ')})`, confidence: 0.85, precedent_ids: [combo.decision_id], combined_with: others },
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
    const syllabus = [syllabusByKey.get(keyOf(tc.institution, tc.course_code)), extraSyllabus].filter(Boolean).join('\n').trim();
    if (!description && !syllabus) {
      return result({ path: 'needs_information', outcome: 'pending', missing: ['syllabus'] },
        ['No course description or syllabus on file, so the content cannot be compared. The syllabus is needed.']);
    }

    const candidates = closestBuCourses({ title: cat?.title || tc.title, description, learning_outcomes: cat?.learning_outcomes, program: cat?.program, level: cat?.level }, syllabus);
    const top = candidates[0];
    // Nothing in the BU catalog shares meaningful content: no BU course is suggested (and no rule is inferred from
    // an unrelated nearest course); the department decides between elective credit and no credit
    if (!top || top.similarity < MIN_SIMILARITY) {
      return result(
        { path: 'review', outcome: 'pending', suggestion: null, confidence: null, candidates },
        ['No BU course in the catalog is close in content. The department decides whether it earns elective credit or no credit.'],
      );
    }
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
   * @param {Array<{institution, course_code, title, term, credit_system, source_credits, grade, syllabus_text?}>} courses
   * @param {{ major?: string }} context
   */
  function evaluateTranscript(courses, { major = '' } = {}) {
    const present = new Set(courses.filter((c) => isPassed(c.grade)).map((c) => keyOf(c.institution, c.course_code)));
    const counted = countedAttempts(courses);
    let econUpper = 0;

    const results = courses.map((tc, i) => {
      const matchedCode = knownCode(tc.institution, tc.course_code);
      // REPEAT: a course passed more than once earns credit once (POLICY.repeatCounts); every attempt stays on the transcript
      if (counted.has(i) && counted.get(i) !== i) {
        const keep = courses[counted.get(i)];
        return {
          path: 'rule', outcome: 'no_credit', award: 'No credit (repeat)', suggestion: null, bu_credits: 0, confidence: 1, rules: ['REPEAT'],
          precedent_ids: [], equivalency_id: null, candidates: [], missing: [], repeat_of: counted.get(i), matched_code: matchedCode,
          reasons: [`Repeat of ${keep.course_code}: credit is awarded once, for the ${keep.term || 'other'} attempt (grade ${keep.grade}).`],
        };
      }
      let r = evaluateCourse(tc, present, tc.syllabus_text);
      r.matched_code = matchedCode;
      if (matchedCode && courseKey(matchedCode) === courseKey(tc.course_code) && norm(matchedCode) !== norm(tc.course_code)) {
        r.reasons.push(`Course code ${tc.course_code} read as ${matchedCode}.`);
      }
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

/** For courses passed more than once: index of each attempt -> index of the attempt that earns the credit. */
function countedAttempts(courses) {
  const groups = new Map();
  courses.forEach((c, i) => {
    if (!isPassed(c.grade)) return;
    const k = keyOf(c.institution, c.course_code);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const counted = new Map();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const best = [...idx].sort((a, b) => (gradeRank(courses[b].grade) - gradeRank(courses[a].grade))
      || (termOrder(courses[b].term) - termOrder(courses[a].term)) || (b - a))[0];
    for (const i of idx) counted.set(i, best);
  }
  return counted;
}

function summarise(results) {
  const s = { courses: results.length, transferred_credits: 0, elective_credits: 0, pending_credits: 0, no_credit_courses: 0, missing_credits: 0, by_path: {} };
  for (const r of results) {
    s.by_path[r.path] = (s.by_path[r.path] || 0) + 1;
    if (r.bu_credits == null) s.missing_credits += 1;
    if (r.outcome === 'transfer') s.transferred_credits += r.bu_credits || 0;
    else if (r.outcome === 'elective') s.elective_credits += r.bu_credits || 0;
    else if (r.outcome === 'pending') s.pending_credits += r.bu_credits || 0;
    else s.no_credit_courses += 1;
  }
  for (const k of ['transferred_credits', 'elective_credits', 'pending_credits']) s[k] = round2(s[k]);
  return s;
}

export { POLICY };
