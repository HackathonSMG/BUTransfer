import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { query } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import { log as auditLog } from '../services/audit.service.js';
import * as lifecycle from '../services/workflow/lifecycle.service.js';
import { eligibleEvaluators, reassignReview, releaseEvaluator, placeOfficeQueue, assignApplication, openQueuedReviews } from '../services/workflow/assignment.service.js';
import { POLICY } from '../services/credit/policy.js';
import { ownershipView, unassignedReason } from '../services/workflow/ownership.service.js';
import { impactMetrics } from '../services/workflow/impact.service.js';
import { applicationQuality } from '../services/workflow/pipeline-trace.service.js';

// The Credit Evaluation Office (Problem 1, steps 3, 4 and 7): monitors every application, places courses that
// have no subject specialist, resolves duplicates and deadline exceptions, and posts decided transfer credit.
// Credit office staff and administrators only; enforced here, not just in the menu.
const router = Router();
router.use(requireAuth, requireRole('credit_office', 'admin'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_APP = `a.status NOT IN ('closed', 'draft', 'credit_posted')`;

router.get('/overview', async (_req, res, next) => {
  try {
    const [counts, toPost, officeQueue, syllabi, duplicates, openApps, recent, escalations] = await Promise.all([
      query(`SELECT
               (SELECT COUNT(*) FROM applications)::int AS applications,
               (SELECT COUNT(*) FROM applications a WHERE ${OPEN_APP})::int AS open_applications,
               (SELECT COUNT(*) FROM applications WHERE status = 'credit_posted')::int AS completed_applications,
               (SELECT COUNT(*) FROM applications WHERE status = 'ready_for_posting')::int AS ready_for_posting,
               (SELECT COUNT(DISTINCT cd.application_id) FROM course_decisions cd JOIN applications a ON a.id = cd.application_id
                  LEFT JOIN credit_postings cp ON cp.transcript_course_id = cd.transcript_course_id
                  WHERE cp.id IS NULL AND a.status <> 'closed')::int AS applications_with_unposted,
               (SELECT COALESCE(SUM(units), 0) FROM credit_postings)::numeric AS credits_posted,
               (SELECT COUNT(*) FROM credit_postings)::int AS courses_posted,
               (SELECT COUNT(*) FROM course_decisions WHERE decided_via = 'established_equivalency')::int AS established_applied,
               (SELECT COUNT(*) FROM course_decisions WHERE decided_via = 'policy_rule')::int AS policy_applied,
               (SELECT COUNT(*) FROM course_decisions WHERE decided_via = 'evaluator')::int AS evaluator_decisions,
               (SELECT COUNT(*) FROM course_reviews WHERE status IN ('new', 'in_progress', 'info_requested') AND queue = 'evaluator')::int AS in_department_review,
               (SELECT COUNT(*) FROM course_reviews WHERE status = 'queued')::int AS queued_reviews`),
      query(`SELECT a.id, a.reference_number, a.student_name, a.transfer_from_institution, a.expected_start_term, a.status, a.duplicate_status,
                    a.deadline_exception, COUNT(tc.id)::int AS courses,
                    COUNT(cd.id) FILTER (WHERE cp.id IS NULL)::int AS decided_unposted, COUNT(cp.id)::int AS posted
             FROM applications a JOIN transcript_courses tc ON tc.application_id = a.id
             LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
             LEFT JOIN credit_postings cp ON cp.transcript_course_id = tc.id
             WHERE a.status <> 'closed'
             GROUP BY a.id HAVING COUNT(cd.id) FILTER (WHERE cp.id IS NULL) > 0
             ORDER BY (a.status = 'ready_for_posting') DESC, a.submitted_at ASC NULLS LAST LIMIT 20`),
      // Courses without an evaluator, and courses held by an evaluator who is now inactive or unavailable
      query(`SELECT r.id, r.status, r.target_bu_course, r.assignment_reason, r.assigned_at, a.id AS application_id, a.reference_number, a.student_name,
                    tc.institution, tc.course_code, tc.title, p.full_name AS evaluator_name,
                    (r.evaluator_id IS NOT NULL) AS needs_reassignment
             FROM course_reviews r JOIN applications a ON a.id = r.application_id JOIN transcript_courses tc ON tc.id = r.transcript_course_id
             LEFT JOIN evaluators e ON e.id = r.evaluator_id LEFT JOIN profiles p ON p.id = r.evaluator_id
             WHERE r.status IN ('new', 'in_progress', 'info_requested', 'queued')
               AND ((r.queue = 'credit_office' AND r.evaluator_id IS NULL)
                    OR (r.evaluator_id IS NOT NULL AND (e.is_active = false OR (e.availability = 'unavailable' AND (e.unavailable_until IS NULL OR e.unavailable_until >= CURRENT_DATE)))))
             ORDER BY r.assigned_at ASC NULLS LAST LIMIT 50`),
      query(`SELECT COUNT(*) FILTER (WHERE ir.status = 'pending')::int AS pending,
                    COUNT(*) FILTER (WHERE ir.status = 'responded')::int AS received
             FROM information_requests ir WHERE ir.kind = 'syllabus'`),
      query(`SELECT a.id, a.reference_number, a.student_name, a.transfer_from_institution, a.duplicate_reason, o.reference_number AS duplicate_of_reference
             FROM applications a LEFT JOIN applications o ON o.id = a.duplicate_of WHERE a.duplicate_status = 'suspected' ORDER BY a.created_at`),
      query(`SELECT a.id, a.reference_number, a.student_name, a.expected_start_term, a.deadline_exception, a.status FROM applications a WHERE ${OPEN_APP} OR a.status = 'ready_for_posting'`),
      query(`SELECT al.action, al.created_at, a.reference_number, COALESCE(p.full_name, al.actor_email, 'System') AS actor, al.details
             FROM audit_logs al LEFT JOIN applications a ON a.id = al.application_id LEFT JOIN profiles p ON p.id = al.actor_id
             WHERE al.action IN ('credit_posted', 'established_outcomes_applied', 'duplicate_suspected', 'duplicate_resolved', 'review_reassigned',
                                 'deadline_exception_recorded', 'syllabus_received', 'conflict_escalated', 'evaluator_availability_changed')
             ORDER BY al.created_at DESC LIMIT 10`),
      // Courses an evaluator asked the office to look at, until the conflict is resolved or a standard recorded
      query(`SELECT cr.institution, cr.course_code, cr.note, cr.created_at, COALESCE(p.full_name, 'Evaluator') AS raised_by
             FROM conflict_resolutions cr LEFT JOIN profiles p ON p.id = cr.resolved_by
             WHERE cr.action = 'additional_review'
               AND NOT EXISTS (SELECT 1 FROM conflict_resolutions x WHERE x.institution = cr.institution AND x.course_code = cr.course_code
                                 AND x.action IN ('resolved', 'use_established') AND x.created_at > cr.created_at)
               AND NOT EXISTS (SELECT 1 FROM equivalencies e WHERE e.institution = cr.institution AND e.course_code = cr.course_code
                                 AND e.status = 'active' AND e.approved_on >= cr.created_at::date AND e.source = 'promoted')
             ORDER BY cr.created_at DESC LIMIT 10`),
    ]);
    const now = new Date();
    const deadlines = openApps.rows
      .map((a) => ({ ...a, deadline: lifecycle.deadlineFor(a, now) }))
      .filter((a) => ['passed', 'approaching'].includes(a.deadline.status))
      .sort((a, b) => (a.deadline.days_left ?? 0) - (b.deadline.days_left ?? 0));
    const c = counts.rows[0];
    return res.status(200).json({
      data: {
        counts: { ...c, credits_posted: Number(c.credits_posted), syllabi_pending: syllabi.rows[0].pending, syllabi_received: syllabi.rows[0].received,
          office_queue: officeQueue.rows.length, duplicates: duplicates.rows.length, deadline_issues: deadlines.length, escalations: escalations.rows.length },
        escalations: escalations.rows,
        ready_to_post: toPost.rows,
        office_queue: officeQueue.rows.map((r) => ({ ...r, reason_category: unassignedReason(r.assignment_reason, { unavailable: r.needs_reassignment }) })),
        duplicates: duplicates.rows,
        deadlines: deadlines.map((a) => ({ id: a.id, reference_number: a.reference_number, student_name: a.student_name, start_term: a.expected_start_term,
          status: a.deadline.status, deadline: a.deadline.deadline, days_left: a.deadline.days_left, exception: a.deadline_exception })),
        recent_activity: recent.rows,
        impact: await impactMetrics(),
      },
    });
  } catch (err) { return next(err); }
});

// One application as the Credit Evaluation Office sees it: every course's state, who holds it, what posts
router.get('/applications/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid application id'));
    const { rows: [app] } = await query(
      `SELECT a.*, p.full_name AS evaluator_name, x.full_name AS deadline_exception_by_name FROM applications a
       LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id LEFT JOIN profiles x ON x.id = a.deadline_exception_by WHERE a.id = $1`, [req.params.id]);
    if (!app) return next(notFound('Application'));
    const [courses, documents, requests, duplicate, history, applicantUpdates] = await Promise.all([
      lifecycle.courseStates(app.id),
      query(`SELECT d.id, d.file_name, d.document_type, d.created_at, d.upload_source, tc.course_code AS for_course
             FROM application_documents d LEFT JOIN transcript_courses tc ON tc.id = d.transcript_course_id WHERE d.application_id = $1 ORDER BY d.created_at`, [app.id]),
      query(`SELECT ir.id, ir.kind, ir.message, ir.status, ir.created_at, ir.responded_at, ir.student_response, tc.course_code,
                    COALESCE(p.full_name, 'Automatic') AS requested_by
             FROM information_requests ir LEFT JOIN transcript_courses tc ON tc.id = ir.transcript_course_id LEFT JOIN profiles p ON p.id = ir.requested_by
             WHERE ir.application_id = $1 ORDER BY ir.created_at DESC`, [app.id]),
      lifecycle.duplicateComparison(app),
      query(`SELECT al.action, al.created_at, al.details, COALESCE(p.full_name, al.actor_email, 'System') AS actor FROM audit_logs al
             LEFT JOIN profiles p ON p.id = al.actor_id WHERE al.application_id = $1 ORDER BY al.created_at DESC LIMIT 25`, [app.id]),
      // What the applicant was told, and whether the email went out
      query(`SELECT type, title, created_at, email_status, emailed_at, email_attempts, email_error FROM notifications
             WHERE application_id = $1 AND email_status IS NOT NULL ORDER BY created_at DESC`, [app.id]),
    ]);
    const visible = courses.filter((c) => c.state !== 'withdrawn');
    return res.status(200).json({
      data: {
        application: {
          id: app.id, reference_number: app.reference_number, status: app.status, student_name: app.student_name, student_email: app.student_email,
          transfer_from_institution: app.transfer_from_institution, transfer_to_program: app.transfer_to_program, expected_start_term: app.expected_start_term,
          submitted_at: app.submitted_at, posted_at: app.posted_at, evaluator_name: app.evaluator_name, secure_token: undefined,
          deadline_exception: app.deadline_exception, deadline_exception_by: app.deadline_exception_by_name,
          applicant_comments: app.applicant_comments,
          // Student details changed from what the transcript showed, and details an emailed transcript didn't show
          details_corrected: (app.academic_history?.corrected_fields || []).map((k) => ({ field: k, transcript: app.academic_history?.extracted?.[k] ?? null })),
          details_to_confirm: app.academic_history?.details_to_confirm || [],
        },
        institutions: [...new Set(visible.map((c) => c.institution))],
        summary: lifecycle.summarizeCourses(visible),
        deadline: lifecycle.deadlineFor(app),
        duplicate,
        blockers: lifecycle.postingBlockers(app, visible),
        courses: courses.map((c) => ({
          id: c.id, institution: c.institution, course_code: c.course_code, catalog_code: c.catalog_code, title: c.title, term: c.term,
          source_credits: c.source_credits, credit_system: c.credit_system, grade: c.grade, bu_credits: c.bu_credits,
          state: c.state, units: c.units, units_status: c.units_status, decision: c.decision, bu_award: c.bu_award,
          decision_type: c.decision_type, decided_via: c.decided_via, decided_by: c.decided_by_name, decided_at: c.decided_at, decision_reason: c.decision_reason,
          transfer_grade: c.transfer_grade, posted_at: c.posted_at, repeat_of_course: c.repeat_of_course,
          review_id: c.review_id, review_status: c.review_status, queue: c.queue, evaluator_name: c.evaluator_name, target_bu_course: c.target_bu_course,
          assignment_reason: c.assignment_reason, missing_information: c.missing_information, combined_with: c.combined_with,
          suggestion: c.suggestion, path: c.path, info_kind: c.info_kind, info_status: c.info_status, syllabus_received_at: c.syllabus_received_at,
          returned_reason: c.returned_reason, can_return: c.state === 'decided',
          // Values the student corrected on the review step, with the transcript's original reading
          corrected_fields: c.corrected_fields || [], extracted: c.corrected_fields?.length ? c.extracted : null,
        })),
        documents: documents.rows,
        information_requests: requests.rows,
        history: history.rows,
        applicant_updates: applicantUpdates.rows,
        ownership: await ownershipView(app.id),
        impact: await impactMetrics({ applicationId: app.id }),
        // Transcript check (staff wording) and what each automated stage did on the latest evaluation
        quality: (await applicationQuality(app.id)).map(({ institution, credit_system: creditSystem, courses: n, findings, needs_review: needsReview }) => ({
          institution, credit_system: creditSystem, courses: n, needs_review: needsReview,
          findings: findings.map(({ type, severity, courses: codes, staff }) => ({ type, severity, courses: codes, text: staff })),
        })),
        // Null until migration 012 adds the column, or for evaluations run before it
        trace: (await query(`SELECT pipeline_trace FROM ai_evaluations WHERE application_id = $1 AND pipeline_trace IS NOT NULL
                             ORDER BY created_at DESC LIMIT 1`, [app.id])
          .catch((err) => { console.error('[Office] Evaluation trace unavailable:', err.message); return { rows: [] }; })).rows[0]?.pipeline_trace || null,
        policy: { transfer_grade: POLICY.transferGrade, hub_units: POLICY.transferHubUnits, counts_in_gpa: POLICY.transferGradesCountInGpa },
      },
    });
  } catch (err) { return next(err); }
});

router.post('/applications/:id/post', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid application id'));
    return res.status(200).json({ data: await lifecycle.postCredits(req.params.id, req.user) });
  } catch (err) { return next(err); }
});

router.post('/applications/:id/deadline-exception', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid application id'));
    const parsed = z.object({ reason: z.string().trim().min(5, 'Give the reason for the exception').max(1000) }).safeParse(req.body);
    if (!parsed.success) return next(badRequest(parsed.error.issues[0].message));
    return res.status(200).json({ data: await lifecycle.recordDeadlineException(req.params.id, parsed.data.reason, req.user) });
  } catch (err) { return next(err); }
});

router.post('/applications/:id/duplicate', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid application id'));
    const parsed = z.object({ action: z.enum(['keep_separate', 'close_duplicate']), note: z.string().max(1000).optional().nullable() }).safeParse(req.body);
    if (!parsed.success) return next(badRequest('Choose keep_separate or close_duplicate'));
    return res.status(200).json({ data: await lifecycle.resolveDuplicate(req.params.id, parsed.data, req.user) });
  } catch (err) { return next(err); }
});

// Evaluators who could take a course, best match first, for manual assignment
router.get('/reviews/:id/eligible-evaluators', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid review id'));
    return res.status(200).json({ data: await eligibleEvaluators(req.params.id) });
  } catch (err) { return next(err); }
});

// evaluator_id: an evaluator's id, 'auto' for the best eligible evaluator, or null for the office queue
router.post('/reviews/:id/assign', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid review id'));
    const parsed = z.object({
      evaluator_id: z.union([z.string().regex(UUID), z.literal('auto'), z.null()]),
      note: z.string().max(500).optional().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) return next(badRequest('Choose an evaluator'));
    return res.status(200).json({ data: await reassignReview(req.params.id, parsed.data.evaluator_id, req.user, parsed.data.note) });
  } catch (err) { return next(err); }
});

// Final review: send one course's decision back to the evaluator before posting
router.post('/courses/:id/return', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid course id'));
    const parsed = z.object({ reason: z.string().trim().min(5, 'Give the reason for returning the decision').max(1000) }).safeParse(req.body);
    if (!parsed.success) return next(badRequest(parsed.error.issues[0].message));
    return res.status(200).json({ data: await lifecycle.returnToEvaluator(req.params.id, parsed.data.reason, req.user) });
  } catch (err) { return next(err); }
});

// Brings applications evaluated before the lifecycle existed up to date: duplicate check, established equivalencies
// and policy outcomes applied (unopened reviews of those courses are withdrawn), remaining courses assigned (with
// syllabus requests where needed), status recomputed. Safe to run again: it only acts on what is still missing.
router.post('/process-existing', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id FROM applications a WHERE a.status NOT IN ('closed', 'draft', 'credit_posted', 'validation_failed')
         AND EXISTS (SELECT 1 FROM ai_evaluations ae WHERE ae.application_id = a.id AND ae.status = 'completed')
       ORDER BY a.created_at`);
    const totals = { applications: rows.length, established_applied: 0, reviews_created: 0, duplicates_flagged: 0 };
    for (const { id } of rows) {
      if (await lifecycle.detectDuplicate(id)) totals.duplicates_flagged += 1;
      const { applied, held } = await lifecycle.applyEstablished(id);
      totals.established_applied += applied;
      totals.reviews_created += (await assignApplication(id, { held })).created;
      await lifecycle.refreshApplicationStatus(id, req.user.id);
    }
    // Departments review in parallel: courses still waiting for a hand-off open now
    totals.queued_opened = (await openQueuedReviews(req.user)).opened;
    await auditLog({ action: 'existing_applications_processed', actorId: req.user.id, actorEmail: req.user.email, details: totals });
    return res.status(200).json({ data: totals });
  } catch (err) { return next(err); }
});

// Places every course in the office queue that now has a qualified evaluator
router.post('/queue/place', async (req, res, next) => {
  try { return res.status(200).json({ data: await placeOfficeQueue(req.user) }); } catch (err) { return next(err); }
});

// Evaluator availability: unavailable (leave) or available again. Making someone unavailable moves their open courses.
router.post('/evaluators/:id/availability', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluator id'));
    const parsed = z.object({
      availability: z.enum(['available', 'unavailable']),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      reassign: z.boolean().optional().default(true),
    }).safeParse(req.body);
    if (!parsed.success) return next(badRequest('Availability must be available or unavailable'));
    const { availability, until, reassign } = parsed.data;
    const { rows: [ev] } = await query(
      `UPDATE evaluators SET availability = $1, unavailable_until = $2 WHERE id = $3 RETURNING id, availability`,
      [availability, availability === 'unavailable' ? until || null : null, req.params.id]);
    if (!ev) return next(notFound('Evaluator'));
    await auditLog({ action: 'evaluator_availability_changed', actorId: req.user.id, actorEmail: req.user.email,
      newValue: { availability, until: until || null }, details: { evaluator_id: req.params.id } });
    const moved = availability === 'unavailable' && reassign ? await releaseEvaluator(req.params.id, req.user, 'Evaluator unavailable') : null;
    // Back from leave: queued office work may now have a qualified evaluator
    const placed = availability === 'available' ? await placeOfficeQueue(req.user) : null;
    return res.status(200).json({ data: { availability, reassigned: moved?.reassigned || 0, to_office: moved?.to_office || 0, placed: placed?.placed || 0 } });
  } catch (err) { return next(err); }
});

// Move every open course an evaluator holds (e.g. before deactivating them)
router.post('/evaluators/:id/reassign-open', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return next(badRequest('Invalid evaluator id'));
    return res.status(200).json({ data: await releaseEvaluator(req.params.id, req.user, 'Reassigned by the Credit Evaluation Office') });
  } catch (err) { return next(err); }
});

router.get('/evaluators', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.id, p.full_name, e.department, e.availability, e.unavailable_until, (p.is_active AND e.is_active) AS is_active, e.max_concurrent_cases,
              COUNT(r.id) FILTER (WHERE r.status IN ('new', 'in_progress', 'info_requested'))::int AS open_reviews,
              COUNT(r.id) FILTER (WHERE r.status = 'queued')::int AS queued_reviews
       FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN course_reviews r ON r.evaluator_id = e.id
       GROUP BY e.id, p.full_name, p.is_active ORDER BY (p.is_active AND e.is_active) DESC, p.full_name`);
    return res.status(200).json({ data: rows });
  } catch (err) { return next(err); }
});

export default router;
