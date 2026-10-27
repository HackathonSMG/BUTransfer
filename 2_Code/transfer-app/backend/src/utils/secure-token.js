import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';

/**
 * Generate a new secure UUID token for a student's application access token.
 */
export function generateSecureToken() {
  return uuidv4();
}

/**
 * Look up an application by its secure_token UUID.
 */
export async function verifyApplicationToken(token) {
  if (!token) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) return null;

  const result = await query(
    `SELECT id, reference_number, status, student_name, student_email,
            student_phone, transfer_from_institution, transfer_to_program,
            transfer_to_department, expected_start_term, submitted_at,
            final_decision, decision_date, created_at, updated_at
     FROM applications WHERE secure_token = $1 LIMIT 1`,
    [token]
  );
  return result.rows[0] || null;
}

export default { generateSecureToken, verifyApplicationToken };
