// Copy of the automated scenario run (TRANSFER_CREDIT_TEST_SCENARIOS.md, section 4). Run from 2_Code/transfer-app/backend
// against a seeded test database with the staff roster (password Demo@1234): node run_scenarios.mjs <transcriptDir> <results.json>
// Runs every transcript in 5_Test_Cases/transcripts through the real API and records what the system does:
// extraction, matching path and rules, automatic decisions, evaluator assignment, stage, the applicant's credit
// summary and the applicant emails; then drives the manual steps each scenario needs (decisions, information
// loop, reassignment, duplicate, deadline exception, final posting) and checks the expected outcome.
// Usage: node t-scenarios.mjs <transcriptDir> <results.json>
import fs from 'node:fs'
import path from 'node:path'
import { createApp } from './src/app.js'
import { pool, query } from './src/config/db.js'

const [dir, resultsFile] = process.argv.slice(2)
const srv = createApp().listen(4103)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const out = []
const report = {}
const check = (id, scenario, ok, actual = '') => {
  const pass = Boolean(ok)
  out.push({ id, scenario, pass, actual: String(actual) })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${scenario}${actual ? `\n        ${actual}` : ''}`)
}
const api = async (method, p, { token, body, form } = {}) => {
  const headers = { ...(token && { Authorization: `Bearer ${token}` }), ...(!form && body && { 'Content-Type': 'application/json' }) }
  const r = await fetch(`http://127.0.0.1:4103/api${p}`, { method, headers, body: form || (body && JSON.stringify(body)) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const tokens = {}
const tokenFor = async (email) => (tokens[email] ||= (await api('POST', '/auth/login', { body: { email, password: 'Demo@1234' } })).body.data.access_token)
const one = async (sql, p = []) => (await query(sql, p)).rows[0]
const all = async (sql, p = []) => (await query(sql, p)).rows
const office = await tokenFor('credit.office@bu-transfer.local')
const stamp = Date.now()

async function settle(id) {
  for (let i = 0; i < 200; i++) {
    const r = await one(`SELECT a.status, (SELECT COUNT(*)::int FROM ai_evaluations WHERE application_id = a.id AND status IN ('pending','running')) AS busy FROM applications a WHERE a.id = $1`, [id])
    if (!r.busy && !['under_evaluation', 'evaluation_completed', 'submitted'].includes(r.status)) return r.status
    await sleep(250)
  }
  return 'timeout'
}

/** Applies as the applicant through the public API: draft, upload transcripts, submit. */
async function apply(key, { files, name, program, start = 'Fall 2027', email }) {
  email ||= `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${stamp}@applicant-mail.com`
  const d = await api('POST', '/student/applications', { body: { student_name: name, student_email: email, transfer_from_institution: 'See transcripts',
    transfer_to_program: program, transfer_to_department: 'College of Arts & Sciences', expected_start_term: start, draft: true } })
  if (d.status !== 201) throw new Error(`${key}: application not started (${d.status}) ${JSON.stringify(d.body)}`)
  const token = d.body.data.secure_token
  for (const f of files) {
    const fd = new FormData()
    fd.append('file', new Blob([fs.readFileSync(path.join(dir, f))], { type: 'application/pdf' }), f)
    fd.append('document_type', 'transcript')
    await api('POST', `/student/applications/${token}/documents`, { form: fd })
  }
  const s = await api('POST', `/student/applications/${token}/submit`, { body: {} })
  const app = await one(`SELECT id, reference_number FROM applications WHERE secure_token = $1`, [token])
  const status = await settle(app.id)
  return { key, id: app.id, ref: app.reference_number, token, email, submitStatus: s.status, status }
}

/** What the system did with each course and where the application is. */
async function snapshot(a) {
  const courses = await all(
    `SELECT tc.institution, tc.course_code, tc.source_credits, tc.grade, tc.credit_system, ce.path, ce.outcome AS engine_outcome, ce.award, ce.suggestion,
            ce.rules, ce.bu_credits, ce.reasons, ce.combined_with, cd.outcome, cd.bu_award, cd.decided_via, cd.bu_units,
            r.status AS review_status, r.queue, p.full_name AS evaluator, e.department, r.assignment_reason,
            (SELECT kind || ':' || status FROM information_requests WHERE transcript_course_id = tc.id ORDER BY created_at DESC LIMIT 1) AS info,
            cp.units AS posted_units, cp.transfer_grade, cp.hub_units, cp.counts_in_gpa
     FROM transcript_courses tc
     LEFT JOIN LATERAL (SELECT ce.* FROM course_evaluations ce JOIN ai_evaluations ae ON ae.id = ce.ai_evaluation_id WHERE ce.transcript_course_id = tc.id ORDER BY ae.created_at DESC LIMIT 1) ce ON true
     LEFT JOIN course_decisions cd ON cd.transcript_course_id = tc.id LEFT JOIN course_reviews r ON r.transcript_course_id = tc.id
     LEFT JOIN profiles p ON p.id = r.evaluator_id LEFT JOIN evaluators e ON e.id = r.evaluator_id
     LEFT JOIN credit_postings cp ON cp.transcript_course_id = tc.id
     WHERE tc.application_id = $1 ORDER BY tc.position`, [a.id])
  const view = (await api('GET', `/student/status/${a.token}`)).body.data
  const own = (await api('GET', `/office/applications/${a.id}`, { token: office })).body.data
  const emails = await all(`SELECT type, email_status FROM notifications WHERE application_id = $1 AND email_status IS NOT NULL ORDER BY created_at`, [a.id])
  return {
    ref: a.ref, status: view.status, applicant_status: view.status_info.label, stage: own.ownership.stage_label,
    summary: view.results.summary, emails: emails.map(e => `${e.type}[${e.email_status}]`),
    courses: courses.map(c => ({
      course: c.course_code, institution: c.institution, credits: c.source_credits == null ? null : Number(c.source_credits), grade: c.grade,
      path: c.path, rules: c.rules, engine: c.engine_outcome, suggestion: c.award || c.suggestion, bu_credits: c.bu_credits == null ? null : Number(c.bu_credits),
      combined_with: c.combined_with, decided: c.outcome ? `${c.outcome}${c.bu_award ? ` ${c.bu_award}` : ''} (${c.decided_via})` : null,
      review: c.review_status ? `${c.review_status}${c.evaluator ? ` · ${c.evaluator} (${c.department})` : ` · ${c.queue} queue`}` : null,
      info: c.info, posted: c.posted_units != null ? `${Number(c.posted_units)} units, grade ${c.transfer_grade || '-'}, hub ${Number(c.hub_units)}, gpa ${c.counts_in_gpa}` : null,
      reason: (c.reasons || [])[0] || null,
    })),
  }
}
const record = async (key, a) => (report[key] = await snapshot(a))
const byCode = (snap, code) => snap.courses.find(c => c.course === code)

/** Decides every open review on the application, round by round (hand-offs open the next evaluator). */
async function decideAll(appId, plan = {}) {
  for (let round = 0; round < 8; round++) {
    const open = await all(`SELECT r.id, r.status, tc.course_code, p.email FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
      JOIN profiles p ON p.id = r.evaluator_id WHERE r.application_id = $1 AND r.status IN ('new', 'in_progress')`, [appId])
    if (!open.length) return
    for (const r of open) {
      const t = await tokenFor(r.email)
      if (r.status === 'new') await api('POST', `/my/reviews/${r.id}/start`, { token: t })
      const want = plan[r.course_code] || { decision: 'equivalent' }
      let res = await api('POST', `/my/reviews/${r.id}/decision`, { token: t, body: want })
      if (res.status !== 200) res = await api('POST', `/my/reviews/${r.id}/decision`, { token: t, body: { decision: 'elective', elective_label: 'General elective', reason: 'No direct BU equivalent.' } })
      if (res.status !== 200) console.log('   decision failed', r.course_code, res.body?.error?.message)
    }
  }
}
const post = async (appId) => api('POST', `/office/applications/${appId}/post`, { token: office })

// ===== TC01: established equivalencies; final posting; Hub/GPA rules; duplicate; deadline =====
const tc01 = await apply('TC01', { files: ['TC01_Established_Equivalencies_Northeastern.pdf'], name: 'Elena Park', program: 'Computer Science' })
let s = await record('TC01', tc01)
check('S01/S06', 'TC01: three established equivalencies applied without an evaluator; straight to Credit Office review',
  s.courses.every(c => c.decided?.includes('established_equivalency') && !c.review) && s.status === 'ready_for_posting',
  s.courses.map(c => `${c.course}→${c.decided}`).join('; ') + ` | ${s.applicant_status}`)
const p1 = await post(tc01.id)
s = await record('TC01_final', tc01)
check('S19/S25', 'TC01 finalized: Completed; credits awarded = accepted; pending 0; grade T, no Hub units, not in GPA; final email',
  p1.status === 200 && s.status === 'credit_posted' && s.summary.credits_posted === s.summary.credits_accepted && s.summary.credits_pending === 0
  && s.courses.every(c => c.posted?.includes('grade T') && c.posted.includes('hub 0') && c.posted.includes('gpa false')) && s.emails.some(e => e.startsWith('decision_available')),
  `awarded ${s.summary.credits_posted}, accepted ${s.summary.credits_accepted}, pending ${s.summary.credits_pending}; emails ${s.emails.join(', ')}`)

const dup = await apply('TC22', { files: ['TC01_Established_Equivalencies_Northeastern.pdf'], name: 'Elena Park', program: 'Computer Science', email: tc01.email })
const dupRow = await one(`SELECT duplicate_status FROM applications WHERE id = $1`, [dup.id])
check('S22', 'TC22: same email again after TC01 completed → accepted as a new evaluation (finished applications are not duplicate candidates)',
  dup.submitStatus === 200 && dupRow.duplicate_status === null, `duplicate_status ${dupRow.duplicate_status}`)
const dup2 = await apply('TC22b', { files: ['TC01_Established_Equivalencies_Northeastern.pdf'], name: 'Elena Park', program: 'Computer Science', email: tc01.email })
const dup2Row = await one(`SELECT duplicate_status, duplicate_reason FROM applications WHERE id = $1`, [dup2.id])
const check22 = (await api('POST', '/student/applications/check-email', { body: { email: tc01.email } })).body.data
check('S22b', 'TC22: a third application while TC22 is still open → flagged as a suspected duplicate for the Credit Office; the email check lists all three (masked)',
  dup2Row.duplicate_status === 'suspected' && check22.applications.length === 3 && check22.has_active, `${dup2Row.duplicate_reason}`)

const late = await apply('TC23', { files: ['TC01_Established_Equivalencies_Northeastern.pdf'], name: 'Marta Kowalski', program: 'Computer Science', start: 'Fall 2024' })
const blocked = await post(late.id)
await api('POST', `/office/applications/${late.id}/deadline-exception`, { token: office, body: { reason: 'Approved by the Credit Evaluation Office for testing.' } })
const allowed = await post(late.id)
const within = (await api('GET', `/student/status/${tc01.token}`)).body.data.results.deadline
check('S23', 'TC23: BU start Fall 2024 → one-year deadline passed; posting blocked until an exception is recorded; Fall 2027 start is within the deadline',
  blocked.status === 400 && /deadline/i.test(blocked.body?.error?.message || '') && allowed.status === 200 && within.status === 'within',
  `blocked: ${blocked.body?.error?.message}; after exception: ${allowed.status}; TC01 deadline ${within.deadline} (${within.status})`)

// ===== TC02: elective equivalency (R3) =====
const tc02 = await apply('TC02', { files: ['TC02_Elective_Equivalency_Riverside.pdf'], name: 'Jonah Castillo', program: 'Computer Science' })
await post(tc02.id)
s = await record('TC02', tc02)
const eng = byCode(s, 'ENG 101')
check('S02', 'TC02: ENG 101 established elective equivalency (R3) applied and posted as elective credit with no Hub units',
  eng.decided?.startsWith('elective') && eng.rules?.includes('R3') && eng.posted?.includes('hub 0') && s.summary.courses_elective === 1, `${eng.decided}; ${eng.posted}`)

// ===== TC03: elective by precedent and by R6; evaluator picks a different BU course =====
const tc03 = await apply('TC03', { files: ['TC03_Elective_and_Different_Course_Northeastern.pdf'], name: 'Priya Natarajan', program: 'Computer Science' })
s = await record('TC03', tc03)
check('S02b', 'TC03: DS 3000 (elective precedent) and CS 3800 (R6: must be taken at BU) recommended as elective; PSYC 2320 to the Psychology evaluator',
  byCode(s, 'DS 3000').engine === 'elective' && byCode(s, 'CS 3800').rules?.includes('R6') && /Psych/i.test(byCode(s, 'PSYC 2320').review || ''),
  s.courses.map(c => `${c.course}: ${c.path}/${c.engine} ${c.suggestion || ''} → ${c.review}`).join('; '))
await decideAll(tc03.id, { 'PSYC 2320': { decision: 'different_course', bu_course: 'CAS PS 211', reason: 'Research statistics with lab reports; matches PS 211.' } })
await post(tc03.id)
s = await record('TC03_final', tc03)
check('S03', 'TC03: evaluator chose a different BU course (PSYC 2320 → CAS PS 211); application completed',
  byCode(s, 'PSYC 2320').decided?.includes('CAS PS 211') && s.status === 'credit_posted', byCode(s, 'PSYC 2320').decided)

// ===== TC04: no-credit rules =====
const tc04 = await apply('TC04', { files: ['TC04_No_Credit_Rules_NYU.pdf'], name: 'Daniel Okoro', program: 'Psychology' })
s = await record('TC04', tc04)
check('S04/S10', 'TC04: grade D and C- → no credit (R1) even with an equivalency on file; W → no credit; PSYCH-UA 1 A → PS 101; no evaluator needed',
  byCode(s, 'BIOL-UA 11').decided?.startsWith('no_credit') && byCode(s, 'MATH-UA 121').rules?.includes('R1') && byCode(s, 'CHEM-UA 125').rules?.includes('W')
  && byCode(s, 'PSYCH-UA 1').decided?.includes('CAS PS 101') && s.status === 'ready_for_posting',
  s.courses.map(c => `${c.course} ${c.grade} → ${c.decided}`).join('; '))

// ===== TC05 / S20: information required loop =====
const tc05 = await apply('TC05', { files: ['TC05_Information_Required_NYU.pdf'], name: 'Sofia Lindqvist', program: 'Mathematics' })
s = await record('TC05', tc05)
const m235 = byCode(s, 'MATH-UA 235')
check('S05', 'TC05: MATH-UA 235 has no description on file → needs information; syllabus requested from the applicant; MATH-UA 122 → MA 124',
  m235.path === 'needs_information' && /syllabus:pending/.test(m235.info || '') && s.status === 'information_required' && s.emails.some(e => e.startsWith('information_required')),
  `${m235.path}; ${m235.info}; ${s.applicant_status}; review ${m235.review}`)
const req = (await api('GET', `/student/status/${tc05.token}`)).body.data.results.courses.find(c => c.course_code === 'MATH-UA 235').information_request
const fd = new FormData()
fd.append('file', new Blob([fs.readFileSync(path.join(dir, '..', '..', '5_Demo_Documents', 'CSC_220_Syllabus_Riverside.pdf'))], { type: 'application/pdf' }), 'MATH-UA_235_Syllabus.pdf')
fd.append('response', 'Syllabus attached.')
const answered = await api('POST', `/student/status/${tc05.token}/info-requests/${req.id}/respond`, { form: fd })
await decideAll(tc05.id, { 'MATH-UA 235': { decision: 'elective', elective_label: 'Math elective (CAS MA 1XX)', reason: 'Probability and statistics; no direct BU equivalent.' } })
await post(tc05.id)
s = await record('TC05_final', tc05)
check('S20', 'TC05: applicant uploads the syllabus from tracking → evaluator decides → posted; the applicant was emailed at each stage',
  answered.status === 200 && byCode(s, 'MATH-UA 235').decided?.startsWith('elective') && s.status === 'credit_posted',
  `${byCode(s, 'MATH-UA 235').decided}; emails ${s.emails.join(', ')}`)

// ===== TC07: conflicting precedents =====
const tc07 = await apply('TC07', { files: ['TC07_Conflicting_Precedents_Northeastern.pdf'], name: 'Mateus Ribeiro', program: 'Biology' })
s = await record('TC07', tc07)
const conflicts = (await api('GET', '/admin/conflicts', { token: office })).body?.data
const flagged = ['CHEM 1161', 'MATH 1365', 'ECON 2560'].filter(c => JSON.stringify(conflicts || {}).includes(c))
check('S07', 'TC07: courses with disagreeing past decisions go to a department evaluator (never auto-applied) and appear on the conflicts list',
  s.courses.every(c => c.review && !c.decided) && flagged.length === 3,
  s.courses.map(c => `${c.course}: ${c.path} ${c.suggestion || ''} → ${c.review} | ${c.reason?.slice(0, 70)}`).join('; ') + ` | conflicts listed: ${flagged.join(', ')}`)

// ===== TC08: grade rules =====
const tc08 = await apply('TC08', { files: ['TC08_Grade_Rules_Northeastern.pdf'], name: 'Hannah Weiss', program: 'Mathematics' })
s = await record('TC08', tc08)
check('S08/S09/S10', 'TC08: A+ meets the minimum (CS 1800 → CS 131 auto); P → department confirms (PASS); C- → no credit (R1)',
  byCode(s, 'CS 1800').decided?.includes('CAS CS 131') && byCode(s, 'MATH 1341').rules?.includes('PASS') && byCode(s, 'MATH 1341').review
  && byCode(s, 'ECON 1116').decided?.startsWith('no_credit') && byCode(s, 'ECON 1116').rules?.includes('R1'),
  s.courses.map(c => `${c.course} ${c.grade}: ${c.decided || `${c.path} → ${c.review}`}`).join('; '))

// ===== TC11: repeated course =====
const tc11 = await apply('TC11', { files: ['TC11_Repeated_Course_Northeastern.pdf'], name: 'Theo Grant', program: 'Computer Science' })
s = await record('TC11', tc11)
const attempts = s.courses.filter(c => c.course === 'CS 2000')
check('S11', 'TC11: CS 2000 taken twice → credit once (best grade A-); the other attempt no credit (REPEAT)',
  attempts.filter(c => c.decided?.includes('CAS CS 111')).length === 1 && attempts.filter(c => c.rules?.includes('REPEAT')).length === 1,
  attempts.map(c => `${c.grade}: ${c.decided}`).join('; '))

// ===== TC12: course code formats =====
const tc12 = await apply('TC12', { files: ['TC12_Course_Code_Formats_Northeastern.pdf'], name: 'Aisha Bello', program: 'Computer Science' })
s = await record('TC12', tc12)
check('S12', 'TC12: CS2000, cs-1800, ECON1116 and "math 1341" normalize and match their equivalencies',
  s.courses.every(c => c.decided?.includes('established_equivalency')), s.courses.map(c => `${c.course} → ${c.decided || c.path}`).join('; '))

// ===== TC13: missing credits =====
const tc13 = await apply('TC13', { files: ['TC13_Missing_Credits_Northeastern.pdf'], name: 'Lucas Moreau', program: 'Economics' })
s = await record('TC13', tc13)
const nocr = byCode(s, 'CS 2000')
check('S13', 'TC13: CS 2000 with no credits is kept (credits null, not 0) and held for the department to confirm the credits; ECON 1116 auto',
  nocr.credits === null && nocr.path === 'needs_information' && !nocr.decided && byCode(s, 'ECON 1116').decided && s.summary.pending_without_credits === 1,
  `${nocr.path}; ${nocr.reason}; review ${nocr.review}; summary pending_without_credits ${s.summary.pending_without_credits}`)

// ===== TC14: unknown course =====
const tc14 = await apply('TC14', { files: ['TC14_Unknown_Course_Northeastern.pdf'], name: 'Grace Adeyemi', program: 'Computer Science' })
s = await record('TC14', tc14)
const unk = byCode(s, 'CS 4973')
check('S14', 'TC14: CS 4973 (not in the catalog or equivalency data) → manual path: syllabus needed, routed to an evaluator',
  unk.path === 'needs_information' && unk.review, `${unk.path}; ${unk.info}; ${unk.review}`)

// ===== TC15: no subject specialist =====
const tc15 = await apply('TC15', { files: ['TC15_No_Subject_Specialist_Riverside.pdf'], name: 'Oliver Bennett', program: 'Liberal Arts' })
s = await record('TC15', tc15)
check('S15', 'TC15: philosophy and music have no subject specialist → general credit evaluator (or the Credit Office queue); KIN 105 follows its no-credit precedent',
  (await all(`SELECT e.expertise_subjects FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id LEFT JOIN evaluators e ON e.id = r.evaluator_id
     WHERE r.application_id = $1 AND tc.course_code IN ('PHIL 101', 'MUS 110')`, [tc15.id])).every(r => !r.expertise_subjects || r.expertise_subjects.includes('GEN')),
  s.courses.map(c => `${c.course}: ${c.path}/${c.engine} → ${c.review} | ${(c.reason || '').slice(0, 60)}`).join('; '))

// ===== TC16: two institutions, quarter conversion =====
const tc16 = await apply('TC16', { files: ['TC16_Multiple_Institutions_Riverside.pdf', 'TC16_Multiple_Institutions_PacificCoast.pdf'], name: 'Nadia Haddad', program: 'Computer Science' })
s = await record('TC16', tc16)
check('S16', 'TC16: two transcripts → four courses from two institutions; quarter courses convert (5 qtr → 3.33 BU, R2)',
  new Set(s.courses.map(c => c.institution)).size === 2 && s.courses.length === 4 && byCode(s, 'PSYC 1').bu_credits === 3.33 && byCode(s, 'PSYC 1').rules?.includes('R2'),
  s.courses.map(c => `${c.institution.split(' ')[0]} ${c.course} ${c.credits}${c.institution.startsWith('Pacific') ? 'q' : ''} → ${c.bu_credits} BU; ${c.decided}`).join('; '))

// ===== TC17: multiple evaluators, combined courses, partial completion, reassignment =====
const tc17 = await apply('TC17', { files: ['TC17_Multiple_Evaluators_Northeastern.pdf'], name: 'Ethan Sato', program: 'Computer Science' })
s = await record('TC17', tc17)
const evaluators = new Set(s.courses.filter(c => c.review).map(c => c.review.split(' · ')[1]))
check('S17/S24', 'TC17: courses go to different subject evaluators; CS 2100 + CS 2700 recommended together (combined precedent PD-002)',
  evaluators.size >= 3 && (byCode(s, 'CS 2100').combined_with || byCode(s, 'CS 2700').combined_with),
  s.courses.map(c => `${c.course} → ${c.review}${c.combined_with ? ` (with ${c.combined_with})` : ''}`).join('; '))
const firstOpen = await one(`SELECT r.id, p.email FROM course_reviews r JOIN profiles p ON p.id = r.evaluator_id WHERE r.application_id = $1 AND r.status = 'new' ORDER BY r.sequence LIMIT 1`, [tc17.id])
const ft = await tokenFor(firstOpen.email)
await api('POST', `/my/reviews/${firstOpen.id}/start`, { token: ft })
await api('POST', `/my/reviews/${firstOpen.id}/decision`, { token: ft, body: { decision: 'equivalent' } })
s = await record('TC17_partial', tc17)
check('S18', 'TC17 partial: the applicant sees accepted courses with units and the rest pending at 0 units',
  s.summary.decided >= 1 && s.summary.pending >= 1 && s.summary.credits_accepted > 0 && s.summary.credits_pending > 0,
  `evaluated ${s.summary.decided}/${s.summary.courses}; accepted ${s.summary.credits_accepted}; pending ${s.summary.credits_pending}`)
const holder = await one(`SELECT r.id AS review_id, r.evaluator_id, tc.course_code FROM course_reviews r JOIN transcript_courses tc ON tc.id = r.transcript_course_id
  WHERE r.application_id = $1 AND r.status IN ('new', 'queued') AND r.evaluator_id IS NOT NULL ORDER BY r.sequence DESC LIMIT 1`, [tc17.id])
const away = await api('POST', `/office/evaluators/${holder.evaluator_id}/availability`, { token: office, body: { availability: 'unavailable' } })
const hist = (await api('GET', `/office/applications/${tc17.id}`, { token: office })).body.data.ownership.history.filter(h => h.course_code === holder.course_code)
await api('POST', `/office/evaluators/${holder.evaluator_id}/availability`, { token: office, body: { availability: 'available' } })
check('S21', 'TC17: the evaluator becomes unavailable → their course is reassigned; the history keeps both assignments',
  away.status === 200 && hist.length >= 2 && hist[0].action === 'Assigned' && hist.some(h => /Reassigned|Returned/.test(h.action)),
  `${holder.course_code}: ${hist.map(h => `${h.action} ${h.evaluator || ''}`).join(' > ')}`)
await decideAll(tc17.id)
await post(tc17.id)
s = await record('TC17_final', tc17)
check('S17b', 'TC17: all evaluators decide → Credit Office posts → Completed', s.status === 'credit_posted', `${s.status}; awarded ${s.summary.credits_posted}`)

// ===== TC26: economics cap (R7) =====
const tc26 = await apply('TC26', { files: ['TC26_Economics_Cap_PacificCoast.pdf', 'TC26_Economics_Cap_Northeastern.pdf'], name: 'Ivy Chen-Morales', program: 'Economics' })
s = await record('TC26', tc26)
check('S26', 'TC26: five upper-level economics courses → the one over the cap of four earns no credit (R7)',
  s.courses.filter(c => c.rules?.includes('R7')).length >= 1,
  s.courses.map(c => `${c.course}: ${c.engine} ${c.suggestion || ''} [${(c.rules || []).join(',')}]`).join('; '))

fs.writeFileSync(resultsFile, JSON.stringify({ checks: out, applications: report }, null, 1))
console.log(`\nTOTAL ${out.length}: PASS ${out.filter(o => o.pass).length}, FAIL ${out.filter(o => !o.pass).length}`)
srv.close(); await pool.end()
