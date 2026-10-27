/**
 * Produces an AI recommendation for one transcript course.
 * Port of engine/recommend.py.
 */
import { pool } from '../../config/db.js';
import { gradeOk, isWithdrawn, isBuOnly, buCredits, isEconUpper } from './rules.js';
import { findEquivalency } from './kb-matcher.js';
import { Matcher } from './matcher.js';
import { overlap, missing } from './tfidf.js';

const WEIGHTS       = { content: 0.50, credits: 0.20, level: 0.15, worksheet: 0.15 };
const LEVELS        = ['Introductory', 'Intermediate', 'Advanced'];
const WS_SCORE      = { 'Likely equivalent': 1.0, 'Partial - syllabus review': 0.6, 'No equivalent found': 0.2, 'Must be taken at BU': 1.0 };
const ENGINE_VERSION = '2.0.0';

let _matcher = null;
let _buCatalog = null;

async function getMatcher(db = pool) {
  if (_matcher) return _matcher;
  const { rows } = await db.query(
    `select c.id, c.code, c.title, c.description, c.learning_outcomes, c.level, c.credits, c.program_area
     from public.courses c join public.institutions i on i.id = c.institution_id where i.is_target = true`,
  );
  _buCatalog = rows;
  _matcher   = new Matcher(rows);
  return _matcher;
}

export function invalidateMatcher() { _matcher = null; _buCatalog = null; }

function getBuCourse(code) {
  return (_buCatalog || []).find((c) => c.code === code) || null;
}

async function getWsLevel(db, partnerInstId, partnerCode, targetCode) {
  const { rows } = await db.query(
    `select match_level from public.worksheet_course_matches
     where partner_institution_id = $1 and partner_course_code = $2 and target_course_id = (
       select id from public.courses where institution_id = (select id from public.institutions where is_target = true) and code = $3 limit 1
     ) limit 1`,
    [partnerInstId, partnerCode, targetCode],
  );
  return rows[0]?.match_level ?? null;
}

async function getPastDecisions(db, instId, code) {
  const { rows } = await db.query(
    `select pd.code, pd.decision, pd.awarded_label, pd.reason from public.past_decisions pd
     where pd.institution_id = $1 and pd.course_code = $2 order by pd.decided_on`,
    [instId, code],
  );
  return rows;
}

function scoreMatch(srcCourse, buCreditsVal, targetCode, sim, wsLevel) {
  const buCourse = getBuCourse(targetCode);
  const crit = [];

  const content = Math.min(1.0, sim / 0.5);
  crit.push({ key: 'content', name: 'Content similarity', value: `${Math.round(content * 100)}%`, score: content,
    status: content >= 0.75 ? 'ok' : content >= 0.45 ? 'warn' : 'fail',
    detail: 'Description, outcomes and syllabus compared with the BU course' });

  const tgtCr = 4.0;
  const diff   = Math.abs(buCreditsVal - tgtCr);
  const cr     = diff < 0.01 ? 1.0 : diff <= 1 ? 0.8 : 0.5;
  crit.push({ key: 'credits', name: 'Credit hours', value: `${buCreditsVal} → ${tgtCr}`, score: cr,
    status: cr === 1 ? 'ok' : 'warn', detail: 'Transfer credits (after any quarter conversion) vs BU credits' });

  if (buCourse) {
    const ai = LEVELS.indexOf(srcCourse.level || 'Introductory');
    const bi = LEVELS.indexOf(buCourse.level || 'Introductory');
    const lv = ai === bi ? 1.0 : Math.abs(ai - bi) === 1 ? 0.6 : 0.3;
    crit.push({ key: 'level', name: 'Course level', value: `${srcCourse.level || 'Introductory'} → ${buCourse.level || 'Introductory'}`,
      score: lv, status: lv === 1 ? 'ok' : 'warn', detail: 'Introductory / Intermediate / Advanced' });
  }

  if (wsLevel && wsLevel in WS_SCORE) {
    crit.push({ key: 'worksheet', name: 'Worksheet match level', value: wsLevel, score: WS_SCORE[wsLevel],
      status: WS_SCORE[wsLevel] === 1 ? 'ok' : 'warn', detail: 'From the sponsor worksheet (Course Match sheet)' });
  }

  const tot = crit.reduce((s, c) => s + WEIGHTS[c.key], 0) || 1;
  const pct = Math.round(100 * crit.reduce((s, c) => s + WEIGHTS[c.key] * c.score, 0) / tot);
  crit.forEach((c) => { c.weight = Math.round(WEIGHTS[c.key] / tot * 100); });
  const conf = pct >= 85 ? 'High' : pct >= 65 ? 'Medium' : 'Low';
  return { pct, conf, crit };
}

/**
 * Generate a recommendation for a transcript course.
 * @param {object} txCourse - transcript_courses row + enrichment
 * @param {object} srcInstitution - {id, name}
 * @param {string} trigger - 'intake' | 'student_upload' | 'reevaluation'
 * @param {object} db - pg client (optional, uses pool by default)
 */
export async function recommend(txCourse, srcInstitution, trigger = 'intake', db = pool) {
  const matcher  = await getMatcher(db);
  const bc       = buCredits(txCourse.source_credits, txCourse.credit_system);
  const grade    = txCourse.grade || '';

  const out = {
    engine_version: ENGINE_VERSION,
    trigger,
    exceptions: [],
    reasons:    [],
    criteria:   [],
    candidates: [],
    covered_topics:  [],
    missing_topics:  [],
    pct:        null,
    confidence: 'n/a',
    auto_eligible:   false,
    evaluation_path: 'manual_review',
  };

  // R-W: withdrawn
  if (isWithdrawn(grade)) {
    out.reasons = [{ status: 'fail', text: `Withdrawn (W): no credit was earned` }];
    return { ...out, decision: 'Reject', award_label: 'No credit', award_credits: 0, auto_eligible: true, evaluation_path: 'policy_rule' };
  }
  // R1: grade
  if (!gradeOk(grade)) {
    out.reasons = [{ status: 'fail', text: `Grade ${grade} is below the C minimum` }];
    out.exceptions = ['Grade below C'];
    return { ...out, decision: 'Reject', award_label: 'No credit', award_credits: 0, auto_eligible: true, evaluation_path: 'policy_rule' };
  }
  if ((txCourse.credit_system || '').toLowerCase() === 'quarter') {
    out.reasons.push({ status: 'ok', text: `Quarter credits converted: ${txCourse.source_credits} × 2/3 = ${bc}` });
  }
  out.reasons.push({ status: gradeOk(grade) ? 'ok' : 'fail', text: `Grade ${grade} meets the C minimum` });

  // KB lookup
  const kbHit = await findEquivalency(srcInstitution.id, txCourse.course_code, txCourse.title, bc, db);
  if (kbHit) {
    const eq = kbHit.equivalency;
    out.kb_equivalency_id = eq.id;
    out.kb_match = { type: kbHit.matchType, confidence: kbHit.confidence };
    out.auto_eligible = true;
    out.evaluation_path = 'known_equivalency';
    out.equivalency_code = eq.code;
    out.reasons.unshift({ status: 'ok', text: `Equivalency ${eq.code} already maps this course to ${eq.award_label}` });
    const targetCode = eq.target_code || '';
    const isElective = !targetCode.startsWith('CAS');
    return {
      ...out,
      decision:      isElective ? 'Accept as elective' : 'Accept',
      award_label:   eq.award_label,
      award_credits: bc,
      target_course_id: eq.target_course_id || null,
      target_code:   targetCode,
      match_pct:     kbHit.confidence,
      confidence:    'High',
    };
  }

  // TF-IDF matching
  const srcCourseRow = {
    title:             txCourse.title || '',
    description:       txCourse.description || '',
    learning_outcomes: '',
    level:             txCourse.course_level || 'Introductory',
    program_area:      txCourse.program_area || '',
  };
  const missing_info = !txCourse.description && !txCourse.has_syllabus;
  const candidates   = missing_info ? [] : matcher.topK(srcCourseRow, '', 3);
  out.candidates = candidates;

  if (missing_info) {
    out.exceptions = ['Course description missing', 'Syllabus unavailable'];
    out.reasons.push({ status: 'fail', text: 'No description or syllabus on file — content cannot be compared' });
    return { ...out, decision: 'Needs info', award_label: 'Request syllabus', award_credits: bc, evaluation_path: 'manual_review' };
  }

  const topCand  = candidates[0];
  const tcode    = topCand?.bu_code || '';
  const tId      = topCand?.bu_course_id || null;
  const sim      = topCand?.score || 0;
  const wsLevel  = tcode ? await getWsLevel(db, srcInstitution.id, txCourse.course_code, tcode) : null;

  if (tcode) {
    const { pct, conf, crit } = scoreMatch(srcCourseRow, bc, tcode, sim, wsLevel);
    out.pct = pct; out.confidence = conf; out.criteria = crit;
    out.covered_topics = topCand.covered || [];
    out.missing_topics  = topCand.missing || [];
  }

  if (isBuOnly(tcode)) {
    out.exceptions.push('BU-only course');
    out.reasons.unshift({ status: 'warn', text: `Closest BU course ${tcode} must be taken at BU (Group C)` });
    return { ...out, decision: 'Accept as elective', award_label: tcode ? `${tcode} elective` : 'Free elective', award_credits: bc,
      target_course_id: tId, target_code: tcode, match_pct: out.pct, evaluation_path: 'policy_rule' };
  }

  // Past decisions
  const pds = await getPastDecisions(db, srcInstitution.id, txCourse.course_code);
  if (pds.length) {
    const last    = pds[pds.length - 1];
    const awards  = new Set(pds.map((p) => p.awarded_label));
    if (awards.size > 1) {
      out.exceptions.push('Conflicting precedents');
      out.reasons.push({ status: 'warn', text: `Past decisions disagree: ${pds.map((p) => `${p.code} → ${p.awarded_label}`).join('; ')}` });
    } else {
      out.reasons.unshift({ status: 'ok', text: `Matches past decision ${last.code}: ${last.awarded_label}` });
    }
    if (last.decision === 'No credit') {
      return { ...out, decision: 'Reject', award_label: 'No credit', award_credits: 0, target_code: tcode, match_pct: out.pct, evaluation_path: 'ai_recommended' };
    }
    const isEl = !last.awarded_label.startsWith('CAS');
    return { ...out, decision: isEl ? 'Accept as elective' : 'Accept', award_label: last.awarded_label, award_credits: bc,
      target_course_id: tId, target_code: tcode, match_pct: out.pct, evaluation_path: 'ai_recommended' };
  }

  // AI-only recommendation
  if (tcode) {
    out.reasons.unshift({ status: out.pct >= 65 ? 'ok' : 'warn', text: `Closest BU course by content: ${tcode} (${out.pct}% match)` });
  }
  if (out.pct !== null && out.pct < 65) out.exceptions.push('Low confidence');

  const path = out.pct !== null && out.pct >= 90 ? 'ai_recommended' : 'manual_review';
  return {
    ...out,
    decision:      tcode ? 'Accept' : 'Needs info',
    award_label:   tcode || 'Free elective',
    award_credits: bc,
    target_course_id: tId,
    target_code:   tcode,
    match_pct:     out.pct,
    evaluation_path: path,
  };
}
