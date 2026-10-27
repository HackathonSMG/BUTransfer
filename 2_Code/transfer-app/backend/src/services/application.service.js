import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { generateReferenceNumber } from '../utils/reference-number.js';
import { log as auditLog } from './audit.service.js';
import * as notificationService from './notification.service.js';
import * as eligibilityService from './eligibility.service.js';
import * as creditService from './credit/credit.service.js';
import { ENGINE_VERSION } from './credit/engine.js';
import { recommendationOf } from './credit/memory.service.js';
import { isAgentConfigured, reviewWithAgent } from './ai/agent.service.js';
import { env } from '../config/env.js';
import { notFound, badRequest, forbidden } from '../utils/errors.js';

export async function createApplication(data, source = 'website', createdBy = null) {
  const referenceNumber = await generateReferenceNumber();
  const secureToken = uuidv4();

  const result = await query(
    `INSERT INTO applications (
       reference_number, source, status, student_name, student_email,
       student_phone, date_of_birth, transfer_from_institution, transfer_from_program,
       transfer_to_program, transfer_to_department, expected_start_term,
       academic_history, personal_statement, additional_info, secure_token,
       created_by, student_profile_id, policy_version
     ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [referenceNumber, source, data.student_name, data.student_email, data.student_phone || null,
     data.date_of_birth || null, data.transfer_from_institution, data.transfer_from_program || null,
     data.transfer_to_program, data.transfer_to_department || null, data.expected_start_term || null,
     JSON.stringify(data.academic_history || {}), data.personal_statement || null,
     JSON.stringify(data.additional_info || {}), secureToken, createdBy,
     data.student_profile_id || null, '1.0']
  );

  const application = result.rows[0];

  // Staff-raised applications are filed on the student's behalf, so they're submitted straight away too
  await updateApplicationStatus(application.id, 'submitted', createdBy,
    source === 'evaluator_submitted' ? 'Application raised by staff' : 'Application received');
  application.status = 'submitted';

  await auditLog({ applicationId: application.id, action: 'application_created', actorId: createdBy, actorEmail: data.student_email, newValue: { reference_number: referenceNumber, source, status: application.status }, details: { source } });
  await notificationService.applicationSubmitted(application);

  // Auto-trigger AI evaluation in the background so evaluators see results immediately
  setImmediate(() => {
    triggerEvaluation(application.id, createdBy).catch((err) => {
      console.error(`[AI] Auto-trigger failed for application ${application.reference_number}:`, err.message);
    });
  });

  return application;
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
  application.transcript_courses = (await creditService.getCourseEvaluations(id, application.latest_ai_evaluation?.id || null))
    .map((c) => ({ ...c, recommendation: recommendationOf(c) }));
  application.documents = docsResult.rows;
  application.information_requests = infoResult.rows;
  application.recent_audit = auditResult.rows;
  return application;
}

export async function listApplications({ status, source, search, assignedEvaluatorId, page = 1, limit = 20, sort = 'created_at', order = 'DESC' } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }
  if (source) { conditions.push(`a.source = $${idx++}`); params.push(source); }
  if (assignedEvaluatorId) { conditions.push(`a.assigned_evaluator_id = $${idx++}`); params.push(assignedEvaluatorId); }
  if (search) {
    conditions.push(`(a.student_name ILIKE $${idx} OR a.student_email ILIKE $${idx} OR a.reference_number ILIKE $${idx} OR a.transfer_from_institution ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSortCols = ['created_at', 'submitted_at', 'status', 'student_name', 'reference_number'];
  const sortCol = allowedSortCols.includes(sort) ? sort : 'created_at';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT a.id, a.reference_number, a.source, a.status, a.student_name, a.student_email,
              a.transfer_from_institution, a.transfer_to_program, a.transfer_to_department,
              a.expected_start_term, a.submitted_at, a.final_decision, a.decision_date,
              a.assigned_evaluator_id, a.created_at, a.updated_at, p.full_name AS evaluator_name,
              ae.confidence_score AS ai_confidence_score
       FROM applications a
       LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id
       LEFT JOIN LATERAL (
         SELECT confidence_score FROM ai_evaluations
         WHERE application_id = a.id AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1
       ) ae ON true
       ${where} ORDER BY a.${sortCol} ${sortDir} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM applications a ${where}`, params),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);
  return { applications: dataResult.rows, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function triggerEvaluation(applicationId, triggeredBy) {
  const appResult = await query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]);
  if (appResult.rows.length === 0) throw notFound('Application');

  const evalResult = await query(
    `INSERT INTO ai_evaluations (application_id, status, policy_version, attempt_number) VALUES ($1, 'pending', '1.0', 1) RETURNING *`,
    [applicationId]
  );
  const evaluation = evalResult.rows[0];

  await updateApplicationStatus(applicationId, 'under_evaluation', triggeredBy, 'AI evaluation triggered');
  await auditLog({ applicationId, action: 'evaluation_triggered', actorId: triggeredBy, details: { evaluation_id: evaluation.id } });

  setImmediate(() => {
    runEvaluation(evaluation.id).catch((err) => {
      console.error(`[AI] Background evaluation failed for eval ${evaluation.id}:`, err.message);
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
      flags.push({ type: 'positive', title: 'Agent review', description: `The Foundry agent (${env.FOUNDRY_AGENT_NAME}) reviewed ${agent.reviewed} of the ${agent.sent} course(s) left open, using past decisions and the BU catalog.` });
    } else if (agent.status === 'failed') {
      flags.push({ type: 'concern', title: 'Agent unavailable', description: `The agent review did not complete (${agent.error}); the engine's suggestions are shown.` });
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
  await query(`UPDATE ai_evaluations SET status = 'running', started_at = NOW() WHERE id = $1`, [evaluationId]);
  let applicationId;

  try {
    const evalRow = await query(`SELECT * FROM ai_evaluations WHERE id = $1 LIMIT 1`, [evaluationId]);
    if (evalRow.rows.length === 0) throw new Error(`Evaluation record ${evaluationId} not found`);
    applicationId = evalRow.rows[0].application_id;

    const [appResult, docsResult] = await Promise.all([
      query(`SELECT * FROM applications WHERE id = $1 LIMIT 1`, [applicationId]),
      query(`SELECT * FROM application_documents WHERE application_id = $1`, [applicationId]),
    ]);

    const application = appResult.rows[0];
    const documents = docsResult.rows;
    const history = application.academic_history || {};
    const eligibility = await eligibilityService.checkEligibility({
      gpa: history.gpa,
      credits: history.credits_completed,
      institution: application.transfer_from_institution,
      program: application.transfer_to_program,
      hasTranscripts: documents.some((d) => d.document_type === 'transcript'),
    });
    let credit = null;
    let creditError = null;
    try {
      credit = await creditService.evaluateApplicationCredits(application, evaluationId);
    } catch (err) {
      console.error(`[Credit] Course evaluation failed for ${application.reference_number}:`, err.message);
      creditError = err.message;
    }

    // The agent runs Phase 1 validation + Phase 2 review; validation failure short-circuits the evaluation
    let agent = { status: 'off' };
    if (credit && isAgentConfigured()) {
      try {
        agent = await reviewWithAgent(application, credit);
        if (agent.status === 'validation_failed') {
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
        console.error(`[Agent] Review failed for ${application.reference_number}:`, err.message);
        agent = { status: 'failed', error: err.message };
      }
    }
    const result = buildEvaluationResult(application, documents, eligibility, credit, creditError, agent);

    await query(
      `UPDATE ai_evaluations SET status = 'completed', criteria_results = $1, missing_documents = $2, flags = $3, recommendations = $4, evaluation_report = $5,
         confidence_score = $6, credit_summary = $7, agent_status = $8, agent_error = $9,
         validation_status = $10, completed_at = NOW() WHERE id = $11`,
      [JSON.stringify(result.criteria_results), JSON.stringify(result.missing_documents), JSON.stringify(result.flags), result.recommendations, result.evaluation_report,
        result.confidence_score, credit ? JSON.stringify(credit.summary) : null, agent.status, agent.error || null,
        isAgentConfigured() ? 'passed' : 'skipped', evaluationId]
    );

    await updateApplicationStatus(applicationId, 'evaluation_completed', null, 'AI evaluation completed');
    await notificationService.evaluationComplete(application, evaluationId);
    console.log(`[AI] Evaluation ${evaluationId} completed successfully`);
  } catch (err) {
    console.error(`[AI] Evaluation ${evaluationId} failed:`, err.message);
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
  const updatedApp = { ...application, status: decision, final_decision: decision };
  await notificationService.decisionMade(updatedApp);
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
  await notificationService.infoRequired(application, infoRequest.id);
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

export default { createApplication, getApplicationById, listApplications, triggerEvaluation, runEvaluation, submitDecision, createInfoRequest, updateApplicationStatus, assignEvaluator, addNote };
