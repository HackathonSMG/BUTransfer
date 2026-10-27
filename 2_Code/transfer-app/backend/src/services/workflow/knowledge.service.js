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
// A conflict is resolved once an administrator records a standard equivalency on or after the latest
// conflicting decision. Resolving never changes an evaluator's decision; it sets the equivalency that
// applies to future transcripts.
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

function detect(decisions, equivalency, scores = []) {
  const relevant = equivalency?.approved_on
    ? decisions.filter((d) => !d.decided_on || d.decided_on > equivalency.approved_on)
    : decisions;
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
  if (numeric.length > 1 && Math.max(...numeric) - Math.min(...numeric) >= MATCH_DIVERGENCE) {
    conflicts.push({ type: 'match_divergence', summary: `Course-match scores range from ${Math.round(Math.min(...numeric) * 100)}% to ${Math.round(Math.max(...numeric) * 100)}%.` });
  }
  return conflicts;
}

const DECISION_COLUMNS = `pd.decision_id, pd.decision, pd.bu_awarded, pd.reason, TO_CHAR(pd.decided_on, 'YYYY-MM-DD') AS decided_on, pd.source,
  CASE WHEN pd.source = 'evaluator' THEN COALESCE(p.full_name, pd.evaluator) ELSE NULL END AS evaluator`;

/**
 * Everything known about one transfer course, for the evaluator reviewing it.
 * @param {{institution, courseCode, targetBuCourse?}} course
 */
export async function courseKnowledge({ institution, courseCode, targetBuCourse }) {
  const [eq, decisions, similar, scores, escalations] = await Promise.all([
    query(`SELECT eq_id, bu_course, outcome, TO_CHAR(approved_on, 'YYYY-MM-DD') AS approved_on, source, evaluator, COALESCE(array_length(promoted_from, 1), 0) AS from_decisions
           FROM equivalencies WHERE institution = $1 AND course_code = $2 AND status = 'active'`, [institution, courseCode]),
    query(`SELECT ${DECISION_COLUMNS} FROM past_decisions pd LEFT JOIN profiles p ON p.id = pd.decided_by
           WHERE pd.institution = $1 AND pd.course_code = $2 AND pd.status = 'active' ORDER BY pd.decided_on DESC NULLS LAST`, [institution, courseCode]),
    targetBuCourse
      ? query(`SELECT pd.institution, pd.course_code, pd.decision, pd.bu_awarded, TO_CHAR(pd.decided_on, 'YYYY-MM-DD') AS decided_on
               FROM past_decisions pd WHERE pd.status = 'active' AND pd.bu_awarded LIKE '%' || $1 || '%'
                 AND NOT (pd.institution = $2 AND pd.course_code = $3)
               UNION ALL
               SELECT e.institution, e.course_code, 'Established equivalency', e.bu_course, TO_CHAR(e.approved_on, 'YYYY-MM-DD')
               FROM equivalencies e WHERE e.status = 'active' AND e.bu_course = $1 AND NOT (e.institution = $2 AND e.course_code = $3)
               ORDER BY decided_on DESC NULLS LAST LIMIT 6`, [targetBuCourse, institution, courseCode])
      : { rows: [] },
    query(`SELECT r.match_score FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
           WHERE tc.institution = $1 AND tc.course_code = $2 AND r.status IN ('new', 'in_progress', 'info_requested') AND r.match_score IS NOT NULL`,
      [institution, courseCode]),
    query(`SELECT al.created_at, COALESCE(p.full_name, al.actor_email) AS actor, al.details->>'note' AS note FROM audit_logs al
           LEFT JOIN profiles p ON p.id = al.actor_id
           WHERE al.action = 'conflict_escalated' AND al.details->>'institution' = $1 AND al.details->>'course_code' = $2
           ORDER BY al.created_at DESC LIMIT 3`, [institution, courseCode]),
  ]);

  const established = eq.rows[0] || null;
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
    conflicts: detect(rows, established, scores.rows.map((s) => s.match_score)),
    escalations: escalations.rows,
  };
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
       SELECT tc.institution, tc.course_code FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
         WHERE r.status IN ('new', 'in_progress', 'info_requested') AND r.match_score IS NOT NULL
         GROUP BY tc.institution, tc.course_code HAVING MAX(r.match_score) - MIN(r.match_score) >= $1
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
       WHERE tc.institution = $1 AND tc.course_code = $2 AND r.status IN ('queued', 'new', 'in_progress', 'info_requested')`,
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
    `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, approved_on, evaluator, source, status, promoted_from, data_source)
     VALUES ('EQ-' || nextval('equivalency_number_seq'), $1, $2,
             (SELECT title FROM catalog_courses WHERE institution = $1 AND course_code = $2), $3, $4, CURRENT_DATE, $5, 'promoted', 'active', $6, 'user')
     ON CONFLICT (institution, course_code) DO UPDATE SET bu_course = EXCLUDED.bu_course, outcome = EXCLUDED.outcome, approved_on = CURRENT_DATE,
       evaluator = EXCLUDED.evaluator, source = 'promoted', status = 'active', promoted_from = EXCLUDED.promoted_from, data_source = 'user'
     RETURNING eq_id, bu_course, outcome`,
    [institution, courseCode, award || null, outcome, user.full_name, ids.map((r) => r.decision_id)]
  );
  invalidateEngine();
  await auditLog({ action: 'equivalency_standardized', actorId: user.id, actorEmail: user.email,
    newValue: eq, details: { institution, course_code: courseCode, note: note || null } });
  return eq;
}

export default { courseKnowledge, listConflicts, recordStandard, matchLabel, MATCH_DIVERGENCE };
