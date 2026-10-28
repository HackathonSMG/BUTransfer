import { query } from '../config/db.js';

/**
 * The Transfer Credit ID a student uses to follow their transfer credit evaluation.
 * Format: TC-YYYY-NNNN (e.g. TC-2026-0001). Evaluations created before this format keep their APP-YYYY-NNNN IDs,
 * which remain valid for tracking. Stored in applications.reference_number.
 */
export async function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) AS cnt FROM applications WHERE reference_number LIKE $1`,
    [`TC-${year}-%`]
  );
  const count = parseInt(result.rows[0].cnt, 10) + 1;
  const padded = String(count).padStart(4, '0');
  return `TC-${year}-${padded}`;
}

export default { generateReferenceNumber };
