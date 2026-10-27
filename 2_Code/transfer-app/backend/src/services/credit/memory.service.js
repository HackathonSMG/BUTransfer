// The decision memory: evaluator decisions on courses become precedents (past_decisions) that the
// credit engine and the agent reuse, and agreeing precedents are promoted to equivalencies that
// apply automatically. Only signed-in evaluators write to it; the agent only reads.
import { query, getClient } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { invalidateEngine } from './credit.service.js';
import { badRequest, notFound } from '../../utils/errors.js';

const PROMOTION_MIN_EVALUATORS = Number(process.env.PROMOTION_MIN_EVALUATORS || 2);
const DECIDED = ['transfer', 'elective', 'no_credit'];
const DECISION_LABEL = { transfer: 'BU equivalent', elective: 'Elective credit', no_credit: 'No credit' };
const SINGLE_BU_COURSE = /^CAS [A-Z]{2} \d{3}$/;

function fromLabel(label) {
  if (/elective/i.test(label)) return { outcome: 'elective', award: label.replace(/\s+likely$/i, '').trim() };
  const codes = label.match(/CAS [A-Z]{2} \d{3}/g);
  return codes ? { outcome: 'transfer', award: codes.join(' + ') } : { outcome: 'elective', award: label };
}

/**
 * What "Approve" accepts for a course: the engine's result when it decided the course, otherwise the
 * agent's recommendation if it made one, otherwise the engine's suggestion.
 */
export function recommendationOf(ev) {
  if (!ev?.path) return null;
  if (DECIDED.includes(ev.outcome)) return { outcome: ev.outcome, award: ev.outcome === 'no_credit' ? null : ev.award, source: 'engine' };
  if (DECIDED.includes(ev.agent_outcome)) {
    return { outcome: ev.agent_outcome, award: ev.agent_outcome === 'no_credit' ? null : ev.agent_bu_course, source: 'agent' };
  }
  if (ev.suggestion) return { ...fromLabel(ev.suggestion), source: 'engine' };
  return null;
}

// Evaluators sometimes mention the student in a reason; precedents must not carry that forward
function scrubReason(reason, application) {
  let text = String(reason || '').trim();
  for (const value of [application.student_name, application.student_email, application.student_phone]) {
    if (!value) continue;
    for (const part of [value, ...String(value).split(/\s+/).filter((p) => p.length > 2)]) {
      text = text.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[student]');
    }
  }
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}

/**
 * Records an evaluator's decision on one transcript course and updates the memory.
 * @param {{ applicationId, courseId, action: 'approve'|'change'|'reject', outcome?, buAward?, reason?, user }} input
 */
export async function recordCourseDecision({ applicationId, courseId, action, outcome, buAward, reason, user }) {
  const { rows: [course] } = await query(
    `SELECT tc.*, a.student_name, a.student_email, a.student_phone
     FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id
     WHERE tc.id = $1 AND tc.application_id = $2`,
    [courseId, applicationId]
  );
  if (!course) throw notFound('Transcript course');

  const { rows: [ev] } = await query(
    `SELECT ce.* FROM course_evaluations ce
     WHERE ce.transcript_course_id = $1
       AND ce.ai_evaluation_id = (SELECT id FROM ai_evaluations WHERE application_id = $2 ORDER BY created_at DESC LIMIT 1)`,
    [courseId, applicationId]
  );
  const rec = recommendationOf(ev);

  let decision;
  if (action === 'approve') {
    if (!rec) throw badRequest('There is no recommendation to approve for this course; choose Change instead.');
    decision = { outcome: rec.outcome, award: rec.award };
  } else if (action === 'change') {
    if (!DECIDED.includes(outcome)) throw badRequest('Choose transfer, elective or no credit.');
    if (outcome !== 'no_credit' && !String(buAward || '').trim()) throw badRequest('Enter the BU course or elective awarded.');
    if (!String(reason || '').trim()) throw badRequest('A reason is required when changing the recommendation.');
    decision = { outcome, award: outcome === 'no_credit' ? null : String(buAward).trim() };
  } else if (action === 'reject') {
    if (!String(reason || '').trim()) throw badRequest('A reason is required when rejecting a course.');
    decision = { outcome: 'no_credit', award: null };
  } else {
    throw badRequest('Action must be approve, change or reject.');
  }

  const matched = !!rec && rec.outcome === decision.outcome && (rec.award || null) === (decision.award || null);
  const cleanReason = scrubReason(reason, course) || null;
  const recommendationText = rec ? (rec.award || 'No credit') : null;

  // Course-level knowledge becomes a precedent; rule outcomes (grade, withdrawal, caps) are about this student only,
  // and approving an existing equivalency adds nothing new
  const teachesMemory = ev && ev.path !== 'rule' && !(ev.path === 'equivalency' && action === 'approve');

  const client = await getClient();
  let pastDecisionId = null;
  let promoted = null;
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(`SELECT past_decision_id FROM course_decisions WHERE transcript_course_id = $1`, [courseId]);

    if (teachesMemory) {
      const values = [course.institution, course.course_code, recommendationText, DECISION_LABEL[decision.outcome], decision.award || '—',
        cleanReason || (matched ? 'Evaluator approved the recommendation.' : null), course.credit_system, user.full_name, user.id];
      if (existing?.past_decision_id) {
        await client.query(
          `UPDATE past_decisions SET institution = $1, course_code = $2, proposed_bu = $3, decision = $4, bu_awarded = $5, reason = $6,
             credit_system = $7, evaluator = $8, decided_by = $9, decided_on = CURRENT_DATE, status = 'active' WHERE decision_id = $10`,
          [...values, existing.past_decision_id]
        );
        pastDecisionId = existing.past_decision_id;
      } else {
        const { rows: [pd] } = await client.query(
          `INSERT INTO past_decisions (decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, credit_system, evaluator, decided_by, decided_on, source)
           VALUES ('PD-' || nextval('past_decision_number_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'evaluator') RETURNING decision_id`,
          values
        );
        pastDecisionId = pd.decision_id;
      }
    } else if (existing?.past_decision_id) {
      await client.query(`UPDATE past_decisions SET status = 'revoked' WHERE decision_id = $1`, [existing.past_decision_id]);
    }

    await client.query(
      `INSERT INTO course_decisions (application_id, transcript_course_id, course_evaluation_id, action, outcome, bu_award, reason, recommendation,
         matched_recommendation, past_decision_id, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (transcript_course_id) DO UPDATE SET course_evaluation_id = EXCLUDED.course_evaluation_id, action = EXCLUDED.action,
         outcome = EXCLUDED.outcome, bu_award = EXCLUDED.bu_award, reason = EXCLUDED.reason, recommendation = EXCLUDED.recommendation,
         matched_recommendation = EXCLUDED.matched_recommendation, past_decision_id = EXCLUDED.past_decision_id,
         decided_by = EXCLUDED.decided_by, decided_at = NOW()`,
      [applicationId, courseId, ev?.id || null, action, decision.outcome, decision.award, cleanReason, recommendationText, matched, pastDecisionId, user.id]
    );

    if (pastDecisionId && decision.outcome === 'transfer' && SINGLE_BU_COURSE.test(decision.award)) {
      promoted = await promoteIfAgreed(client, course, decision.award);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  invalidateEngine();
  await auditLog({
    applicationId, action: 'course_decision', actorId: user.id, actorEmail: user.email,
    details: { course_code: course.course_code, institution: course.institution, action, outcome: decision.outcome, bu_award: decision.award,
      matched_recommendation: matched, past_decision_id: pastDecisionId, promoted_equivalency: promoted?.eq_id || null },
  });
  return { outcome: decision.outcome, bu_award: decision.award, matched_recommendation: matched, past_decision_id: pastDecisionId, promoted_equivalency: promoted };
}

// Promote to an equivalency once enough different evaluators awarded the same BU course and no active precedent disagrees
async function promoteIfAgreed(client, course, award) {
  const { rows: [eq] } = await client.query(
    `SELECT eq_id FROM equivalencies WHERE institution = $1 AND course_code = $2 AND status = 'active'`, [course.institution, course.course_code]);
  if (eq) return null;

  const { rows } = await client.query(
    `SELECT decision_id, bu_awarded, COALESCE(decided_by::text, evaluator) AS who FROM past_decisions
     WHERE institution = $1 AND course_code = $2 AND status = 'active'`,
    [course.institution, course.course_code]
  );
  if (rows.some((r) => r.bu_awarded !== award)) return null;
  const evaluators = new Set(rows.map((r) => r.who));
  if (evaluators.size < PROMOTION_MIN_EVALUATORS) return null;

  const { rows: [created] } = await client.query(
    `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, approved_on, evaluator, source, promoted_from)
     VALUES ('EQ-' || nextval('equivalency_number_seq'), $1, $2, $3, $4, 'BU equivalent', CURRENT_DATE, 'Promoted from precedents', 'promoted', $5)
     ON CONFLICT (institution, course_code) DO UPDATE SET bu_course = EXCLUDED.bu_course, status = 'active', source = 'promoted',
       promoted_from = EXCLUDED.promoted_from, approved_on = EXCLUDED.approved_on
     RETURNING eq_id, bu_course, promoted_from`,
    [course.institution, course.course_code, course.title, award, rows.map((r) => r.decision_id)]
  );
  return created;
}

/** Approves every course the engine decided on its own (equivalency, rule or past decision) that has no decision yet. */
export async function approveAutomatic(applicationId, user) {
  const { rows } = await query(
    `SELECT tc.id FROM transcript_courses tc
     JOIN course_evaluations ce ON ce.transcript_course_id = tc.id
       AND ce.ai_evaluation_id = (SELECT id FROM ai_evaluations WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1)
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     WHERE tc.application_id = $1 AND cd.id IS NULL AND ce.path IN ('equivalency', 'rule', 'precedent')
     ORDER BY tc.position`,
    [applicationId]
  );
  for (const r of rows) await recordCourseDecision({ applicationId, courseId: r.id, action: 'approve', user });
  return { approved: rows.length };
}

export async function getMemory() {
  const [equivalencies, decisions, stats] = await Promise.all([
    query(`SELECT eq_id, institution, course_code, title, bu_course, outcome, TO_CHAR(approved_on, 'YYYY-MM-DD') AS approved_on, evaluator, source, status, promoted_from
           FROM equivalencies ORDER BY (source = 'promoted') DESC, institution, course_code`),
    query(`SELECT decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, TO_CHAR(decided_on, 'YYYY-MM-DD') AS decided_on,
             evaluator, source, status
           FROM past_decisions ORDER BY (source = 'evaluator') DESC, decided_on DESC NULLS LAST, decision_id`),
    query(`SELECT COUNT(*)::int AS decisions, COUNT(*) FILTER (WHERE matched_recommendation)::int AS matched,
             (SELECT COUNT(*)::int FROM past_decisions WHERE source = 'evaluator' AND status = 'active') AS learned_precedents,
             (SELECT COUNT(*)::int FROM equivalencies WHERE source = 'promoted' AND status = 'active') AS promoted_equivalencies
           FROM course_decisions`),
  ]);
  const s = stats.rows[0];
  return {
    equivalencies: equivalencies.rows,
    past_decisions: decisions.rows,
    stats: { ...s, agreement_rate: s.decisions ? Math.round((100 * s.matched) / s.decisions) : null, promotion_min_evaluators: PROMOTION_MIN_EVALUATORS },
  };
}

/** Revokes or restores a precedent or equivalency; revoked entries stop influencing evaluations immediately. */
export async function setMemoryStatus(kind, id, status, user) {
  if (!['active', 'revoked'].includes(status)) throw badRequest('Status must be active or revoked.');
  const table = kind === 'equivalency' ? 'equivalencies' : kind === 'precedent' ? 'past_decisions' : null;
  if (!table) throw badRequest('Kind must be equivalency or precedent.');
  const idColumn = table === 'equivalencies' ? 'eq_id' : 'decision_id';
  const { rowCount } = await query(`UPDATE ${table} SET status = $1 WHERE ${idColumn} = $2`, [status, id]);
  if (!rowCount) throw notFound(kind === 'equivalency' ? 'Equivalency' : 'Precedent');
  invalidateEngine();
  await auditLog({ action: `memory_${status}`, actorId: user.id, actorEmail: user.email, details: { kind, id } });
  return { id, status };
}

export default { recommendationOf, recordCourseDecision, approveAutomatic, getMemory, setMemoryStatus };
