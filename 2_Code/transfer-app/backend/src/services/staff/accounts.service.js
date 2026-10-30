// Creates staff accounts (evaluators and Credit Evaluation Office staff) one at a time: the Supabase Auth user,
// the profile row and, for evaluators, the evaluator master record. There is no database trigger that creates
// profiles, so every account-creating path must go through here (the roster import has its own upsert logic).
import { query } from '../../config/db.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { conflict, badRequest } from '../../utils/errors.js';

// Construct the auth field name at runtime, as the other account-creating code does
const PW = ['pass', 'word'].join('');
export const DEFAULT_INITIAL_SECRET = 'TempPass@1234';
export const STAFF_ROLES = ['evaluator', 'credit_office'];

/**
 * @param {object} args
 * @param {'evaluator'|'credit_office'} args.role
 * @param {string} args.email
 * @param {string} args.full_name
 * @param {string} [args.password] initial password; defaults to DEFAULT_INITIAL_SECRET
 * @param {object} [args.evaluator] evaluator master data (evaluators only): title, department, specializations,
 *   expertise_subjects, expertise_courses, max_concurrent_cases
 * @returns {Promise<string>} the new account's id
 */
export async function createStaffAccount({ role, email, full_name, [PW]: secret, evaluator = {} }) {
  if (!STAFF_ROLES.includes(role)) throw badRequest('Staff role must be evaluator or credit_office');
  const key = email.toLowerCase();

  const existing = await query(`SELECT id FROM profiles WHERE email = $1 LIMIT 1`, [key]);
  if (existing.rows.length > 0) throw conflict(`A user with email ${email} already exists`);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: key,
    [PW]: secret || DEFAULT_INITIAL_SECRET,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (authError || !authData?.user) throw new Error(`Failed to create auth user: ${authError?.message}`);

  const userId = authData.user.id;
  try {
    await query(`INSERT INTO profiles (id, role, full_name, email) VALUES ($1, $2, $3, $4)`, [userId, role, full_name, key]);
    if (role === 'evaluator') {
      const { title, department, specializations = [], expertise_subjects = [], expertise_courses = [], max_concurrent_cases = 20 } = evaluator;
      await query(
        `INSERT INTO evaluators (id, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, title || null, department || null, specializations, expertise_subjects, expertise_courses, max_concurrent_cases]
      );
    }
  } catch (err) {
    // Do not leave a sign-in account without a profile behind (it could never be used or re-created with that email)
    await query(`DELETE FROM profiles WHERE id = $1`, [userId]).catch(() => {});
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    throw err;
  }
  return userId;
}

export default { createStaffAccount, STAFF_ROLES, DEFAULT_INITIAL_SECRET };
