import { z } from 'zod';
import { query } from '../config/db.js';
import * as auditService from '../services/audit.service.js';
import { badRequest, notFound } from '../utils/errors.js';
import { listConflicts } from '../services/workflow/knowledge.service.js';

const criterionSchema = z.object({
  criterion_name: z.string().min(2).max(255),
  description: z.string().min(2).max(1000),
  rule_type: z.string().min(2).max(50),
  rule_config: z.record(z.any()).optional().default({}),
  is_required: z.boolean().optional().default(true),
  display_order: z.coerce.number().int().min(0).optional().default(0),
});

export async function getReports(req, res, next) {
  try {
    const [totalResult, byStatusResult, bySourceResult, avgTimeResult, recentDecisionsResult, monthlyResult, workloadResult] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM applications`),
      query(`SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY status`),
      query(`SELECT source, COUNT(*) AS count FROM applications GROUP BY source ORDER BY source`),
      query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at)) / 86400), 1) AS avg_days FROM applications WHERE decision_date IS NOT NULL AND submitted_at IS NOT NULL`),
      query(`SELECT a.reference_number, a.student_name, a.final_decision, a.decision_date, a.transfer_to_program, p.full_name AS decided_by FROM applications a LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id WHERE a.final_decision IS NOT NULL ORDER BY a.decision_date DESC LIMIT 10`),
      query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count FROM applications WHERE created_at >= NOW() - INTERVAL '6 months' GROUP BY month ORDER BY month ASC`),
      query(`SELECT p.full_name AS evaluator_name, p.email, COUNT(a.id) FILTER (WHERE a.status NOT IN ('approved', 'rejected', 'closed', 'credit_posted')) AS active_cases, COUNT(a.id) AS total_cases FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN applications a ON a.assigned_evaluator_id = e.id WHERE e.is_active = true GROUP BY p.full_name, p.email ORDER BY active_cases DESC`),
    ]);
    return res.status(200).json({
      data: {
        total_applications: parseInt(totalResult.rows[0].total, 10),
        by_status: byStatusResult.rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count, 10); return acc; }, {}),
        by_source: bySourceResult.rows.reduce((acc, row) => { acc[row.source] = parseInt(row.count, 10); return acc; }, {}),
        avg_processing_time_days: parseFloat(avgTimeResult.rows[0]?.avg_days) || null,
        recent_decisions: recentDecisionsResult.rows,
        monthly_submissions: monthlyResult.rows,
        evaluator_workload: workloadResult.rows,
      },
      meta: { generated_at: new Date().toISOString() },
    });
  } catch (err) { return next(err); }
}

/** Admin dashboard: headline counts, applications by status and program, evaluator workload, recent activity. */
export async function getOverview(req, res, next) {
  try {
    const [counts, byStatus, byProgram, reviews, workload, activity, attention, conflicts] = await Promise.all([
      query(`SELECT (SELECT COUNT(*) FROM evaluators e JOIN profiles p ON p.id = e.id WHERE e.is_active AND p.is_active)::int AS active_evaluators,
                    (SELECT COUNT(*) FROM evaluators)::int AS evaluators,
                    (SELECT COUNT(DISTINCT LOWER(student_email)) FROM applications)::int AS students,
                    (SELECT COUNT(*) FROM applications)::int AS applications,
                    (SELECT COUNT(*) FROM applications WHERE status NOT IN ('approved', 'rejected', 'closed', 'draft', 'credit_posted'))::int AS open_applications,
                    (SELECT COUNT(*) FROM applications WHERE status IN ('approved', 'rejected', 'closed', 'credit_posted'))::int AS completed_applications,
                    (SELECT COUNT(*) FROM applications WHERE status = 'ready_for_posting')::int AS ready_for_posting,
                    (SELECT COALESCE(SUM(units), 0) FROM credit_postings)::float AS credits_posted,
                    (SELECT COUNT(*) FROM course_decisions WHERE decided_via = 'established_equivalency')::int AS established_applied`),
      query(`SELECT status, COUNT(*)::int AS count FROM applications GROUP BY status`),
      query(`SELECT COALESCE(NULLIF(transfer_to_program, ''), 'Not specified') AS program, COUNT(*)::int AS count
             FROM applications GROUP BY 1 ORDER BY count DESC, program LIMIT 8`),
      query(`SELECT COUNT(*) FILTER (WHERE status IN ('new', 'in_progress', 'info_requested'))::int AS open,
                    COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
                    COUNT(*) FILTER (WHERE status IN ('approved', 'rejected'))::int AS completed,
                    COUNT(*) FILTER (WHERE evaluator_id IS NULL AND status NOT IN ('approved', 'rejected', 'withdrawn'))::int AS unassigned
             FROM course_reviews`),
      query(`SELECT p.full_name, e.department, e.max_concurrent_cases,
                    COUNT(r.id) FILTER (WHERE r.status IN ('new', 'in_progress', 'info_requested'))::int AS open,
                    COUNT(r.id) FILTER (WHERE r.status = 'queued')::int AS queued,
                    COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'rejected'))::int AS completed
             FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN course_reviews r ON r.evaluator_id = e.id
             WHERE e.is_active AND p.is_active
             GROUP BY p.full_name, e.department, e.max_concurrent_cases
             ORDER BY open DESC, completed DESC, p.full_name`),
      query(`SELECT al.action, al.created_at, al.details, a.reference_number, a.student_name, COALESCE(p.full_name, al.actor_email) AS actor
             FROM audit_logs al LEFT JOIN applications a ON a.id = al.application_id LEFT JOIN profiles p ON p.id = al.actor_id
             WHERE al.action NOT IN ('review_decided', 'review_started')
             ORDER BY al.created_at DESC LIMIT 8`),
      // Things an administrator should act on
      query(`SELECT
               (SELECT COUNT(DISTINCT tc.application_id) FROM transcript_courses tc
                  WHERE NOT EXISTS (SELECT 1 FROM course_reviews r WHERE r.transcript_course_id = tc.id)
                    AND NOT EXISTS (SELECT 1 FROM course_decisions cd WHERE cd.transcript_course_id = tc.id)
                    AND EXISTS (SELECT 1 FROM ai_evaluations ae WHERE ae.application_id = tc.application_id AND ae.status = 'completed'))::int AS unassigned_applications,
               (SELECT COUNT(*) FROM course_reviews WHERE evaluator_id IS NULL AND status NOT IN ('approved', 'rejected', 'withdrawn'))::int AS courses_without_evaluator,
               (SELECT COUNT(*) FROM transfer_requests WHERE status = 'pending')::int AS pending_transfers,
               (SELECT COUNT(*) FROM information_requests WHERE kind = 'syllabus' AND status = 'pending')::int AS syllabi_pending,
               (SELECT COUNT(*) FROM applications WHERE duplicate_status = 'suspected')::int AS suspected_duplicates,
               (SELECT COUNT(*) FROM applications WHERE status = 'ready_for_posting')::int AS ready_for_posting,
               (SELECT COALESCE(json_agg(json_build_object('full_name', x.full_name, 'open', x.open, 'capacity', x.cap) ORDER BY x.open DESC), '[]')
                  FROM (SELECT p.full_name, e.max_concurrent_cases AS cap,
                               (SELECT COUNT(*) FROM course_reviews r WHERE r.evaluator_id = e.id AND r.status IN ('new', 'in_progress', 'info_requested'))::int AS open
                        FROM evaluators e JOIN profiles p ON p.id = e.id WHERE e.is_active AND p.is_active) x
                  WHERE x.open >= 0.8 * x.cap) AS high_workload`),
      listConflicts(),
    ]);
    return res.status(200).json({
      data: {
        ...counts.rows[0],
        by_status: byStatus.rows.reduce((acc, r) => { acc[r.status] = r.count; return acc; }, {}),
        by_program: byProgram.rows,
        reviews: reviews.rows[0],
        evaluator_workload: workload.rows,
        recent_activity: activity.rows,
        attention: { ...attention.rows[0], conflicts: conflicts.length },
      },
    });
  } catch (err) { return next(err); }
}

export async function getAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const { rows, total } = await auditService.listAuditLogs({ action: req.query.action, actorId: req.query.actor_id, page, limit });
    return res.status(200).json({ data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { return next(err); }
}

export async function listCriteria(req, res, next) {
  try {
    const result = await query(`SELECT * FROM eligibility_criteria ORDER BY display_order ASC, criterion_name ASC`);
    return res.status(200).json({ data: result.rows });
  } catch (err) { return next(err); }
}

export async function createCriterion(req, res, next) {
  try {
    const parseResult = criterionSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const { criterion_name, description, rule_type, rule_config, is_required, display_order } = parseResult.data;
    const result = await query(
      `INSERT INTO eligibility_criteria (criterion_name, description, rule_type, rule_config, is_required, display_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [criterion_name, description, rule_type, JSON.stringify(rule_config), is_required, display_order]
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch (err) { return next(err); }
}

export async function updateCriterion(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM eligibility_criteria WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Criterion'));

    const parseResult = criterionSchema.partial().safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));

    const fields = parseResult.data;
    const setClauses = [];
    const params = [];
    let idx = 1;
    if (fields.criterion_name !== undefined) { setClauses.push(`criterion_name = $${idx++}`); params.push(fields.criterion_name); }
    if (fields.description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(fields.description); }
    if (fields.rule_type !== undefined) { setClauses.push(`rule_type = $${idx++}`); params.push(fields.rule_type); }
    if (fields.rule_config !== undefined) { setClauses.push(`rule_config = $${idx++}`); params.push(JSON.stringify(fields.rule_config)); }
    if (fields.is_required !== undefined) { setClauses.push(`is_required = $${idx++}`); params.push(fields.is_required); }
    if (fields.display_order !== undefined) { setClauses.push(`display_order = $${idx++}`); params.push(fields.display_order); }
    if (setClauses.length === 0) return next(badRequest('No fields to update'));

    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    const result = await query(`UPDATE eligibility_criteria SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return res.status(200).json({ data: result.rows[0] });
  } catch (err) { return next(err); }
}

export async function deleteCriterion(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM eligibility_criteria WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Criterion'));
    await query(`UPDATE eligibility_criteria SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return res.status(200).json({ data: { message: 'Criterion deactivated successfully' } });
  } catch (err) { return next(err); }
}

export default { getReports, getOverview, getAuditLogs, listCriteria, createCriterion, updateCriterion, deleteCriterion };
