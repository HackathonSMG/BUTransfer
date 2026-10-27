import { query } from '../config/db.js';
import { notFound } from '../utils/errors.js';

/**
 * Middleware that authenticates a student-facing request using secure_token UUID.
 * Attaches req.application if found.
 */
export async function validateSecureToken(req, _res, next) {
  try {
    let token =
      req.params.token ||
      req.query.token ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!token) return next(notFound('Application'));

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) return next(notFound('Application'));

    const result = await query(
      `SELECT a.*, e.department AS evaluator_department, p.full_name AS evaluator_name
       FROM applications a
       LEFT JOIN evaluators e ON e.id = a.assigned_evaluator_id
       LEFT JOIN profiles p ON p.id = a.assigned_evaluator_id
       WHERE a.secure_token = $1 LIMIT 1`,
      [token]
    );

    if (result.rows.length === 0) return next(notFound('Application'));

    req.application = result.rows[0];
    req.secureToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

export default validateSecureToken;
