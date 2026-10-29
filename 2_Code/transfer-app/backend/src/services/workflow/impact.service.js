// The measurable outcome (hackathon brief: "define one outcome you could measure"). Every figure is counted from
// stored data: course decisions and how they were made (decided_via), syllabus requests, review timestamps and
// whether evaluators agreed with the recommendation. Nothing is estimated; a figure with no data is null.
//
// Headline: automation rate = courses settled without department work (established equivalency or a
// deterministic policy rule) / all courses evaluated (pending courses included, so it is never inflated).
import { query } from '../../config/db.js';

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const hours = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);

/**
 * @param {{ applicationId?: string }} [scope] one application, or every submitted application
 */
export async function impactMetrics({ applicationId = null } = {}) {
  const where = applicationId ? 'a.id = $1' : `a.status NOT IN ('draft', 'closed')`;
  const params = applicationId ? [applicationId] : [];
  const { rows: [m] } = await query(
    `WITH c AS (
       SELECT tc.id, tc.credit_system, a.submitted_at, cd.decided_via, cd.outcome, cd.decided_at, cd.matched_recommendation,
              r.status AS review_status, r.started_at, r.completed_at,
              EXISTS (SELECT 1 FROM information_requests ir WHERE ir.transcript_course_id = tc.id AND ir.kind = 'syllabus') AS syllabus_requested,
              EXISTS (SELECT 1 FROM information_requests ir WHERE ir.transcript_course_id = tc.id) AS info_requested
       FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id
       LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
       LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
       WHERE ${where} AND COALESCE(r.status, '') <> 'withdrawn')
     SELECT COUNT(*)::int AS courses,
            COUNT(decided_via)::int AS decided,
            COUNT(*) FILTER (WHERE decided_via IN ('established_equivalency', 'policy_rule'))::int AS automatic,
            COUNT(*) FILTER (WHERE decided_via = 'established_equivalency')::int AS by_equivalency,
            COUNT(*) FILTER (WHERE decided_via = 'policy_rule')::int AS by_policy,
            COUNT(*) FILTER (WHERE decided_via = 'evaluator')::int AS by_department,
            COUNT(*) FILTER (WHERE decided_via IS NULL)::int AS pending,
            COUNT(*) FILTER (WHERE decided_via IS NULL AND review_status IS NOT NULL)::int AS with_department,
            COUNT(*) FILTER (WHERE credit_system ILIKE 'quarter')::int AS quarter_courses,
            COUNT(*) FILTER (WHERE syllabus_requested)::int AS syllabus_requested,
            COUNT(*) FILTER (WHERE decided_via = 'evaluator' AND NOT info_requested)::int AS department_without_request,
            COUNT(*) FILTER (WHERE decided_via = 'evaluator' AND matched_recommendation)::int AS agreed_with_recommendation,
            COUNT(*) FILTER (WHERE outcome = 'transfer')::int AS outcome_equivalent,
            COUNT(*) FILTER (WHERE outcome = 'elective')::int AS outcome_elective,
            COUNT(*) FILTER (WHERE outcome = 'no_credit')::int AS outcome_no_credit,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 3600)
              FILTER (WHERE decided_via IN ('established_equivalency', 'policy_rule') AND submitted_at IS NOT NULL) AS hours_to_decision_automatic,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 3600)
              FILTER (WHERE decided_via = 'evaluator' AND submitted_at IS NOT NULL) AS hours_to_decision_department,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600)
              FILTER (WHERE decided_via = 'evaluator' AND started_at IS NOT NULL AND completed_at IS NOT NULL) AS hours_evaluator_review
     FROM c`, params);

  // Institutional knowledge (whole institution only): what the equivalency memory holds, how much of it was
  // learned from department decisions, and how often established equivalencies have settled a course since
  const knowledge = applicationId ? null : (await query(
    `SELECT (SELECT COUNT(*)::int FROM equivalencies WHERE status = 'active') AS equivalencies,
            (SELECT COUNT(*)::int FROM equivalencies WHERE status = 'active' AND source = 'promoted') AS learned_equivalencies,
            (SELECT COUNT(*)::int FROM past_decisions WHERE status = 'active') AS precedents,
            (SELECT COUNT(*)::int FROM past_decisions WHERE status = 'active' AND source = 'evaluator') AS learned_precedents,
            (SELECT COUNT(*)::int FROM course_decisions WHERE decided_via = 'established_equivalency') AS reused`)).rows[0];

  return {
    knowledge,
    courses: m.courses,
    decided: m.decided,
    pending: m.pending,
    with_department: m.with_department,
    automatic: m.automatic,
    by_equivalency: m.by_equivalency,
    by_policy: m.by_policy,
    by_department: m.by_department,
    automation_rate: pct(m.automatic, m.courses),
    quarter_courses: m.quarter_courses,
    syllabus_requested: m.syllabus_requested,
    department_without_request: m.department_without_request,
    recommendation_agreement: pct(m.agreed_with_recommendation, m.by_department),
    outcomes: { equivalent: m.outcome_equivalent, elective: m.outcome_elective, no_credit: m.outcome_no_credit },
    median_hours: {
      to_decision_automatic: hours(m.hours_to_decision_automatic),
      to_decision_department: hours(m.hours_to_decision_department),
      evaluator_review: hours(m.hours_evaluator_review),
    },
  };
}

export default { impactMetrics };
