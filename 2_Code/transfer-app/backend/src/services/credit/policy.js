// BU transfer credit policy, in one place. Every value traces to the Problem 1 statement ("Rules that apply
// alongside the workflow"); where the statement leaves the policy open, the value is configurable through the
// environment and marked ASSUMPTION so it is never mistaken for documented BU policy.

const num = (v, d) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const POLICY = {
  // "Many BU schools require a C or higher for credit." The minimum differs by school, so it is configurable.
  minimumGrade: (process.env.TRANSFER_MIN_GRADE || 'C').toUpperCase(),
  // ASSUMPTION: the statement does not say how Pass/Fail grades are treated. 'review' sends the course to the
  // department evaluator to confirm (never an automatic rejection); 'accept' treats P as meeting the minimum;
  // 'reject' treats it as below the minimum.
  passGradePolicy: (process.env.TRANSFER_PASS_GRADE_POLICY || 'review').toLowerCase(),
  // "Credits convert at two-thirds of a semester credit (a 4-credit quarter course becomes 2.66 BU credits)."
  quarterFactor: 2 / 3,
  // "The outcome is posted in MyBU Student with a grade of 'T'."
  transferGrade: 'T',
  // "External grades do not count toward the BU GPA."
  transferGradesCountInGpa: false,
  // "Transfer courses do not earn BU Hub general education units."
  transferHubUnits: 0,
  // "Pending credit shows as zero units in MyBU Student until it has been evaluated."
  pendingUnits: 0,
  // "All credits must be transferred within one year of starting at BU."
  deadlineMonths: num(process.env.TRANSFER_DEADLINE_MONTHS, 12),
  // ASSUMPTION: the first day of each BU term, used to turn a start term ("Fall 2026") into a date.
  // The statement gives no calendar; adjust TRANSFER_TERM_STARTS (e.g. "Fall=09-01,Spring=01-15,Summer=05-15").
  termStarts: Object.fromEntries(String(process.env.TRANSFER_TERM_STARTS || 'Fall=09-01,Spring=01-15,Summer=05-15')
    .split(',').map((p) => p.split('=').map((s) => s.trim())).filter(([k, v]) => k && /^\d{2}-\d{2}$/.test(v || ''))
    .map(([k, v]) => [k.toLowerCase(), v])),
  // ASSUMPTION: when the same course was passed more than once, credit is awarded once, for the best grade
  // (the latest attempt on a tie). The statement does not cover repeats.
  repeatCounts: 'best_grade',
  // How close to the deadline an application is flagged as approaching (days)
  deadlineWarningDays: num(process.env.TRANSFER_DEADLINE_WARNING_DAYS, 60),
};

// ---------- Grades ----------
const LETTER_POINTS = { 'A+': 4.3, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0 };
const ALIASES = {
  PASS: 'P', PASSED: 'P', CR: 'P', CREDIT: 'P', S: 'P', SATISFACTORY: 'P',
  FAIL: 'F', FAILED: 'F', NC: 'F', 'NO CREDIT': 'F', U: 'F', UNSATISFACTORY: 'F',
  WITHDRAWN: 'W', WITHDREW: 'W', WD: 'W',
  INCOMPLETE: 'I', INC: 'I', 'IN PROGRESS': 'IP',
};

/**
 * Normalises a transcript grade. kind: letter | pass | fail | withdrawn | incomplete | missing | invalid.
 * "P/F" on its own does not say whether the course was passed, so it is treated as invalid (ask for the grade).
 */
export function normalizeGrade(raw) {
  const text = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!text) return { grade: null, kind: 'missing' };
  const g = ALIASES[text] || text.replace(/\s+(?=[+-]$)/, '');
  if (g in LETTER_POINTS) return { grade: g, kind: g === 'F' ? 'fail' : 'letter', points: LETTER_POINTS[g] };
  if (g === 'P') return { grade: 'P', kind: 'pass' };
  if (g === 'W') return { grade: 'W', kind: 'withdrawn' };
  if (g === 'I' || g === 'IP') return { grade: g, kind: 'incomplete' };
  return { grade: text, kind: 'invalid' };
}

/**
 * Whether a grade meets the minimum for transfer credit.
 * @returns {{eligible: true|false|null, reason?: string, rule?: string}} null = an evaluator must confirm
 */
export function gradeEligibility(raw, policy = POLICY) {
  const g = normalizeGrade(raw);
  const min = LETTER_POINTS[policy.minimumGrade] ?? LETTER_POINTS.C;
  switch (g.kind) {
    case 'letter':
      return g.points >= min
        ? { eligible: true, grade: g.grade }
        : { eligible: false, grade: g.grade, rule: 'R1', reason: `R1: grade ${g.grade} is below the ${policy.minimumGrade} minimum.` };
    case 'fail':
      return { eligible: false, grade: 'F', rule: 'R1', reason: 'R1: the course was not passed (F), so no credit was earned.' };
    case 'withdrawn':
      return { eligible: false, grade: 'W', rule: 'W', reason: 'Withdrawn (W): no credit was earned.' };
    case 'pass':
      if (policy.passGradePolicy === 'accept') return { eligible: true, grade: 'P' };
      if (policy.passGradePolicy === 'reject') return { eligible: false, grade: 'P', rule: 'R1', reason: `R1: a Pass grade is not accepted as ${policy.minimumGrade} or higher.` };
      return { eligible: null, grade: 'P', rule: 'PASS', reason: `Pass/Fail grade: the department confirms that a Pass meets the ${policy.minimumGrade} minimum.` };
    case 'incomplete':
      return { eligible: null, grade: g.grade, rule: 'GRADE', reason: `Grade ${g.grade} (incomplete or in progress): a final grade is needed before credit can be awarded.`, missing: 'final grade' };
    case 'missing':
      return { eligible: null, grade: null, rule: 'GRADE', reason: 'No grade on the transcript: the final grade is needed before credit can be awarded.', missing: 'grade' };
    default:
      return { eligible: null, grade: g.grade, rule: 'GRADE', reason: `Grade "${g.grade}" is not a recognised grade: the final grade must be confirmed.`, missing: 'grade' };
  }
}

/** True when the grade is a passing grade for repeat/combination purposes (letter at or above the minimum, or P). */
export function isPassed(raw, policy = POLICY) {
  const e = gradeEligibility(raw, policy);
  return e.eligible === true || e.grade === 'P';
}

/** Comparable strength of a grade, for choosing which repeat attempt counts. */
export function gradeRank(raw) {
  const g = normalizeGrade(raw);
  return g.kind === 'letter' ? g.points : g.kind === 'pass' ? 2 : -1;
}

// ---------- Course codes ----------
/**
 * Compact comparison key for a course code: case, spaces, hyphens and dots are ignored, so CS1800, CS 1800,
 * CS-1800 and cs 1800 compare equal, while the letters and digits themselves must match exactly.
 */
export function courseKey(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9+]/g, '');
}

// ---------- Credits ----------
/** R2: quarter units convert at 2/3, truncated to two decimals (4 -> 2.66). null when the credits are missing. */
export function buCredits(sourceCredits, creditSystem, policy = POLICY) {
  if (sourceCredits == null || sourceCredits === '' || Number.isNaN(Number(sourceCredits))) return null;
  const c = Number(sourceCredits);
  return /quarter/i.test(creditSystem || '') ? Math.floor(c * policy.quarterFactor * 100) / 100 : c;
}

// ---------- One-year deadline ----------
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** First day of a BU term such as "Fall 2026" (UTC date), or null when the term can't be read. */
export function termStartDate(term, policy = POLICY) {
  const m = /^\s*(fall|spring|summer)\D*(\d{4})\s*$/i.exec(String(term || '').replace(/_/g, ' '));
  if (!m) return null;
  const mmdd = policy.termStarts[m[1].toLowerCase()];
  if (!mmdd) return null;
  const [mm, dd] = mmdd.split('-').map(Number);
  return new Date(Date.UTC(Number(m[2]), mm - 1, dd));
}

/**
 * Deadline status for transferring credit: all credits within one year of starting at BU.
 * @param {string} startTerm the BU start term on the application
 * @param {Date|string} asOf the date being checked (today for the dashboard, the posting date when posting)
 * @returns {{status: 'within'|'approaching'|'passed'|'unknown', start: string|null, deadline: string|null, days_left: number|null, explanation: string}}
 */
export function transferDeadline(startTerm, asOf, policy = POLICY) {
  const start = termStartDate(startTerm, policy);
  if (!start) {
    return { status: 'unknown', start: null, deadline: null, days_left: null,
      explanation: 'The BU start term is not recorded, so the one-year transfer deadline cannot be calculated.' };
  }
  const deadline = new Date(start);
  deadline.setUTCMonth(deadline.getUTCMonth() + policy.deadlineMonths);
  const day = new Date(asOf);
  const today = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const daysLeft = Math.round((deadline.getTime() - today) / 86400000);
  const status = daysLeft < 0 ? 'passed' : daysLeft <= policy.deadlineWarningDays ? 'approaching' : 'within';
  const when = isoDate(deadline);
  const explanation = status === 'passed'
    ? `All transfer credit had to be transferred by ${when}, one year after starting at BU (${startTerm}). Posting needs a recorded exception.`
    : `All transfer credit must be transferred by ${when}, one year after starting at BU (${startTerm}).`;
  return { status, start: isoDate(start), deadline: when, days_left: daysLeft, explanation };
}

export default { POLICY, normalizeGrade, gradeEligibility, isPassed, gradeRank, courseKey, buCredits, termStartDate, transferDeadline };
