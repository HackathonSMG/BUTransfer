/**
 * Guided demo (demo mode only). Each scenario signs in as the real people involved — student,
 * Credit Evaluation owner, department evaluators — and performs the step through the same API
 * the screens use. Nothing is simulated in the browser.
 */
import { api } from './api.js';
import { state, app } from './store.js';
import { $, $$, esc, toast, I } from './ui.js';

const lookup = (n) => api.get(`/demo/lookup/${n}`);
async function as(email) {
  if (!email) throw new Error('Demo account not found.');
  if (state.user?.email !== email) await app.switchAccount(email);
}
const pendingFor = (info, email) => info.reviewers.filter((r) => r.email === email && ['pending', 'info_requested'].includes(r.state));
const decide = (id, body) => api.patch(`/course-evaluations/${id}/decision`, body).catch((e) => toast(e.message, 'error'));
const ownerComplete = async (info) => {
  await as(info.ownerEmail);
  try { const r = await api.post(`/evaluations/${info.applicationId}/bulk`, { action: 'approve_all_and_complete' }); toast(r.message); } catch (e) { toast(e.message, 'error'); }
  app.openCase(info.applicationId);
};
const reviewerOf = (info, course) => info.reviewers.find((r) => r.course === course);

const SCENARIOS = [
  { id: 's1', name: 'High-confidence transfer', who: 'Ethan Brooks · NYU → Economics', student: 'STU-007', steps: [
    ['Ethan checks his request', async (i) => { await as(i.studentEmail); app.go('dashboard'); }],
    ['Every course matches an approved equivalency', async (i) => { await as(i.ownerEmail); app.openCase(i.applicationId); }],
    ['Credit Evaluation confirms all and completes', (i) => ownerComplete(i)],
    ['Ethan sees his confirmed credits', async (i) => { await as(i.studentEmail); app.go('dashboard'); }]] },
  { id: 's2', name: 'Low confidence → department review', who: 'Daniel Kim · Northeastern → Computer Science', student: 'STU-002', steps: [
    ["Daniel's courses are matched; ambiguous ones are routed", async (i) => { await as(i.ownerEmail); app.openCase(i.applicationId); }],
    ['Dr. Smith receives CS 2700 (Data Structures specialization)', async (i) => { const r = reviewerOf(i, 'CS 2700'); await as(r.email); app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Dr. Smith confirms his routed courses', async (i) => { const r = reviewerOf(i, 'CS 2700'); await as(r.email); for (const x of pendingFor(i, r.email)) await decide(x.courseEvaluationId, { action: 'accept', comment: x.course === 'CS 2700' ? 'Together with CS 2100 this covers CS 112.' : '' }); toast('Routed courses confirmed.'); app.openCase(i.applicationId); }],
    ['Dr. Park confirms CS 3800 (Theory of Computation)', async (i) => { const r = reviewerOf(i, 'CS 3800'); await as(r.email); for (const x of pendingFor(i, r.email)) await decide(x.courseEvaluationId, { action: 'accept' }); app.openCase(i.applicationId); }],
    ['Credit Evaluation confirms the rest and completes', (i) => ownerComplete(i)],
    ['Daniel sees his updated credits', async (i) => { await as(i.studentEmail); app.go('dashboard'); }]] },
  { id: 's3', name: 'Rejected course', who: 'Priya Shah · NYU → Psychology', student: 'STU-003', steps: [
    ['BIOL-UA 11 is recommended for rejection (grade D)', async (i) => { await as(i.ownerEmail); app.openCase(i.applicationId); }],
    ['Credit Evaluation rejects it with the reason', async (i) => { await as(i.ownerEmail); const c = i.courses.find((x) => x.course === 'BIOL-UA 11'); const r = await decide(c.courseEvaluationId, { action: 'reject', reason: '' }); if (r) toast(r.message); app.openCase(i.applicationId); }],
    ['Dr. Hall confirms the psychology courses', async (i) => { const r = reviewerOf(i, 'PSYCH-UA 10'); await as(r.email); for (const x of pendingFor(i, r.email)) await decide(x.courseEvaluationId, { action: 'accept' }); app.openCase(i.applicationId); }],
    ['Credit Evaluation completes', (i) => ownerComplete(i)],
    ['Priya sees the rejection and its reason', async (i) => { await as(i.studentEmail); app.go('courses'); }]] },
  { id: 's4', name: 'Missing information', who: 'Omar Haddad · NYU → Mathematics', student: 'STU-009', steps: [
    ['Dr. Menon receives MATH-UA 235 with no syllabus', async (i) => { const r = reviewerOf(i, 'MATH-UA 235'); await as(r.email); app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Dr. Menon requests the syllabus', async (i) => { const r = reviewerOf(i, 'MATH-UA 235'); await as(r.email); try { const x = await api.post(`/course-evaluations/${r.courseEvaluationId}/request-information`, { message: 'Please upload the MATH-UA 235 syllabus with weekly topics and assessment.' }); toast(x.message); } catch (e) { toast(e.message, 'error'); } app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Omar uploads the syllabus; the course is re-evaluated', async (i) => {
      await as(i.studentEmail); app.go('courses');
      const blob = await (await fetch(`${(window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api'}/demo/samples/MATH-UA-235_syllabus.pdf`)).blob();
      const r = reviewerOf(i, 'MATH-UA 235');
      try { const x = await api.upload(`/students/me/courses/${r.courseEvaluationId}/documents`, new File([blob], 'MATH-UA-235_syllabus.pdf', { type: 'application/pdf' })); toast(x.message); } catch (e) { toast(e.message, 'error'); }
      app.render();
    }],
    ['Dr. Menon confirms the re-evaluated course', async (i) => { const r = reviewerOf(i, 'MATH-UA 235'); await as(r.email); await decide(r.courseEvaluationId, { action: 'accept', comment: 'Combined probability and statistics course; counts as a math elective.' }); app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Credit Evaluation completes; Omar is notified', async (i) => { await ownerComplete(i); await as(i.studentEmail); app.go('dashboard'); }]] },
  { id: 's5', name: 'Evaluator overrides the recommendation', who: 'Grace Liu · Northeastern → Economics', student: 'STU-010', steps: [
    ['Dr. Morgan receives ECON 2560 (recommended: EC 204)', async (i) => { const r = reviewerOf(i, 'ECON 2560'); await as(r.email); app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Dr. Morgan overrides to elective credit, with a reason', async (i) => { const r = reviewerOf(i, 'ECON 2560'); await as(r.email); await decide(r.courseEvaluationId, { action: 'override', award: 'Econ elective (CAS EC 3XX)', credits: 4, reason: 'The syllabus has no instrumental-variables or panel-data units, which EC 204 requires.' }); app.openCase(i.applicationId, r.courseEvaluationId); }],
    ['Credit Evaluation completes', (i) => ownerComplete(i)],
    ['Grace sees the decision and the reason', async (i) => { await as(i.studentEmail); app.go('courses'); }]] },
  { id: 's6', name: 'Live intake: paper transcript', who: 'Noah Patel · Northeastern → Computer Science', student: 'STU-011', steps: [
    ['A mailed transcript is scanned and queued for the agent', async (i) => { await as(i.ownerEmail || 'dana.whitfield@staff.example.org'); app.go('requests'); }],
    ['The agent reads it, evaluates every course and routes it', async () => { try { const r = await api.post('/intake/run'); toast(`${r.processed.length} transcript${r.processed.length === 1 ? '' : 's'} read, evaluated and routed.`); } catch (e) { toast(e.message, 'error'); } app.render(); app.refreshShell(); }],
    ["Open Noah's case and see who it was routed to", async () => { const i = await lookup('STU-011'); await as(i.ownerEmail); app.openCase(i.applicationId); }]] },
];

/* ---- knowledge-base scenarios: students upload real (synthetic) transcript PDFs ---- */
const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';
const studentEmail = (n) => state.cache.demo?.accounts.find((a) => a.role === 'student' && a.detail.startsWith(n))?.email;
const adminEmail = () => state.cache.demo?.accounts.find((a) => a.role === 'admin')?.email;
async function uploadSample(n) {
  await as(studentEmail(n));
  const { items } = await api.get('/demo/sample-transcripts');
  const s = items.find((x) => x.studentNumber === n);
  if (!s) throw new Error(`No sample transcript for ${n}.`);
  const blob = await (await fetch(`${BASE}/demo/samples/${encodeURIComponent(s.file)}`)).blob();
  const r = await api.upload('/transcripts/upload', new File([blob], s.file, { type: 'application/pdf' }));
  app.go('processing', { id: r.transcriptId });
}
/** Waits until the uploaded transcript has been read, evaluated and routed. */
async function ready(n) {
  for (let k = 0; k < 40; k += 1) {
    try { const i = await lookup(n); if (i.courses.length && i.ownerEmail) return i; } catch { /* not created yet */ }
    await new Promise((r) => { setTimeout(r, 750); });
  }
  throw new Error('The transcript is still being processed. Try the step again in a moment.');
}
const KB_SCENARIO = { id: 'kb', name: 'Every transcript makes the next one faster', who: 'Lakeshore State University (new school) → Computer Science', student: null, steps: [
  ['Scenario 1 · Ava uploads her transcript (first from this school)', () => uploadSample('STU-020')],
  ['Dr. Smith opens CS 101: no equivalency yet, AI recommends CAS CS 111', async () => { const i = await ready('STU-020'); const r = reviewerOf(i, 'CS 101'); await as(r.email); app.openCase(i.applicationId, r.courseEvaluationId); }],
  ['Department evaluators approve; the knowledge base learns', async () => {
    const i = await ready('STU-020');
    for (const email of [...new Set(i.reviewers.map((r) => r.email))]) {
      await as(email);
      for (const x of pendingFor(i, email)) { const res = await decide(x.courseEvaluationId, { action: 'accept', comment: '' }); if (res?.message) toast(res.message); }
    }
    app.go('knowledge');
  }],
  ['Scenario 2 · Liam uploads the same CS 101', () => uploadSample('STU-021')],
  ['CS 101 and MATH 151 are reused: no department review', async () => { const i = await ready('STU-021'); await as(i.ownerEmail); app.openCase(i.applicationId); }],
  ['Scenario 3 · Zoe uploads: CSC 101 recognised, CS 450 is new', () => uploadSample('STU-022')],
  ['Dr. Smith reviews CS 450 Advanced AI Systems (low confidence)', async () => { const i = await ready('STU-022'); const r = reviewerOf(i, 'CS 450'); await as(r.email); app.openCase(i.applicationId, r.courseEvaluationId); }],
  ['Dr. Smith approves CS 450 as an upper-level CS elective', async () => {
    const i = await ready('STU-022'); const r = reviewerOf(i, 'CS 450'); await as(r.email);
    const res = await decide(r.courseEvaluationId, { action: 'override', award: 'CS elective (CAS CS 3XX)', credits: 3, reason: 'Covers search, planning and learning at an advanced level; no direct BU equivalent, so it counts as an upper-level CS elective.' });
    if (res?.message) toast(res.message);
    app.openCase(i.applicationId, r.courseEvaluationId);
  }],
  ['Scenario 4 · Mason uploads CS 450: reused from Zoe’s decision', () => uploadSample('STU-023')],
  ['The administrator sees the knowledge base grow', async () => { await as(adminEmail()); app.go('knowledge'); }]] };
SCENARIOS.unshift(KB_SCENARIO);

export function openDemo() {
  const box = $('#demo');
  box.innerHTML = `<div class="dh"><b>Guided demo</b><button class="xicon" id="dclose" aria-label="Close">✕</button></div>
    <p class="dp">Each scenario runs the real workflow end to end through the API: student, agent, evaluators, decision, student. Steps sign in as the people involved.</p>
    <div class="dflow"><span>Submit</span>${I.chev}<span>Process</span>${I.chev}<span>Match</span>${I.chev}<span>Route</span>${I.chev}<span>Decide</span>${I.chev}<span>Student</span></div>
    <div class="dl">${SCENARIOS.map((sc) => { const d = state.demo[sc.id] || 0; return `<section class="dsc"><div class="dsh"><b>${esc(sc.name)}</b><small>${esc(sc.who)}</small></div>
      <ol class="dst">${sc.steps.map(([l], i) => `<li class="${i < d ? 'done' : i === d ? 'cur' : ''}"><button data-ds="${sc.id}" data-i="${i}" ${i > d ? 'disabled' : ''}><span>${i < d ? '✓' : i + 1}</span>${esc(l)}</button></li>`).join('')}</ol></section>`; }).join('')}</div>
    <div class="df"><button class="xbtn ghost" id="dreset">Reset demo data</button></div>`;
  box.hidden = false; $('#scrim').hidden = true;
  $('#dclose').onclick = () => app.closeDrawers();
  $('#dreset').onclick = async () => {
    const me = state.user.email;
    try {
      const admin = state.cache.demo.accounts.find((a) => a.role === 'admin');
      await as(admin.email);
      await api.post('/admin/demo/reset');
      await as(me);
      state.demo = {}; toast('Demo data reset.'); app.render(); openDemo();
    } catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-ds]', box).forEach((b) => {
    b.onclick = async () => {
      const sc = SCENARIOS.find((x) => x.id === b.dataset.ds); const i = Number(b.dataset.i);
      $$('[data-ds]', box).forEach((x) => { x.disabled = true; });
      try {
        const info = sc.student ? await lookup(sc.student) : null;
        await sc.steps[i][1](info);
        state.demo[sc.id] = Math.max(state.demo[sc.id] || 0, i + 1);
      } catch (e) { toast(e.message, 'error'); }
      openDemo();
    };
  });
}
export function closeDemo() { const d = $('#demo'); if (d) d.hidden = true; }
