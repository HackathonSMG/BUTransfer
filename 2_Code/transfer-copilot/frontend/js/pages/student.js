/**
 * Student-facing pages: dashboard (home), course results, degree plan, transcript viewer.
 * upload + processing are provided by intake.js and re-exported here.
 */
import { api } from '../api.js';
import { state, app } from '../store.js';
import { $, esc, fmt, badge, I, ico, toast, errorBox } from '../ui.js';

export { upload, processing } from './intake.js';

/* ── helpers ─────────────────────────────────────────────────────────── */
const STATUS_CLS = {
  Confirmed: 'ok', Likely: 'info', 'Under review': 'warn', 'Not transferable': 'bad',
};
const statusIcon = (s) => ({ Confirmed: '✓', Likely: '~', 'Under review': '…', 'Not transferable': '✕' }[s] || '•');

function courseCard(c) {
  const cls = STATUS_CLS[c.student_status] || 'info';
  return `<div class="stucc ${cls}">
    <div class="stuccl"><b class="mono">${esc(c.course_code)}</b><span>${esc(c.title)}</span></div>
    <div class="stuccr">
      <span class="xb s-${cls}"><i>${statusIcon(c.student_status)}</i>${esc(c.student_status || c.state)}</span>
      <span class="xmuted">${c.suggestion ? esc(c.suggestion) : ''}</span>
      ${c.awarded_credits ? `<span><b>${fmt(c.awarded_credits)}</b> credits</span>` : ''}
      ${c.decision_note ? `<p class="stucnote">${esc(c.decision_note)}</p>` : ''}
    </div>
  </div>`;
}

/* ── home (dashboard) ───────────────────────────────────────────────── */
export async function home(ctx) {
  app.setTitle('Transfer overview', ['My Transfer', 'Transfer overview']);
  let data;
  try { data = await api.get('/students/me/application'); } catch (e) { ctx.paint(errorBox(e)); return; }

  if (!data.application) {
    if (!ctx.paint(`
      <section class="xcard stunoapp">
        ${ico('cap')}
        <div>
          <h2>Welcome, ${esc(state.user.fullName.split(' ')[0])}</h2>
          <p class="xmuted">You don't have an active transfer credit application yet. Upload your transcript to begin.</p>
          <button class="xbtn pri" data-go="upload">Upload transcript</button>
        </div>
      </section>`)) return;
    $('[data-go]')?.addEventListener('click', () => app.go('upload'));
    return;
  }

  const a = data.application;
  const courses = data.courses || [];
  const confirmed = courses.filter((c) => c.state === 'confirmed' || c.state === 'overridden');
  const pending   = courses.filter((c) => c.state === 'pending');
  const rejected  = courses.filter((c) => c.state === 'rejected');

  if (!ctx.paint(`
    <div class="stuhero">
      <div class="stuhero-l">
        <div class="xey">Welcome back, ${esc(state.user.fullName.split(' ')[0])}</div>
        <h2>Transfer Credit Application</h2>
        <p class="xmuted">Request ${esc(a.reference)} · ${esc(a.source_institution || '')}</p>
        ${badge(a.status === 'in_review' ? 'In Review' : a.status === 'completed' ? 'Completed' : a.status === 'needs_information' ? 'Needs Information' : 'Submitted')}
      </div>
      <div class="stukpis">
        <div class="kpi"><b>${courses.length}</b><span>Courses</span></div>
        <div class="kpi ok"><b>${confirmed.length}</b><span>Confirmed</span></div>
        <div class="kpi warn"><b>${pending.length}</b><span>Under review</span></div>
        <div class="kpi bad"><b>${rejected.length}</b><span>Not transferable</span></div>
      </div>
    </div>
    <section class="xcard">
      <div class="xch"><h3>Your courses</h3><button class="xbtn sm" data-go="courses">See all</button></div>
      <div class="stuccards">${courses.slice(0, 6).map(courseCard).join('') || '<p class="xmuted">No courses yet. We\'ll update this once your transcript is evaluated.</p>'}</div>
    </section>
    ${a.total_credits ? `<div class="xinfo ok">${I.check}<div><b>${fmt(a.total_credits)} credits confirmed</b> for transfer to Boston University.</div></div>` : ''}
  `)) return;

  $('[data-go="courses"]')?.addEventListener('click', () => app.go('courses'));
  $('[data-go="upload"]')?.addEventListener('click', () => app.go('upload'));
}

/* ── courses ────────────────────────────────────────────────────────── */
export async function courses(ctx) {
  app.setTitle('Course evaluations', ['My Transfer', 'Course evaluations']);
  let data;
  try { data = await api.get('/students/me/application'); } catch (e) { ctx.paint(errorBox(e)); return; }

  if (!data.application) {
    if (!ctx.paint(`<div class="xinfo">${ico('inbox')}<div><p>No application yet. <button class="xlink" data-go="upload">Upload a transcript</button> to start.</p></div></div>`)) return;
    $('[data-go]')?.addEventListener('click', () => app.go('upload'));
    return;
  }

  const all = data.courses || [];
  if (!ctx.paint(`
    <div class="stufilt">
      <span class="xmuted">${all.length} course${all.length === 1 ? '' : 's'}</span>
    </div>
    <div class="stuccards large">${all.length ? all.map(courseCard).join('') : '<p class="xmuted">No course evaluations yet.</p>'}</div>
  `)) return;
}

/* ── degree ─────────────────────────────────────────────────────────── */
export async function degree(ctx) {
  app.setTitle('Degree plan', ['My Transfer', 'Degree plan']);
  let data;
  try { data = await api.get('/students/me/degree-progress'); } catch (e) { ctx.paint(errorBox(e)); return; }

  ctx.paint(`
    <section class="xcard">
      <div class="xch"><h3>Degree progress</h3></div>
      <div class="stukpis">
        <div class="kpi"><b>${fmt(data.completedCredits)}</b><span>Credits confirmed</span></div>
        <div class="kpi"><b>${fmt(data.totalCredits)}</b><span>Credits requested</span></div>
      </div>
      ${data.progress?.length
        ? `<div class="stuccards">${data.progress.map((r) => `<div class="stucc info"><div class="stuccl"><b>${esc(r.requirement)}</b></div><div class="stuccr"><span>${fmt(r.completed)} / ${fmt(r.needed)} credits</span></div></div>`).join('')}</div>`
        : '<p class="xmuted" style="padding:1rem 0">Degree plan data will be available after your transcript has been evaluated.</p>'}
    </section>`);
}

/* ── transcript (raw view) ───────────────────────────────────────────── */
export async function transcript(ctx) {
  app.setTitle('Transcript', ['My Transfer', 'Transcript']);
  let data;
  try { data = await api.get('/students/me/transcript'); } catch (e) { ctx.paint(errorBox(e)); return; }

  const rows = data.courses || [];
  ctx.paint(`
    <section class="xcard">
      <div class="xch"><h3>Transcript courses</h3><span class="xmuted">${rows.length} courses</span></div>
      ${rows.length ? `
        <div class="extable">
          <div class="exr exh"><span>Course</span><span>Title</span><span>Credits</span><span>Grade</span><span>Term</span></div>
          ${rows.map((c) => `<div class="exr"><span class="mono"><b>${esc(c.course_code)}</b></span><span>${esc(c.title)}</span><span class="mono">${fmt(c.source_credits)}</span><span class="mono"><b>${esc(c.grade)}</b></span><span>${esc(c.term)}</span></div>`).join('')}
        </div>` : '<p class="xmuted" style="padding:1rem 0">No transcript data yet.</p>'}
    </section>`);
}
