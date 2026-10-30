import crypto from 'crypto';
import { query } from '../../config/db.js';
import { createEngine, ENGINE_VERSION } from './engine.js';
import { parseTranscript } from './transcript-parser.js';
import { isAgentConfigured, getProjectClient } from '../ai/agent.service.js';
import { invalidatePrecedentIndex } from './precedent-index.js';
import { checkTranscript } from './transcript-quality.js';
import { courseKey } from './policy.js';

let enginePromise = null;

/** Builds the engine from the reference tables once, then reuses it. */
async function getEngine() {
  if (!enginePromise) {
    console.log(`[Credit] Building credit engine from reference tables...`);
    enginePromise = (async () => {
      const [catalog, equivalencies, decisions] = await Promise.all([
        query(`SELECT institution, course_code, title, program, level, description, learning_outcomes, syllabus FROM catalog_courses`),
        query(`SELECT eq_id, institution, course_code, bu_course, outcome FROM equivalencies WHERE status = 'active'`),
        query(`SELECT decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, TO_CHAR(decided_on, 'YYYY-MM-DD') AS decided_on
               FROM past_decisions WHERE status = 'active'`),
      ]);
      console.log(`[Credit]   catalog_courses=${catalog.rows.length} equivalencies=${equivalencies.rows.length} past_decisions=${decisions.rows.length}`);
      if (catalog.rows.length === 0) throw new Error('Transfer credit reference data is not loaded. Run `npm run db:seed:credit`.');
      const engine = createEngine({
        catalog: catalog.rows,
        equivalencies: equivalencies.rows,
        pastDecisions: decisions.rows,
        syllabi: catalog.rows.filter((c) => c.syllabus).map((c) => ({ institution: c.institution, course_code: c.course_code, syllabus: c.syllabus })),
      });
      console.log(`[Credit]   Engine v${engine.version} built and cached`);
      return engine;
    })().catch((err) => { enginePromise = null; throw err; });
  } else {
    console.log(`[Credit] Using cached credit engine`);
  }
  return enginePromise;
}

// A transcript is read when the student adds it (to show what was found) and again when it is stored at submission.
// The same file gives the same result, so the reading is kept briefly by the file's hash and not repeated.
const PARSE_CACHE_MS = 15 * 60_000;
const parseCache = new Map();
async function parseTranscriptOnce(buffer, mimeType = 'application/pdf') {
  const key = crypto.createHash('sha256').update(buffer).digest('hex');
  const hit = parseCache.get(key);
  if (hit && Date.now() - hit.at < PARSE_CACHE_MS) return hit.parsed;
  const aiClient = isAgentConfigured() ? getProjectClient().getOpenAIClient() : null;
  const parsed = await parseTranscript(buffer, aiClient, { mimeType });
  parseCache.set(key, { parsed, at: Date.now() });
  if (parseCache.size > 200) parseCache.delete(parseCache.keys().next().value);
  return parsed;
}

/** Forces the next evaluation to reload reference data (after equivalencies or decisions change). */
export function invalidateEngine() {
  enginePromise = null;
  invalidatePrecedentIndex();
}

/**
 * What a transcript file says, as the student sees it on review: the reading, with catalog titles in place of
 * truncated ones when the institution's course is on file.
 */
async function readingOf(buffer, mimeType) {
  const parsed = await parseTranscriptOnce(buffer, mimeType);
  let courses = parsed.courses;
  let knownCodes;
  if (parsed.institution && courses.length) {
    const titles = await query(`SELECT UPPER(course_code) AS code, title FROM catalog_courses WHERE institution = $1`, [parsed.institution]);
    const titleOf = new Map(titles.rows.map((r) => [r.code, r.title]));
    courses = courses.map((c) => ({ ...c, title: titleOf.get(c.course_code.toUpperCase()) || c.title }));
    const { rows: eq } = await query(`SELECT course_code FROM equivalencies WHERE institution = $1`, [parsed.institution]);
    const codes = [...titles.rows.map((r) => r.code), ...eq.map((r) => r.course_code)];
    knownCodes = codes.length ? new Set(codes.map(courseKey)) : null;
  }
  return { ...parsed, courses, knownCodes };
}

/**
 * Reads a transcript (PDF, or an image when the AI reader is configured) without storing anything, the same way
 * an upload does, so the student can confirm or correct what was found before submitting: institution, calendar,
 * courses and the header (name, student ID, BU major, BU start term), with how it was read.
 */
export async function readTranscript(buffer, { mimeType = 'application/pdf' } = {}) {
  const r = await readingOf(buffer, mimeType);
  // What may need more review (missing credits, unreadable or Pass grades, repeats, courses not evaluated before)
  const quality = checkTranscript({ institution: r.institution, credit_system: r.credit_system, courses: r.courses }, { knownCodes: r.knownCodes });
  return { institution: r.institution, credit_system: r.credit_system, courses: r.courses, student: r.student || {}, quality,
    method: r.method, text_layer: r.text_layer, pages: r.pages };
}

const EDITABLE = ['course_code', 'title', 'term', 'source_credits', 'grade'];
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/**
 * The student's confirmed values for one course, checked: text fields are trimmed and capped, credits must be a
 * number from 0 to 30 or empty, and an empty course code keeps the transcript's. Returns the values and the
 * fields that differ from the transcript.
 */
function confirmedCourse(original, reviewed) {
  const value = {
    course_code: clip(reviewed.course_code, 40) || original.course_code,
    title: clip(reviewed.title, 200),
    term: clip(reviewed.term, 40) || null,
    source_credits: reviewed.source_credits === '' || reviewed.source_credits == null ? null : Number(reviewed.source_credits),
    grade: clip(reviewed.grade, 10),
  };
  if (value.source_credits != null && (!Number.isFinite(value.source_credits) || value.source_credits < 0 || value.source_credits > 30)) {
    value.source_credits = original.source_credits;
  }
  const same = (k) => (k === 'source_credits'
    ? (original[k] == null && value[k] == null) || (original[k] != null && value[k] != null && Number(original[k]) === Number(value[k]))
    : String(original[k] ?? '').trim() === String(value[k] ?? '').trim());
  return { value, corrected: EDITABLE.filter((k) => !same(k)) };
}

/**
 * Stores the courses of an uploaded transcript in transcript_courses, appended after any already on the application.
 * reviewed: what the student confirmed on the review step ({ institution?, courses? }, one course per course read,
 * in the same order). The confirmed values are stored for evaluation and the original reading beside them
 * (extracted), with the fields the student changed (corrected_fields). Courses can't be added or removed: a list
 * of another length is ignored and the transcript's reading is stored. The file itself is never changed.
 */
export async function importTranscript(applicationId, documentId, buffer, { mimeType = 'application/pdf', reviewed = null } = {}) {
  const r = await readingOf(buffer, mimeType);
  const extraction = { method: r.method, pages: r.pages, text_layer: r.text_layer, courses: r.courses.length };
  await query(`UPDATE application_documents SET extraction = $1 WHERE id = $2`, [JSON.stringify(extraction), documentId])
    .catch((err) => console.error('[Transcript] Extraction details not stored (migration 013 not run?):', err.message));

  const reviewedInstitution = clip(reviewed?.institution, 200);
  const institution = reviewedInstitution || r.institution;
  if (!institution || r.courses.length === 0) return { institution, courses: 0, method: r.method, text_layer: r.text_layer };
  const institutionCorrected = Boolean(reviewedInstitution) && reviewedInstitution !== r.institution;
  const reviewedCourses = Array.isArray(reviewed?.courses) && reviewed.courses.length === r.courses.length ? reviewed.courses : null;
  if (reviewed?.courses && !reviewedCourses) console.warn(`[Transcript] Reviewed courses ignored: ${reviewed.courses.length} sent for ${r.courses.length} read`);

  const next = await query(`SELECT COALESCE(MAX(position), 0) AS last FROM transcript_courses WHERE application_id = $1`, [applicationId]);
  let position = Number(next.rows[0].last);
  let corrected = 0;
  for (const [i, original] of r.courses.entries()) {
    position += 1;
    const { value, corrected: fields } = reviewedCourses ? confirmedCourse(original, reviewedCourses[i] || {}) : { value: original, corrected: [] };
    if (institutionCorrected) fields.push('institution');
    if (fields.length) corrected += 1;
    const extracted = { course_code: original.course_code, title: original.title, term: original.term, source_credits: original.source_credits,
      grade: original.grade, institution: r.institution };
    const values = [applicationId, documentId, position, institution, value.course_code, value.title, value.term, r.credit_system, value.source_credits, value.grade];
    await query(
      `INSERT INTO transcript_courses (application_id, document_id, position, institution, course_code, title, term, credit_system, source_credits, grade,
         extracted, corrected_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [...values, JSON.stringify(extracted), fields]
    ).catch(async (err) => {
      // Before migration 013 the columns for the original reading don't exist: store the confirmed values only
      if (err.code !== '42703') throw err;
      await query(`INSERT INTO transcript_courses (application_id, document_id, position, institution, course_code, title, term, credit_system, source_credits, grade)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, values);
    });
  }
  return { institution, courses: r.courses.length, corrected, method: r.method, text_layer: r.text_layer };
}

/**
 * Runs the engine over the application's transcript courses and stores one row per course.
 * @returns {Promise<{summary, results}|null>} null when no transcript courses have been read yet
 */
export async function evaluateApplicationCredits(application, evaluationId) {
  console.log(`[Credit] evaluateApplicationCredits — app=${application.reference_number} eval=${evaluationId}`);
  const { rows: courses } = await query(`SELECT * FROM transcript_courses WHERE application_id = $1 ORDER BY position`, [application.id]);
  console.log(`[Credit]   Transcript courses found: ${courses.length}`);
  if (courses.length === 0) {
    console.log(`[Credit]   No courses — returning null`);
    return null;
  }

  courses.forEach((c, i) => console.log(`[Credit]   [${i+1}] ${c.institution} ${c.course_code} "${c.title}" ${c.source_credits}cr ${c.grade}`));

  console.log(`[Credit]   Loading engine...`);
  const engine = await getEngine();
  console.log(`[Credit]   Running evaluateTranscript for program="${application.transfer_to_program}"...`);
  const { results, summary } = engine.evaluateTranscript(
    // Missing credits stay missing (null), never 0
    courses.map((c) => ({ ...c, source_credits: c.source_credits == null ? null : Number(c.source_credits) })),
    { major: application.transfer_to_program },
  );
  console.log(`[Credit]   Engine done — ${results.length} results`);
  results.forEach((r, i) => {
    const c = courses[i];
    console.log(`[Credit]     [${i+1}] ${c.course_code}: path=${r.path} outcome=${r.outcome} award=${r.award || '-'} suggestion=${r.suggestion || '-'} confidence=${r.confidence}`);
    if (r.rules?.length)  console.log(`[Credit]          rules=${r.rules.join(',')}`);
    if (r.reasons?.length) console.log(`[Credit]          reasons=${r.reasons.slice(0,3).join(' | ')}`);
  });

  console.log(`[Credit]   Inserting course_evaluations rows...`);
  const evaluationIds = [];
  for (let i = 0; i < courses.length; i++) {
    const r = results[i];
    const { rows: [row] } = await query(
      `INSERT INTO course_evaluations (application_id, ai_evaluation_id, transcript_course_id, path, outcome, award, suggestion, bu_credits, confidence,
         rules, precedent_ids, equivalency_id, candidates, reasons, engine_version, missing_information, combined_with, syllabus_compared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [application.id, evaluationId, courses[i].id, r.path, r.outcome, r.award, r.suggestion, r.bu_credits, r.confidence,
        r.rules, r.precedent_ids, r.equivalency_id, JSON.stringify(r.candidates), JSON.stringify(r.reasons), ENGINE_VERSION,
        r.missing || [], r.combined_with || [], Boolean(courses[i].syllabus_text)]
    );
    evaluationIds.push(row.id);
    // The transcript keeps the code as written; the catalog spelling and the counted attempt are recorded beside it
    await query(`UPDATE transcript_courses SET catalog_code = $1, repeat_of = $2 WHERE id = $3`,
      [r.matched_code && r.matched_code !== courses[i].course_code ? r.matched_code : null,
        r.repeat_of != null ? courses[r.repeat_of].id : null, courses[i].id]);
  }
  console.log(`[Credit]   Inserted ${evaluationIds.length} course_evaluations rows: [${evaluationIds.join(', ')}]`);
  return { summary, results, courses, evaluationIds };
}

/**
 * Re-runs the evaluation of one transcript course after its syllabus arrives, updating the course's latest
 * evaluation in place (path, suggestion, candidates, reasons) so the evaluator sees the new evidence.
 * Decisions are never changed. Returns the updated evaluation, or null when the course has none yet.
 */
export async function rematchCourse(transcriptCourseId) {
  const { rows: [tc] } = await query(
    `SELECT tc.*, a.transfer_to_program FROM transcript_courses tc JOIN applications a ON a.id = tc.application_id WHERE tc.id = $1`, [transcriptCourseId]);
  if (!tc) return null;
  const { rows: [ev] } = await query(
    `SELECT ce.id FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id
     WHERE ce.transcript_course_id = $1 ORDER BY ae.created_at DESC LIMIT 1`, [transcriptCourseId]);
  if (!ev) return null;
  // Evaluate it alongside the rest of the transcript so repeats and combined courses still apply
  const { rows: courses } = await query(`SELECT * FROM transcript_courses WHERE application_id = $1 ORDER BY position`, [tc.application_id]);
  const engine = await getEngine();
  const { results } = engine.evaluateTranscript(
    courses.map((c) => ({ ...c, source_credits: c.source_credits == null ? null : Number(c.source_credits) })),
    { major: tc.transfer_to_program },
  );
  const r = results[courses.findIndex((c) => c.id === transcriptCourseId)];
  const reasons = [...r.reasons, ...(tc.syllabus_text ? ['The syllabus the student sent was compared with the BU catalog.'] : [])];
  const { rows: [updated] } = await query(
    `UPDATE course_evaluations SET path = $1, outcome = $2, award = $3, suggestion = $4, bu_credits = $5, confidence = $6, rules = $7,
       precedent_ids = $8, equivalency_id = $9, candidates = $10, reasons = $11, missing_information = $12, combined_with = $13,
       syllabus_compared = $14, engine_version = $15
     WHERE id = $16 RETURNING *`,
    [r.path, r.outcome, r.award, r.suggestion, r.bu_credits, r.confidence, r.rules, r.precedent_ids, r.equivalency_id,
      JSON.stringify(r.candidates), JSON.stringify(reasons), (r.missing || []).filter((m) => !(m === 'syllabus' && tc.syllabus_text)),
      r.combined_with || [], Boolean(tc.syllabus_text), ENGINE_VERSION, ev.id]
  );
  return updated;
}

/**
 * Transcript courses with the given evaluation's engine and agent results, and the evaluator's decision.
 * Result fields are null before any evaluation; decision fields are null until an evaluator decides.
 */
export async function getCourseEvaluations(applicationId, evaluationId = null) {
  const result = await query(
    `SELECT tc.id, tc.position, tc.institution, tc.course_code, tc.title, tc.term, tc.credit_system, tc.source_credits, tc.grade,
            ce.path, ce.outcome, ce.award, ce.suggestion, ce.bu_credits, ce.confidence, ce.rules, ce.precedent_ids, ce.equivalency_id,
            ce.candidates, ce.reasons, ce.missing_information, ce.combined_with, tc.catalog_code, tc.repeat_of,
            ce.agent_outcome, ce.agent_bu_course, ce.agent_confidence, ce.agent_rationale, ce.agent_precedent_ids, ce.agent_missing,
            cd.action AS decision_action, cd.outcome AS decision_outcome, cd.bu_award AS decision_award, cd.reason AS decision_reason,
            cd.matched_recommendation, cd.past_decision_id, cd.decided_at, p.full_name AS decided_by_name
     FROM transcript_courses tc
     LEFT JOIN course_evaluations ce ON ce.transcript_course_id = tc.id AND ce.ai_evaluation_id = $2
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id
     LEFT JOIN profiles p ON p.id = cd.decided_by
     WHERE tc.application_id = $1
     ORDER BY tc.position`,
    [applicationId, evaluationId]
  );
  return result.rows;
}

export default { importTranscript, evaluateApplicationCredits, rematchCourse, getCourseEvaluations, invalidateEngine };
