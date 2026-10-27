/**
 * Seed functions: clearAll → seedReference → seedPeople → seedApplications → processAll
 */
import env from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { evaluateTranscript } from '../services/evaluation.service.js';
import { assignCaseOwner } from '../services/routing.service.js';

// ── helpers ─────────────────────────────────────────────────────────────────

async function upsertAuthUser(db, { email, password, fullName, role }) {
  if (env.AUTH_PROVIDER === 'local') {
    const { rows } = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), $1, $2::jsonb, now(), now())
       on conflict (email) do update set raw_user_meta_data = excluded.raw_user_meta_data
       returning id`,
      [email, JSON.stringify({ password, full_name: fullName, role })],
    );
    return rows[0].id;
  }
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for seeding');
  // Try to find existing user
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  return data.user.id;
}

// ── clearAll ─────────────────────────────────────────────────────────────────

export async function clearAll(db) {
  await db.query(`
    delete from public.equivalency_usage;
    delete from public.equivalency_evidence;
    delete from public.equivalency_aliases;
    delete from public.equivalency_versions where change_type != 'imported';
    delete from public.evaluation_decisions;
    delete from public.information_requests;
    delete from public.evaluation_history;
    delete from public.notifications;
    delete from public.evaluator_assignments;
    delete from public.ai_recommendations;
    delete from public.course_evaluations;
    delete from public.transcript_courses;
    delete from public.ai_confidence_scores;
    delete from public.ai_extraction_results;
    delete from public.transcript_processing_jobs;
    delete from public.transcript_documents;
    delete from public.transcripts;
    delete from public.applications;
    delete from public.evaluator_daily_stats;
    delete from public.documents;
  `);
  // Clear business data equivalencies (keep worksheet ones)
  await db.query(`delete from public.equivalencies where origin = 'evaluator_decision'`);
  await db.query(`delete from public.past_decisions`);
  await db.query(`delete from public.students`);
  await db.query(`delete from public.evaluators`);
  await db.query(`delete from public.profiles`);
}

// ── seedReference ─────────────────────────────────────────────────────────────

export async function seedReference(db, src) {
  // Institutions
  const { rows: buRow } = await db.query(
    `insert into public.institutions (name, short_name, is_target, data_source)
     values ('Boston University','BU',true,'worksheet')
     on conflict (name) do update set is_target = true returning id`);
  const buId = buRow[0].id;

  const { rows: nuRow } = await db.query(
    `insert into public.institutions (name, short_name, data_source)
     values ('Northeastern University','NEU','worksheet')
     on conflict (name) do update set short_name = 'NEU' returning id`);
  const nuId = nuRow[0].id;

  const { rows: nyuRow } = await db.query(
    `insert into public.institutions (name, short_name, data_source)
     values ('New York University','NYU','worksheet')
     on conflict (name) do update set short_name = 'NYU' returning id`);
  const nyuId = nyuRow[0].id;

  // Synthetic fictional schools from transcripts CSV
  const allInsts = [...new Set((src.transcripts || []).map((r) => r.institution).filter(Boolean))];
  const instMap = { 'Boston University': buId, 'Northeastern University': nuId, 'New York University': nyuId };
  for (const name of allInsts) {
    if (instMap[name]) continue;
    const { rows } = await db.query(
      `insert into public.institutions (name, data_source) values ($1,'synthetic') on conflict (name) do nothing returning id`,
      [name]);
    if (rows[0]) instMap[name] = rows[0].id;
    else {
      const { rows: ex } = await db.query(`select id from public.institutions where name = $1`, [name]);
      instMap[name] = ex[0]?.id;
    }
  }

  // Departments
  const DEPTS = [
    { code: 'CS',   name: 'Computer Science',   college: 'CAS', subject_codes: ['CS','CSC','COMP','CIS','CSCI'] },
    { code: 'MA',   name: 'Mathematics',         college: 'CAS', subject_codes: ['MA','MATH','MTH'] },
    { code: 'EC',   name: 'Economics',           college: 'CAS', subject_codes: ['EC','ECON'] },
    { code: 'PS',   name: 'Psychology',          college: 'CAS', subject_codes: ['PS','PSYC','PSY'] },
    { code: 'BI',   name: 'Biology',             college: 'CAS', subject_codes: ['BI','BIOL','BIO'] },
    { code: 'CH',   name: 'Chemistry',           college: 'CAS', subject_codes: ['CH','CHEM'] },
    { code: 'PH',   name: 'Physics',             college: 'CAS', subject_codes: ['PH','PHYS','PHY'] },
    { code: 'WR',   name: 'Writing Program',     college: 'CAS', subject_codes: ['WR','ENG','ENGL'] },
    { code: 'CE',   name: 'Credit Evaluation',   college: 'Registry', subject_codes: [] },
  ];
  const deptMap = {};
  for (const d of DEPTS) {
    const { rows } = await db.query(
      `insert into public.departments (code, name, college, subject_codes)
       values ($1,$2,$3,$4) on conflict (code) do update set name=$2 returning id`,
      [d.code, d.name, d.college, d.subject_codes]);
    deptMap[d.code] = rows[0].id;
  }

  // BU courses
  const buCourseMap = {};
  for (const c of (src.buCourses || [])) {
    const code  = c.course_code || c.code;
    const subj  = (code || '').split(' ')[1] || 'CS';
    const deptId = deptMap[subj] || null;
    const { rows } = await db.query(
      `insert into public.courses (institution_id, department_id, code, title, program_area, credits, level, data_source, content_source, is_bu_only)
       values ($1,$2,$3,$4,$5,$6,$7,'worksheet','worksheet',$8)
       on conflict (institution_id, code) do update set title=$4 returning id`,
      [buId, deptId, code, c.course_title || c.title, c.program || null,
       parseFloat(c.credits) || 4,
       (c.level || (parseInt((code || '').replace(/\D/g,'')) || 0) >= 300 ? 'Advanced' : parseInt((code || '').replace(/\D/g,'')) >= 200 ? 'Intermediate' : 'Introductory'),
       (c.notes || '').toLowerCase().includes('bu only') || ['CAS CS 320','CAS CS 332','CAS CS 350'].includes(code)]);
    buCourseMap[code] = rows[0].id;
  }

  // NU courses
  const nuCourseMap = {};
  for (const c of (src.nuCourses || [])) {
    const code = c.course_code || c.code;
    const { rows } = await db.query(
      `insert into public.courses (institution_id, code, title, program_area, credits, data_source, content_source)
       values ($1,$2,$3,$4,$5,'worksheet','worksheet')
       on conflict (institution_id, code) do update set title=$3 returning id`,
      [nuId, code, c.course_title || c.title, c.program || null, parseFloat(c.credits) || 3]);
    nuCourseMap[code] = rows[0].id;
  }

  // NYU courses
  const nyuCourseMap = {};
  for (const c of (src.nyuCourses || [])) {
    const code = c.course_code || c.code;
    const { rows } = await db.query(
      `insert into public.courses (institution_id, code, title, program_area, credits, data_source, content_source)
       values ($1,$2,$3,$4,$5,'worksheet','worksheet')
       on conflict (institution_id, code) do update set title=$3 returning id`,
      [nyuId, code, c.course_title || c.title, c.program || null, parseFloat(c.credits) || 4]);
    nyuCourseMap[code] = rows[0].id;
  }

  // Synthetic courses from transcripts
  const synthCourseMap = {};
  for (const row of (src.transcripts || [])) {
    const instId = instMap[row.institution];
    if (!instId || instId === buId || instId === nuId || instId === nyuId) continue;
    if (synthCourseMap[`${row.institution}|${row.course}`]) continue;
    const { rows } = await db.query(
      `insert into public.courses (institution_id, code, title, credits, credit_system, data_source, content_source)
       values ($1,$2,$3,$4,$5,'synthetic','synthetic')
       on conflict (institution_id, code) do update set title=$3 returning id`,
      [instId, row.course, row.title, parseFloat(row.source_credits) || 3, row.credit_system || 'Semester']);
    synthCourseMap[`${row.institution}|${row.course}`] = rows[0].id;
  }

  // Syllabi
  for (const s of (src.syllabi || [])) {
    const instId = instMap[s.institution];
    if (!instId) continue;
    const { rows: cRows } = await db.query(
      `select id from public.courses where institution_id = $1 and code = $2`, [instId, s.course]);
    if (!cRows[0]) continue;
    await db.query(
      `insert into public.course_syllabi (course_id, content, source, data_source)
       values ($1,$2,'catalog','synthetic') on conflict do nothing`,
      [cRows[0].id, s.syllabus]);
    // Store description in course
    await db.query(`update public.courses set description = $1 where id = $2 and description is null`, [s.syllabus?.slice(0, 500), cRows[0].id]);
  }

  // Worksheet course matches
  for (const row of (src.worksheetMatch || [])) {
    const tgtId = buCourseMap[row.bu_course];
    if (!tgtId) continue;
    if (row.nu_course) {
      await db.query(
        `insert into public.worksheet_course_matches (target_course_id, partner_institution_id, partner_course_code, partner_course_id, match_level)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [tgtId, nuId, row.nu_course, nuCourseMap[row.nu_course] || null, row.nu_match_level || 'No equivalent found']);
    }
    if (row.nyu_course) {
      await db.query(
        `insert into public.worksheet_course_matches (target_course_id, partner_institution_id, partner_course_code, partner_course_id, match_level)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [tgtId, nyuId, row.nyu_course, nyuCourseMap[row.nyu_course] || null, row.nyu_match_level || 'No equivalent found']);
    }
  }

  // Transfer rules
  for (const r of (src.rules || [])) {
    await db.query(
      `insert into public.transfer_rules (id, name, detail, applies_to, source, kind)
       values ($1,$2,$3,$4,$5,'process') on conflict (id) do nothing`,
      [r.rule_id || r.id, r.rule || r.name, r.detail, r.applies_to || null, r.source || null]);
  }

  // Season
  await db.query(
    `insert into public.seasons (code, name, starts_on, ends_on, is_current)
     values ('FA26','Fall 2026 transfer season','2026-01-01','2026-08-31',true)
     on conflict (code) do nothing`);

  // Programs
  for (const p of (src.programs || src.worksheetPrograms || [])) {
    const buInstRow = await db.query(`select id from public.institutions where is_target = true limit 1`);
    await db.query(
      `insert into public.programs (institution_id, program_area, name, degree, data_source)
       values ($1,$2,$3,$4,'worksheet') on conflict (institution_id, program_area) do nothing`,
      [buInstRow.rows[0]?.id, p.program_area || p.program, p.bu_program || p.name || p.program_area, p.bu_degree || null]);
  }

  // Equivalencies (from equivalency_db.csv)
  for (const eq of (src.equivalencies || [])) {
    const srcInstId = instMap[eq.institution];
    if (!srcInstId) continue;
    const { rows: srcCourse } = await db.query(
      `select id from public.courses where institution_id = $1 and code = $2`, [srcInstId, eq.course]);
    if (!srcCourse[0]) continue;
    const tgtId = buCourseMap[eq.bu_course] || null;
    await db.query(
      `insert into public.equivalencies (code, source_course_id, target_course_id, award_label, approved_on, approved_by_label, origin, status)
       values ($1,$2,$3,$4,$5,$6,'synthetic','active')
       on conflict (code) do nothing`,
      [eq.eq_id, srcCourse[0].id, tgtId, eq.bu_course || eq.outcome, eq.approved || '2024-01-01', eq.evaluator || 'Historical']);
  }

  // Past decisions
  for (const pd of (src.pastDecisions || [])) {
    const instId = instMap[pd.institution];
    if (!instId) continue;
    const { rows: srcC } = await db.query(
      `select id from public.courses where institution_id = $1 and code = $2`, [instId, pd.course]);
    await db.query(
      `insert into public.past_decisions
         (code, institution_id, course_code, source_course_id, proposed_target_code, decision, awarded_label, reason, credit_system, decided_on, evaluator_label, data_source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic') on conflict (code) do nothing`,
      [pd.decision_id, instId, pd.course, srcC[0]?.id || null, pd.proposed_bu, pd.decision, pd.bu_awarded, pd.reason,
       pd.credit_system || 'Semester', pd.decided || '2024-01-01', pd.evaluator || 'Historical']);
  }

  return { instMap, buId, nuId, nyuId, buCourseMap, nuCourseMap, nyuCourseMap, synthCourseMap, deptMap };
}

// ── seedPeople ─────────────────────────────────────────────────────────────────

const DEMO_EVALUATORS = [
  { staff_code: 'CE-01', full_name: 'Dana Whitfield',  title: 'Transfer Credit Coordinator', unit: 'credit_evaluation', dept: 'CE', email: 'dana.whitfield@staff.example.org', specializations: [], subject_codes: [], avatar_tone: 'ce1', historical_decisions: 247 },
  { staff_code: 'CE-02', full_name: 'Tomas Reyes',     title: 'Transfer Credit Specialist',  unit: 'credit_evaluation', dept: 'CE', email: 'tomas.reyes@staff.example.org',   specializations: [], subject_codes: [], avatar_tone: 'ce2', historical_decisions: 183 },
  { staff_code: 'DEP-CS1', full_name: 'Dr. Michael Smith', title: 'Associate Professor, CS', unit: 'department', dept: 'CS', email: 'michael.smith@staff.example.org', specializations: ['Algorithms', 'Data Structures'], subject_codes: ['CS','CSC'], avatar_tone: 'ev1', course_levels: ['Intermediate','Advanced'], target_course_pattern: 'CAS CS [12]', historical_decisions: 94 },
  { staff_code: 'DEP-CS2', full_name: 'Dr. Elena Park',    title: 'Assistant Professor, CS',  unit: 'department', dept: 'CS', email: 'elena.park@staff.example.org',    specializations: ['Systems', 'Programming Languages'], subject_codes: ['CS','CSC'], avatar_tone: 'ev2', course_levels: ['Intermediate','Advanced'], target_course_pattern: 'CAS CS [3-9]', historical_decisions: 67 },
  { staff_code: 'DEP-EC1', full_name: 'Dr. Alex Morgan',   title: 'Professor, Economics',     unit: 'department', dept: 'EC', email: 'alex.morgan@staff.example.org',   specializations: ['Micro', 'Macro'],                   subject_codes: ['EC','ECON'], avatar_tone: 'ev3', historical_decisions: 112 },
  { staff_code: 'DEP-MA1', full_name: 'Dr. Ravi Menon',    title: 'Lecturer, Mathematics',    unit: 'department', dept: 'MA', email: 'ravi.menon@staff.example.org',    specializations: ['Calculus', 'Statistics'],           subject_codes: ['MA','MATH'], avatar_tone: 'ev4', historical_decisions: 89 },
  { staff_code: 'DEP-PS1', full_name: 'Dr. Marcus Hall',   title: 'Professor, Psychology',    unit: 'department', dept: 'PS', email: 'marcus.hall@staff.example.org',   specializations: ['Research Methods'],                 subject_codes: ['PS','PSYC'], avatar_tone: 'ev5', historical_decisions: 45 },
  { staff_code: 'DEP-BI1', full_name: 'Dr. Lena Fischer',  title: 'Associate Professor',      unit: 'department', dept: 'BI', email: 'lena.fischer@staff.example.org',  specializations: ['Biology', 'Chemistry'],             subject_codes: ['BI','BIOL','CH','CHEM'], avatar_tone: 'ev6', historical_decisions: 73 },
];

export async function seedPeople(db, src, ref) {
  const password = env.DEMO_PASSWORD || 'TransferDemo!2026';
  const evaluators = {};
  const students   = {};

  // Admin
  const adminId = await upsertAuthUser(db, { email: 'registrar.admin@staff.example.org', password, fullName: 'Registrar Admin', role: 'admin' });
  await db.query(
    `insert into public.profiles (id, role, full_name, email) values ($1,'admin','Registrar Admin','registrar.admin@staff.example.org') on conflict (id) do nothing`,
    [adminId]);

  // Evaluators
  for (const ev of DEMO_EVALUATORS) {
    const uid = await upsertAuthUser(db, { email: ev.email, password, fullName: ev.full_name, role: 'evaluator' });
    const { rows: pRows } = await db.query(
      `insert into public.profiles (id, role, full_name, email) values ($1,'evaluator',$2,$3) on conflict (id) do nothing returning id`,
      [uid, ev.full_name, ev.email]);

    const deptId = ref.deptMap[ev.dept] || null;
    const { rows: eRows } = await db.query(
      `insert into public.evaluators
         (staff_code, profile_id, full_name, title, unit, department_id, subject_codes, specializations, avatar_tone, historical_decisions, data_source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic') returning id`,
      [ev.staff_code, uid, ev.full_name, ev.title, ev.unit, deptId,
       ev.subject_codes || [], ev.specializations || [], ev.avatar_tone, ev.historical_decisions || 0]);
    evaluators[ev.staff_code] = eRows[0].id;

    // Historical stats (last 14 days)
    for (let i = 1; i <= 14; i++) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      await db.query(
        `insert into public.evaluator_daily_stats (evaluator_id, day, decisions) values ($1,$2,$3) on conflict do nothing`,
        [eRows[0].id, day, Math.floor(Math.random() * 8)]);
    }
  }

  // Students
  for (const s of (src.students || [])) {
    const [first, ...rest] = (s.name || '').replace('(synthetic)', '').trim().split(' ');
    const last    = rest.join(' ').trim() || 'Student';
    const email   = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g,'.')}@students.example.org`;
    const uid     = await upsertAuthUser(db, { email, password, fullName: `${first} ${last}`, role: 'student' });
    await db.query(
      `insert into public.profiles (id, role, full_name, email) values ($1,'student',$2,$3) on conflict (id) do nothing`,
      [uid, `${first} ${last}`, email]);
    const { rows: sRows } = await db.query(
      `insert into public.students (student_number, profile_id, full_name, email, intended_major, start_term, start_date, data_source)
       values ($1,$2,$3,$4,$5,$6,$7,'synthetic') returning id`,
      [s.student_id, uid, `${first} ${last}`, email, s.intended_major, s.bu_start_term || 'Fall 2026', s.bu_start_date || '2026-09-02']);
    students[s.student_id] = sRows[0].id;
  }

  return { evaluators, students };
}

// ── seedApplications ──────────────────────────────────────────────────────────

export async function seedApplications(db, src, ref, people) {
  const apps  = {};
  const { rows: [season] } = await db.query(`select id from public.seasons where is_current = true limit 1`);
  const { rows: [buInst]  } = await db.query(`select id from public.institutions where is_target = true limit 1`);

  // Group transcript rows by student
  const byStudent = {};
  for (const row of (src.transcripts || [])) {
    (byStudent[row.student_id] = byStudent[row.student_id] || []).push(row);
  }

  for (const [stuId, rows] of Object.entries(byStudent)) {
    const dbStudentId = people.students[stuId];
    if (!dbStudentId) continue;

    // Determine source institution (first row's institution)
    const srcInstName = rows[0].institution;
    const srcInstId   = ref.instMap[srcInstName];
    if (!srcInstId) continue;

    const refNum = `TCR-26-${String(Object.keys(apps).length + 1).padStart(3, '0')}`;
    const { rows: appRows } = await db.query(
      `insert into public.applications (reference, student_id, season_id, target_institution_id, status, intake_channel)
       values ($1,$2,$3,$4,'received','online') returning id`,
      [refNum, dbStudentId, season.id, buInst.id]);
    const appId = appRows[0].id;

    const { rows: txRows } = await db.query(
      `insert into public.transcripts (application_id, source_institution_id, channel, status, data_source, source)
       values ($1,$2,'online','received','synthetic','PORTAL_UPLOAD') returning id`,
      [appId, srcInstId]);
    const txId = txRows[0].id;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const srcInstRowId = ref.instMap[r.institution] || srcInstId;
      // Find or create source course
      let courseId = ref.buCourseMap[r.course] || ref.synthCourseMap[`${r.institution}|${r.course}`];
      if (!courseId) {
        const { rows: cRows } = await db.query(
          `select id from public.courses where institution_id = $1 and code = $2`, [srcInstRowId, r.course]);
        courseId = cRows[0]?.id || null;
      }
      await db.query(
        `insert into public.transcript_courses
           (transcript_id, application_id, row_code, line_no, course_code, title, term, credit_system, source_credits, grade, course_id, data_source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic')`,
        [txId, appId, r.row_id, i + 1, r.course, r.title, r.term || 'Fall 2024',
         r.credit_system || 'Semester', parseFloat(r.source_credits) || 3, r.grade, courseId]);
    }

    // Assign case owner
    await assignCaseOwner(appId, db).catch(() => {/* ignore if no evaluator */});
    apps[stuId] = { appId, txId };
  }

  return apps;
}

// ── processAll ────────────────────────────────────────────────────────────────

export async function processAll(db, apps) {
  for (const { txId } of Object.values(apps)) {
    try {
      await evaluateTranscript(txId, 'intake', db);
      await db.query(`update public.transcripts set status = 'processed', processed_at = now() where id = $1`, [txId]);
    } catch (e) {
      console.warn(`[seed] transcript ${txId} eval error:`, e.message);
      await db.query(`update public.transcripts set status = 'failed' where id = $1`, [txId]);
    }
  }
}
