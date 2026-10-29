// The evaluation pipeline as a recorded sequence of stages. runEvaluation already orchestrates the work (read the
// transcripts, check them, match every course, search the institution's precedents, settle established outcomes,
// route the rest to evaluators); this records what each stage did, with counts and timings, so the Credit
// Evaluation Office sees the work done before a department evaluator opened the application. Recording only: a
// stage that fails to record never affects the evaluation.
import { query } from '../../config/db.js';
import { checkTranscript } from '../credit/transcript-quality.js';
import { courseKey } from '../credit/policy.js';
import { getPrecedentIndex } from '../credit/precedent-index.js';
import { courseKnowledge } from './knowledge.service.js';

export function createTrace() {
  const started = Date.now();
  const stages = [];
  return {
    /** A timer for one stage; pass it to record(). */
    start: () => Date.now(),
    /** @param {{ summary: string, metrics?: object, status?: 'done'|'skipped'|'failed' }} detail */
    record(key, label, { summary, metrics = {}, status = 'done' }, startedAt = null) {
      stages.push({ key, label, status, summary, metrics, ms: startedAt ? Date.now() - startedAt : null });
    },
    toJSON: () => ({ version: 1, started_at: new Date(started).toISOString(), total_ms: Date.now() - started, stages }),
  };
}

export async function saveTrace(evaluationId, trace) {
  await query(`UPDATE ai_evaluations SET pipeline_trace = $1 WHERE id = $2`, [JSON.stringify(trace.toJSON()), evaluationId])
    .catch((err) => console.error('[Trace] Could not save the pipeline trace:', err.message));
}

/**
 * The transcript quality check for every transcript on an application, from the courses read into
 * transcript_courses (one group per transcript document, or per institution for courses without one).
 */
export async function applicationQuality(applicationId) {
  const { rows } = await query(
    `SELECT tc.document_id, tc.institution, tc.credit_system, tc.course_code, tc.title, tc.term, tc.source_credits, tc.grade
     FROM transcript_courses tc WHERE tc.application_id = $1 ORDER BY tc.position`, [applicationId]);
  const institutions = [...new Set(rows.map((r) => r.institution).filter(Boolean))];
  const { rows: known } = institutions.length
    ? await query(`SELECT institution, course_code FROM catalog_courses WHERE institution = ANY($1)
                   UNION SELECT institution, course_code FROM equivalencies WHERE institution = ANY($1)`, [institutions])
    : { rows: [] };
  const codesBy = new Map();
  for (const k of known) {
    if (!codesBy.has(k.institution)) codesBy.set(k.institution, new Set());
    codesBy.get(k.institution).add(courseKey(k.course_code));
  }
  const groups = new Map();
  for (const r of rows) {
    const key = r.document_id || r.institution || 'unknown';
    if (!groups.has(key)) groups.set(key, { institution: r.institution, credit_system: r.credit_system, courses: [] });
    groups.get(key).courses.push(r);
  }
  return [...groups.values()].map((g) => ({
    institution: g.institution,
    credit_system: g.credit_system,
    courses: g.courses.length,
    ...checkTranscript(g, { knownCodes: codesBy.get(g.institution) || null }),
  }));
}

/**
 * What the institution already knew about the application's courses when they arrived: established
 * equivalencies, earlier decisions on the same course, conflicts, and, for courses never decided before,
 * decided courses at other institutions with similar content.
 */
export async function precedentScan(applicationId) {
  const { rows } = await query(
    `SELECT DISTINCT tc.institution, COALESCE(tc.catalog_code, tc.course_code) AS code, c.title, c.description, c.learning_outcomes,
            COALESCE(tc.syllabus_text, c.syllabus) AS syllabus
     FROM transcript_courses tc LEFT JOIN catalog_courses c ON c.institution = tc.institution AND c.course_code = COALESCE(tc.catalog_code, tc.course_code)
     WHERE tc.application_id = $1`, [applicationId]);
  const index = await getPrecedentIndex().catch(() => null);
  const m = { courses: rows.length, established: 0, with_previous: 0, previous_decisions: 0, conflicts: 0, first_time: 0, first_time_with_similar: 0 };
  for (const r of rows) {
    const k = await courseKnowledge({ institution: r.institution, courseCode: r.code });
    if (k.established) m.established += 1;
    if (k.previous.total) { m.with_previous += 1; m.previous_decisions += k.previous.total; }
    if (k.conflicts.length) m.conflicts += 1;
    if (!k.established && !k.previous.total) {
      m.first_time += 1;
      if (index?.similar({ institution: r.institution, course_code: r.code, title: r.title, description: r.description,
        learning_outcomes: r.learning_outcomes, syllabus: r.syllabus }).courses.length) m.first_time_with_similar += 1;
    }
  }
  return m;
}

export default { createTrace, saveTrace, applicationQuality, precedentScan };
