// Dashboard counts in context: a period (from / to dates, inclusive) and a term (the student's BU start term, the
// cohort the one-year transfer deadline is measured from). Every figure is counted in SQL from course reviews,
// decisions, assignments and postings; nothing is calculated in the browser.
//
// A period applies to the event behind a count (assigned, completed, received, posted, reassigned). Counts of work
// that is open now (not started, in progress, needs review, awaiting the Credit Evaluation Office) describe the
// present, so only the term filters them.
import { z } from 'zod';
import { query } from '../../config/db.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Query-string filters: term (BU start term), from / to (YYYY-MM-DD, inclusive). Empty values mean "all". */
export const filterSchema = z.object({
  term: z.string().trim().max(40).optional().transform((v) => v || null),
  from: DATE.optional().or(z.literal('')).transform((v) => v || null),
  to: DATE.optional().or(z.literal('')).transform((v) => v || null),
});

// $n::date bounds; the end date is inclusive
const inPeriod = (column, from, to) => `(${from}::date IS NULL OR ${column} >= ${from}::date) AND (${to}::date IS NULL OR ${column} < ${to}::date + 1)`;
const OPEN = `('new', 'in_progress', 'info_requested')`;

/** BU start terms that have submitted evaluations, newest first (e.g. Fall 2026, Spring 2026). */
export async function startTerms() {
  const { rows } = await query(
    `SELECT DISTINCT expected_start_term AS term FROM applications WHERE expected_start_term IS NOT NULL AND expected_start_term <> '' AND status <> 'draft'`);
  const order = { spring: 1, summer: 2, fall: 3 };
  const key = (t) => {
    const m = /(spring|summer|fall)\D*(\d{4})/i.exec(t);
    return m ? Number(m[2]) * 10 + order[m[1].toLowerCase()] : 0;
  };
  return rows.map((r) => r.term).sort((a, b) => key(b) - key(a) || a.localeCompare(b));
}

/** One evaluator's courses: assigned and completed in the period; not started, in progress and needing review now. */
export async function evaluatorCounts(evaluatorId, { term = null, from = null, to = null } = {}) {
  const { rows: [c] } = await query(
    `SELECT COUNT(*) FILTER (WHERE r.assigned_at IS NOT NULL AND ${inPeriod('r.assigned_at', '$3', '$4')})::int AS assigned,
            COUNT(*) FILTER (WHERE r.status = 'new')::int AS not_started,
            COUNT(*) FILTER (WHERE r.status IN ('in_progress', 'info_requested'))::int AS in_progress,
            COUNT(*) FILTER (WHERE r.status IN ('approved', 'rejected') AND ${inPeriod('r.completed_at', '$3', '$4')})::int AS completed,
            COUNT(*) FILTER (WHERE r.status IN ${OPEN} AND (ir.status = 'responded' OR r.returned_at IS NOT NULL))::int AS needs_review
     FROM course_reviews r JOIN applications a ON a.id = r.application_id
     LEFT JOIN information_requests ir ON ir.id = r.info_request_id
     WHERE r.evaluator_id = $1 AND r.status <> 'withdrawn' AND ($2::text IS NULL OR a.expected_start_term = $2)`,
    [evaluatorId, term, from, to]);
  return c;
}

/** The whole process: what arrived and what was done in the period, and what is waiting now. */
export async function adminCounts({ term = null, from = null, to = null } = {}) {
  const termFilter = `($1::text IS NULL OR a.expected_start_term = $1)`;
  const params = [term, from, to];
  const [received, reviews, decided, reassigned, office, posted] = await Promise.all([
    query(`WITH s AS (SELECT a.id FROM applications a
                      WHERE a.status <> 'draft' AND ${termFilter} AND a.submitted_at IS NOT NULL AND ${inPeriod('a.submitted_at', '$2', '$3')})
           SELECT (SELECT COUNT(*) FROM s)::int AS evaluations,
                  (SELECT COUNT(*) FROM application_documents d JOIN s ON s.id = d.application_id WHERE d.document_type = 'transcript')::int AS transcripts,
                  (SELECT COUNT(*) FROM transcript_courses tc JOIN s ON s.id = tc.application_id)::int AS courses`, params),
    query(`SELECT COUNT(*) FILTER (WHERE r.status IN ('queued', 'new'))::int AS pending,
                  COUNT(*) FILTER (WHERE r.status IN ('in_progress', 'info_requested'))::int AS in_progress
           FROM course_reviews r JOIN applications a ON a.id = r.application_id WHERE ${termFilter} AND a.status <> 'closed'`, [term]),
    query(`SELECT COUNT(*)::int AS completed,
                  COUNT(*) FILTER (WHERE cd.decided_via = 'evaluator')::int AS by_department,
                  COUNT(*) FILTER (WHERE cd.decided_via IN ('established_equivalency', 'policy_rule'))::int AS automatic
           FROM course_decisions cd JOIN applications a ON a.id = cd.application_id WHERE ${termFilter} AND ${inPeriod('cd.decided_at', '$2', '$3')}`, params),
    query(`SELECT COUNT(*)::int AS reassigned FROM review_assignments ra JOIN course_reviews r ON r.id = ra.review_id JOIN applications a ON a.id = r.application_id
           -- A course moved away from an evaluator; placing a course from the office queue is not a reassignment
           WHERE ra.ended_at IS NOT NULL AND ra.evaluator_id IS NOT NULL AND ${termFilter} AND ${inPeriod('ra.ended_at', '$2', '$3')}`, params),
    query(`WITH s AS (SELECT a.id FROM applications a WHERE a.status = 'ready_for_posting' AND ${termFilter})
           SELECT (SELECT COUNT(*) FROM s)::int AS applications,
                  (SELECT COUNT(*) FROM course_decisions cd JOIN s ON s.id = cd.application_id
                     LEFT JOIN credit_postings cp ON cp.transcript_course_id = cd.transcript_course_id WHERE cp.id IS NULL)::int AS courses`, [term]),
    query(`WITH s AS (SELECT a.id FROM applications a
                      WHERE a.status = 'credit_posted' AND ${termFilter} AND a.posted_at IS NOT NULL AND ${inPeriod('a.posted_at', '$2', '$3')})
           SELECT (SELECT COUNT(*) FROM s)::int AS applications,
                  (SELECT COALESCE(SUM(cp.units), 0) FROM credit_postings cp JOIN s ON s.id = cp.application_id)::float AS credits`, params),
  ]);
  return {
    transcripts: received.rows[0].transcripts,
    evaluations_received: received.rows[0].evaluations,
    courses: received.rows[0].courses,
    pending: reviews.rows[0].pending,
    in_progress: reviews.rows[0].in_progress,
    completed: decided.rows[0].completed,
    completed_by_department: decided.rows[0].by_department,
    completed_automatically: decided.rows[0].automatic,
    reassigned: reassigned.rows[0].reassigned,
    awaiting_credit_office: office.rows[0].applications,
    awaiting_credit_office_courses: office.rows[0].courses,
    credit_transfers_completed: posted.rows[0].applications,
    credits_posted: posted.rows[0].credits,
  };
}

export default { filterSchema, startTerms, evaluatorCounts, adminCounts };
