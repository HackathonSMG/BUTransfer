// Assigns an application's transcript courses to evaluators once its evaluation completes.
// Every course gets a course review with a recommended BU target and a match score; the evaluator is chosen
// from the evaluator master data (expertise courses, expertise subjects, department/specializations) with
// ties going to the lightest workload. The evaluator whose subject matches the student's major reviews first;
// other evaluators' courses wait (queued) and are handed over by transfer request in order.
import { query } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { sendNotification } from '../notification.service.js';

const OPEN_STATUSES = ['queued', 'new', 'in_progress', 'info_requested'];

// Scores for the sponsor's preliminary match levels; "Must be taken at BU" means transfer credit can't satisfy it
const SPONSOR_LEVELS = {
  'Likely equivalent': { score: 0.9, rank: 1 },
  'Partial - syllabus review': { score: 0.65, rank: 2 },
  'Must be taken at BU': { score: 0.2, rank: 3 },
};

const GENERAL_SUBJECT = 'GEN';

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

async function activeEvaluators() {
  const { rows } = await query(
    `SELECT e.id, p.full_name, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases,
            (SELECT COUNT(*)::int FROM course_reviews r WHERE r.evaluator_id = e.id AND r.status = ANY($1)) AS open_reviews
     FROM evaluators e JOIN profiles p ON p.id = e.id
     WHERE e.is_active AND p.is_active AND p.role = 'evaluator'`,
    [OPEN_STATUSES]
  );
  return rows;
}

/**
 * The recommended BU target for one course. Precedence: the sponsor's match, then an approved equivalency,
 * then the engine's or the agent's suggestion. Policy-rule outcomes (e.g. grade below C) carry no target.
 */
function recommend(course, sponsorMatches, equivalency) {
  const sponsor = sponsorMatches
    .filter((m) => SPONSOR_LEVELS[m.match_level])
    .sort((a, b) => SPONSOR_LEVELS[a.match_level].rank - SPONSOR_LEVELS[b.match_level].rank)[0];
  // A policy rule already settled the outcome (e.g. grade below C, BU-only course); keep the BU course it corresponds to
  if (course.path === 'rule') {
    return { target: sponsor?.bu_course || null, score: null, basis: 'rule', level: sponsor?.match_level || null, priority: 'low' };
  }
  if (sponsor) {
    const agreesWithEquivalency = equivalency && equivalency.bu_course === sponsor.bu_course;
    return {
      target: sponsor.bu_course,
      score: agreesWithEquivalency ? 1 : SPONSOR_LEVELS[sponsor.match_level].score,
      basis: agreesWithEquivalency ? 'equivalency' : 'sponsor_match',
      level: sponsor.match_level,
      priority: sponsor.match_level === 'Must be taken at BU' || course.path === 'needs_information' ? 'high' : 'normal',
    };
  }
  if (course.path === 'equivalency' && course.award) {
    return { target: course.award, score: 1, basis: 'equivalency', level: null, priority: 'normal' };
  }
  const suggestionText = course.agent_bu_course || course.suggestion || course.candidates?.[0]?.code || null;
  // Suggestions can carry a note, e.g. "CAS CS 112 (with CS 2100)"; the target is the course code itself
  const suggestion = /\bCAS [A-Z]{2} \d{3}\b/.exec(suggestionText || '')?.[0] || suggestionText;
  const confidence = course.agent_confidence ?? course.confidence;
  return {
    target: suggestion,
    score: suggestion && confidence != null ? Number(confidence) : null,
    basis: suggestion ? (course.path === 'precedent' || course.precedent_ids?.length ? 'precedent' : 'similarity') : 'none',
    level: null,
    priority: course.path === 'needs_information' || !suggestion ? 'high' : 'normal',
  };
}

/**
 * Best evaluator for a subject/target: expertise course (3) + expertise subject (2) + department or
 * specialization naming the program (1). Ties: under capacity first, then fewest open reviews, then name.
 */
function chooseEvaluator(evaluators, { subject, target, program }, load) {
  const scored = evaluators.map((e) => {
    let points = 0;
    const why = [];
    if (target && (e.expertise_courses || []).includes(target)) { points += 3; why.push(`Qualified for ${target}`); }
    if (subject && (e.expertise_subjects || []).includes(subject)) { points += 2; why.push(`${subject} subject expertise`); }
    const fields = [e.department, ...(e.specializations || [])].map(lower);
    if (program && fields.some((f) => f && (f.includes(lower(program)) || lower(program).includes(f)))) {
      points += 1; why.push(`${program} department`);
    }
    const open = e.open_reviews + (load.get(e.id) || 0);
    return { e, points, why, open, over: open >= (e.max_concurrent_cases || Infinity) };
  });
  const byLoad = (a, b) => (a.over - b.over) || (a.open - b.open) || a.e.full_name.localeCompare(b.e.full_name);

  const specialists = scored.filter((s) => s.points > 0).sort((a, b) => (b.points - a.points) || byLoad(a, b));
  if (specialists.length) {
    const best = specialists[0];
    const tied = specialists.filter((s) => s.points === best.points).length > 1;
    return { evaluator: best.e, reason: [...best.why, ...(tied ? ['Lightest current workload'] : [])].join(' · ') };
  }
  const general = scored.filter((s) => (s.e.expertise_subjects || []).includes(GENERAL_SUBJECT)).sort(byLoad)[0]
    || scored.sort(byLoad)[0];
  if (!general) return { evaluator: null, reason: 'No active evaluator is available.' };
  return { evaluator: general.e, reason: `General credit evaluation · No subject specialist for ${subject || program || 'this course'}` };
}

/**
 * Creates course reviews for the application's transcript courses that don't have one yet, using the
 * latest completed evaluation. Safe to call again after a re-evaluation: existing reviews keep their
 * evaluator, and undecided ones get the refreshed recommendation.
 * @returns {Promise<{created: number, owner: string|null}>}
 */
export async function assignApplication(applicationId) {
  const { rows: [application] } = await query(
    `SELECT id, reference_number, student_name, transfer_from_institution, transfer_to_program, assigned_evaluator_id FROM applications WHERE id = $1`,
    [applicationId]
  );
  if (!application) return { created: 0, owner: null };

  const { rows: courses } = await query(
    `SELECT tc.id, tc.institution, tc.course_code, tc.title, src.program AS source_program,
            ce.path, ce.outcome, ce.award, ce.suggestion, ce.confidence, ce.candidates, ce.equivalency_id, ce.precedent_ids, ce.agent_bu_course, ce.agent_confidence,
            r.id AS review_id, r.status AS review_status, r.evaluator_id AS review_evaluator, r.sequence AS review_sequence,
            cd.id AS decision_id
     FROM transcript_courses tc
     LEFT JOIN LATERAL (
       SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
       WHERE ce.transcript_course_id = tc.id AND ae.status = 'completed' ORDER BY ae.created_at DESC LIMIT 1
     ) ce ON true
     LEFT JOIN catalog_courses src ON src.institution = tc.institution AND src.course_code = tc.course_code
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     WHERE tc.application_id = $1
     ORDER BY tc.position`,
    [applicationId]
  );
  if (courses.length === 0) return { created: 0, owner: null };

  const [{ rows: sponsorRows }, { rows: equivalencyRows }, subjects, evaluators] = await Promise.all([
    query(`SELECT peer_institution, peer_course, bu_course, match_level FROM sponsor_course_matches
           WHERE (peer_institution, peer_course) IN (SELECT institution, course_code FROM transcript_courses WHERE application_id = $1)`, [applicationId]),
    query(`SELECT eq_id, bu_course FROM equivalencies WHERE eq_id = ANY($1) AND status = 'active'`, [courses.map((c) => c.equivalency_id).filter(Boolean)]),
    programSubjects(),
    activeEvaluators(),
  ]);
  const equivalencies = new Map(equivalencyRows.map((e) => [e.eq_id, e]));
  const majorSubject = subjects.get(lower(application.transfer_to_program)) || null;

  // Refresh the recommendation on reviews nobody has opened yet
  for (const c of courses.filter((x) => x.review_id && ['queued', 'new'].includes(x.review_status))) {
    const rec = recommend(c, sponsorRows.filter((m) => m.peer_institution === c.institution && m.peer_course === c.course_code), equivalencies.get(c.equivalency_id));
    await query(
      `UPDATE course_reviews SET target_bu_course = $1, match_score = $2, match_basis = $3, sponsor_match_level = $4, priority = $5 WHERE id = $6`,
      [rec.target, rec.score, rec.basis, rec.level, rec.priority, c.review_id]
    );
  }

  const pending = courses.filter((c) => !c.review_id && !c.decision_id);
  if (pending.length === 0) return { created: 0, owner: application.assigned_evaluator_id };

  // Choose an evaluator per course
  const load = new Map();
  const planned = pending.map((c) => {
    const rec = recommend(c, sponsorRows.filter((m) => m.peer_institution === c.institution && m.peer_course === c.course_code), equivalencies.get(c.equivalency_id));
    const program = c.source_program || application.transfer_to_program;
    const subject = buSubject(rec.target) || subjects.get(lower(program)) || null;
    const { evaluator, reason } = chooseEvaluator(evaluators, { subject, target: rec.target, program }, load);
    if (evaluator) load.set(evaluator.id, (load.get(evaluator.id) || 0) + 1);
    return { course: c, rec, subject, evaluator, reason };
  });

  // Order evaluators: keep existing sequences; new ones go after, the major's subject first, then by course count
  const sequences = new Map(courses.filter((c) => c.review_id && c.review_evaluator).map((c) => [c.review_evaluator, c.review_sequence]));
  // The sequence being worked on now (an evaluator has new, in-progress or waiting reviews), if any
  const working = courses.filter((c) => c.review_id && ['new', 'in_progress', 'info_requested'].includes(c.review_status));
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
  for (const p of planned) {
    const sequence = p.evaluator ? sequences.get(p.evaluator.id) : firstSequence;
    const startsNow = sequence === firstSequence;
    const { rowCount } = await query(
      `INSERT INTO course_reviews (application_id, transcript_course_id, evaluator_id, status, sequence, priority, target_bu_course, match_score,
         match_basis, sponsor_match_level, assignment_reason, assigned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (transcript_course_id) DO NOTHING`,
      [applicationId, p.course.id, p.evaluator?.id || null, startsNow ? 'new' : 'queued', sequence, p.rec.priority, p.rec.target, p.rec.score,
        p.rec.basis, p.rec.level, p.reason, startsNow ? new Date() : null]
    );
    created += rowCount;
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
        course: `${p.course.institution} ${p.course.course_code}`, target: p.rec.target, evaluator: p.evaluator?.full_name || null,
        sequence: p.evaluator ? sequences.get(p.evaluator.id) : firstSequence, reason: p.reason,
      })),
    },
  });

  // Tell each evaluator whose courses start now
  const starting = new Map();
  for (const p of planned) {
    if (p.evaluator && sequences.get(p.evaluator.id) === firstSequence) starting.set(p.evaluator.id, (starting.get(p.evaluator.id) || 0) + 1);
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

  return { created, owner: ownerId };
}

/** Assigns every evaluated application that still has courses without a review (used by the seed/backfill script). */
export async function assignPendingApplications() {
  const { rows } = await query(
    `SELECT DISTINCT tc.application_id, a.reference_number
     FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id
     LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     WHERE r.id IS NULL AND cd.id IS NULL
       AND EXISTS (SELECT 1 FROM ai_evaluations ae WHERE ae.application_id = tc.application_id AND ae.status = 'completed')`
  );
  const results = [];
  for (const r of rows) results.push({ reference_number: r.reference_number, ...(await assignApplication(r.application_id)) });
  return results;
}

export default { assignApplication, assignPendingApplications, buSubject };
