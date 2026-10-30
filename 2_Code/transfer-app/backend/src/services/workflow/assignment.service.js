// Assigns an application's undecided transcript courses to evaluators once its evaluation completes.
// Every course gets a course review with a recommended BU target and a match score; the evaluator is chosen
// from the evaluator master data (expertise courses, expertise subjects, department/specializations) among
// active, available evaluators, preferring lighter workloads. A course with no suitable subject specialist
// goes to a general credit evaluator with capacity, otherwise to the Credit Evaluation Office queue for manual
// assignment; it is never given to an evaluator from an unrelated subject. Departments review in parallel: every
// evaluator's courses open at assignment, and the application is ready for the Credit Evaluation Office once every
// course has a decision. The sequence only orders evaluators for display (the major's subject first).
// Courses whose content cannot be compared (no description, no syllabus) get a syllabus request to the student.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification } from '../notification.service.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { requestCourseInformation } from './information.service.js';
import { applyEstablished, notifyCreditOffice, refreshApplicationStatus } from './lifecycle.service.js';

const OPEN_STATUSES = ['queued', 'new', 'in_progress', 'info_requested'];

// The sponsor's preliminary match levels. These are defined levels, not computed similarities: the score is the
// level's fixed position on the 0-1 match scale so levels can be ordered, and the UI shows the level's name.
export const SPONSOR_LEVELS = {
  'Likely equivalent': { score: 0.9, rank: 1 },
  'Partial - syllabus review': { score: 0.65, rank: 2 },
  'Must be taken at BU': { score: 0.2, rank: 3 },
};

const GENERAL_SUBJECT = 'GEN';
const CAPACITY_SHARE = 0.8; // evaluators at or over 80% of their capacity are passed over when someone lighter qualifies
const BU_CODE = /\bCAS [A-Z]{2} \d{3}\b/g;

/** BU subject code of a BU course or award text, e.g. "CAS CS 111" or "CS elective (CAS CS 3XX)" -> "CS". */
export function buSubject(text) {
  return /\bCAS ([A-Z]{2})\b/.exec(text || '')?.[1] || null;
}

const lower = (s) => (s || '').toLowerCase();

/** program name -> most common BU subject among BU catalog courses of that program (e.g. Biology -> BI). */
async function programSubjects() {
  const { rows } = await query(`SELECT program, course_code FROM catalog_courses WHERE institution = 'Boston University' AND program IS NOT NULL`);
  const counts = new Map();
  for (const r of rows) {
    const subject = buSubject(r.course_code);
    if (!subject) continue;
    const key = lower(r.program);
    const m = counts.get(key) || new Map();
    m.set(subject, (m.get(subject) || 0) + 1);
    counts.set(key, m);
  }
  const result = new Map();
  for (const [program, m] of counts) result.set(program, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return result;
}

/** Evaluators who can take new work: active account, active evaluator, available (not on leave). */
async function activeEvaluators() {
  const { rows } = await query(
    `SELECT e.id, p.full_name, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases,
            (SELECT COUNT(*)::int FROM course_reviews r WHERE r.evaluator_id = e.id AND r.status = ANY($1)) AS open_reviews
     FROM evaluators e JOIN profiles p ON p.id = e.id
     WHERE e.is_active AND p.is_active AND p.role = 'evaluator' AND e.availability = 'available'`,
    [OPEN_STATUSES]
  );
  return rows;
}

/** Every BU course named in a target or suggestion, joined: "CAS CH 101 + CAS CH 102". */
const targetOf = (text) => (String(text || '').match(BU_CODE) || []).join(' + ') || null;

/**
 * The recommended BU target for one course. Precedence: the sponsor's match, then an approved equivalency,
 * then the engine's or the agent's suggestion. Policy-rule outcomes (e.g. grade below C) carry no target.
 */
function recommend(course, sponsorMatches, equivalency) {
  const sponsor = sponsorMatches
    .filter((m) => SPONSOR_LEVELS[m.match_level])
    .sort((a, b) => SPONSOR_LEVELS[a.match_level].rank - SPONSOR_LEVELS[b.match_level].rank)[0];
  // A policy rule already settled the outcome (e.g. BU-only course); keep the BU course it corresponds to
  if (course.path === 'rule') {
    return { target: sponsor?.bu_course || null, score: null, basis: 'rule', level: sponsor?.match_level || null, priority: 'low' };
  }
  const needsInfo = course.path === 'needs_information';
  if (sponsor) {
    const agreesWithEquivalency = equivalency && equivalency.bu_course === sponsor.bu_course;
    return {
      target: sponsor.bu_course,
      score: agreesWithEquivalency ? 1 : SPONSOR_LEVELS[sponsor.match_level].score,
      basis: agreesWithEquivalency ? 'equivalency' : 'sponsor_match',
      level: sponsor.match_level,
      priority: sponsor.match_level === 'Must be taken at BU' || needsInfo ? 'high' : 'normal',
    };
  }
  if ((course.path === 'equivalency' || equivalency) && (course.award || equivalency?.bu_course)) {
    return { target: targetOf(course.award || equivalency.bu_course) || course.award, score: 1, basis: 'equivalency', level: null, priority: needsInfo ? 'high' : 'normal' };
  }
  const suggestionText = course.agent_bu_course || course.suggestion || course.candidates?.[0]?.code || null;
  // Suggestions can carry a note, e.g. "CAS CS 112 (with CS 2100)"; the target keeps every BU course named
  const suggestion = targetOf(suggestionText) || suggestionText;
  const confidence = course.agent_confidence ?? course.confidence;
  return {
    target: suggestion,
    score: suggestion && confidence != null ? Number(confidence) : null,
    basis: suggestion ? (course.path === 'precedent' || course.precedent_ids?.length ? 'precedent' : 'similarity') : 'none',
    level: null,
    priority: needsInfo || !suggestion ? 'high' : 'normal',
  };
}

/**
 * Best evaluator for a course, with the reasons. Points: qualified for a target BU course (3) + subject
 * expertise (2) + has decided this same transfer course before (1) + department or specialization naming the
 * source course's program (1). Among qualified evaluators, those under 80% of capacity come first, then the
 * most points, then the fewest open reviews. With no qualified evaluator: a general credit evaluator with
 * capacity, else nobody (the Credit Evaluation Office queue).
 * @returns {{evaluator: object|null, reason: string, context: string[]}}
 */
export function chooseEvaluator(evaluators, { subject, target, program, experienced = new Set() }, load = new Map(), exclude = new Set()) {
  const targets = String(target || '').match(BU_CODE) || [];
  const scored = evaluators.filter((e) => !exclude.has(e.id)).map((e) => {
    let points = 0;
    const why = [];
    const qualified = targets.filter((t) => (e.expertise_courses || []).includes(t));
    if (qualified.length) { points += 3; why.push(`Qualified for ${qualified.join(' and ')}`); }
    if (subject && (e.expertise_subjects || []).includes(subject)) { points += 2; why.push(`${subject} subject expertise`); }
    if (experienced.has(e.id)) { points += 1; why.push('Has evaluated this course before'); }
    const fields = [e.department, ...(e.specializations || [])].map(lower);
    if (program && fields.some((f) => f && (f.includes(lower(program)) || lower(program).includes(f)))) {
      points += 1; why.push(`${program} department`);
    }
    const open = e.open_reviews + (load.get(e.id) || 0);
    return { e, points, why, open, over: open >= CAPACITY_SHARE * (e.max_concurrent_cases || Infinity) };
  });
  const byLoad = (a, b) => (a.over - b.over) || (a.open - b.open) || a.e.full_name.localeCompare(b.e.full_name);
  const workload = (s) => `${s.open} open of ${s.e.max_concurrent_cases || '—'} capacity`;

  const specialists = scored.filter((s) => s.points > 0).sort((a, b) => (a.over - b.over) || (b.points - a.points) || byLoad(a, b));
  if (specialists.length) {
    const best = specialists[0];
    const tied = specialists.filter((s) => s.points === best.points).length > 1;
    const passedOver = specialists.filter((s) => s.over && s.points > best.points);
    const context = [
      ...best.why,
      'Active and available',
      ...(passedOver.length ? [`${passedOver.length === 1 ? passedOver[0].e.full_name + ' is' : passedOver.length + ' better-matched evaluators are'} near capacity`] : []),
      ...(tied || passedOver.length ? [`Lowest current workload among eligible evaluators (${workload(best)})`] : [`Current workload: ${workload(best)}`]),
    ];
    return { evaluator: best.e, reason: context.join(' · '), context };
  }
  const what = subject || program || 'this course';
  const general = scored.filter((s) => (s.e.expertise_subjects || []).includes(GENERAL_SUBJECT) && !s.over).sort(byLoad)[0];
  if (general) {
    const context = [`No subject specialist for ${what}`, 'General credit evaluator', 'Active and available', `Current workload: ${workload(general)}`];
    return { evaluator: general.e, reason: context.join(' · '), context };
  }
  const context = [`No subject specialist for ${what}`, 'No general credit evaluator with capacity', 'Routed to the Credit Evaluation Office for manual assignment'];
  return { evaluator: null, reason: context.join(' · '), context };
}

async function recordAssignment(reviewId, evaluatorId, reason, assignedBy = null) {
  await query(`UPDATE review_assignments SET ended_at = NOW(), end_reason = COALESCE(end_reason, 'Reassigned') WHERE review_id = $1 AND ended_at IS NULL`, [reviewId]);
  await query(`INSERT INTO review_assignments (review_id, evaluator_id, reason, assigned_by) VALUES ($1, $2, $3, $4)`, [reviewId, evaluatorId, reason, assignedBy]);
}

/**
 * Creates course reviews for the application's transcript courses that have neither a review nor a decision,
 * using the latest completed evaluation. Safe to call again after a re-evaluation: existing reviews keep their
 * evaluator, and undecided ones get the refreshed recommendation.
 * @param {string} applicationId
 * @param {{ held?: Map<string,string> }} [options] held: courses whose established equivalency needs confirmation, and why
 * @returns {Promise<{created: number, owner: string|null, office: number, syllabus_requests: number}>}
 */
export async function assignApplication(applicationId, { held = new Map() } = {}) {
  const { rows: [application] } = await query(
    `SELECT id, reference_number, student_name, transfer_from_institution, transfer_to_program, assigned_evaluator_id, status FROM applications WHERE id = $1`,
    [applicationId]
  );
  if (!application || application.status === 'closed') return { created: 0, owner: null, office: 0, syllabus_requests: 0 };

  const { rows: courses } = await query(
    `SELECT tc.id, tc.institution, tc.course_code, COALESCE(tc.catalog_code, tc.course_code) AS code, tc.title, src.program AS source_program,
            ce.path, ce.outcome, ce.award, ce.suggestion, ce.confidence, ce.candidates, ce.equivalency_id, ce.precedent_ids, ce.agent_bu_course, ce.agent_confidence,
            ce.missing_information, ce.rules,
            r.id AS review_id, r.status AS review_status, r.evaluator_id AS review_evaluator, r.sequence AS review_sequence,
            cd.id AS decision_id
     FROM transcript_courses tc
     LEFT JOIN LATERAL (
       SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
       WHERE ce.transcript_course_id = tc.id AND ae.status = 'completed' ORDER BY ae.created_at DESC LIMIT 1
     ) ce ON true
     LEFT JOIN catalog_courses src ON src.institution = tc.institution AND src.course_code = COALESCE(tc.catalog_code, tc.course_code)
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     WHERE tc.application_id = $1
     ORDER BY tc.position`,
    [applicationId]
  );
  if (courses.length === 0) return { created: 0, owner: null, office: 0, syllabus_requests: 0 };

  const [{ rows: sponsorRows }, { rows: equivalencyRows }, subjects, evaluators] = await Promise.all([
    query(`SELECT peer_institution, peer_course, bu_course, match_level FROM sponsor_course_matches
           WHERE (peer_institution, peer_course) IN (SELECT institution, COALESCE(catalog_code, course_code) FROM transcript_courses WHERE application_id = $1)`, [applicationId]),
    query(`SELECT eq_id, bu_course FROM equivalencies WHERE eq_id = ANY($1) AND status = 'active'`, [courses.map((c) => c.equivalency_id).filter(Boolean)]),
    programSubjects(),
    activeEvaluators(),
  ]);
  const equivalencies = new Map(equivalencyRows.map((e) => [e.eq_id, e]));
  const { rows: experienceRows } = await query(
    `SELECT DISTINCT tc.institution, COALESCE(tc.catalog_code, tc.course_code) AS code, cd.decided_by FROM course_decisions cd JOIN transcript_courses tc ON tc.id = cd.transcript_course_id
     WHERE cd.decided_by IS NOT NULL
       AND (tc.institution, COALESCE(tc.catalog_code, tc.course_code)) IN (SELECT institution, COALESCE(catalog_code, course_code) FROM transcript_courses WHERE application_id = $1)`,
    [applicationId]
  );
  const experience = new Map();
  for (const r of experienceRows) {
    const key = `${r.institution}|${r.code}`;
    if (!experience.has(key)) experience.set(key, new Set());
    experience.get(key).add(r.decided_by);
  }
  const majorSubject = subjects.get(lower(application.transfer_to_program)) || null;
  const sponsorFor = (c) => sponsorRows.filter((m) => m.peer_institution === c.institution && m.peer_course === c.code);

  // Refresh the recommendation on reviews nobody has opened yet
  for (const c of courses.filter((x) => x.review_id && ['queued', 'new'].includes(x.review_status))) {
    const rec = recommend(c, sponsorFor(c), equivalencies.get(c.equivalency_id));
    await query(
      `UPDATE course_reviews SET target_bu_course = $1, match_score = $2, match_basis = $3, sponsor_match_level = $4, priority = $5 WHERE id = $6`,
      [rec.target, rec.score, rec.basis, rec.level, rec.priority, c.review_id]
    );
  }

  const pending = courses.filter((c) => !c.review_id && !c.decision_id && c.path);
  if (pending.length === 0) {
    await openNextSequenceIfIdle(application);
    await refreshApplicationStatus(applicationId);
    return { created: 0, owner: application.assigned_evaluator_id, office: 0, syllabus_requests: 0 };
  }

  // Choose an evaluator per course. The subject comes from the BU target, else from the source course's own
  // program; the student's intended major is not used, so an unrelated course is never routed by the major.
  const load = new Map();
  const planned = pending.map((c) => {
    const rec = recommend(c, sponsorFor(c), equivalencies.get(c.equivalency_id));
    const program = c.source_program || null;
    const subject = buSubject(rec.target) || (program ? subjects.get(lower(program)) : null) || null;
    const experienced = experience.get(`${c.institution}|${c.code}`);
    const choice = chooseEvaluator(evaluators, { subject, target: rec.target, program, experienced }, load);
    if (choice.evaluator) load.set(choice.evaluator.id, (load.get(choice.evaluator.id) || 0) + 1);
    const context = [...(held.has(c.id) ? [held.get(c.id)] : []), ...choice.context];
    return { course: c, rec, subject, evaluator: choice.evaluator, reason: [...(held.has(c.id) ? [held.get(c.id)] : []), choice.reason].join(' · '), context };
  });

  // Order evaluators: keep existing sequences; new ones go after, the major's subject first, then by course count
  const sequences = new Map(courses.filter((c) => c.review_id && c.review_evaluator).map((c) => [c.review_evaluator, c.review_sequence]));
  // The sequence being worked on now (an evaluator has new, in-progress or waiting reviews), if any
  const working = courses.filter((c) => c.review_id && c.review_evaluator && ['new', 'in_progress', 'info_requested'].includes(c.review_status));
  const activeSequence = working.length ? Math.min(...working.map((c) => c.review_sequence)) : null;
  const groups = new Map();
  for (const p of planned) {
    const key = p.evaluator?.id || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const newKeys = [...groups.keys()].filter((k) => k !== 'unassigned' && !sequences.has(k)).sort((a, b) => {
    const majorA = groups.get(a).some((p) => p.subject && p.subject === majorSubject) ? 1 : 0;
    const majorB = groups.get(b).some((p) => p.subject && p.subject === majorSubject) ? 1 : 0;
    return (majorB - majorA) || (groups.get(b).length - groups.get(a).length);
  });
  let next = sequences.size ? Math.max(...sequences.values()) + 1 : 1;
  for (const k of newKeys) sequences.set(k, next++);
  // With nothing in progress, the earliest of the new courses' sequences starts now
  const plannedSequences = planned.filter((p) => p.evaluator).map((p) => sequences.get(p.evaluator.id));
  const firstSequence = activeSequence ?? (plannedSequences.length ? Math.min(...plannedSequences) : 1);

  let created = 0;
  let office = 0;
  const syllabusNeeded = [];
  for (const p of planned) {
    const sequence = p.evaluator ? sequences.get(p.evaluator.id) : firstSequence;
    const { rows: [row] } = await query(
      `INSERT INTO course_reviews (application_id, transcript_course_id, evaluator_id, status, sequence, priority, target_bu_course, match_score,
         match_basis, sponsor_match_level, assignment_reason, assignment_context, queue, assigned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (transcript_course_id) DO NOTHING RETURNING id`,
      // Parallel review: every course opens now, for its evaluator or in the Credit Evaluation Office queue
      [applicationId, p.course.id, p.evaluator?.id || null, 'new', sequence, p.rec.priority, p.rec.target, p.rec.score,
        p.rec.basis, p.rec.level, p.reason, JSON.stringify(p.context), p.evaluator ? 'evaluator' : 'credit_office', new Date()]
    );
    if (!row) continue;
    created += 1;
    if (!p.evaluator) office += 1;
    await recordAssignment(row.id, p.evaluator?.id || null, p.reason);
    // Step 5: no description or syllabus to compare -> listed as "maybe" and the student is asked for the syllabus
    if (p.course.path === 'needs_information' && (p.course.missing_information || []).includes('syllabus')) {
      syllabusNeeded.push({ course: p.course, reviewId: row.id });
    }
  }

  // The first evaluator owns the application
  const ownerId = application.assigned_evaluator_id
    || [...sequences.entries()].find(([, s]) => s === firstSequence)?.[0] || null;
  if (ownerId && !application.assigned_evaluator_id) {
    await query(`UPDATE applications SET assigned_evaluator_id = $1, updated_at = NOW() WHERE id = $2`, [ownerId, applicationId]);
  }

  await auditLog({
    applicationId,
    action: 'reviews_assigned',
    newValue: { assigned_evaluator_id: ownerId },
    details: {
      reviews: planned.map((p) => ({
        course: `${p.course.institution} ${p.course.course_code}`, target: p.rec.target, evaluator: p.evaluator?.full_name || 'Credit Evaluation Office',
        sequence: p.evaluator ? sequences.get(p.evaluator.id) : firstSequence, reason: p.reason,
      })),
    },
  });

  // Tell each evaluator about their courses (all start now), and the Credit Evaluation Office about courses it must place
  const starting = new Map();
  for (const p of planned) {
    if (p.evaluator) starting.set(p.evaluator.id, (starting.get(p.evaluator.id) || 0) + 1);
  }
  for (const [evaluatorId, n] of starting) {
    await sendNotification({
      recipientId: evaluatorId,
      applicationId,
      type: 'evaluation_assigned',
      title: `New Evaluation Assigned: ${application.reference_number}`,
      message: `${n} course${n === 1 ? '' : 's'} from ${application.student_name} (${application.transfer_from_institution}) ${n === 1 ? 'is' : 'are'} ready for your review.`,
      data: { reference_number: application.reference_number },
    });
  }
  if (office) {
    await notifyCreditOffice({
      applicationId, type: 'assignment_needed', title: `Assignment needed: ${application.reference_number}`,
      message: `${office} course${office === 1 ? '' : 's'} from ${application.student_name} had no suitable subject specialist and need${office === 1 ? 's' : ''} an evaluator.`,
      data: { reference_number: application.reference_number },
    });
  }

  for (const s of syllabusNeeded) {
    await requestCourseInformation({ applicationId, transcriptCourseId: s.course.id, reviewId: s.reviewId, kind: 'syllabus' }).catch((err) => {
      console.error(`[Assignment] Could not request the syllabus for ${s.course.course_code}:`, err.message);
    });
  }
  await openNextSequenceIfIdle(application);
  await refreshApplicationStatus(applicationId);
  return { created, owner: ownerId, office, syllabus_requests: syllabusNeeded.length };
}

/**
 * Recomputes one open course review's recommended BU target and match score from the course's latest evaluation,
 * the same way assignment does (sponsor match, then equivalency, then the agent's or the engine's suggestion).
 * Used after the course was compared again (a syllabus arrived), so "Accept" and the match shown follow the new
 * evidence. The evaluator, status and decision are never changed; a decided review is left alone.
 * @returns {Promise<object|null>} the updated target fields, or null when the course has no open review
 */
export async function refreshReviewRecommendation(transcriptCourseId) {
  const { rows: [c] } = await query(
    `SELECT tc.id, tc.institution, COALESCE(tc.catalog_code, tc.course_code) AS code,
            ce.path, ce.outcome, ce.award, ce.suggestion, ce.confidence, ce.candidates, ce.equivalency_id, ce.precedent_ids,
            ce.agent_bu_course, ce.agent_confidence, r.id AS review_id
     FROM transcript_courses tc
     JOIN course_reviews r ON r.transcript_course_id = tc.id AND r.status = ANY($2)
     JOIN LATERAL (
       SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
       WHERE ce.transcript_course_id = tc.id ORDER BY ae.created_at DESC LIMIT 1
     ) ce ON true
     WHERE tc.id = $1`,
    [transcriptCourseId, OPEN_STATUSES]
  );
  if (!c) return null;
  const [{ rows: sponsorRows }, { rows: [equivalency] }] = await Promise.all([
    query(`SELECT peer_institution, peer_course, bu_course, match_level FROM sponsor_course_matches WHERE peer_institution = $1 AND peer_course = $2`,
      [c.institution, c.code]),
    c.equivalency_id ? query(`SELECT eq_id, bu_course FROM equivalencies WHERE eq_id = $1 AND status = 'active'`, [c.equivalency_id]) : { rows: [] },
  ]);
  const rec = recommend(c, sponsorRows, equivalency);
  await query(
    `UPDATE course_reviews SET target_bu_course = $1, match_score = $2, match_basis = $3, sponsor_match_level = $4, priority = $5 WHERE id = $6`,
    [rec.target, rec.score, rec.basis, rec.level, rec.priority, c.review_id]
  );
  return { review_id: c.review_id, target_bu_course: rec.target, match_score: rec.score, match_basis: rec.basis };
}

/**
 * When no evaluator has open courses on the application but some are queued for a later hand-off (e.g. the open
 * ones were settled by an established equivalency), the next evaluator's courses open now.
 */
async function openNextSequenceIfIdle(application) {
  const { rows: [busy] } = await query(
    `SELECT COUNT(*)::int AS n FROM course_reviews WHERE application_id = $1 AND evaluator_id IS NOT NULL AND status IN ('new', 'in_progress', 'info_requested')`,
    [application.id]);
  if (busy.n) return;
  const { rows: queued } = await query(
    `SELECT id, evaluator_id, sequence FROM course_reviews WHERE application_id = $1 AND status = 'queued' AND evaluator_id IS NOT NULL ORDER BY sequence`,
    [application.id]);
  if (!queued.length) return;
  const batch = queued.filter((q) => q.sequence === queued[0].sequence);
  await query(`UPDATE course_reviews SET status = 'new', assigned_at = NOW() WHERE id = ANY($1)`, [batch.map((b) => b.id)]);
  for (const evaluatorId of [...new Set(batch.map((b) => b.evaluator_id))]) {
    const n = batch.filter((b) => b.evaluator_id === evaluatorId).length;
    await sendNotification({
      recipientId: evaluatorId, applicationId: application.id, type: 'evaluation_assigned',
      title: `New Evaluation Assigned: ${application.reference_number}`,
      message: `${n} course${n === 1 ? '' : 's'} from ${application.student_name} ${n === 1 ? 'is' : 'are'} ready for your review.`,
      data: { reference_number: application.reference_number },
    });
  }
}

/**
 * Opens courses still waiting for a hand-off (queued under the earlier sequential review), so every department
 * reviews in parallel. Each evaluator is told; the audit trail records it per application. Safe to run again.
 */
export async function openQueuedReviews(user = null) {
  const { rows } = await query(
    `UPDATE course_reviews SET status = 'new', assigned_at = NOW() WHERE status = 'queued' AND evaluator_id IS NOT NULL
     RETURNING id, application_id, evaluator_id`);
  const byApplication = new Map();
  for (const r of rows) {
    if (!byApplication.has(r.application_id)) byApplication.set(r.application_id, []);
    byApplication.get(r.application_id).push(r);
  }
  for (const [applicationId, reviews] of byApplication) {
    const { rows: [app] } = await query(`SELECT reference_number, student_name FROM applications WHERE id = $1`, [applicationId]);
    await auditLog({ applicationId, action: 'queued_reviews_opened', actorId: user?.id || null, actorEmail: user?.email || null,
      details: { reviews: reviews.length, reason: 'Departments review in parallel' } });
    for (const evaluatorId of [...new Set(reviews.map((r) => r.evaluator_id))]) {
      const n = reviews.filter((r) => r.evaluator_id === evaluatorId).length;
      await sendNotification({
        recipientId: evaluatorId, applicationId, type: 'evaluation_assigned',
        title: `New Evaluation Assigned: ${app.reference_number}`,
        message: `${n} course${n === 1 ? '' : 's'} from ${app.student_name} ${n === 1 ? 'is' : 'are'} ready for your review.`,
        data: { reference_number: app.reference_number },
      });
    }
  }
  return { opened: rows.length, applications: byApplication.size };
}

/** Assigns every evaluated application that still has courses without a review (used by the seed/backfill script). */
export async function assignPendingApplications() {
  const { rows } = await query(
    `SELECT DISTINCT tc.application_id, a.reference_number
     FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     WHERE r.id IS NULL AND cd.id IS NULL AND a.status <> 'closed'
       AND EXISTS (SELECT 1 FROM ai_evaluations ae WHERE ae.application_id = tc.application_id AND ae.status = 'completed')`
  );
  const results = [];
  for (const r of rows) {
    // Step 4 first: established equivalencies need no evaluator
    const { applied, held } = await applyEstablished(r.application_id);
    results.push({ reference_number: r.reference_number, established: applied, ...(await assignApplication(r.application_id, { held })) });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Reassignment
// ---------------------------------------------------------------------------------------------

async function reviewContext(reviewId) {
  const { rows: [r] } = await query(
    `SELECT r.*, tc.institution, COALESCE(tc.catalog_code, tc.course_code) AS code, tc.course_code, src.program AS source_program,
            a.reference_number, a.student_name, a.assigned_evaluator_id
     FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id JOIN applications a ON a.id = r.application_id
     LEFT JOIN catalog_courses src ON src.institution = tc.institution AND src.course_code = COALESCE(tc.catalog_code, tc.course_code)
     WHERE r.id = $1`, [reviewId]);
  if (!r) throw notFound('Course review');
  return r;
}

async function contextFor(r) {
  const subjects = await programSubjects();
  const subject = buSubject(r.target_bu_course) || (r.source_program ? subjects.get(lower(r.source_program)) : null) || null;
  const { rows } = await query(
    `SELECT DISTINCT cd.decided_by FROM course_decisions cd JOIN transcript_courses tc ON tc.id = cd.transcript_course_id
     WHERE tc.institution = $1 AND COALESCE(tc.catalog_code, tc.course_code) = $2 AND cd.decided_by IS NOT NULL`, [r.institution, r.code]);
  return { subject, target: r.target_bu_course, program: r.source_program, experienced: new Set(rows.map((x) => x.decided_by)) };
}

/** Evaluators who could take a review, best first, with the reasons and workload, for manual assignment. */
export async function eligibleEvaluators(reviewId) {
  const r = await reviewContext(reviewId);
  const evaluators = await activeEvaluators();
  const ctx = await contextFor(r);
  const ranked = [];
  const exclude = new Set(r.evaluator_id ? [r.evaluator_id] : []);
  for (;;) {
    const choice = chooseEvaluator(evaluators, ctx, new Map(), exclude);
    if (!choice.evaluator) break;
    ranked.push({ id: choice.evaluator.id, full_name: choice.evaluator.full_name, department: choice.evaluator.department,
      open_reviews: choice.evaluator.open_reviews, capacity: choice.evaluator.max_concurrent_cases, reason: choice.reason });
    exclude.add(choice.evaluator.id);
  }
  // Everyone else who is active, so the office can still choose them deliberately
  for (const e of evaluators.filter((x) => !exclude.has(x.id))) {
    ranked.push({ id: e.id, full_name: e.full_name, department: e.department, open_reviews: e.open_reviews, capacity: e.max_concurrent_cases, reason: 'No matching expertise' });
  }
  return { course: `${r.institution} ${r.course_code}`, target: r.target_bu_course, current_evaluator_id: r.evaluator_id, evaluators: ranked };
}

/**
 * Moves one open review to another evaluator (evaluatorId), to the best eligible evaluator (evaluatorId = 'auto'),
 * or to the Credit Evaluation Office queue (evaluatorId = null). The assignment history keeps every holder.
 */
export async function reassignReview(reviewId, evaluatorId, user, note = null) {
  const r = await reviewContext(reviewId);
  if (!OPEN_STATUSES.includes(r.status)) throw badRequest('Only open course reviews can be reassigned.');
  let target = null;
  let reason;
  if (evaluatorId === 'auto') {
    const choice = chooseEvaluator(await activeEvaluators(), await contextFor(r), new Map(), new Set(r.evaluator_id ? [r.evaluator_id] : []));
    target = choice.evaluator;
    reason = choice.reason;
  } else if (evaluatorId) {
    const { rows: [e] } = await query(
      `SELECT e.id, p.full_name FROM evaluators e JOIN profiles p ON p.id = e.id
       WHERE e.id = $1 AND e.is_active AND p.is_active AND e.availability = 'available'`, [evaluatorId]);
    if (!e) throw badRequest('That evaluator is not active and available.');
    target = e;
    reason = `Assigned by ${user?.full_name || 'the Credit Evaluation Office'}`;
  } else {
    reason = 'Moved to the Credit Evaluation Office queue';
  }
  if (note) reason = `${reason} · ${String(note).trim()}`;
  if (target && target.id === r.evaluator_id) throw badRequest('The course is already assigned to that evaluator.');

  // A course that was waiting for a hand-off stays in order; otherwise it opens for the new holder now
  const status = r.status === 'info_requested' ? 'info_requested' : r.status === 'queued' && target ? 'queued' : 'new';
  await query(
    `UPDATE course_reviews SET evaluator_id = $1, queue = $2, status = $3, assignment_reason = $4,
       assignment_context = $5, assigned_at = NOW(), started_at = NULL WHERE id = $6`,
    [target?.id || null, target ? 'evaluator' : 'credit_office', status, reason, JSON.stringify(reason.split(' · ')), reviewId]
  );
  await recordAssignment(reviewId, target?.id || null, reason, user?.id || null);
  if (!r.assigned_evaluator_id || r.assigned_evaluator_id === r.evaluator_id) {
    await query(`UPDATE applications SET assigned_evaluator_id = $1, updated_at = NOW() WHERE id = $2`, [target?.id || null, r.application_id]);
  }
  await auditLog({ applicationId: r.application_id, action: 'review_reassigned', actorId: user?.id || null, actorEmail: user?.email || null,
    oldValue: { evaluator_id: r.evaluator_id }, newValue: { evaluator_id: target?.id || null },
    details: { review_id: reviewId, course_code: r.course_code, reason } });
  if (target) {
    await sendNotification({
      recipientId: target.id, applicationId: r.application_id, type: 'evaluation_assigned',
      title: `Course assigned to you: ${r.course_code} (${r.reference_number})`,
      message: `${r.course_code} from ${r.student_name}'s application has been assigned to you. ${reason}.`,
      data: { reference_number: r.reference_number, review_id: reviewId },
    });
  }
  return { review_id: reviewId, evaluator_id: target?.id || null, evaluator: target?.full_name || null, queue: target ? 'evaluator' : 'credit_office', reason };
}

/**
 * Tries to place every open course in the Credit Evaluation Office queue with a qualified evaluator (e.g. after
 * new evaluators join or one returns from leave). Courses that still have no suitable evaluator stay queued.
 */
export async function placeOfficeQueue(user = null) {
  const { rows } = await query(`SELECT id FROM course_reviews WHERE queue = 'credit_office' AND status = ANY($1) ORDER BY created_at`, [OPEN_STATUSES]);
  const evaluators = await activeEvaluators();
  let placed = 0;
  for (const r of rows) {
    const ctx = await contextFor(await reviewContext(r.id));
    const { evaluator } = chooseEvaluator(evaluators, ctx);
    if (!evaluator) continue;
    await reassignReview(r.id, 'auto', user, 'Placed from the Credit Evaluation Office queue');
    evaluator.open_reviews += 1;
    placed += 1;
  }
  return { placed, remaining: rows.length - placed };
}

/**
 * An evaluator became inactive or unavailable: every open or queued course they hold goes to the best eligible
 * evaluator (or the Credit Evaluation Office queue). Their completed decisions and history are untouched.
 */
export async function releaseEvaluator(evaluatorId, user, why = 'Evaluator unavailable') {
  const { rows } = await query(
    `SELECT r.id FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
     WHERE r.evaluator_id = $1 AND r.status = ANY($2) ORDER BY r.application_id, tc.position`, [evaluatorId, OPEN_STATUSES]);
  const moved = [];
  for (const r of rows) moved.push(await reassignReview(r.id, 'auto', user, why));
  return { reassigned: moved.length, to_office: moved.filter((m) => !m.evaluator_id).length, moves: moved };
}

export default { assignApplication, assignPendingApplications, refreshReviewRecommendation, buSubject, chooseEvaluator, eligibleEvaluators, reassignReview, releaseEvaluator, placeOfficeQueue, openQueuedReviews, SPONSOR_LEVELS };
