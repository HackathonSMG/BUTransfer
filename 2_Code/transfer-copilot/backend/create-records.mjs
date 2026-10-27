process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Create evaluator record
const { error: evalErr } = await sb.from('evaluators').upsert({
  profile_id: 'd8fb3756-53a0-4ad4-b230-fbf68c048417',
  staff_code: 'CE-01',
  full_name: 'Dana Whitfield',
  title: 'Transfer Credit Evaluator',
  unit: 'credit_evaluation',
  subject_codes: ['CS', 'MATH'],
  specializations: ['Computer Science', 'Mathematics'],
  program_expertise: [],
  avatar_tone: 'warm',
  is_active: true,
  is_available: true,
}, { onConflict: 'profile_id' });
console.log(`Evaluator: ${evalErr ? '❌ ' + evalErr.message : '✓'}`);

// Create student record
const { error: stuErr } = await sb.from('students').upsert({
  profile_id: 'f6b9f172-ae89-4d1e-9b63-9f3034c48662',
  student_number: 'BU-2026-001',
  full_name: 'Maya Ortiz',
  email: 'student@demo.bu.edu',
  intended_major: 'Computer Science',
  start_term: 'Fall 2026',
  start_date: '2026-09-01',
}, { onConflict: 'profile_id' });
console.log(`Student: ${stuErr ? '❌ ' + stuErr.message : '✓'}`);

// Verify
const { data: ev } = await sb.from('evaluators').select('staff_code, full_name, unit');
const { data: st } = await sb.from('students').select('student_number, full_name');
console.log('Evaluators:', ev);
console.log('Students:', st);
