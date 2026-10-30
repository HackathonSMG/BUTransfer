// Course equivalency management: evaluators propose equivalencies, the Credit Evaluation Office and administrators
// approve or reject proposals and add equivalencies directly, and administrators import them in bulk from a CSV.
// equivalencies holds one row per source course; proposals wait in equivalency_proposals until reviewed.
// Every change invalidates the credit engine, so the next evaluation uses it; existing decisions stay as they were.
import { query, getClient } from '../../config/db.js';
import { log as auditLog } from '../audit.service.js';
import { invalidateEngine } from './credit.service.js';
import { courseKey } from './policy.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';

export const OUTCOMES = ['BU equivalent', 'Elective credit', 'No credit'];
export const TARGET = 'Boston University';
export const IMPORT_MAX_ROWS = 1000;
const MANAGERS = ['admin', 'credit_office'];

const clean = (s, max = 500) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const instKey = (s) => clean(s).toLowerCase();
const keyOf = (institution, code) => `${instKey(institution)}|${courseKey(code)}`;
const conflictError = (message, details) => new AppError(message, 409, 'CONFLICT', details);
const sameAward = (a, b) => a.outcome === b.outcome && (a.bu_course || '') === (b.bu_course || '');
const awardText = (e) => (e.outcome === 'BU equivalent' ? e.bu_course : e.outcome);

/** Outcome as stored ('BU equivalent' | 'Elective credit' | 'No credit'); accepts the engine's words too. */
export function normalizeOutcome(value) {
  const v = clean(value).toLowerCase().replace(/[_-]+/g, ' ');
  if (['bu equivalent', 'equivalent', 'transfer', 'bu course'].includes(v)) return 'BU equivalent';
  if (['elective credit', 'elective'].includes(v)) return 'Elective credit';
  if (['no credit', 'none', 'reject', 'rejected'].includes(v)) return 'No credit';
  return null;
}

/**
 * Reference data used to validate entries: the institutions and course codes already known (catalog and
 * equivalencies) so a course is stored under its existing spelling, the BU catalog, and existing equivalencies.
 */
async function loadReference(institutions) {
  const names = [...new Set(institutions.map(instKey).filter(Boolean))];
  const [known, eqs, bu] = await Promise.all([
    names.length
      ? query(`SELECT institution, course_code, title FROM catalog_courses WHERE LOWER(institution) = ANY($1)`, [names])
      : { rows: [] },
    names.length
      ? query(`SELECT eq_id, institution, course_code, title, bu_course, outcome, status, source, note FROM equivalencies WHERE LOWER(institution) = ANY($1)`, [names])
      : { rows: [] },
    query(`SELECT course_code, title FROM catalog_courses WHERE institution = $1`, [TARGET]),
  ]);
  const institutionName = new Map();
  const courses = new Map(); // instKey|courseKey -> { course_code, title }
  // Equivalencies come last so their spelling wins: a new entry must land on the existing row (UNIQUE institution, course_code)
  for (const r of [...known.rows, ...eqs.rows]) {
    institutionName.set(instKey(r.institution), r.institution);
    const k = keyOf(r.institution, r.course_code);
    const prev = courses.get(k);
    courses.set(k, { course_code: r.course_code, title: r.title || prev?.title || null });
  }
  return {
    institutionName,
    courses,
    equivalencies: new Map(eqs.rows.map((e) => [keyOf(e.institution, e.course_code), e])),
    bu: new Map(bu.rows.map((c) => [courseKey(c.course_code), c])),
  };
}

/**
 * Validates and normalises one entry against the reference data.
 * @returns {{ value?: {institution, course_code, title, outcome, bu_course, note}, error?: string, existing?: object }}
 */
function validateEntry(raw, ref) {
  const institutionIn = clean(raw.institution, 200);
  const codeIn = clean(raw.course_code ?? raw.course, 60).toUpperCase();
  if (!institutionIn) return { error: 'Enter the institution.' };
  if (!codeIn) return { error: 'Enter the course code.' };
  if (!courseKey(codeIn)) return { error: 'The course code must contain letters or numbers.' };
  if (instKey(institutionIn) === instKey(TARGET)) return { error: 'The source course must be at another institution, not Boston University.' };
  const outcome = normalizeOutcome(raw.outcome);
  if (!outcome) return { error: `Outcome must be one of: ${OUTCOMES.join(', ')}.` };

  const institution = ref.institutionName.get(instKey(institutionIn)) || institutionIn;
  const known = ref.courses.get(keyOf(institution, codeIn));
  const course_code = known?.course_code || codeIn;

  let bu_course = null;
  if (outcome === 'BU equivalent') {
    const parts = String(raw.bu_course ?? '').split('+').map((p) => clean(p, 40).toUpperCase()).filter(Boolean);
    if (!parts.length) return { error: 'Choose the BU course for a BU equivalent.' };
    const codes = [];
    const unknown = [];
    for (const p of parts) {
      const c = ref.bu.get(courseKey(p));
      if (c) { if (!codes.includes(c.course_code)) codes.push(c.course_code); } else unknown.push(p);
    }
    if (unknown.length) return { error: `${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the BU course catalog.` };
    bu_course = codes.join(' + ');
  }

  const value = {
    institution, course_code, outcome, bu_course,
    title: clean(raw.title, 200) || known?.title || null,
    note: clean(raw.note, 2000) || null,
  };
  return { value, existing: ref.equivalencies.get(keyOf(institution, course_code)) || null };
}

async function validateOne(raw) {
  const ref = await loadReference([raw?.institution]);
  const v = validateEntry(raw || {}, ref);
  if (v.error) throw badRequest(v.error);
  return v;
}

const existingView = (e) => (e ? { eq_id: e.eq_id, outcome: e.outcome, bu_course: e.bu_course, status: e.status, source: e.source } : null);

// Inserts or replaces the equivalency for a source course, inside the caller's transaction
async function upsertEquivalency(client, v, { source, evaluator, user }) {
  const { rows: [eq] } = await client.query(
    `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, approved_on, evaluator, source, status, data_source,
                               approved_by, approved_at, note)
     VALUES ('EQ-' || nextval('equivalency_number_seq'), $1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, 'active', 'user', $8, NOW(), $9)
     ON CONFLICT (institution, course_code) DO UPDATE SET outcome = EXCLUDED.outcome, bu_course = EXCLUDED.bu_course,
       title = COALESCE(EXCLUDED.title, equivalencies.title), status = 'active', source = EXCLUDED.source, data_source = 'user',
       approved_on = CURRENT_DATE, approved_at = NOW(), approved_by = EXCLUDED.approved_by, evaluator = EXCLUDED.evaluator,
       note = EXCLUDED.note, promoted_from = '{}'
     RETURNING eq_id, institution, course_code, title, bu_course, outcome, status, source, TO_CHAR(approved_on, 'YYYY-MM-DD') AS approved_on, evaluator, note`,
    [v.institution, v.course_code, v.title, v.bu_course, v.outcome, evaluator, source, user.id, v.note]
  );
  return eq;
}

// ---------------------------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------------------------

/** An evaluator (or the office) proposes the equivalency for a source course; it applies only once approved. */
export async function propose(body, user) {
  const { value: v, existing } = await validateOne(body);
  const reviewId = body?.review_id && /^[0-9a-f-]{36}$/i.test(String(body.review_id)) ? String(body.review_id) : null;

  if (existing?.status === 'active' && sameAward(existing, v)) {
    throw conflictError(`${v.course_code} at ${v.institution} already has this equivalency (${existing.eq_id}).`, { existing: existingView(existing) });
  }
  const { rows: [dup] } = await query(
    `SELECT id FROM equivalency_proposals WHERE LOWER(institution) = LOWER($1) AND course_code = $2 AND outcome = $3
       AND COALESCE(bu_course, '') = COALESCE($4, '') AND status = 'pending' LIMIT 1`,
    [v.institution, v.course_code, v.outcome, v.bu_course]
  );
  if (dup) throw conflictError('The same proposal is already waiting for approval.', { proposal_id: dup.id });

  const { rows: [p] } = await query(
    `INSERT INTO equivalency_proposals (institution, course_code, title, outcome, bu_course, note, source, proposed_by, review_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [v.institution, v.course_code, v.title, v.outcome, v.bu_course, v.note, reviewId ? 'decision' : 'evaluator', user.id, reviewId]
  );
  await auditLog({ action: 'equivalency_proposed', actorId: user.id, actorRole: user.role, actorEmail: user.email, newValue: p,
    details: { proposal_id: p.id, institution: v.institution, course_code: v.course_code, review_id: reviewId } });
  return { proposal: p, current: existing?.status === 'active' ? existingView(existing) : null };
}

/** Pending and reviewed proposals: everything for the office and administrators, their own for evaluators. */
export async function listProposals(user, { status } = {}) {
  const params = [];
  const where = [];
  if (!MANAGERS.includes(user.role)) { params.push(user.id); where.push(`p.proposed_by = $${params.length}`); }
  if (['pending', 'approved', 'rejected'].includes(status)) { params.push(status); where.push(`p.status = $${params.length}`); }
  const { rows } = await query(
    `SELECT p.id, p.institution, p.course_code, p.title, p.outcome, p.bu_course, p.note, p.status, p.source, p.review_id, p.equivalency_id,
            p.proposed_by, COALESCE(pp.full_name, 'Former staff member') AS proposed_by_name, p.proposed_at,
            rp.full_name AS reviewed_by_name, p.reviewed_at, p.review_note,
            CASE WHEN e.eq_id IS NULL THEN NULL ELSE json_build_object('eq_id', e.eq_id, 'outcome', e.outcome, 'bu_course', e.bu_course,
              'status', e.status, 'source', e.source) END AS current
     FROM equivalency_proposals p
     LEFT JOIN profiles pp ON pp.id = p.proposed_by
     LEFT JOIN profiles rp ON rp.id = p.reviewed_by
     LEFT JOIN equivalencies e ON LOWER(e.institution) = LOWER(p.institution) AND e.course_code = p.course_code
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (p.status = 'pending') DESC, p.proposed_at DESC
     LIMIT 500`,
    params
  );
  return rows;
}

async function lockPending(client, id) {
  const { rows: [p] } = await client.query(`SELECT * FROM equivalency_proposals WHERE id = $1 FOR UPDATE`, [id]);
  if (!p) throw notFound('Proposal');
  if (p.status !== 'pending') throw conflictError(`This proposal was already ${p.status}.`, { status: p.status });
  return p;
}

/** Approves a proposal: it becomes (or replaces) the active equivalency for the course. */
export async function approveProposal(id, { note } = {}, user) {
  if (!MANAGERS.includes(user.role)) throw forbidden();
  // The reference data is read before the transaction: reading it through the pool while this transaction holds a
  // connection could wait on itself when connections are scarce
  const { rows: [pre] } = await query(`SELECT institution FROM equivalency_proposals WHERE id = $1`, [id]);
  if (!pre) throw notFound('Proposal');
  const ref = await loadReference([pre.institution]);
  const client = await getClient();
  let result;
  try {
    await client.query('BEGIN');
    const p = await lockPending(client, id);
    // Validate again: the BU catalog may have changed since the proposal was made
    const { value: v, error, existing } = validateEntry({ ...p, note: p.note }, ref);
    if (error) throw badRequest(`This proposal can no longer be approved: ${error}`);
    const { rows: [proposer] } = await client.query(`SELECT full_name FROM profiles WHERE id = $1`, [p.proposed_by]);
    const eq = await upsertEquivalency(client, v, { source: 'manual', evaluator: proposer?.full_name || user.full_name, user });
    const reviewNote = clean(note, 2000) || null;
    await client.query(
      `UPDATE equivalency_proposals SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), review_note = $3, equivalency_id = $4 WHERE id = $1`,
      [id, user.id, reviewNote, eq.eq_id]
    );
    await client.query('COMMIT');
    // replaced: the equivalency this approval overwrote (active or revoked), or null when the course had none
    result = { proposal_id: id, status: 'approved', equivalency: eq, replaced: existing ? existingView(existing) : null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  invalidateEngine();
  await auditLog({ action: 'equivalency_proposal_approved', actorId: user.id, actorRole: user.role, actorEmail: user.email,
    oldValue: result.replaced, newValue: result.equivalency, details: { proposal_id: id, eq_id: result.equivalency.eq_id, replaced: result.replaced?.eq_id || null } });
  return result;
}

/** Rejects a proposal; the reason is shown to the evaluator who proposed it. */
export async function rejectProposal(id, { review_note: reviewNote } = {}, user) {
  if (!MANAGERS.includes(user.role)) throw forbidden();
  const why = clean(reviewNote, 2000);
  if (!why) throw badRequest('Give the reason for rejecting the proposal.');
  const client = await getClient();
  let p;
  try {
    await client.query('BEGIN');
    p = await lockPending(client, id);
    await client.query(`UPDATE equivalency_proposals SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), review_note = $3 WHERE id = $1`, [id, user.id, why]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await auditLog({ action: 'equivalency_proposal_rejected', actorId: user.id, actorRole: user.role, actorEmail: user.email,
    details: { proposal_id: id, institution: p.institution, course_code: p.course_code, review_note: why } });
  return { proposal_id: id, status: 'rejected' };
}

// ---------------------------------------------------------------------------------------------
// Direct add (Credit Evaluation Office, administrators)
// ---------------------------------------------------------------------------------------------

/** Adds the equivalency for a course. Replacing a different active equivalency needs replace: true. */
export async function addEquivalency(body, user) {
  if (!MANAGERS.includes(user.role)) throw forbidden();
  const { value: v, existing } = await validateOne(body);
  if (existing?.status === 'active') {
    if (sameAward(existing, v)) {
      throw conflictError(`${v.course_code} at ${v.institution} already has this equivalency (${existing.eq_id}).`, { existing: existingView(existing) });
    }
    if (body?.replace !== true) {
      throw conflictError(`${v.course_code} at ${v.institution} already has an active equivalency (${existing.eq_id}: ${awardText(existing)}). Confirm to replace it.`,
        { existing: existingView(existing) });
    }
  }
  const client = await getClient();
  let eq;
  try {
    await client.query('BEGIN');
    eq = await upsertEquivalency(client, v, { source: 'manual', evaluator: user.full_name, user });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  invalidateEngine();
  const replaced = existing ? existingView(existing) : null;
  await auditLog({ action: 'equivalency_added', actorId: user.id, actorRole: user.role, actorEmail: user.email,
    oldValue: replaced, newValue: eq, details: { eq_id: eq.eq_id, replaced: replaced?.eq_id || null } });
  return { equivalency: eq, replaced };
}

// ---------------------------------------------------------------------------------------------
// Bulk import (administrators)
// ---------------------------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks. Returns rows of strings. */
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (quoted) throw badRequest('The CSV file has a quoted value that is never closed.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => String(f).trim() !== ''));
}

const HEADER_ALIASES = {
  institution: 'institution', school: 'institution',
  course: 'course_code', course_code: 'course_code', code: 'course_code', source_course: 'course_code',
  title: 'title', course_title: 'title',
  outcome: 'outcome',
  bu_course: 'bu_course', bu_equivalent: 'bu_course', bu_course_code: 'bu_course',
  note: 'note', notes: 'note',
};
export const IMPORT_COLUMNS = ['institution', 'course', 'title', 'outcome', 'bu_course', 'note'];

/** Reads the CSV into entries keyed by the import columns, with their line numbers. */
function entriesFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw badRequest('The CSV file is empty.');
  const header = rows[0].map((h) => HEADER_ALIASES[String(h).trim().toLowerCase().replace(/[\s-]+/g, '_')] || null);
  const missing = ['institution', 'course_code', 'outcome', 'bu_course'].filter((c) => !header.includes(c));
  if (missing.length) {
    throw badRequest(`The CSV header must include ${missing.map((c) => (c === 'course_code' ? 'course' : c)).join(', ')}. Expected columns: ${IMPORT_COLUMNS.join(', ')}.`);
  }
  const data = rows.slice(1);
  if (!data.length) throw badRequest('The CSV file has a header but no rows.');
  if (data.length > IMPORT_MAX_ROWS) throw badRequest(`A CSV import can hold at most ${IMPORT_MAX_ROWS} rows; this file has ${data.length}.`);
  return data.map((cells, i) => {
    const entry = { row: i + 2 };
    header.forEach((col, j) => { if (col && entry[col] === undefined) entry[col] = cells[j] ?? ''; });
    return entry;
  });
}

/**
 * Classifies each entry: new | update (an equivalency exists with different values, or is revoked) |
 * duplicate (identical active equivalency) | invalid (with the reason).
 */
async function classify(entries) {
  const ref = await loadReference(entries.map((e) => e.institution));
  const seen = new Map();
  return entries.map((e, i) => {
    const row = e.row ?? i + 1;
    const input = { institution: clean(e.institution, 200), course_code: clean(e.course_code ?? e.course, 60), title: clean(e.title, 200),
      outcome: clean(e.outcome, 40), bu_course: clean(e.bu_course, 200), note: clean(e.note, 2000) };
    const v = validateEntry(input, ref);
    if (v.error) return { row, ...input, status: 'invalid', reason: v.error };
    const k = keyOf(v.value.institution, v.value.course_code);
    if (seen.has(k)) return { row, ...input, status: 'invalid', reason: `Repeats row ${seen.get(k)} for the same course.` };
    seen.set(k, row);
    const ex = v.existing;
    if (!ex) return { row, ...v.value, status: 'new' };
    if (ex.status === 'active' && sameAward(ex, v.value)) {
      return { row, ...v.value, status: 'duplicate', reason: `Same as ${ex.eq_id}.`, existing: existingView(ex) };
    }
    const reason = ex.status === 'revoked'
      ? `${ex.eq_id} was revoked; importing restores it with these values.`
      : `Replaces ${ex.eq_id} (${awardText(ex)}).`;
    return { row, ...v.value, status: 'update', reason, existing: existingView(ex) };
  });
}

const countOf = (rows) => ({
  total: rows.length,
  new: rows.filter((r) => r.status === 'new').length,
  update: rows.filter((r) => r.status === 'update').length,
  duplicate: rows.filter((r) => r.status === 'duplicate').length,
  invalid: rows.filter((r) => r.status === 'invalid').length,
});

/** Checks an uploaded CSV without changing anything. */
export async function previewImport(buffer, user) {
  if (user.role !== 'admin') throw forbidden();
  if (!buffer?.length) throw badRequest('Choose a CSV file to import.');
  const rows = await classify(entriesFromCsv(buffer.toString('utf8')));
  return { rows, counts: countOf(rows), max_rows: IMPORT_MAX_ROWS };
}

/** Imports the previewed rows (validated again here) in one transaction: everything is applied or nothing is. */
export async function commitImport({ rows: input, update_existing: updateExisting } = {}, user) {
  if (user.role !== 'admin') throw forbidden();
  if (!Array.isArray(input) || !input.length) throw badRequest('There are no rows to import.');
  if (input.length > IMPORT_MAX_ROWS) throw badRequest(`A CSV import can hold at most ${IMPORT_MAX_ROWS} rows.`);
  const rows = await classify(input.map((r, i) => ({ ...r, row: Number.isInteger(r?.row) ? r.row : i + 1 })));
  const counts = countOf(rows);
  const toInsert = rows.filter((r) => r.status === 'new');
  const toUpdate = updateExisting === true ? rows.filter((r) => r.status === 'update') : [];
  if (!toInsert.length && !toUpdate.length) throw badRequest('Nothing to import: every row is a duplicate, invalid, or an update you chose not to apply.');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const r of toInsert) {
      await client.query(
        `INSERT INTO equivalencies (eq_id, institution, course_code, title, bu_course, outcome, approved_on, evaluator, source, status, data_source,
                                   approved_by, approved_at, note)
         VALUES ('EQ-' || nextval('equivalency_number_seq'), $1, $2, $3, $4, $5, CURRENT_DATE, $6, 'imported', 'active', 'user', $7, NOW(), $8)`,
        [r.institution, r.course_code, r.title, r.bu_course, r.outcome, user.full_name, user.id, r.note]
      );
    }
    for (const r of toUpdate) {
      await client.query(
        `UPDATE equivalencies SET outcome = $2, bu_course = $3, title = COALESCE($4, title), note = COALESCE($5, note), status = 'active',
           source = 'imported', data_source = 'user', approved_on = CURRENT_DATE, approved_at = NOW(), approved_by = $6, evaluator = $7, promoted_from = '{}'
         WHERE eq_id = $1`,
        [r.existing.eq_id, r.outcome, r.bu_course, r.title, r.note, user.id, user.full_name]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw conflictError('Another change added one of these courses while importing. Preview the file again.');
    throw err;
  } finally {
    client.release();
  }
  invalidateEngine();
  const summary = {
    added: toInsert.length,
    updated: toUpdate.length,
    skipped_duplicates: counts.duplicate,
    skipped_existing: counts.update - toUpdate.length,
    invalid: counts.invalid,
  };
  await auditLog({ action: 'equivalencies_imported', actorId: user.id, actorRole: user.role, actorEmail: user.email,
    details: { ...summary, update_existing: updateExisting === true } });
  return summary;
}

// ---------------------------------------------------------------------------------------------
// BU catalog search (all memory roles)
// ---------------------------------------------------------------------------------------------

export async function searchBuCourses(search) {
  const q = String(search || '').trim().slice(0, 60);
  const { rows } = await query(
    `SELECT course_code, title, credits, program FROM catalog_courses
     WHERE institution = $3 AND ($1 = '' OR course_code ILIKE $2 OR title ILIKE $2)
     ORDER BY course_code LIMIT 25`, [q, `%${q}%`, TARGET]);
  return rows;
}

export default { propose, listProposals, approveProposal, rejectProposal, addEquivalency, previewImport, commitImport, searchBuCourses, parseCsv, normalizeOutcome };
