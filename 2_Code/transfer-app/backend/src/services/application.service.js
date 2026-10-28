import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { generateReferenceNumber } from '../utils/reference-number.js';
import { log as auditLog } from './audit.service.js';
import * as notificationService from './notification.service.js';
import { notifyApplicant, onStatusChange } from './notifications/applicant-notification.service.js';
import * as eligibilityService from './eligibility.service.js';
import * as creditService from './credit/credit.service.js';
import { ENGINE_VERSION } from './credit/engine.js';
import { recommendationOf } from './credit/memory.service.js';
import * as assignmentService from './workflow/assignment.service.js';
import * as lifecycle from './workflow/lifecycle.service.js';
import { OWNERSHIP_FROM, ATTENTION_STAGES, ownershipView } from './workflow/ownership.service.js';
import { isAgentConfigured, reviewWithAgent } from './ai/agent.service.js';
import { env } from '../config/env.js';
import { notFound, badRequest, forbidden } from '../utils/errors.js';

/**
 * Creates an application. With { draft: true } it stays a draft so the student can attach documents first;
 * submitApplication then submits it and starts the evaluation. Without it (staff intake, email intake) the
 * application is submitted and evaluated straight away, as before.
 */
export async function createApplication(data, source = 'website', createdBy = null, { draft = false } = {}) {
  const referenceNumber = await generateReferenceNumber();
  const secureToken = uuidv4();

  const result = await query(
    `INSERT INTO applications (
       reference_number, source, status, student_name, student_email,
       student_phone, date_of_birth, transfer_from_institution, transfer_from_program,
       transfer_to_program, transfer_to_department, expected_start_term,
       academic_history, personal_statement, additional_info, secure_token,
       created_by, student_profile_id, policy_version, applicant_comments
     ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [referenceNumber, source, data.student_name, data.student_email, data.student_phone || null,
     data.date_of_birth || null, data.transfer_from_institution, data.transfer_from_program || null,
     data.transfer_to_program, data.transfer_to_department || null, data.expected_start_term || null,
     JSON.stringify(data.academic_history || {}), data.personal_statement || null,
     JSON.stringify(data.additional_info || {}), secureToken, createdBy,
     data.student_profile_id || null, '1.0', data.applicant_comments || null]
  );

  const application = result.rows[0];
  await auditLog({ applicationId: application.id, action: 'application_created', actorId: createdBy, actorEmail: data.student_email, newValue: { reference_number: referenceNumber, source, status: draft ? 'draft' : 'submitted' }, details: { source } });
  if (draft) return application;
  return finishSubmission(application, createdBy, source === 'evaluator_submitted' ? 'Application raised by staff' : 'Application received');
}

async function finishSubmission(application, actorId, reason) {
  await updateApplicationStatus(application.id, 'submitted', actorId, reason);
  application.status = 'submitted';
  // Confirmation to the applicant (in-app + email); a failed email never fails the submission
  await notifyApplicant(application.id, 'application_received');
  // Flag (never block or delete) a second open application from the same student
  await lifecycle.detectDuplicate(application.id).catch((err) => console.error('[Duplicate] Check failed:', err.message));

  // Document processing and course evaluation run in the background
  setImmediate(() => {
    triggerEvaluation(application.id, actorId).catch((err) => {
      console.error(`[Evaluation] Could not start for application ${application.reference_number}:`, err.message);
    });
  });
  return application;
}

/**
 * Submits a draft once its documents are attached: at least one transcript is required. The transcript has
 * already been read (courses extracted) on upload, so the evaluation that starts here sees every course.
 */
export async function submitApplication(applicationId, actorId = null, { applicantComments } = {}) {
  const { rows: [application] } = await query(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
  if (!application) throw notFound('Application');
  if (application.status !== 'draft') throw badRequest('This application has already been submitted.');
  const { rows: [docs] } = await query(
    `SELECT COUNT(*) FILTER (WHERE document_type = 'transcript')::int AS transcripts FROM application_documents WHERE application_id = $1`, [applicationId]);
  if (!docs.transcripts) throw badRequest('Upload your official transcript before submitting.');
  if (applicantComments !== undefined) {
    const text = String(applicantComments || '').trim() || null;
    await query(`UPDATE applications SET applicant_comments = $1 WHERE id = $2`, [text, applicationId]);
    application.applicant_comments = text;
  }
  return finishSubmission(application, actorId, 'Submitted by the applicant');
}

// Details an applicant can change while the application is still a draft
const DRAFT_FIELDS = ['student_name', 'student_email', 'transfer_from_institution', 'transfer_from_program', 'transfer_to_program',
  'transfer_to_department', 'expected_start_term', 'applicant_comments'];

/** Updates a draft's applicant details (the applicant went back a step before submitting). */
export async function updateDraft(applicationId, fields) {
  const { rows: [application] } = await query(`SELECT status FROM applications WHERE id = $1`, [applicationId]);
  if (!application) throw notFound('Application');
  if (application.status !== 'draft') throw badRequest('This application has already been submitted and can no longer be changed.');
  const keys = DRAFT_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  const { rows: [updated] } = await query(
    `UPDATE applications SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => (fields[k] === '' ? null : fields[k])), applicationId]);
  return updated;
}

/**
 * Plain-language reading of the eligibility check score (criteria passed, 0-1). It describes the initial
 * eligibility criteria only, never a course match or a credit decision.
 */
export function eligibilityLabel(score) {
  if (score == null) return null;
  const s = Number(score);
  return s >= 1 ? { tone: 'ok', text: 'Meets every initial eligibility criterion' }
    : s >= 0.6 ? { tone: 'warn', text: 'Meets most initial eligibility criteria; some need staff review' }
      : { tone: 'bad', text: 'Several initial eligibility criteria are not met' };
}

export async function getApplicationById(id) {
  const appResult = await query(
    `SELECT a.*, p.full_name AS evaluator_name, p.email AS evaluator_email, e.department AS evaluator_department
     FROM applications a LEFT JOIN evaluators e ON e.id = a.assigned_evaluator_id LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id
     WHERE a.id = $1 LIMIT 1`,
    [id]
  );
  if (appResult.rows.length === 0) throw notFound('Application');
  const application = appResult.rows[0];

  const [evalResult, docsResult, infoResult, auditResult] = await Promise.all([
    query(`SELECT * FROM ai_evaluations WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]),
    query(`SELECT ad.*, p.full_name AS uploaded_by_name FROM application_documents ad LEFT JOIN profiles p ON p.id = ad.uploaded_by WHERE ad.application_id = $1 ORDER BY ad.created_at ASC`, [id]),
    query(`SELECT ir.*, p.full_name AS requested_by_name FROM information_requests ir LEFT JOIN profiles p ON p.id = ir.requested_by WHERE ir.application_id = $1 ORDER BY ir.created_at DESC`, [id]),
    query(`SELECT al.*, p.full_name AS actor_name FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_id WHERE al.application_id = $1 ORDER BY al.created_at DESC LIMIT 20`, [id]),
  ]);

  application.latest_ai_evaluation = evalResult.rows[0] || null;
  if (application.latest_ai_evaluation) {
    // The wording for the eligibility score is decided here, not in the browser
    application.latest_ai_evaluation.score_label = eligibilityLabel(application.latest_ai_evaluation.confidence_score);
  }
  application.transcript_courses = (await creditService.getCourseEvaluations(id, application.latest_ai_evaluation?.id || null))
    .map((c) => ({ ...c, recommendation: recommendationOf(c) }));
  application.documents = docsResult.rows;
  application.information_requests = infoResult.rows;
  application.recent_audit = auditResult.rows;
  application.ownership = await ownershipView(id);
  return application;
}

/**
 * Staff list and Application Lookup. Each row carries its ownership (current evaluator, department, pending course,
 * pending since, stage; see ownership.service). stage: one stage or 'needs_attention' (every stage needing office
 * action). ownerId / department: an open course review held by that evaluator / department. minAgeDays: pending
 * for at least that many days (operational information, not an SLA).
 */
export async function listApplications({ status, source, search, assignedEvaluatorId, reviewerId, dateFrom, dateTo, stage, ownerId, department, minAgeDays, page = 1, limit = 20, sort = 'created_at', order = 'DESC' } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (stage === 'needs_attention') { conditions.push(`(a.stage = ANY($${idx++}) OR a.duplicate_status = 'suspected')`); params.push(ATTENTION_STAGES); }
  else if (stage) { conditions.push(`a.stage = $${idx++}`); params.push(stage); }
  if (ownerId) { conditions.push(`EXISTS (SELECT 1 FROM course_reviews ow WHERE ow.application_id = a.id AND ow.evaluator_id = $${idx++} AND ow.status IN ('queued', 'new', 'in_progress', 'info_requested'))`); params.push(ownerId); }
  if (department) {
    conditions.push(`EXISTS (SELECT 1 FROM course_reviews ow JOIN evaluators oe ON oe.id = ow.evaluator_id WHERE ow.application_id = a.id AND oe.department = $${idx++} AND ow.status IN ('queued', 'new', 'in_progress', 'info_requested'))`);
    params.push(department);
  }
  if (minAgeDays) { conditions.push(`a.pending_since <= NOW() - make_interval(days => $${idx++})`); params.push(minAgeDays); }

  // An evaluator only sees applications with a course assigned to them
  if (reviewerId) { conditions.push(`EXISTS (SELECT 1 FROM course_reviews rv WHERE rv.application_id = a.id AND rv.evaluator_id = $${idx++})`); params.push(reviewerId); }
  if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }
  if (source) { conditions.push(`a.source = $${idx++}`); params.push(source); }
  if (assignedEvaluatorId) { conditions.push(`a.assigned_evaluator_id = $${idx++}`); params.push(assignedEvaluatorId); }
  // Date range is inclusive and matches the "Submitted" date the dashboard shows
  if (dateFrom) { conditions.push(`COALESCE(a.submitted_at, a.created_at) >= $${idx++}::date`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`COALESCE(a.submitted_at, a.created_at) < $${idx++}::date + 1`); params.push(dateTo); }
  if (search) {
    conditions.push(`(a.student_name ILIKE $${idx} OR a.student_email ILIKE $${idx} OR a.reference_number ILIKE $${idx} OR a.transfer_from_institution ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSortCols = ['created_at', 'submitted_at', 'status', 'student_name', 'reference_number', 'pending_since'];
  const sortCol = allowedSortCols.includes(sort) ? sort : 'created_at';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT a.id, a.reference_number, a.source, a.status, a.student_name, a.student_email,
              a.transfer_from_institution, a.transfer_to_program, a.transfer_to_department,
              a.expected_start_term, a.submitted_at, a.final_decision, a.decision_date,
              a.assigned_evaluator_id, a.created_at, a.updated_at, p.full_name AS evaluator_name, a.duplicate_status,
              ae.confidence_score AS ai_confidence_score,
              a.stage, a.open_reviews, a.unassigned_reviews, a.owners_count, a.current_owner_id, a.current_owner_name,
              a.current_owner_department, a.pending_course, a.pending_review_status, a.pending_since
       FROM ${OWNERSHIP_FROM}
       LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id
       LEFT JOIN LATERAL (
         SELECT confidence_score FROM ai_evaluations
         WHERE application_id = a.id AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1
       ) ae ON true
       ${where} ORDER BY a.${sortCol} ${sortDir} NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM ${OWNERSHIP_FROM} ${where}`, params),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);
  return { applications: dataResult.rows, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Counts by stage, the evaluators and departments currently holding courses (the queue's filter options), and
 * the number needing office attention. Independent of the list's filters and paging.
 */
export async function getOwnershipStats() {
  const [{ rows: stages }, { rows: owners }, { rows: [attention] }, { rows: [unassigned] }] = await Promise.all([
    query(`SELECT a.stage, COUNT(*)::int AS count FROM ${OWNERSHIP_FROM} GROUP BY a.stage`),
    query(`SELECT DISTINCT r.evaluator_id AS id, p.full_name AS name, e.department FROM course_reviews r JOIN profiles p ON p.id = r.evaluator_id
           LEFT JOIN evaluators e ON e.id = r.evaluator_id WHERE r.status IN ('queued', 'new', 'in_progress', 'info_requested') ORDER BY p.full_name`),
    query(`SELECT COUNT(*)::int AS n FROM ${OWNERSHIP_FROM} WHERE a.stage = ANY($1) OR a.duplicate_status = 'suspected'`, [ATTENTION_STAGES]),
    query(`SELECT COUNT(*)::int AS n FROM course_reviews WHERE evaluator_id IS NULL AND status IN ('queued', 'new', 'in_progress', 'info_requested')`),
  ]);
  return {
    by_stage: Object.fromEntries(stages.map((r) => [r.stage, r.count])),
    needs_attention: attention.n,
    unassigned_reviews: unassigned.n,
    owners: owners.map((o) => ({ id: o.id, name: o.name, department: o.department })),
    departments: [...new Set(owners.map((o) => o.department).filter(Boolean))].sort(),
  };
}

/** Queue-wide counts for the staff dashboard; independent of the list's filters and paging. */
export async function getApplicationStats() {
  const result = await query(
    `SELECT status, COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE decision_date >= DATE_TRUNC('month', NOW()))::int AS decided_this_month
     FROM applications GROUP BY status`
  );
  const byStatus = {};
  let total = 0;
  let decidedThisMonth = 0;
  for (const row of result.rows) {
    byStatus[row.status] = row.count;
    total += row.count;
    decidedThisMonth += row.decided_this_month;
  }
  return { total, by_status: byStatus, decided_this_month: decidedThisMonth };
}

export async function triggerEvaluation(applicationId, triggeredBy) {
  console.log(`[Eval] triggerEvaluation called — applicationId=${applicationId} triggeredBy=${triggeredBy}`);
  const appResult = await query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]);
  if (appResult.rows.length === 0) throw notFound('Application');

  const app = appResult.rows[0];
  console.log(`[Eval]   Application: ${app.reference_number} — ${app.transfer_from_institution} → ${app.transfer_to_program}`);

  const evalResult = await query(
    `INSERT INTO ai_evaluations (application_id, status, policy_version, attempt_number) VALUES ($1, 'pending', '1.0', 1) RETURNING *`,
    [applicationId]
  );
  const evaluation = evalResult.rows[0];
  console.log(`[Eval]   Evaluation record created: eval_id=${evaluation.id}`);

  await updateApplicationStatus(applicationId, 'under_evaluation', triggeredBy, 'Course evaluation started');
  // Applications loaded in bulk or raised by staff get the same duplicate check as website submissions
  await lifecycle.detectDuplicate(applicationId).catch((err) => console.error('[Duplicate] Check failed:', err.message));
  await auditLog({ applicationId, action: 'evaluation_triggered', actorId: triggeredBy, details: { evaluation_id: evaluation.id } });

  console.log(`[Eval]   Queuing background runEvaluation(${evaluation.id}) via setImmediate`);
  setImmediate(() => {
    runEvaluation(evaluation.id).catch((err) => {
      console.error(`[AI] Background evaluation failed for eval ${evaluation.id}:`, err.message, err.stack);
    });
  });

  return { evaluation_id: evaluation.id, status: 'pending' };
}

const PATH_LABELS = {
  equivalency: 'approved equivalency', rule: 'policy rule', precedent: 'past decision',
  review: 'department review', needs_information: 'needs information',
};

// Combines the rule-based eligibility check with the per-course credit evaluation into the
// evaluation report. Deterministic, and nothing about the student leaves the backend.
function buildEvaluationResult(application, documents, eligibility, credit, creditError, agent = { status: 'off' }) {
  const criteria_results = eligibility.criteria_results.map((c) => ({
    criterion_id: c.id,
    criterion_name: c.criterion_name,
    result: c.result === true ? 'pass' : c.result === false ? 'fail' : 'unable_to_determine',
    score: c.result === true ? 100 : c.result === false ? 0 : 50,
    explanation: c.reason,
  }));

  const missing_documents = [];
  const flags = [];
  if (!documents.some((d) => d.document_type === 'transcript')) {
    missing_documents.push({ document_type: 'transcript', description: 'Official transcript from each previous institution.', is_blocking: true });
  }

  let recommendations;
  const lines = [];
  if (credit) {
    const { summary: s, results, courses } = credit;
    const count = (path) => s.by_path[path] || 0;
    results.forEach((r, i) => {
      const c = courses[i];
      const label = r.outcome === 'no_credit' ? 'no credit' : r.award || `suggested ${r.suggestion || 'BU course to be decided'}`;
      lines.push(`${c.course_code} ${c.title} (${c.term}, ${c.grade}): ${PATH_LABELS[r.path]}, ${label}`);
      if (r.path === 'needs_information') {
        missing_documents.push({ document_type: 'syllabus', description: `Syllabus for ${c.course_code} ${c.title} (${c.institution}): no description on file to compare.`, is_blocking: false });
      }
    });
    if (count('equivalency')) flags.push({ type: 'positive', title: 'Approved equivalencies', description: `${count('equivalency')} of ${s.courses} courses match approved equivalencies and were applied automatically.` });
    const ruled = results.filter((r) => r.path === 'rule');
    if (ruled.length) flags.push({ type: 'concern', title: 'Policy rules applied', description: `${ruled.length} course(s) were decided by BU rules (${[...new Set(ruled.flatMap((r) => r.rules))].join(', ')}).` });
    const disputed = results.filter((r) => r.reasons.some((t) => t.startsWith('Past decisions disagree')));
    if (disputed.length) flags.push({ type: 'critical', title: 'Conflicting precedents', description: `${disputed.length} course(s) have past decisions that disagree; the department must decide.` });
    if (agent.status === 'completed') {
      flags.push({ type: 'positive', title: 'Additional course review', description: `${agent.reviewed} of the ${agent.sent} course(s) left open were reviewed against past decisions and the BU catalog.` });
    } else if (agent.status === 'failed') {
      flags.push({ type: 'concern', title: 'Additional course review unavailable', description: `The additional review did not complete (${agent.error}); the course-match suggestions are shown.` });
    }

    recommendations = `${s.transferred_credits} credits transfer as BU courses and ${s.elective_credits} as elective credit. `
      + `${count('review')} course(s) need department review${count('needs_information') ? ` and ${count('needs_information')} need more information` : ''} (${s.pending_credits} credits pending). `
      + `${s.no_credit_courses} course(s) earn no credit. Department evaluators make the final decision on every course.`;
  } else if (creditError) {
    flags.push({ type: 'critical', title: 'Course evaluation unavailable', description: creditError });
    recommendations = 'The per-course credit evaluation could not run. Eligibility criteria were still checked.';
  } else {
    recommendations = 'No transcript courses have been read yet. Upload the official transcript PDF, then run the evaluation again for a per-course credit evaluation.';
  }

  const evaluation_report = [
    'TRANSFER CREDIT EVALUATION',
    `Application: ${application.reference_number}`,
    `From: ${application.transfer_from_institution}`,
    `To: ${application.transfer_to_program}`,
    '',
    `ELIGIBILITY: ${eligibility.score}/100 (${eligibility.eligible ? 'meets the initial requirements' : 'does not meet all required criteria'})`,
    '',
    ...(lines.length ? ['COURSES:', ...lines, ''] : []),
    `SUMMARY: ${recommendations}`,
    '',
    `Rule-based credit engine v${ENGINE_VERSION}. The tool only suggests; department evaluators make the final decision (R10).`,
  ].join('\n');

  return { criteria_results, missing_documents, flags, recommendations, evaluation_report, confidence_score: eligibility.score / 100 };
}

export async function runEvaluation(evaluationId) {
  console.log(`[Eval] ══════════════════════════════════════════`);
  console.log(`[Eval] runEvaluation START — eval_id=${evaluationId}`);
  await query(`UPDATE ai_evaluations SET status = 'running', started_at = NOW() WHERE id = $1`, [evaluationId]);
  let applicationId;

  try {
    const evalRow = await query(`SELECT * FROM ai_evaluations WHERE id = $1 LIMIT 1`, [evaluationId]);
    if (evalRow.rows.length === 0) throw new Error(`Evaluation record ${evaluationId} not found`);
    applicationId = evalRow.rows[0].application_id;
    console.log(`[Eval]   application_id=${applicationId}`);

    const [appResult, docsResult] = await Promise.all([
      query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]),
      query(`SELECT * FROM application_documents WHERE application_id = $1`, [applicationId]),
    ]);

    const application = appResult.rows[0];
    const documents = docsResult.rows;
    console.log(`[Eval]   Application : ${application.reference_number}`);
    console.log(`[Eval]   Institution : ${application.transfer_from_institution}`);
    console.log(`[Eval]   Program     : ${application.transfer_to_program}`);
    console.log(`[Eval]   Documents   : ${documents.length} (types: ${documents.map(d => d.document_type).join(', ') || 'none'})`);

    // ── Step 1: Eligibility ──────────────────────────────────────────────────
    console.log(`[Eval] STEP 1: Eligibility check`);
    const history = application.academic_history || {};
    console.log(`[Eval]   GPA=${history.gpa} credits=${history.credits_completed} hasTranscripts=${documents.some(d => d.document_type === 'transcript')}`);
    const eligibility = await eligibilityService.checkEligibility({
      gpa: history.gpa,
      credits: history.credits_completed,
      institution: application.transfer_from_institution,
      program: application.transfer_to_program,
      hasTranscripts: documents.some((d) => d.document_type === 'transcript'),
      missingAsUnknown: true,
    });
    console.log(`[Eval]   Eligibility result: eligible=${eligibility.eligible} score=${eligibility.score}`);
    if (eligibility.reasons?.length) console.log(`[Eval]   Reasons: ${eligibility.reasons.join('; ')}`);

    // ── Step 2: Credit Engine ────────────────────────────────────────────────
    console.log(`[Eval] STEP 2: Credit engine evaluation`);
    let credit = null;
    let creditError = null;
    try {
      credit = await creditService.evaluateApplicationCredits(application, evaluationId);
      if (credit) {
        const s = credit.summary;
        console.log(`[Eval]   Credit result: ${credit.courses.length} courses`);
        console.log(`[Eval]   Transferred=${s.transferred_credits} elective=${s.elective_credits} pending=${s.pending_credits} no_credit=${s.no_credit_courses}`);
        console.log(`[Eval]   By path: ${JSON.stringify(s.by_path)}`);
        credit.results.forEach((r, i) => {
          const c = credit.courses[i];
          console.log(`[Eval]     [${i+1}] ${c.course_code} "${c.title}" → path=${r.path} outcome=${r.outcome} award=${r.award || '-'} confidence=${r.confidence}`);
        });
      } else {
        console.log(`[Eval]   No transcript courses found — credit evaluation skipped`);
      }
    } catch (err) {
      console.error(`[Eval] STEP 2 FAILED: Credit engine error — ${err.message}`, err.stack);
      creditError = err.message;
    }

    // ── Step 3: Agent ────────────────────────────────────────────────────────
    console.log(`[Eval] STEP 3: Agent evaluation`);
    console.log(`[Eval]   isAgentConfigured() = ${isAgentConfigured()}`);
    console.log(`[Eval]   credit available    = ${Boolean(credit)}`);
    let agent = { status: 'off' };

    if (!credit) {
      console.log(`[Eval]   Skipping agent — no credit data`);
    } else if (!isAgentConfigured()) {
      console.log(`[Eval]   Skipping agent — not configured (FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_AGENT_NAME missing)`);
    } else {
      console.log(`[Eval]   Calling reviewWithAgent...`);
      try {
        agent = await reviewWithAgent(application, credit);
        console.log(`[Eval]   reviewWithAgent returned: status=${agent.status} reviewed=${agent.reviewed ?? '-'} sent=${agent.sent ?? '-'}`);

        if (agent.status === 'validation_failed') {
          console.log(`[Eval]   Validation FAILED — halting evaluation. reason=${agent.reason} details=${agent.details}`);
          await query(
            `UPDATE ai_evaluations SET status = 'completed', validation_status = 'failed',
               validation_result = $1, completed_at = NOW() WHERE id = $2`,
            [JSON.stringify({ reason: agent.reason, details: agent.details }), evaluationId]
          );
          await updateApplicationStatus(applicationId, 'validation_failed', null,
            `Agent validation failed: ${agent.reason} — ${agent.details}`);
          await auditLog({ applicationId, action: 'validation_failed', details: { evaluation_id: evaluationId, reason: agent.reason, details: agent.details } });
          console.log(`[AI] Evaluation ${evaluationId} halted — validation failed: ${agent.reason}`);
          return;
        }
      } catch (err) {
        console.error(`[Eval] STEP 3 FAILED: Agent error — ${err.message}`);
        console.error(`[Eval]   HTTP status : ${err.status || 'n/a'}`);
        console.error(`[Eval]   Error code  : ${err.code || 'n/a'}`);
        console.error(`[Eval]   Body        : ${err.body ? JSON.stringify(err.body).slice(0, 400) : 'n/a'}`);
        console.error(`[Eval]   Stack       :`, err.stack?.split('\n').slice(0, 5).join('\n'));
        agent = { status: 'failed', error: err.message };
      }
    }

    // ── Step 4: Build result ─────────────────────────────────────────────────
    console.log(`[Eval] STEP 4: Building evaluation result`);
    const result = buildEvaluationResult(application, documents, eligibility, credit, creditError, agent);
    console.log(`[Eval]   confidence_score=${result.confidence_score} flags=${result.flags.length} missing_docs=${result.missing_documents.length}`);

    // ── Step 5: Persist ──────────────────────────────────────────────────────
    console.log(`[Eval] STEP 5: Persisting to DB — agent_status=${agent.status}`);
    await query(
      `UPDATE ai_evaluations SET status = 'completed', criteria_results = $1, missing_documents = $2, flags = $3, recommendations = $4, evaluation_report = $5,
         confidence_score = $6, credit_summary = $7, agent_status = $8, agent_error = $9,
         validation_status = $10, completed_at = NOW() WHERE id = $11`,
      [JSON.stringify(result.criteria_results), JSON.stringify(result.missing_documents), JSON.stringify(result.flags), result.recommendations, result.evaluation_report,
        result.confidence_score, credit ? JSON.stringify(credit.summary) : null, agent.status, agent.error || null,
        isAgentConfigured() ? 'passed' : 'skipped', evaluationId]
    );
    console.log(`[Eval]   ai_evaluations record updated`);

    await updateApplicationStatus(applicationId, 'evaluation_completed', null, 'Course evaluation completed');
    console.log(`[Eval]   Application status → evaluation_completed`);

    // A transcript arrived but no course could be read from it: the Credit Evaluation Office follows up
    if (!credit && documents.some((d) => d.document_type === 'transcript')) {
      await lifecycle.notifyCreditOffice({
        applicationId, type: 'transcript_unreadable', title: `Transcript needs attention: ${application.reference_number}`,
        message: `No courses could be read from ${application.student_name}'s transcript. Contact the student or the sending college.`,
        data: { reference_number: application.reference_number },
      }).catch(() => {});
    }
    await notificationService.evaluationComplete(application, evaluationId);
    console.log(`[Eval]   Notification sent`);

    // ── Step 6: Apply established equivalencies then assign to evaluators ────
    if (credit) {
      console.log(`[Eval] STEP 6: Assigning application to evaluators`);
      try {
        const { held } = await lifecycle.applyEstablished(applicationId);
        await assignmentService.assignApplication(applicationId, { held });
        console.log(`[Eval]   Assignment complete`);
      } catch (err) {
        console.error(`[Eval] STEP 6 FAILED: Assignment error — ${err.message}`);
      }
    }

    console.log(`[AI] Evaluation ${evaluationId} completed successfully`);
    console.log(`[Eval] ══════════════════════════════════════════`);
  } catch (err) {
    console.error(`[Eval] runEvaluation FAILED — eval_id=${evaluationId}: ${err.message}`);
    console.error(`[Eval]   Stack:`, err.stack?.split('\n').slice(0, 8).join('\n'));
    await query(`UPDATE ai_evaluations SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`, [err.message, evaluationId]);
    if (applicationId) await auditLog({ applicationId, action: 'evaluation_failed', details: { evaluation_id: evaluationId, error: err.message } });
  }
}

export async function submitDecision(applicationId, decision, comments, evaluatorId) {
  if (!['approved', 'rejected'].includes(decision)) throw badRequest('Decision must be "approved" or "rejected"');

  const appResult = await query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]);
  if (appResult.rows.length === 0) throw notFound('Application');
  const application = appResult.rows[0];

  if (application.assigned_evaluator_id && application.assigned_evaluator_id !== evaluatorId) {
    const profileResult = await query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [evaluatorId]);
    if (profileResult.rows[0]?.role !== 'admin') throw forbidden('Only the assigned evaluator or admin may submit a decision');
  }

  const oldStatus = application.status;
  await query(
    `UPDATE applications SET final_decision = $1, evaluator_comments = $2, decision_date = NOW(), status = $3, updated_at = NOW() WHERE id = $4`,
    [decision, comments, decision, applicationId]
  );

  await auditLog({ applicationId, action: 'decision_submitted', actorId: evaluatorId, oldValue: { status: oldStatus }, newValue: { status: decision, final_decision: decision }, details: { comments } });
  await onStatusChange(applicationId, oldStatus, decision);
}

export async function createInfoRequest(applicationId, items, message, evaluatorId) {
  const appResult = await query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]);
  if (appResult.rows.length === 0) throw notFound('Application');
  const application = appResult.rows[0];

  const infoResult = await query(
    `INSERT INTO information_requests (application_id, requested_by, items, message) VALUES ($1, $2, $3, $4) RETURNING *`,
    [applicationId, evaluatorId, JSON.stringify(items), message]
  );
  const infoRequest = infoResult.rows[0];

  await updateApplicationStatus(applicationId, 'information_required', evaluatorId, 'Information requested from student');
  await notifyApplicant(application.id, 'information_required', {
    items: items.map((i) => (typeof i === 'string' ? i : i.description)).filter(Boolean),
  });
  await auditLog({ applicationId, action: 'info_request_created', actorId: evaluatorId, details: { info_request_id: infoRequest.id, item_count: items.length } });
  return infoRequest;
}

export async function updateApplicationStatus(applicationId, newStatus, actorId = null, reason = '') {
  const current = await query(`SELECT status FROM applications WHERE id = $1 LIMIT 1`, [applicationId]);
  const oldStatus = current.rows[0]?.status;

  await query(`UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, applicationId]);
  if (newStatus === 'submitted') {
    await query(`UPDATE applications SET submitted_at = NOW() WHERE id = $1 AND submitted_at IS NULL`, [applicationId]);
  }
  await auditLog({ applicationId, action: 'status_changed', actorId, oldValue: { status: oldStatus }, newValue: { status: newStatus }, details: { reason } });
  await onStatusChange(applicationId, oldStatus, newStatus);
}

export async function addNote(applicationId, note, actorId, actorEmail) {
  await query(
    `UPDATE applications
     SET additional_info = jsonb_set(
       COALESCE(additional_info, '{}'),
       '{evaluator_notes}',
       COALESCE(additional_info->'evaluator_notes', '[]') ||
       jsonb_build_array(jsonb_build_object('note', $1::text, 'created_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'created_by_id', $2::text))
     ), updated_at = NOW()
     WHERE id = $3`,
    [note, actorId || '', applicationId]
  );
  await auditLog({ applicationId, action: 'note_added', actorId, actorEmail, details: { note_preview: note.slice(0, 50) } });
}

export async function assignEvaluator(applicationId, evaluatorId, assignedBy) {
  await query(`UPDATE applications SET assigned_evaluator_id = $1, updated_at = NOW() WHERE id = $2`, [evaluatorId, applicationId]);
  await auditLog({ applicationId, action: 'evaluator_assigned', actorId: assignedBy, newValue: { assigned_evaluator_id: evaluatorId } });
}

export default { createApplication, submitApplication, updateDraft, getApplicationById, listApplications, getApplicationStats, getOwnershipStats, triggerEvaluation, runEvaluation, submitDecision, createInfoRequest, updateApplicationStatus, assignEvaluator, addNote };
