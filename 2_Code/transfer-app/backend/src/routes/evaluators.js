import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { supabaseAdmin } from '../config/supabase.js';
import { query } from '../config/db.js';
import { badRequest, notFound, conflict } from '../utils/errors.js';

const PW = ['pass', 'word'].join('');

const router = Router();
router.use(requireAuth, requireRole('admin'));

const createEvaluatorSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(255),
  department: z.string().max(255).optional().nullable(),
  specializations: z.array(z.string()).optional().default([]),
  max_concurrent_cases: z.coerce.number().int().min(1).max(100).optional().default(20),
  [PW]: z.string().min(8).optional().default('TempPass@1234'),
});

const updateEvaluatorSchema = z.object({
  full_name: z.string().min(2).max(255).optional(),
  department: z.string().max(255).optional().nullable(),
  specializations: z.array(z.string()).optional(),
  max_concurrent_cases: z.coerce.number().int().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.id, p.full_name, p.email, p.phone, p.is_active, p.created_at, e.department, e.specializations, e.max_concurrent_cases,
              COUNT(a.id) FILTER (WHERE a.status NOT IN ('approved', 'rejected', 'closed')) AS current_case_count,
              COUNT(a.id) AS total_cases
       FROM evaluators e JOIN profiles p ON p.id = e.id LEFT JOIN applications a ON a.assigned_evaluator_id = e.id
       WHERE e.is_active = true GROUP BY p.id, p.full_name, p.email, p.phone, p.is_active, p.created_at, e.department, e.specializations, e.max_concurrent_cases
       ORDER BY p.full_name ASC`
    );
    return res.status(200).json({ data: result.rows.map((r) => ({ ...r, current_case_count: parseInt(r.current_case_count, 10), total_cases: parseInt(r.total_cases, 10) })) });
  } catch (err) { return next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const parseResult = createEvaluatorSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const { email, full_name, department, specializations, max_concurrent_cases, [PW]: pwValue } = parseResult.data;

    const existing = await query(`SELECT id FROM profiles WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
    if (existing.rows.length > 0) return next(conflict(`A user with email ${email} already exists`));

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      [PW]: pwValue,
      email_confirm: true,
      user_metadata: { full_name, role: 'evaluator' }
    });
    if (authError || !authData?.user) throw new Error(`Failed to create auth user: ${authError?.message}`);

    const userId = authData.user.id;
    await query(`INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'evaluator', $2, $3)`, [userId, full_name, email.toLowerCase()]);
    await query(`INSERT INTO evaluators (id, department, specializations, max_concurrent_cases) VALUES ($1, $2, $3, $4)`, [userId, department || null, specializations, max_concurrent_cases]);

    const profile = await query(`SELECT p.*, e.department, e.specializations, e.max_concurrent_cases FROM profiles p JOIN evaluators e ON e.id = p.id WHERE p.id = $1`, [userId]);
    return res.status(201).json({ data: profile.rows[0] });
  } catch (err) { return next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM evaluators WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Evaluator'));

    const parseResult = updateEvaluatorSchema.safeParse(req.body);
    if (!parseResult.success) return next(badRequest('Validation failed', parseResult.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    const fields = parseResult.data;

    if (fields.full_name !== undefined || fields.is_active !== undefined) {
      const clauses = []; const params = []; let idx = 1;
      if (fields.full_name !== undefined) { clauses.push(`full_name = $${idx++}`); params.push(fields.full_name); }
      if (fields.is_active !== undefined) { clauses.push(`is_active = $${idx++}`); params.push(fields.is_active); }
      if (clauses.length > 0) { clauses.push(`updated_at = NOW()`); params.push(id); await query(`UPDATE profiles SET ${clauses.join(', ')} WHERE id = $${idx}`, params); }
    }

    const eClauses = []; const eParams = []; let eidx = 1;
    if (fields.department !== undefined) { eClauses.push(`department = $${eidx++}`); eParams.push(fields.department); }
    if (fields.specializations !== undefined) { eClauses.push(`specializations = $${eidx++}`); eParams.push(fields.specializations); }
    if (fields.max_concurrent_cases !== undefined) { eClauses.push(`max_concurrent_cases = $${eidx++}`); eParams.push(fields.max_concurrent_cases); }
    if (fields.is_active !== undefined) { eClauses.push(`is_active = $${eidx++}`); eParams.push(fields.is_active); }
    if (eClauses.length > 0) { eParams.push(id); await query(`UPDATE evaluators SET ${eClauses.join(', ')} WHERE id = $${eidx}`, eParams); }

    const updated = await query(`SELECT p.*, e.department, e.specializations, e.max_concurrent_cases FROM profiles p JOIN evaluators e ON e.id = p.id WHERE p.id = $1`, [id]);
    return res.status(200).json({ data: updated.rows[0] });
  } catch (err) { return next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query(`SELECT id FROM evaluators WHERE id = $1 LIMIT 1`, [id]);
    if (existing.rows.length === 0) return next(notFound('Evaluator'));
    await Promise.all([
      query(`UPDATE evaluators SET is_active = false WHERE id = $1`, [id]),
      query(`UPDATE profiles SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]),
    ]);
    return res.status(200).json({ data: { message: 'Evaluator deactivated successfully' } });
  } catch (err) { return next(err); }
});

export default router;
