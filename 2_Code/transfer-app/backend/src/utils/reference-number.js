import { query } from '../config/db.js';

/**
 * The Transfer Credit ID a student uses to follow their transfer credit evaluation.
 * Format: TC-YYYY-NNNN (e.g. TC-2026-0001). Evaluations created before this format keep their APP-YYYY-NNNN IDs,
 * which remain valid for tracking. Stored in applications.reference_number.
 * The next number follows the highest one issued this year (not the count, which repeats a number once a row is
 * deleted). Two submissions at the same moment can still read the same highest number; the insert is retried for
 * that (isReferenceNumberConflict).
 */
export async function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COALESCE(MAX(SUBSTRING(reference_number FROM '^TC-[0-9]{4}-([0-9]+)$')::int), 0) AS last
     FROM applications WHERE reference_number LIKE $1`,
    [`TC-${year}-%`]
  );
  const next = parseInt(result.rows[0].last, 10) + 1;
  const padded = String(next).padStart(4, '0');
  return `TC-${year}-${padded}`;
}

/** True when an insert failed because another application took the same reference number first. */
export function isReferenceNumberConflict(err) {
  return err?.code === '23505' && /reference_number/.test(err.constraint || err.detail || '');
}

export default { generateReferenceNumber, isReferenceNumberConflict };
