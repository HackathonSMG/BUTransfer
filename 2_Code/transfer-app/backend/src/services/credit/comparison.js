// Side-by-side comparison of a transfer course with its proposed BU course(s), for the evaluator. It explains the
// recommendation; it does not make one. Each BU learning outcome and topic is checked against the transfer
// course's own text (catalog description, learning outcomes and any syllabus on file) by shared key terms, so
// the evaluator sees what is covered, what is only partly covered and what is not evident.
import { tokenise } from './tfidf.js';

// Light stemming so plural/singular and simple verb forms compare equal ("structures"/"structure", "trees"/"tree")
function stem(word) {
  let w = word;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 6) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 5) w = w.slice(0, -2);
  return w;
}
// Words that describe a course rather than its content
const FILLER = new Set(['second', 'first', 'core', 'choose', 'task', 'tasks', 'topic', 'skill', 'student', 'understand', 'knowledge', 'ability']);
const keyTerms = (text) => tokenise(text).map((w) => ({ w, s: stem(w) })).filter((t) => t.s.length > 2 && !FILLER.has(t.s));

/** Splits a description into topic phrases and an outcomes text into outcome statements. */
function phrases(text, { outcomes = false } = {}) {
  const parts = String(text || '')
    .split(outcomes ? /[;.]\s+|\n/ : /[;.:]\s*|,\s*|\s+and\s+/i)
    .map((p) => p.trim().replace(/^(covers|includes|including|introduction to)\s+/i, ''))
    .filter((p) => keyTerms(p).length > 0);
  return [...new Set(parts)].slice(0, 14);
}

function coverage(text, sourceStems) {
  const terms = keyTerms(text);
  const unique = [...new Map(terms.map((t) => [t.s, t.w])).entries()];
  const matched = unique.filter(([s]) => sourceStems.has(s)).map(([, w]) => w);
  const ratio = unique.length ? matched.length / unique.length : 0;
  return {
    text,
    status: ratio >= 0.6 ? 'covered' : ratio >= 0.3 ? 'partial' : 'not_evident',
    matched,
    missing: unique.filter(([s]) => !sourceStems.has(s)).map(([, w]) => w),
  };
}

const tally = (items) => ({
  total: items.length,
  covered: items.filter((i) => i.status === 'covered').length,
  partial: items.filter((i) => i.status === 'partial').length,
  not_evident: items.filter((i) => i.status === 'not_evident').length,
});

/**
 * @param {{ description?, learning_outcomes?, syllabus_text?, source_credits?, bu_credits?, credit_system? }} source
 * @param {Array<{ course_code, title, credits, description?, learning_outcomes? }>} buCourses
 * @returns {object|null} null when there is no BU course to compare with
 */
export function compareCourses(source, buCourses) {
  if (!source || !buCourses?.length) return null;
  const based_on = [
    source.description && 'transfer course description',
    source.learning_outcomes && 'transfer course learning outcomes',
    source.syllabus_text && 'syllabus on file',
  ].filter(Boolean);
  const sourceText = [source.description, source.learning_outcomes, source.syllabus_text].filter(Boolean).join(' ');
  const sourceStems = new Set(keyTerms(sourceText).map((t) => t.s));

  const outcomes = buCourses.flatMap((c) => phrases(c.learning_outcomes, { outcomes: true }).map((p) => ({ ...coverage(p, sourceStems), bu_course: c.course_code })));
  const topics = buCourses.flatMap((c) => phrases(c.description).map((p) => ({ ...coverage(p, sourceStems), bu_course: c.course_code })));

  const buText = buCourses.map((c) => `${c.description || ''} ${c.learning_outcomes || ''}`).join(' ');
  const buTerms = [...new Map(keyTerms(buText).map((t) => [t.s, t.w])).entries()];
  const sourceUnits = source.bu_credits ?? (source.source_credits != null ? Number(source.source_credits) : null);
  const buCredits = buCourses.reduce((n, c) => n + Number(c.credits || 0), 0) || null;

  return {
    based_on,
    has_source_text: based_on.length > 0,
    outcomes,
    topics,
    outcome_coverage: tally(outcomes),
    topic_coverage: tally(topics),
    shared_terms: buTerms.filter(([s]) => sourceStems.has(s)).map(([, w]) => w).slice(0, 16),
    missing_terms: buTerms.filter(([s]) => !sourceStems.has(s)).map(([, w]) => w).slice(0, 12),
    credits: {
      source: source.source_credits != null ? Number(source.source_credits) : null,
      credit_system: source.credit_system || null,
      source_units: sourceUnits,
      bu: buCredits,
      comparison: sourceUnits == null || buCredits == null ? 'unknown'
        : Math.abs(sourceUnits - buCredits) < 0.01 ? 'equal' : sourceUnits < buCredits ? 'fewer' : 'more',
    },
  };
}

export default { compareCourses };
