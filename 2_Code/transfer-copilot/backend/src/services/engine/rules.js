/** Deterministic transfer rules — port of engine/rules.py */

const PASSING_GRADES = new Set(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C']);
const BU_ONLY        = new Set(['CAS CS 320', 'CAS CS 332', 'CAS CS 350']);
const ECON_UPPER_CAP = 4;
const SUBSTITUTIONS  = { 'CAS MA 242': 'CAS CS 132', 'CAS MA 294': 'CAS CS 235', 'CAS MA 581': 'CAS CS 237' };

export const gradeOk       = (g) => PASSING_GRADES.has(String(g || '').trim().toUpperCase());
export const isWithdrawn   = (g) => String(g || '').trim().toUpperCase() === 'W';
export const isBuOnly      = (code) => BU_ONLY.has(code);
export const substitution  = (code) => SUBSTITUTIONS[code] || null;

export function buCredits(sourceCredits, creditSystem) {
  const c = parseFloat(sourceCredits);
  if ((creditSystem || '').toLowerCase() === 'quarter') {
    return Math.floor(c * 2 / 3 * 100) / 100;
  }
  return c;
}

export function isEconUpper(buCourse) {
  const m = /^(CAS EC|Econ elective \(CAS EC) (\d)/.exec(buCourse || '');
  return m ? parseInt(m[2], 10) >= 2 : false;
}

export const RULE_DEFS = [
  { id: 'R1', name: 'Minimum grade', kind: 'stop',    detail: 'Grade of C or higher required' },
  { id: 'R2', name: 'Credit conversion', kind: 'change', detail: 'Quarter credits multiplied by 2/3' },
  { id: 'R3', name: 'Hub units',     kind: 'change',  detail: 'Transfer credits earn no BU Hub units' },
  { id: 'R6', name: 'BU-only course', kind: 'stop',   detail: 'Must be taken at BU; only elective credit available' },
  { id: 'R7', name: 'Econ cap',      kind: 'stop',    detail: 'Maximum 4 upper-level Economics courses from transfer' },
  { id: 'W',  name: 'Withdrawn',     kind: 'stop',    detail: 'W grade: no credit earned' },
];

/**
 * Apply rules to a transcript course row.
 * Returns { status, rules_fired, bu_credits, suggestion }.
 */
export function applyRules(row, econUpperCount = 0) {
  const rulesFired = [];
  const bc = buCredits(row.source_credits, row.credit_system);

  if (isWithdrawn(row.grade)) {
    rulesFired.push('W');
    return { status: 'Not transferable', rules_fired: rulesFired, bu_credits: 0, suggestion: 'No credit' };
  }
  if (!gradeOk(row.grade)) {
    rulesFired.push('R1');
    return { status: 'Not transferable', rules_fired: rulesFired, bu_credits: bc, suggestion: 'No credit' };
  }
  if ((row.credit_system || '').toLowerCase() === 'quarter') rulesFired.push('R2');

  // BU-only check happens after matching; flagged during recommendation
  // Econ upper cap
  if (isEconUpper(row.suggestion || '') && econUpperCount >= ECON_UPPER_CAP) {
    rulesFired.push('R7');
    return { status: 'Not transferable', rules_fired: rulesFired, bu_credits: bc, suggestion: 'No credit' };
  }

  return { status: 'Under review', rules_fired: rulesFired, bu_credits: bc };
}
