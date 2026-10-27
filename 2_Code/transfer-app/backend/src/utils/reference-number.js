import { query } from '../config/db.js';

/**
 * Generate a unique reference number for a new application.
 * Format: APP-YYYY-NNNN  (e.g. APP-2026-0001)
 */
export async function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT COUNT(*) AS cnt FROM applications WHERE reference_number LIKE $1`,
    [`APP-${year}-%`]
  );
  const count = parseInt(result.rows[0].cnt, 10) + 1;
  const padded = String(count).padStart(4, '0');
  return `APP-${year}-${padded}`;
}

export default { generateReferenceNumber };
