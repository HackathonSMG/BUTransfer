process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { config } from 'dotenv';
config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sql(query) {
  const { data, error } = await sb.rpc('exec_sql', { query });
  if (error) { console.warn('[sql]', error.message.slice(0, 120), '\n  SQL:', query.slice(0, 150)); return []; }
  return Array.isArray(data) ? data : [];
}

// ── fixed seed UUIDs ─────────────────────────────────────────────────────────
const ID = {
  BU:  '00000001-0001-0000-0000-000000000001',
  NEU: '00000001-0001-0000-0000-000000000002',
  NYU: '00000001-0001-0000-0000-000000000003',

  CS_DEPT:   '00000002-0001-0000-0000-000000000001',
  MATH_DEPT: '00000002-0001-0000-0000-000000000002',
  PHY_DEPT:  '00000002-0001-0000-0000-000000000003',

  BU_CS105: '00000003-0001-0000-0000-000000000001',
  BU_CS111: '00000003-0001-0000-0000-000000000002',
  BU_CS112: '00000003-0001-0000-0000-000000000003',
  BU_CS210: '00000003-0001-0000-0000-000000000004',
  BU_CS330: '00000003-0001-0000-0000-000000000005',
  BU_MA121: '00000003-0001-0000-0000-000000000006',
  BU_MA122: '00000003-0001-0000-0000-000000000007',
  BU_MA225: '00000003-0001-0000-0000-000000000008',
  BU_PY211: '00000003-0001-0000-0000-000000000009',
  BU_PY212: '00000003-0001-0000-0000-000000000010',

  NEU_CS2500:   '00000003-0002-0000-0000-000000000001',
  NEU_CS2510:   '00000003-0002-0000-0000-000000000002',
  NEU_MA1341:   '00000003-0002-0000-0000-000000000003',
  NEU_MA1342:   '00000003-0002-0000-0000-000000000004',
  NEU_PHYS1151: '00000003-0002-0000-0000-000000000005',
  NEU_MATH2321: '00000003-0002-0000-0000-000000000006',
  NYU_CS1114:   '00000003-0003-0000-0000-000000000001',
  NYU_CS1124:   '00000003-0003-0000-0000-000000000002',
  NYU_MA121:    '00000003-0003-0000-0000-000000000003',

  SEASON: '00000004-0001-0000-0000-000000000001',

  MAYA_AUTH:  'f6b9f172-ae89-4d1e-9b63-9f3034c48662',
  ADMIN_AUTH: '03778fce-ba11-4d96-bbf2-a036f016fcfc',
  DANA_AUTH:  'd8fb3756-53a0-4ad4-b230-fbf68c048417',

  DANIEL_AUTH: null,
  PRIYA_AUTH:  null,
  SMITH_AUTH:  null,

  MAYA_STU:   '00000005-0001-0000-0000-000000000001',
  DANIEL_STU: '00000005-0001-0000-0000-000000000002',
  PRIYA_STU:  '00000005-0001-0000-0000-000000000003',

  DANA_EV:  '00000006-0001-0000-0000-000000000001',
  SMITH_EV: '00000006-0001-0000-0000-000000000002',

  APP1: '00000007-0001-0000-0000-000000000001',
  APP2: '00000007-0001-0000-0000-000000000002',
  APP3: '00000007-0001-0000-0000-000000000003',

  TX1: '00000008-0001-0000-0000-000000000001',
  TX2: '00000008-0001-0000-0000-000000000002',
  TX3: '00000008-0001-0000-0000-000000000003',

  EQ1: '00000009-0001-0000-0000-000000000001',
  EQ2: '00000009-0001-0000-0000-000000000002',
  EQ3: '00000009-0001-0000-0000-000000000003',
  EQ4: '00000009-0001-0000-0000-000000000004',
  EQ5: '00000009-0001-0000-0000-000000000005',
  EQ6: '00000009-0001-0000-0000-000000000006',
};

const TC = {
  M1:'0000000a-0001-0000-0000-000000000001',M2:'0000000a-0001-0000-0000-000000000002',
  M3:'0000000a-0001-0000-0000-000000000003',M4:'0000000a-0001-0000-0000-000000000004',
  M5:'0000000a-0001-0000-0000-000000000005',
  D1:'0000000a-0002-0000-0000-000000000001',D2:'0000000a-0002-0000-0000-000000000002',
  D3:'0000000a-0002-0000-0000-000000000003',
  P1:'0000000a-0003-0000-0000-000000000001',P2:'0000000a-0003-0000-0000-000000000002',
  P3:'0000000a-0003-0000-0000-000000000003',P4:'0000000a-0003-0000-0000-000000000004',
};

const CE = {
  M1:'0000000b-0001-0000-0000-000000000001',M2:'0000000b-0001-0000-0000-000000000002',
  M3:'0000000b-0001-0000-0000-000000000003',M4:'0000000b-0001-0000-0000-000000000004',
  M5:'0000000b-0001-0000-0000-000000000005',
  D1:'0000000b-0002-0000-0000-000000000001',D2:'0000000b-0002-0000-0000-000000000002',
  D3:'0000000b-0002-0000-0000-000000000003',
  P1:'0000000b-0003-0000-0000-000000000001',P2:'0000000b-0003-0000-0000-000000000002',
  P3:'0000000b-0003-0000-0000-000000000003',P4:'0000000b-0003-0000-0000-000000000004',
};

const AR = {
  M1:'0000000c-0001-0000-0000-000000000001',M2:'0000000c-0001-0000-0000-000000000002',
  M3:'0000000c-0001-0000-0000-000000000003',M4:'0000000c-0001-0000-0000-000000000004',
  M5:'0000000c-0001-0000-0000-000000000005',
  D1:'0000000c-0002-0000-0000-000000000001',D2:'0000000c-0002-0000-0000-000000000002',
  D3:'0000000c-0002-0000-0000-000000000003',
  P1:'0000000c-0003-0000-0000-000000000001',P2:'0000000c-0003-0000-0000-000000000002',
  P3:'0000000c-0003-0000-0000-000000000003',P4:'0000000c-0003-0000-0000-000000000004',
};

console.log('=== Transfer Credit Portal — Seed ===\n');

// 1. Institutions (actual columns: id, name, short_name, city, is_target, data_source)
console.log('1. Institutions...');
await sql(`INSERT INTO public.institutions (id,name,short_name,city,is_target,data_source) VALUES
  ('${ID.BU}','Boston University','BU','Boston MA',true,'synthetic'),
  ('${ID.NEU}','Northeastern University','NEU','Boston MA',false,'synthetic'),
  ('${ID.NYU}','New York University','NYU','New York NY',false,'synthetic')
ON CONFLICT (id) DO NOTHING`);

// 2. Departments (actual columns: id, code, name, college, subject_codes — no institution_id)
console.log('2. Departments...');
await sql(`INSERT INTO public.departments (id,code,name,college) VALUES
  ('${ID.CS_DEPT}','CAS CS','Computer Science','CAS'),
  ('${ID.MATH_DEPT}','CAS MA','Mathematics & Statistics','CAS'),
  ('${ID.PHY_DEPT}','CAS PY','Physics','CAS')
ON CONFLICT (id) DO NOTHING`);

// 3. BU Courses
console.log('3. BU Courses...');
await sql(`INSERT INTO public.courses (id,institution_id,department_id,code,title,credits,level,program_area,requirement_group,description,learning_outcomes,data_source) VALUES
  ('${ID.BU_CS105}','${ID.BU}','${ID.CS_DEPT}','CS105','Introduction to Computer Science',4,'Introductory','Computer Science','Core (Group A)','Broad introduction to computing concepts.','Understand basic programming constructs.','synthetic'),
  ('${ID.BU_CS111}','${ID.BU}','${ID.CS_DEPT}','CS111','Introduction to Computer Science I',4,'Introductory','Computer Science','Core (Group A)','Python programming: variables, control flow, functions, recursion, data structures.','Write Python programs. Use functions and recursion.','synthetic'),
  ('${ID.BU_CS112}','${ID.BU}','${ID.CS_DEPT}','CS112','Introduction to Computer Science II',4,'Introductory','Computer Science','Core (Group A)','OOP, abstract data types, and elementary algorithms in Java.','Design OOP programs. Use Java. Implement ADTs.','synthetic'),
  ('${ID.BU_CS210}','${ID.BU}','${ID.CS_DEPT}','CS210','Computer Systems',4,'Intermediate','Computer Science','Core (Group B)','Systems programming in C, machine representation, memory management.','Write C programs. Understand memory and hardware abstraction.','synthetic'),
  ('${ID.BU_CS330}','${ID.BU}','${ID.CS_DEPT}','CS330','Introduction to Analysis of Algorithms',4,'Advanced','Computer Science','Core (Group B)','Algorithm design paradigms: divide and conquer, dynamic programming, greedy.','Analyze complexity. Apply major design paradigms.','synthetic'),
  ('${ID.BU_MA121}','${ID.BU}','${ID.MATH_DEPT}','MA121','Calculus I',4,'Introductory','Mathematics','Core (Group A)','Differential calculus: limits, derivatives, and their applications.','Compute limits and derivatives. Introduction to integration.','synthetic'),
  ('${ID.BU_MA122}','${ID.BU}','${ID.MATH_DEPT}','MA122','Calculus II',4,'Introductory','Mathematics','Core (Group A)','Integral calculus, techniques of integration, infinite series.','Compute integrals. Evaluate series convergence.','synthetic'),
  ('${ID.BU_MA225}','${ID.BU}','${ID.MATH_DEPT}','MA225','Multivariate Calculus',4,'Intermediate','Mathematics','Core (Group B)','Vectors, partial derivatives, multiple integrals, vector calculus.','Compute partial derivatives and multiple integrals.','synthetic'),
  ('${ID.BU_PY211}','${ID.BU}','${ID.PHY_DEPT}','PY211','General Physics I',4,'Introductory','Physics','Elective','Mechanics, Newton laws, energy, momentum, oscillations.','Apply Newton laws. Solve mechanics problems.','synthetic'),
  ('${ID.BU_PY212}','${ID.BU}','${ID.PHY_DEPT}','PY212','General Physics II',4,'Introductory','Physics','Elective','Electromagnetism, waves, optics, modern physics.','Solve electrostatic problems. Understand waves.','synthetic')
ON CONFLICT (id) DO NOTHING`);

// 4. Source institution courses
console.log('4. NEU/NYU courses...');
await sql(`INSERT INTO public.courses (id,institution_id,code,title,credits,level,data_source) VALUES
  ('${ID.NEU_CS2500}','${ID.NEU}','CS2500','Fundamentals of Computer Science 1',4,'Introductory','synthetic'),
  ('${ID.NEU_CS2510}','${ID.NEU}','CS2510','Fundamentals of Computer Science 2',4,'Introductory','synthetic'),
  ('${ID.NEU_MA1341}','${ID.NEU}','MATH1341','Calculus 1 for Science and Engineering',4,'Introductory','synthetic'),
  ('${ID.NEU_MA1342}','${ID.NEU}','MATH1342','Calculus 2 for Science and Engineering',4,'Introductory','synthetic'),
  ('${ID.NEU_PHYS1151}','${ID.NEU}','PHYS1151','Physics for Engineering I',4,'Introductory','synthetic'),
  ('${ID.NEU_MATH2321}','${ID.NEU}','MATH2321','Calculus 3 for Science and Engineering',4,'Intermediate','synthetic'),
  ('${ID.NYU_CS1114}','${ID.NYU}','CS-UY 1114','Introduction to Programming and Problem Solving',4,'Introductory','synthetic'),
  ('${ID.NYU_CS1124}','${ID.NYU}','CS-UY 1124','Object Oriented Programming',4,'Introductory','synthetic'),
  ('${ID.NYU_MA121}','${ID.NYU}','MATH-UA 121','Calculus I',4,'Introductory','synthetic')
ON CONFLICT (id) DO NOTHING`);

// 5. Season
console.log('5. Season...');
await sql(`INSERT INTO public.seasons (id,code,name,starts_on,ends_on,is_current) VALUES
  ('${ID.SEASON}','FA26','Fall 2026 transfer season','2026-08-01','2026-12-31',true)
ON CONFLICT (id) DO NOTHING`);

// 6. Transfer rules
console.log('6. Transfer rules...');
await sql(`INSERT INTO public.transfer_rules (id,name,detail,kind) VALUES
  ('R1','Grade minimum','Grade C or higher required for transfer credit','stop'),
  ('R2','Credit limit','Maximum 64 transfer credits accepted','stop'),
  ('R3','Equivalency reuse','Use approved equivalency without re-evaluation','process'),
  ('R4','Quarter conversion','Quarter credits x 0.667 = semester credits','change'),
  ('R5','Same-name rule','Identical course name and credits auto-accepted','process'),
  ('R6','BU-only courses','Certain courses must be taken at BU','stop')
ON CONFLICT (id) DO NOTHING`);

// 7. New auth users
console.log('7. Auth users...');
const PW = 'TransferDemo!2026';
const newUsers = [
  { email: 'daniel.kim@students.example.org', full_name: 'Daniel Kim', role: 'student' },
  { email: 'priya.shah@students.example.org', full_name: 'Priya Shah', role: 'student' },
  { email: 'michael.smith@staff.example.org', full_name: 'Dr. Michael Smith', role: 'evaluator' },
];
const authIds = {};
const { data: existingUsers } = await sb.auth.admin.listUsers({ perPage: 200 });
for (const u of newUsers) {
  const found = existingUsers?.users?.find((x) => x.email === u.email);
  if (found) {
    authIds[u.email] = found.id;
    console.log(`  existing: ${u.email}`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email, password: PW, email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role },
      app_metadata: { role: u.role },
    });
    if (error) { console.warn('  auth error:', u.email, error.message); }
    else { authIds[u.email] = data.user.id; console.log(`  created: ${u.email} → ${data.user.id}`); }
  }
}
ID.DANIEL_AUTH = authIds['daniel.kim@students.example.org'];
ID.PRIYA_AUTH  = authIds['priya.shah@students.example.org'];
ID.SMITH_AUTH  = authIds['michael.smith@staff.example.org'];

// 8. Profiles (via supabase-js to handle upsert gracefully)
console.log('8. Profiles...');
const newProfiles = [];
if (ID.DANIEL_AUTH) newProfiles.push({ id: ID.DANIEL_AUTH, role: 'student',   full_name: 'Daniel Kim',        email: 'daniel.kim@students.example.org', is_active: true });
if (ID.PRIYA_AUTH)  newProfiles.push({ id: ID.PRIYA_AUTH,  role: 'student',   full_name: 'Priya Shah',        email: 'priya.shah@students.example.org',  is_active: true });
if (ID.SMITH_AUTH)  newProfiles.push({ id: ID.SMITH_AUTH,  role: 'evaluator', full_name: 'Dr. Michael Smith', email: 'michael.smith@staff.example.org',  is_active: true });
for (const p of newProfiles) {
  const { error } = await sb.from('profiles').upsert(p, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('  profile error:', error.message.slice(0,80));
}

// 9. Evaluators — use ON CONFLICT DO NOTHING (staff_code may conflict from prior runs)
console.log('9. Evaluators...');
await sql(`INSERT INTO public.evaluators (id,staff_code,profile_id,full_name,title,unit,department_id,subject_codes,specializations,program_expertise,historical_decisions,avatar_tone,data_source)
VALUES ('${ID.DANA_EV}','CE-01','${ID.DANA_AUTH}','Dana Whitfield','Credit Evaluation Officer','credit_evaluation',NULL,
  ARRAY['CS','MA','PY'],ARRAY['Computer Science','Mathematics'],ARRAY['Computer Science BS','Mathematics BS'],247,'warm','synthetic')
ON CONFLICT DO NOTHING`);

if (ID.SMITH_AUTH) {
  await sql(`INSERT INTO public.evaluators (id,staff_code,profile_id,full_name,title,unit,department_id,subject_codes,specializations,program_expertise,historical_decisions,avatar_tone,data_source)
  VALUES ('${ID.SMITH_EV}','DEP-CS1','${ID.SMITH_AUTH}','Dr. Michael Smith','Associate Professor, CS','department','${ID.CS_DEPT}',
    ARRAY['CS'],ARRAY['Computer Science','Software Engineering'],ARRAY['Computer Science BS'],183,'cool','synthetic')
  ON CONFLICT DO NOTHING`);
}
// Query actual IDs (may differ from fixed IDs if records pre-existed)
const evActual = await sql(`SELECT id, staff_code FROM public.evaluators WHERE staff_code IN ('CE-01','DEP-CS1')`);
const DANA_EV_ID  = evActual.find(r => r.staff_code === 'CE-01')?.id  || ID.DANA_EV;
const SMITH_EV_ID = evActual.find(r => r.staff_code === 'DEP-CS1')?.id || ID.SMITH_EV;

// 10. Students — use ON CONFLICT DO NOTHING (student_number may conflict from prior runs)
console.log('10. Students...');
await sql(`INSERT INTO public.students (id,student_number,profile_id,full_name,email,intended_major,start_term,start_date,previous_program,data_source) VALUES
  ('${ID.MAYA_STU}','BU-2026-001','${ID.MAYA_AUTH}','Maya Ortiz','student@demo.bu.edu','Computer Science BS','Fall 2026','2026-09-01','Computer Science','synthetic')
ON CONFLICT DO NOTHING`);

if (ID.DANIEL_AUTH) {
  await sql(`INSERT INTO public.students (id,student_number,profile_id,full_name,email,intended_major,start_term,start_date,previous_program,data_source) VALUES
    ('${ID.DANIEL_STU}','BU-2026-002','${ID.DANIEL_AUTH}','Daniel Kim','daniel.kim@students.example.org','Computer Science BS','Fall 2026','2026-09-01','Computer Engineering','synthetic')
  ON CONFLICT DO NOTHING`);
}
if (ID.PRIYA_AUTH) {
  await sql(`INSERT INTO public.students (id,student_number,profile_id,full_name,email,intended_major,start_term,start_date,previous_program,data_source) VALUES
    ('${ID.PRIYA_STU}','BU-2026-003','${ID.PRIYA_AUTH}','Priya Shah','priya.shah@students.example.org','Mathematics BS','Fall 2026','2026-09-01','Applied Mathematics','synthetic')
  ON CONFLICT DO NOTHING`);
}
// Query actual IDs (may differ from fixed IDs if records pre-existed)
const stuActual = await sql(`SELECT id, student_number FROM public.students WHERE student_number IN ('BU-2026-001','BU-2026-002','BU-2026-003')`);
const MAYA_STU_ID   = stuActual.find(r => r.student_number === 'BU-2026-001')?.id || ID.MAYA_STU;
const DANIEL_STU_ID = stuActual.find(r => r.student_number === 'BU-2026-002')?.id || ID.DANIEL_STU;
const PRIYA_STU_ID  = stuActual.find(r => r.student_number === 'BU-2026-003')?.id || ID.PRIYA_STU;

// 11. Applications (use actual student IDs resolved in step 10)
console.log('11. Applications...');
await sql(`INSERT INTO public.applications (id,reference,student_id,season_id,target_institution_id,status,intake_channel,submitted_at,internal_notes) VALUES
  ('${ID.APP1}','TCR-26-001','${MAYA_STU_ID}','${ID.SEASON}','${ID.BU}','in_review','online','2026-09-15 09:00:00','High-achieving NEU transfer. Strong CS background.'),
  ('${ID.APP2}','TCR-26-002','${DANIEL_STU_ID}','${ID.SEASON}','${ID.BU}','in_review','online','2026-09-18 10:30:00','NYU computer engineering transfer.'),
  ('${ID.APP3}','TCR-26-003','${PRIYA_STU_ID}','${ID.SEASON}','${ID.BU}','needs_information','online','2026-09-20 14:00:00','Math transfer — syllabus for MATH2321 requested.')
ON CONFLICT (id) DO NOTHING`);

// 12. Transcripts
console.log('12. Transcripts...');
await sql(`INSERT INTO public.transcripts (id,application_id,source_institution_id,channel,file_name,status,data_source) VALUES
  ('${ID.TX1}','${ID.APP1}','${ID.NEU}','online','ortiz_maya_neu_transcript.pdf','processed','synthetic'),
  ('${ID.TX2}','${ID.APP2}','${ID.NYU}','online','kim_daniel_nyu_transcript.pdf','processed','synthetic'),
  ('${ID.TX3}','${ID.APP3}','${ID.NEU}','online','shah_priya_neu_transcript.pdf','processed','synthetic')
ON CONFLICT (id) DO NOTHING`);

// 13. Transcript courses
console.log('13. Transcript courses...');
await sql(`INSERT INTO public.transcript_courses (id,transcript_id,application_id,row_code,line_no,course_code,title,term,credit_system,source_credits,grade,data_source) VALUES
  ('${TC.M1}','${ID.TX1}','${ID.APP1}','TR-M01',1,'CS2500','Fundamentals of Computer Science 1','Fall 2025','Semester',4,'A','synthetic'),
  ('${TC.M2}','${ID.TX1}','${ID.APP1}','TR-M02',2,'CS2510','Fundamentals of Computer Science 2','Spring 2026','Semester',4,'A-','synthetic'),
  ('${TC.M3}','${ID.TX1}','${ID.APP1}','TR-M03',3,'MATH1341','Calculus 1 for Science and Engineering','Fall 2025','Semester',4,'B+','synthetic'),
  ('${TC.M4}','${ID.TX1}','${ID.APP1}','TR-M04',4,'MATH1342','Calculus 2 for Science and Engineering','Spring 2026','Semester',4,'B','synthetic'),
  ('${TC.M5}','${ID.TX1}','${ID.APP1}','TR-M05',5,'PHYS1151','Physics for Engineering I','Spring 2026','Semester',4,'B+','synthetic'),
  ('${TC.D1}','${ID.TX2}','${ID.APP2}','TR-D01',1,'CS-UY 1114','Introduction to Programming and Problem Solving','Fall 2025','Semester',4,'A','synthetic'),
  ('${TC.D2}','${ID.TX2}','${ID.APP2}','TR-D02',2,'CS-UY 1124','Object Oriented Programming','Spring 2026','Semester',4,'B+','synthetic'),
  ('${TC.D3}','${ID.TX2}','${ID.APP2}','TR-D03',3,'MATH-UA 121','Calculus I','Fall 2025','Semester',4,'A-','synthetic'),
  ('${TC.P1}','${ID.TX3}','${ID.APP3}','TR-P01',1,'MATH1341','Calculus 1 for Science and Engineering','Fall 2025','Semester',4,'A','synthetic'),
  ('${TC.P2}','${ID.TX3}','${ID.APP3}','TR-P02',2,'MATH1342','Calculus 2 for Science and Engineering','Spring 2026','Semester',4,'A-','synthetic'),
  ('${TC.P3}','${ID.TX3}','${ID.APP3}','TR-P03',3,'MATH2321','Calculus 3 for Science and Engineering','Spring 2026','Semester',4,'B','synthetic'),
  ('${TC.P4}','${ID.TX3}','${ID.APP3}','TR-P04',4,'PHYS1151','Physics for Engineering I','Fall 2025','Semester',4,'B+','synthetic')
ON CONFLICT (id) DO NOTHING`);

// 14. Course Evaluations (no current_recommendation_id yet — circular FK)
console.log('14. Course evaluations...');
await sql(`INSERT INTO public.course_evaluations (id,application_id,transcript_course_id,pipeline_path,state,student_status,suggestion,requested_credits,awarded_credits,decided_at) VALUES
  ('${CE.M1}','${ID.APP1}','${TC.M1}','Needs review','pending','Likely','CS111',4,0,NULL),
  ('${CE.M2}','${ID.APP1}','${TC.M2}','Precedent','pending','Likely','CS112',4,0,NULL),
  ('${CE.M3}','${ID.APP1}','${TC.M3}','Auto-applied','confirmed','Confirmed','MA121',4,4,'2026-09-16 10:00:00'),
  ('${CE.M4}','${ID.APP1}','${TC.M4}','Needs review','pending','Under review','MA122',4,0,NULL),
  ('${CE.M5}','${ID.APP1}','${TC.M5}','Needs review','pending','Under review','No credit',4,0,NULL),
  ('${CE.D1}','${ID.APP2}','${TC.D1}','Needs review','pending','Likely','CS111',4,0,NULL),
  ('${CE.D2}','${ID.APP2}','${TC.D2}','Needs review','pending','Under review','CS112',4,0,NULL),
  ('${CE.D3}','${ID.APP2}','${TC.D3}','Auto-applied','confirmed','Confirmed','MA121',4,4,'2026-09-19 11:00:00'),
  ('${CE.P1}','${ID.APP3}','${TC.P1}','Auto-applied','confirmed','Confirmed','MA121',4,4,'2026-09-21 09:00:00'),
  ('${CE.P2}','${ID.APP3}','${TC.P2}','Precedent','confirmed','Confirmed','MA122',4,4,'2026-09-21 09:30:00'),
  ('${CE.P3}','${ID.APP3}','${TC.P3}','Needs review','info_requested','Under review','MA225',4,0,NULL),
  ('${CE.P4}','${ID.APP3}','${TC.P4}','Needs review','pending','Under review','PY211',4,0,NULL)
ON CONFLICT (id) DO NOTHING`);

// 15. AI Recommendations — via supabase-js to handle text[] columns correctly
console.log('15. AI recommendations...');
const arRows = [
  { id:AR.M1, course_evaluation_id:CE.M1, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'CS111', award_credits:4, target_course_id:ID.BU_CS111, target_code:'CS111', match_pct:87, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"85% content overlap","status":"ok","score":0.87},{"key":"credits","value":"4 == 4","status":"ok","score":1.0}],
    reasons:[["ok","Strong content match with BU CS111"]],
    covered_topics:['Functions','Recursion','Data structures','Python'], missing_topics:['Type systems'], exceptions:[] },

  { id:AR.M2, course_evaluation_id:CE.M2, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'CS112', award_credits:4, target_course_id:ID.BU_CS112, target_code:'CS112', match_pct:92, confidence:'High', auto_eligible:true,
    criteria:[{"key":"content","value":"92% content overlap","status":"ok","score":0.92}],
    reasons:[["ok","Approved equivalency on file"]],
    covered_topics:['OOP','Java','Abstract data types','Generics'], missing_topics:[], exceptions:[] },

  { id:AR.M3, course_evaluation_id:CE.M3, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA121', award_credits:4, target_course_id:ID.BU_MA121, target_code:'MA121', match_pct:95, confidence:'High', auto_eligible:true,
    criteria:[{"key":"content","value":"95% content overlap","status":"ok","score":0.95}],
    reasons:[["ok","Approved equivalency: EQ-001"]],
    covered_topics:['Limits','Derivatives','Integration','Applications'], missing_topics:[], exceptions:[] },

  { id:AR.M4, course_evaluation_id:CE.M4, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA122', award_credits:4, target_course_id:ID.BU_MA122, target_code:'MA122', match_pct:78, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"78% content overlap","status":"ok","score":0.78}],
    reasons:[["ok","Covers most of MA122 syllabus"],["warn","Missing series convergence topics"]],
    covered_topics:['Integration techniques','Differential equations'], missing_topics:['Power series','Taylor series'], exceptions:[] },

  { id:AR.M5, course_evaluation_id:CE.M5, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Reject', award_label:'No credit', award_credits:0, target_course_id:null, target_code:null, match_pct:38, confidence:'Low', auto_eligible:false,
    criteria:[{"key":"content","value":"38% content overlap","status":"warn","score":0.38}],
    reasons:[["warn","Insufficient content overlap with BU PY211"],["warn","Missing electrostatics and waves"]],
    covered_topics:['Mechanics','Newton laws'], missing_topics:['Electricity','Magnetism','Waves'], exceptions:['Insufficient content overlap'] },

  { id:AR.D1, course_evaluation_id:CE.D1, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'CS111', award_credits:4, target_course_id:ID.BU_CS111, target_code:'CS111', match_pct:82, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"82% content overlap","status":"ok","score":0.82}],
    reasons:[["ok","Good coverage of intro programming concepts"]],
    covered_topics:['Variables','Control flow','Functions','Problem solving'], missing_topics:['Recursion'], exceptions:[] },

  { id:AR.D2, course_evaluation_id:CE.D2, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'CS112', award_credits:4, target_course_id:ID.BU_CS112, target_code:'CS112', match_pct:75, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"75% content overlap","status":"ok","score":0.75}],
    reasons:[["ok","OOP coverage adequate"],["warn","Java-specific content differs"]],
    covered_topics:['OOP','Classes','Inheritance'], missing_topics:['Abstract data types','Generics'], exceptions:[] },

  { id:AR.D3, course_evaluation_id:CE.D3, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA121', award_credits:4, target_course_id:ID.BU_MA121, target_code:'MA121', match_pct:95, confidence:'High', auto_eligible:true,
    criteria:[{"key":"content","value":"95% content overlap","status":"ok","score":0.95}],
    reasons:[["ok","Approved equivalency on file"]],
    covered_topics:['Limits','Derivatives','Applications'], missing_topics:[], exceptions:[] },

  { id:AR.P1, course_evaluation_id:CE.P1, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA121', award_credits:4, target_course_id:ID.BU_MA121, target_code:'MA121', match_pct:95, confidence:'High', auto_eligible:true,
    criteria:[{"key":"content","value":"95% content overlap","status":"ok","score":0.95}],
    reasons:[["ok","Approved equivalency: EQ-001"]],
    covered_topics:['Limits','Derivatives','Integration'], missing_topics:[], exceptions:[] },

  { id:AR.P2, course_evaluation_id:CE.P2, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA122', award_credits:4, target_course_id:ID.BU_MA122, target_code:'MA122', match_pct:88, confidence:'High', auto_eligible:false,
    criteria:[{"key":"content","value":"88% content overlap","status":"ok","score":0.88}],
    reasons:[["ok","Strong match based on prior decisions"]],
    covered_topics:['Integration','Series','Applications'], missing_topics:[], exceptions:[] },

  { id:AR.P3, course_evaluation_id:CE.P3, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'MA225', award_credits:4, target_course_id:ID.BU_MA225, target_code:'MA225', match_pct:65, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"65% content overlap","status":"ok","score":0.65}],
    reasons:[["ok","Covers partial multivariate content"],["warn","Syllabus needed for full assessment"]],
    covered_topics:['Partial derivatives','Multiple integrals'], missing_topics:['Vector calculus','Stokes theorem'], exceptions:[] },

  { id:AR.P4, course_evaluation_id:CE.P4, version:1, is_current:true, engine_version:'1.0', trigger:'intake', decision:'Accept', award_label:'PY211', award_credits:4, target_course_id:ID.BU_PY211, target_code:'PY211', match_pct:80, confidence:'Medium', auto_eligible:false,
    criteria:[{"key":"content","value":"80% content overlap","status":"ok","score":0.80}],
    reasons:[["ok","Good mechanics coverage"]],
    covered_topics:['Mechanics','Newton laws','Energy'], missing_topics:['Oscillations'], exceptions:[] },
];

for (const row of arRows) {
  const { error } = await sb.from('ai_recommendations').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('  AR error:', row.id.slice(-4), error.message.slice(0,100));
}

// 16. Link course_evaluations → ai_recommendations
console.log('16. Linking AI recs to course evals...');
const ceRecMap = [
  [CE.M1,AR.M1],[CE.M2,AR.M2],[CE.M3,AR.M3],[CE.M4,AR.M4],[CE.M5,AR.M5],
  [CE.D1,AR.D1],[CE.D2,AR.D2],[CE.D3,AR.D3],
  [CE.P1,AR.P1],[CE.P2,AR.P2],[CE.P3,AR.P3],[CE.P4,AR.P4],
];
for (const [ceId, arId] of ceRecMap) {
  await sql(`UPDATE public.course_evaluations SET current_recommendation_id = '${arId}' WHERE id = '${ceId}' AND current_recommendation_id IS NULL`);
}

// 17. Evaluator Assignments (use actual evaluator IDs resolved in step 9)
console.log('17. Evaluator assignments...');
await sql(`INSERT INTO public.evaluator_assignments (application_id,course_evaluation_id,evaluator_id,assignment_type,status,routing_reason)
VALUES
  ('${ID.APP1}',NULL,'${DANA_EV_ID}','case_owner','in_progress','Assigned to credit evaluation officer'),
  ('${ID.APP2}',NULL,'${DANA_EV_ID}','case_owner','assigned','Assigned to credit evaluation officer'),
  ('${ID.APP3}',NULL,'${DANA_EV_ID}','case_owner','assigned','Assigned to credit evaluation officer')
ON CONFLICT DO NOTHING`);

if (ID.SMITH_AUTH && SMITH_EV_ID) {
  await sql(`INSERT INTO public.evaluator_assignments (application_id,course_evaluation_id,evaluator_id,assignment_type,status,routing_reason)
  VALUES
    ('${ID.APP1}','${CE.M1}','${SMITH_EV_ID}','department_review','assigned','CS course routed to CS department'),
    ('${ID.APP1}','${CE.M2}','${SMITH_EV_ID}','department_review','assigned','CS course routed to CS department'),
    ('${ID.APP1}','${CE.M4}','${DANA_EV_ID}','department_review','assigned','Math course routed to credit evaluation'),
    ('${ID.APP1}','${CE.M5}','${DANA_EV_ID}','department_review','assigned','Physics course routed to credit evaluation'),
    ('${ID.APP2}','${CE.D1}','${DANA_EV_ID}','department_review','assigned','CS intro routed to credit evaluation'),
    ('${ID.APP2}','${CE.D2}','${SMITH_EV_ID}','department_review','assigned','CS course routed to CS department')
  ON CONFLICT DO NOTHING`);
} else {
  await sql(`INSERT INTO public.evaluator_assignments (application_id,course_evaluation_id,evaluator_id,assignment_type,status,routing_reason)
  VALUES
    ('${ID.APP1}','${CE.M1}','${DANA_EV_ID}','department_review','assigned','CS course routed to credit evaluation'),
    ('${ID.APP1}','${CE.M2}','${DANA_EV_ID}','department_review','assigned','CS course routed to credit evaluation'),
    ('${ID.APP1}','${CE.M4}','${DANA_EV_ID}','department_review','assigned','Math course routed to credit evaluation'),
    ('${ID.APP1}','${CE.M5}','${DANA_EV_ID}','department_review','assigned','Physics course routed to credit evaluation'),
    ('${ID.APP2}','${CE.D1}','${DANA_EV_ID}','department_review','assigned','CS intro routed to credit evaluation'),
    ('${ID.APP2}','${CE.D2}','${DANA_EV_ID}','department_review','assigned','CS course routed to credit evaluation')
  ON CONFLICT DO NOTHING`);
}

// 18. Daily stats
console.log('18. Daily stats...');
const danaData = [8,5,7,6,4,0,0,9,6,5,8,3,4,0];
const smithData = [4,3,6,5,2,0,0,5,4,3,6,2,3,0];
const makeStats = (evId, data) => data.map((n, i) => {
  const d = new Date('2026-10-26'); d.setDate(d.getDate() - (13 - i));
  return { evaluator_id: evId, day: d.toISOString().split('T')[0], decisions: n, data_source: 'synthetic' };
});
const allStats = [...makeStats(DANA_EV_ID, danaData), ...(SMITH_EV_ID ? makeStats(SMITH_EV_ID, smithData) : [])];
for (const row of allStats) {
  const { error } = await sb.from('evaluator_daily_stats').upsert(row, { onConflict: 'evaluator_id,day', ignoreDuplicates: true });
  if (error && !error.message.includes('duplicate')) console.warn('  stat error:', error.message.slice(0,80));
}

// 19. Equivalencies
console.log('19. Equivalencies...');
await sql(`INSERT INTO public.equivalencies (id,code,source_course_id,target_course_id,award_label,award_credits,approved_on,origin,status,approved_by_label) VALUES
  ('${ID.EQ1}','EQ-001','${ID.NEU_MA1341}','${ID.BU_MA121}','MA121',4,'2025-08-15','worksheet','active','Academic Affairs'),
  ('${ID.EQ2}','EQ-002','${ID.NEU_MA1342}','${ID.BU_MA122}','MA122',4,'2025-08-15','worksheet','active','Academic Affairs'),
  ('${ID.EQ3}','EQ-003','${ID.NEU_CS2510}','${ID.BU_CS112}','CS112',4,'2025-09-01','evaluator_decision','active','Dana Whitfield'),
  ('${ID.EQ4}','EQ-004','${ID.NYU_MA121}','${ID.BU_MA121}','MA121',4,'2025-08-15','worksheet','active','Academic Affairs'),
  ('${ID.EQ5}','EQ-005','${ID.NEU_CS2500}','${ID.BU_CS111}','CS111',4,'2026-01-10','evaluator_decision','active','Dr. Michael Smith'),
  ('${ID.EQ6}','EQ-006','${ID.NYU_CS1114}','${ID.BU_CS105}','CS105',4,'2025-09-15','worksheet','under_review','Academic Affairs')
ON CONFLICT (id) DO NOTHING`);

// 20. Worksheet matches
console.log('20. Worksheet matches...');
await sql(`INSERT INTO public.worksheet_course_matches (target_course_id,partner_institution_id,partner_course_code,partner_course_id,match_level,notes,data_source) VALUES
  ('${ID.BU_CS111}','${ID.NEU}','CS2500','${ID.NEU_CS2500}','Likely equivalent','Content and credit match confirmed by CS dept','worksheet'),
  ('${ID.BU_CS112}','${ID.NEU}','CS2510','${ID.NEU_CS2510}','Likely equivalent','OOP fundamentals align well','worksheet'),
  ('${ID.BU_MA121}','${ID.NEU}','MATH1341','${ID.NEU_MA1341}','Likely equivalent','Standard calculus sequence','worksheet'),
  ('${ID.BU_MA122}','${ID.NEU}','MATH1342','${ID.NEU_MA1342}','Likely equivalent','Standard calculus 2 sequence','worksheet'),
  ('${ID.BU_CS111}','${ID.NYU}','CS-UY 1114','${ID.NYU_CS1114}','Likely equivalent','Intro programming — check recursion depth','worksheet'),
  ('${ID.BU_CS112}','${ID.NYU}','CS-UY 1124','${ID.NYU_CS1124}','Partial - syllabus review','OOP match but Java vs Python differences','worksheet'),
  ('${ID.BU_MA121}','${ID.NYU}','MATH-UA 121','${ID.NYU_MA121}','Likely equivalent','Standard calculus 1','worksheet'),
  ('${ID.BU_MA225}','${ID.NEU}','MATH2321','${ID.NEU_MATH2321}','Partial - syllabus review','Requires syllabus review for vector calc topics','worksheet'),
  ('${ID.BU_PY211}','${ID.NEU}','PHYS1151','${ID.NEU_PHYS1151}','Partial - syllabus review','Mechanics overlap confirmed; check electrostatics coverage','worksheet')
ON CONFLICT (target_course_id,partner_institution_id,partner_course_code) DO NOTHING`);

// 21. Evaluation policy — migration already inserts a default; just adjust thresholds for demo
console.log('21. Evaluation policy...');
await sql(`UPDATE public.evaluation_policies SET reuse_min_confidence=85, similar_min_confidence=75, auto_close_known=true WHERE is_current=true`);

// Summary
console.log('\n=== Seed complete ===');
const [appCount] = await sql(`SELECT count(*)::int as n FROM public.applications`);
const [ceCount]  = await sql(`SELECT count(*)::int as n FROM public.course_evaluations`);
const [arCount]  = await sql(`SELECT count(*)::int as n FROM public.ai_recommendations`);
const [eqCount]  = await sql(`SELECT count(*)::int as n FROM public.equivalencies`);
console.log(`  Applications: ${appCount?.n}  |  Course evals: ${ceCount?.n}  |  AI recs: ${arCount?.n}  |  Equivalencies: ${eqCount?.n}`);
console.log('\nDemo login (password: TransferDemo!2026)');
console.log('  student@demo.bu.edu  |  evaluator@demo.bu.edu  |  admin@demo.bu.edu');
