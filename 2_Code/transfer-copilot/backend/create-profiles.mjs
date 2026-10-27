process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Auth user IDs from creation
const USERS = [
  { id: 'f6b9f172-ae89-4d1e-9b63-9f3034c48662', email: 'student@demo.bu.edu',   full_name: 'Maya Ortiz',       role: 'student' },
  { id: '03778fce-ba11-4d96-bbf2-a036f016fcfc', email: 'admin@demo.bu.edu',     full_name: 'Registrar Admin',  role: 'admin' },
  { id: 'd8fb3756-53a0-4ad4-b230-fbf68c048417', email: 'evaluator@demo.bu.edu', full_name: 'Dana Whitfield',   role: 'evaluator' },
];

// Upsert profiles
for (const u of USERS) {
  const { error } = await sb.from('profiles').upsert({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_active: true,
  }, { onConflict: 'id' });
  console.log(`Profile ${u.email} (${u.role}): ${error ? '❌ ' + error.message : '✓'}`);
}

// Create evaluator record for Dana
const evaluatorId = 'd8fb3756-53a0-4ad4-b230-fbf68c048417';
const { error: evalErr } = await sb.from('evaluators').upsert({
  profile_id: evaluatorId,
  staff_code: 'CE-01',
  unit: 'credit_evaluation',
  title: 'Transfer Credit Evaluator',
  subject_codes: ['CS', 'MATH'],
  specializations: ['Computer Science', 'Mathematics'],
  avatar_tone: 'warm',
  is_active: true,
}, { onConflict: 'profile_id' });
console.log(`Evaluator record: ${evalErr ? '❌ ' + evalErr.message : '✓'}`);

// Create student record for Maya
const studentId = 'f6b9f172-ae89-4d1e-9b63-9f3034c48662';
const { error: stuErr } = await sb.from('students').upsert({
  profile_id: studentId,
  student_number: 'BU-2026-001',
  enrollment_status: 'admitted',
}, { onConflict: 'profile_id' });
console.log(`Student record: ${stuErr ? '❌ ' + stuErr.message : '✓'}`);

// Verify
const { data: profiles } = await sb.from('profiles').select('email, role');
console.log('\nProfiles in DB:', profiles?.map(p => `${p.email} (${p.role})`));
