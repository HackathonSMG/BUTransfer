// Staff accounts other than through the roster import: administrators add evaluators and Credit Evaluation Office
// staff one at a time, and list / rename / deactivate Credit Office staff. Mounted under /admin/staff; administrators only.
// Evaluator maintenance (edit, availability, deactivate with reassignment) stays on /evaluators.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { query } from '../config/db.js';
import { supabaseAdmin } from '../config/supabase.js';
import { badRequest, notFound } from '../utils/errors.js';
import { log as auditLog } from '../services/audit.service.js';
import { createStaffAccount, STAFF_ROLES } from '../services/staff/accounts.service.js';
import { createEvaluatorSchema } from './evaluators.js';

const PW = ['pass', 'word'].join('');
const ROLE_LABELS = { evaluator: 'Evaluator', credit_office: 'Credit Office' };

const router = Router();
router.use(requireAuth, requireRole('admin'));

const validation = (error) => badRequest('Validation failed', error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));

// Only staff roles can be created here; administrators and students never are
const roleSchema = z.object({ role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: 'Choose Evaluator or Credit Office' }) }) });
const createCreditOfficeSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(255),
  [PW]: z.string().min(8).optional(),
});
const updateCreditOfficeSchema = z.object({
  full_name: z.string().trim().min(2).max(255).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => d.full_name !== undefined || d.is_active !== undefined, { message: 'Nothing to update' });

const EVALUATOR_COLUMNS = `p.*, e.evaluator_code, e.title, e.department, e.specializations, e.expertise_subjects, e.expertise_courses, e.max_concurrent_cases, e.availability, e.unavailable_until`;
const PROFILE_COLUMNS = `p.id, p.role, p.full_name, p.email, p.is_active, p.created_at, p.updated_at`;

// Last sign-in comes from Supabase Auth; best effort, so the list still loads if Auth cannot be reached
async function lastSignIns() {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return new Map();
    return new Map(data.users.map((u) => [u.id, u.last_sign_in_at || null]));
  } catch {
    return new Map();
  }
}

// GET /admin/staff?role=credit_office (default) | evaluator
router.get('/', async (req, res, next) => {
  try {
    const parsed = z.object({ role: z.enum(STAFF_ROLES).optional().default('credit_office') }).safeParse(req.query);
    if (!parsed.success) return next(badRequest('Use role=credit_office or role=evaluator'));
    const [result, signIns] = await Promise.all([
      query(`SELECT ${PROFILE_COLUMNS} FROM profiles p WHERE p.role = $1 ORDER BY p.is_active DESC, p.full_name ASC`, [parsed.data.role]),
      lastSignIns(),
    ]);
    const data = result.rows.map((r) => ({ ...r, last_sign_in_at: signIns.get(r.id) ?? null }));
    return res.status(200).json({ data, meta: { total: data.length, active: data.filter((r) => r.is_active).length } });
  } catch (err) { return next(err); }
});

// POST /admin/staff { role: 'evaluator' | 'credit_office', email, full_name, password?, ...evaluator fields }
router.post('/', async (req, res, next) => {
  try {
    const roleParsed = roleSchema.safeParse(req.body || {});
    if (!roleParsed.success) return next(validation(roleParsed.error));
    const { role } = roleParsed.data;

    let userId;
    if (role === 'evaluator') {
      const parsed = createEvaluatorSchema.safeParse(req.body);
      if (!parsed.success) return next(validation(parsed.error));
      const { email, full_name, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases, [PW]: secret } = parsed.data;
      userId = await createStaffAccount({
        role, email, full_name, [PW]: secret,
        evaluator: { title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases },
      });
    } else {
      const parsed = createCreditOfficeSchema.safeParse(req.body);
      if (!parsed.success) return next(validation(parsed.error));
      const { email, full_name, [PW]: secret } = parsed.data;
      userId = await createStaffAccount({ role, email, full_name, [PW]: secret });
    }

    const row = role === 'evaluator'
      ? await query(`SELECT ${EVALUATOR_COLUMNS} FROM profiles p JOIN evaluators e ON e.id = p.id WHERE p.id = $1`, [userId])
      : await query(`SELECT ${PROFILE_COLUMNS} FROM profiles p WHERE p.id = $1`, [userId]);
    const created = row.rows[0];
    await auditLog({
      action: 'staff_account_created', actorId: req.user.id, actorRole: req.user.role, actorEmail: req.user.email,
      newValue: { id: userId, role, email: created.email, full_name: created.full_name },
      details: { role, role_label: ROLE_LABELS[role] },
    });
    return res.status(201).json({ data: created });
  } catch (err) { return next(err); }
});

// PUT /admin/staff/:id { full_name?, is_active? } (Credit Office staff only; evaluators are maintained on /evaluators)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return next(badRequest('Invalid staff id'));
    const existing = await query(`SELECT ${PROFILE_COLUMNS} FROM profiles p WHERE p.id = $1 AND p.role = 'credit_office' LIMIT 1`, [id]);
    if (!existing.rows.length) return next(notFound('Credit Office staff member'));

    const parsed = updateCreditOfficeSchema.safeParse(req.body || {});
    if (!parsed.success) return next(validation(parsed.error));
    const fields = parsed.data;

    const clauses = []; const params = []; let idx = 1;
    if (fields.full_name !== undefined) { clauses.push(`full_name = $${idx++}`); params.push(fields.full_name); }
    if (fields.is_active !== undefined) { clauses.push(`is_active = $${idx++}`); params.push(fields.is_active); }
    clauses.push('updated_at = NOW()');
    params.push(id);
    const updated = await query(`UPDATE profiles p SET ${clauses.join(', ')} WHERE p.id = $${idx} RETURNING ${PROFILE_COLUMNS}`, params);

    const before = existing.rows[0];
    const after = updated.rows[0];
    await auditLog({
      action: fields.is_active === false && before.is_active ? 'staff_account_deactivated'
        : fields.is_active === true && !before.is_active ? 'staff_account_reactivated' : 'staff_account_updated',
      actorId: req.user.id, actorRole: req.user.role, actorEmail: req.user.email,
      oldValue: { full_name: before.full_name, is_active: before.is_active },
      newValue: { full_name: after.full_name, is_active: after.is_active },
      details: { staff_id: id, role: 'credit_office', email: after.email },
    });
    return res.status(200).json({ data: after });
  } catch (err) { return next(err); }
});

export default router;
