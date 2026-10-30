// What the institution already knows about a transfer course: its established equivalency, earlier decisions,
// decisions on other courses that map to the same BU course, and conflicts between them. Everything is derived
// from equivalencies, past_decisions (reference data plus every evaluator decision) and course_reviews.
//
// Conflict rules (only meaningful disagreements are flagged):
//   different_bu_course   two active decisions for the same source course award different BU courses, or a
//                         decision made after the established equivalency awards a different BU course
//   different_outcome     one decision grants a BU course while another grants only elective or no credit
//   match_divergence      open reviews of the same source course whose course-match scores differ by
//                         MATCH_DIVERGENCE or more (0.25 = 25 points; small differences are not flagged)
// A conflict is resolved once an administrator or the Credit Evaluation Office records a standard equivalency
// on or after the latest conflicting decision, or marks the conflict resolved (conflict_resolutions) after it.
// Resolving never changes an evaluator's decision; it sets the equivalency that applies to future transcripts.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { invalidateEngine } from '../credit/credit.service.js';
import { badRequest } from '../../utils/errors.js';

export const MATCH_DIVERGENCE = 0.25;
const BU_CODE = /\bCAS [A-Z]{2} \d{3}\b/g;

/** The BU courses an award names, e.g. "CAS CH 101 + CAS CH 102" -> "CAS CH 101 + CAS CH 102". */
const buCourses = (award) => (String(award || '').match(BU_CODE) || []).join(' + ');

/** Grants a specific BU course (as opposed to elective credit or no credit). */
const grantsBuCourse = (d) => d.decision === 'BU equivalent' && buCourses(d.bu_awarded) !== '';

/** Plain-language strength of a 0–1 course match. */
export function matchLabel(score) {
  if (score == null) return null;
  return score >= 0.85 ? 'Strong match' : score >= 0.65 ? 'Partial match' : 'Weak match';
}

function detect(decisions, equivalency, scores = [], resolvedAt = null) {
  let relevant = equivalency?.approved_on
    ? decisions.filter((d) => !d.decided_on || d.decided_on > equivalency.approved_on)
    : decisions;
  // Marked resolved: only decisions recorded after the resolution can re-open the conflict
  if (resolvedAt) relevant = relevant.filter((d) => d.recorded_at && new Date(d.recorded_at) > new Date(resolvedAt));
  const conflicts = [];

  const awards = [...new Set(relevant.filter(grantsBuCourse).map((d) => buCourses(d.bu_awarded)))];
  if (awards.length > 1) {
    conflicts.push({ type: 'different_bu_course', summary: `Decisions award different BU courses: ${awards.join(' vs ')}.` });
  } else if (equivalency?.bu_course && awards.length === 1 && buCourses(equivalency.bu_course) && awards[0] !== buCourses(equivalency.bu_course)) {
    conflicts.push({ type: 'different_bu_course', summary: `A later decision awards ${awards[0]}, but the established equivalency is ${equivalency.bu_course}.` });
  }

  const granted = relevant.filter(grantsBuCourse);
  const notGranted = relevant.filter((d) => !grantsBuCourse(d));
  if (granted.length && notGranted.length) {
    const verb = (n) => (n === 1 ? 'grants' : 'grant');
    conflicts.push({ type: 'different_outcome', summary: `${granted.length} decision${granted.length === 1 ? '' : 's'} ${verb(granted.length)} a BU course; ${notGranted.length} ${verb(notGranted.length)} only ${[...new Set(notGranted.map((d) => d.decision.toLowerCase()))].join(' or ')}.` });
  }

  const numeric = scores.map(Number).filter((s) => !Number.isNaN(s));
  if (!resolvedAt && numeric.length > 1 && Math.max(...numeric) - Math.min(...numeric) >= MATCH_DIVERGENCE) {
    conflicts.push({ type: 'match_divergence', summary: `Course-match scores range from ${Math.round(Math.min(...numeric) * 100)}% to ${Math.round(Math.max(...numeric) * 100)}%.` });
  }
  return conflicts;
}

const DECISION_COLUMNS = `pd.decision_id, pd.decision, pd.bu_awarded, pd.reason, TO_CHAR(pd.decided_on, 'YYYY-MM-DD') AS decided_on, pd.source,
  pd.created_at AS recorded_at, CASE WHEN pd.source = 'evaluator' THEN COALESCE(p.full_name, pd.evaluator) ELSE pd.evaluator END AS evaluator`;

/**
 * Everything known about one transfer course, for the evaluator reviewing it.
 * @param {{institution, courseCode, targetBuCourse?}} course
 */
export async function courseKnowledge({ institution, courseCode, targetBuCourse }) {
  // A combined award ("CAS CH 101 + CAS CH 102") is looked up by its first BU course
  const target = buCourses(targetBuCourse).split(' + ')[0] || targetBuCourse || null;
  const [eq, decisions, similar, scores, escalations, resolution] = await Promise.all([
    query(`SELECT e.eq_id, e.bu_course, e.outcome, TO_CHAR(e.approved_on, 'YYYY-MM-DD') AS approved_on, e.source, e.evaluator,
                  COALESCE(array_length(e.promoted_from, 1), 0) AS from_decisions,
                  (SELECT COUNT(DISTINCT ce.transcript_course_id)::int FROM course_evaluations ce WHERE ce.equivalency_id = e.eq_id) AS times_applied
           FROM equivalencies e WHERE e.institution = $1 AND e.course_code = $2 AND e.status = 'active'`, [institution, courseCode]),
    query(`SELECT ${DECISION_COLUMNS} FROM past_decisions pd LEFT JOIN profiles p ON p.id = pd.decided_by
           WHERE pd.institution = $1 AND pd.course_code = $2 AND pd.status = 'active' ORDER BY pd.decided_on DESC NULLS LAST`, [institution, courseCode]),
    target
      ? query(`SELECT pd.institution, pd.course_code, pd.decision, pd.bu_awarded, TO_CHAR(pd.decided_on, 'YYYY-MM-DD') AS decided_on
               FROM past_decisions pd WHERE pd.status = 'active' AND pd.bu_awarded LIKE '%' || $1 || '%'
                 AND NOT (pd.institution = $2 AND pd.course_code = $3)
               UNION ALL
               SELECT e.institution, e.course_code, 'Established equivalency', e.bu_course, TO_CHAR(e.approved_on, 'YYYY-MM-DD')
               FROM equivalencies e WHERE e.status = 'active' AND e.bu_course = $1 AND NOT (e.institution = $2 AND e.course_code = $3)
               ORDER BY decided_on DESC NULLS LAST LIMIT 6`, [target, institution, courseCode])
      : { rows: [] },
    query(`SELECT r.match_score FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
           WHERE tc.institution = $1 AND COALESCE(tc.catalog_code, tc.course_code) = $2 AND r.status IN ('new', 'in_progress', 'info_requested')
             AND r.match_score IS NOT NULL AND r.match_basis = 'similarity'`,
      [institution, courseCode]),
    query(`SELECT al.created_at, COALESCE(p.full_name, al.actor_email) AS actor, al.details->>'note' AS note FROM audit_logs al
           LEFT JOIN profiles p ON p.id = al.actor_id
           WHERE al.action = 'conflict_escalated' AND al.details->>'institution' = $1 AND al.details->>'course_code' = $2
           ORDER BY al.created_at DESC LIMIT 3`, [institution, courseCode]),
    query(`SELECT cr.action, cr.note, cr.created_at, COALESCE(p.full_name, 'Staff') AS resolved_by FROM conflict_resolutions cr
           LEFT JOIN profiles p ON p.id = cr.resolved_by
           WHERE cr.institution = $1 AND cr.course_code = $2 AND cr.action IN ('resolved', 'use_established')
           ORDER BY cr.created_at DESC LIMIT 1`, [institution, courseCode]),
  ]);

  const established = eq.rows[0] || null;
  const resolved = resolution.rows[0] || null;
  const rows = decisions.rows;
  const byAward = new Map();
  for (const d of rows) {
    const key = grantsBuCourse(d) ? buCourses(d.bu_awarded) : d.decision;
    const entry = byAward.get(key) || { award: key, grants_bu_course: grantsBuCourse(d), count: 0, decision_ids: [] };
    entry.count += 1;
    entry.decision_ids.push(d.decision_id);
    byAward.set(key, entry);
  }
  const outcomes = [...byAward.values()].sort((a, b) => b.count - a.count);
  return {
    established,
    previous: {
      total: rows.length,
      by_evaluators: rows.filter((d) => d.source === 'evaluator').length,
      outcomes,
      most_common: outcomes[0] || null,
      decisions: rows,
    },
    similar: similar.rows,
    conflicts: detect(rows, established, scores.rows.map((s) => s.match_score), resolved?.created_at),
    escalations: escalations.rows,
    resolution: resolved,
  };
}

/**
 * Records what was done about a potential equivalency conflict. 'resolved' (Credit Evaluation Office or
 * administrator) closes the conflict until a newer decision disagrees again; 'use_established', 'override' and
 * 'additional_review' are recorded from the evaluator's review of a course.
 */
export async function recordResolution({ institution, courseCode, action, buCourse = null, note = null, reviewId = null }, user) {
  if (!institution || !courseCode) throw badRequest('Choose the source course.');
  const { rows: [row] } = await query(
    `INSERT INTO conflict_resolutions (institution, course_code, action, bu_course, note, review_id, resolved_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, action, created_at`,
    [institution, courseCode, action, buCourse, note ? String(note).trim() : null, reviewId, user.id]
  );
  await auditLog({ action: `conflict_${action}`, actorId: user.id, actorEmail: user.email,
    details: { institution, course_code: courseCode, bu_course: buCourse, note, review_id: reviewId } });
  return row;
}

/** Every source course with an unresolved conflict, for administrators. */
export async function listConflicts() {
  const { rows: candidates } = await query(
    `SELECT institution, course_code FROM (
       SELECT institution, course_code FROM past_decisions WHERE status = 'active' GROUP BY institution, course_code HAVING COUNT(*) > 1
       UNION
       SELECT pd.institution, pd.course_code FROM past_decisions pd
         JOIN equivalencies e ON e.institution = pd.institution AND e.course_code = pd.course_code AND e.status = 'active'
         WHERE pd.status = 'active' AND (e.approved_on IS NULL OR pd.decided_on > e.approved_on)
       UNION
       SELECT tc.institution, COALESCE(tc.catalog_code, tc.course_code) FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
         WHERE r.status IN ('new', 'in_progress', 'info_requested') AND r.match_score IS NOT NULL AND r.match_basis = 'similarity'
         GROUP BY tc.institution, COALESCE(tc.catalog_code, tc.course_code) HAVING MAX(r.match_score) - MIN(r.match_score) >= $1
     ) c ORDER BY institution, course_code`,
    [MATCH_DIVERGENCE]
  );
  const results = [];
  for (const c of candidates) {
    const k = await courseKnowledge({ institution: c.institution, courseCode: c.course_code });
    if (!k.conflicts.length) continue;
    const { rows: [catalog] } = await query(`SELECT title FROM catalog_courses WHERE institution = $1 AND course_code = $2`, [c.institution, c.course_code]);
    const { rows: [open] } = await query(
      `SELECT COUNT(*)::int AS n FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
       WHERE tc.institution = $1 AND COALESCE(tc.catalog_code, tc.course_code) = $2 AND r.status IN ('queued', 'new', 'in_progress', 'info_requested')`,
      [c.institution, c.course_code]
    );
    results.push({ institution: c.institution, course_code: c.course_code, title: catalog?.title || null, open_reviews: open.n, ...k });
  }
  return results;
}

/**
 * Records the standard equivalency for a source course (administrators only). Applies to future transcripts;
 * existing evaluator decisions stay as they were.
 */
export async function recordStandard({ institution, courseCode, buCourse, outcome = 'BU equivalent', note }, user) {
  const award = String(buCourse || '').trim();
  if (!institution || !courseCode) throw badRequest('Choose the source course.');
  if (outcome === 'BU equivalent' && !buCourses(award)) throw badRequest('Enter the BU course code, e.g. CAS CS 111.');
  const { rows: ids } = await query(
    `SELECT decision_id FROM past_decisions WHERE institution = $1 AND course_code = $2 AND status = 'active'`, [institution, courseCode]);
  const { rows: [eq] } = await query(
    `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, approved_on, evaluator, source, status, promoted_from, data_source,
                               approved_by, approved_at, note)
     VALUES ('EQ-' || nextval('equivalency_number_seq'), $1, $2,
             (SELECT title FROM catalog_courses WHERE institution = $1 AND course_code = $2), $3, $4, CURRENT_DATE, $5, 'standard', 'active', $6, 'user',
             $7, NOW(), $8)
     ON CONFLICT (institution, course_code) DO UPDATE SET bu_course = EXCLUDED.bu_course, outcome = EXCLUDED.outcome, approved_on = CURRENT_DATE,
       evaluator = EXCLUDED.evaluator, source = 'standard', status = 'active', promoted_from = EXCLUDED.promoted_from, data_source = 'user',
       approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, note = COALESCE(EXCLUDED.note, equivalencies.note)
     RETURNING eq_id, bu_course, outcome`,
    [institution, courseCode, award || null, outcome, user.full_name, ids.map((r) => r.decision_id), user.id, note ? String(note).trim().slice(0, 2000) : null]
  );
  invalidateEngine();
  await auditLog({ action: 'equivalency_standardized', actorId: user.id, actorEmail: user.email,
    newValue: eq, details: { institution, course_code: courseCode, note: note || null } });
  return eq;
}

export default { courseKnowledge, listConflicts, recordStandard, recordResolution, matchLabel, MATCH_DIVERGENCE };
