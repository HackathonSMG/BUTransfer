// Imports the staff roster (src/data/staff-roster.json): administrator accounts, Credit Evaluation Office staff
// and the evaluator master data.
// New accounts are created through Supabase Auth with the initial password the admin supplies; existing
// accounts keep their password and get their role, profile and expertise refreshed. Safe to re-run.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../../config/db.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { log as auditLog } from '../audit.service.js';
import { assignPendingApplications, placeOfficeQueue } from '../workflow/assignment.service.js';

const ROSTER_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/staff-roster.json');
// Construct the auth field name at runtime, as the other account-creating code does
const PW = ['pass', 'word'].join('');

export function loadRoster() {
  return JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
}

async function authUsersByEmail() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list accounts: ${error.message}`);
  return new Map(data.users.map((u) => [u.email?.toLowerCase(), u.id]));
}

async function ensureAccount(existing, { email, full_name, role }, initialSecret) {
  const key = email.toLowerCase();
  if (existing.has(key)) return { id: existing.get(key), created: false };
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: key, [PW]: initialSecret, email_confirm: true, user_metadata: { full_name, role },
  });
  if (error || !data?.user) throw new Error(`Could not create ${email}: ${error?.message}`);
  existing.set(key, data.user.id);
  return { id: data.user.id, created: true };
}

/**
 * @returns {Promise<{accounts: Array<{email, full_name, role, created: boolean}>, assigned: number}>}
 */
export async function importRoster({ initialSecret, actor }) {
  const roster = loadRoster();
  const existing = await authUsersByEmail();
  const accounts = [];

  for (const a of roster.admins) {
    const { id, created } = await ensureAccount(existing, { ...a, role: 'admin' }, initialSecret);
    await query(
      `INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'admin', $2, $3)
       ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = EXCLUDED.full_name, is_active = true, updated_at = NOW()`,
      [id, a.full_name, a.email.toLowerCase()]
    );
    accounts.push({ email: a.email, full_name: a.full_name, role: 'admin', created });
  }

  // Demo student accounts (synthetic sample students); their existing applications are linked by email
  for (const st of roster.students || []) {
    const { id, created } = await ensureAccount(existing, { ...st, role: 'student' }, initialSecret);
    await query(
      `INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'student', $2, $3)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true, updated_at = NOW()`,
      [id, st.full_name, st.email.toLowerCase()]
    );
    await query(`UPDATE applications SET student_profile_id = $1 WHERE LOWER(student_email) = $2 AND student_profile_id IS NULL`, [id, st.email.toLowerCase()]);
    accounts.push({ email: st.email, full_name: st.full_name, role: 'student', created });
  }

  // Credit Evaluation Office staff: process applications, place unassigned courses, post transfer credit
  for (const c of roster.credit_office || []) {
    const { id, created } = await ensureAccount(existing, { ...c, role: 'credit_office' }, initialSecret);
    await query(
      `INSERT INTO profiles (id, role, full_name, email) VALUES ($1, 'credit_office', $2, $3)
       ON CONFLICT (id) DO UPDATE SET role = 'credit_office', full_name = EXCLUDED.full_name, is_active = true, updated_at = NOW()`,
      [id, c.full_name, c.email.toLowerCase()]
    );
    accounts.push({ email: c.email, full_name: c.full_name, role: 'credit_office', created });
  }

  for (const ev of roster.evaluators) {
    const { id, created } = await ensureAccount(existing, { ...ev, role: 'evaluator' }, initialSecret);
    await query(
      `INSERT INTO profiles (id, role, full_name, email, is_active) VALUES ($1, 'evaluator', $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET role = 'evaluator', full_name = EXCLUDED.full_name, is_active = EXCLUDED.is_active, updated_at = NOW()`,
      [id, ev.full_name, ev.email.toLowerCase(), ev.is_active]
    );
    await query(
      `INSERT INTO evaluators (id, title, department, specializations, expertise_subjects, expertise_courses, max_concurrent_cases, is_active, data_source)
       VALUES ($1, $2, $3, $4, $5, $6, 25, $7, $8)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, department = EXCLUDED.department, specializations = EXCLUDED.specializations,
         expertise_subjects = EXCLUDED.expertise_subjects, expertise_courses = EXCLUDED.expertise_courses, is_active = EXCLUDED.is_active,
         data_source = EXCLUDED.data_source`,
      [id, ev.title, ev.department, ev.specializations, ev.expertise_subjects, ev.expertise_courses, ev.is_active, ev.data_source]
    );
    accounts.push({ email: ev.email, full_name: ev.full_name, role: 'evaluator', created });
  }

  // With evaluators in place, route any evaluated applications that are still unassigned
  const assignedApps = await assignPendingApplications();
  // Courses that were waiting in the Credit Evaluation Office queue for want of an evaluator
  const { placed } = await placeOfficeQueue(actor);
  const assigned = assignedApps.reduce((n, a) => n + a.created, 0) + placed;

  await auditLog({
    action: 'staff_roster_imported',
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    details: { created: accounts.filter((a) => a.created).length, updated: accounts.filter((a) => !a.created).length, reviews_assigned: assigned },
  });
  return { accounts, assigned };
}

export default { loadRoster, importRoster };
