/**
 * Evaluator pages: dashboard (personal metrics), My evaluations, Transfer requests, Students, Courses, Team & routing.
 * Every list row opens the evaluation detail page.
 */
import { api, qs } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, greet, I, ico, badge, priPill, meter, avatar, empty, kpi, riskDot, recv, demoTag, srcTag, pathPill } from '../ui.js';

const CATS = { high: 'High priority', missing: 'Missing information', replied: 'Student replied', low: 'Low confidence', med: 'Medium confidence', hi: 'High confidence' };
const filters = () => ({ q: state.qf.q, status: state.qf.status, priority: state.qf.priority, subject: state.qf.subject, category: state.qf.category, sort: state.qSort, dir: state.qDir });

/* ---------- shared table ---------- */
function itemRow(x) {
  if (x.kind === 'course') {
    return `<div class="xtr clk" role="row" tabindex="0" data-open="${x.applicationId}" data-row="${x.course.id}" aria-label="Open ${esc(x.student.name)}, ${esc(x.course.code)}">
      <span class="c-stu" data-l="Student">${avatar(x.student)}<span><b>${esc(x.student.name)}</b><small>${esc(x.student.number)}</small></span></span>
      <span class="c-crs" data-l="Course"><b class="mono">${esc(x.course.code)} → ${esc((x.course.targetCode || x.course.award || '').replace('CAS ', ''))}</b><small>${esc(x.course.title)}</small></span>
      <span data-l="Previous university">${esc(x.previousUniversity)}</span>
      <span data-l="Target course"><b class="mono">${esc(x.course.targetCode || '—')}</b><small>${esc(x.course.targetTitle || '')}</small></span>
      <span data-l="AI match">${meter(x.matchPct)}</span>
      <span data-l="Reason" class="c-rsn">${pathPill(x.evaluationPath)}<small>${riskDot(x.risk)}${esc(x.reason)}</small></span>
      <span data-l="Priority">${priPill(x.priority)}</span>
      <span data-l="Status">${badge(x.status)}</span>
      <span class="c-act"><button class="xbtn ${x.open ? 'pri' : ''} sm" data-case="${x.applicationId}" data-row="${x.course.id}">${x.open ? 'Review' : 'Open'}</button></span></div>`;
  }
  return `<div class="xtr clk" role="row" tabindex="0" data-open="${x.applicationId}" aria-label="Open ${esc(x.student.name)}">
    <span class="c-stu" data-l="Student">${avatar(x.student)}<span><b>${esc(x.student.name)}</b><small>${esc(x.student.number)}</small></span></span>
    <span class="c-crs" data-l="Courses"><b>${x.courses.total} courses</b><small>${x.courses.preApproved} pre-approved · ${x.courses.withDepartments} with departments</small></span>
    <span data-l="Previous university">${esc(x.previousUniversity)}</span>
    <span data-l="Target program"><b>${esc(x.targetProgram)}</b><small>Received ${esc(recv(x.receivedAt))}</small></span>
    <span data-l="AI match">${meter(x.matchPct)}</span>
    <span data-l="Reason" class="c-rsn">${riskDot(x.risk)}${esc(x.reason)}</span>
    <span data-l="Priority">${priPill(x.priority)}</span>
    <span data-l="Status">${badge(x.status)}</span>
    <span class="c-act"><button class="xbtn ${x.open ? 'pri' : ''} sm" data-case="${x.applicationId}">${x.open ? 'Review' : 'Open'}</button></span></div>`;
}
const processingRow = (p) => `<div class="xtr xproc" role="row"><span class="c-stu">${avatar({ initials: initials(p.student_name), tone: 'st3' })}<span><b>${esc(p.student_name)}</b><small>${p.channel === 'offline' ? 'Paper transcript' : 'Transcript'}</small></span></span><span class="c-crs"><span class="sk" style="width:70%"></span><span class="sk" style="width:45%"></span></span><span><span class="sk" style="width:80%"></span></span><span><span class="sk" style="width:60%"></span></span><span><span class="sk" style="width:50%"></span></span><span class="c-rsn">${p.transcript_status === 'processing' ? 'The agent is reading the transcript' : `Queued for the intake agent${p.process_after ? ` · scheduled ${new Date(p.process_after).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span><span></span><span>${badge(p.transcript_status === 'processing' ? 'Processing' : 'Submitted')}</span><span class="c-act">${state.user.unit === 'credit_evaluation' || state.user.role === 'admin' ? '<button class="xbtn sm" data-intake>Process now</button>' : ''}</span></div>`;
const initials = (n) => String(n || '').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function itemTable(items, { courseHeads, processing = [] } = {}) {
  const head = courseHeads ? ['Student', 'Course', 'Previous university', 'Target course', 'AI match', 'Reason', 'Priority', 'Status', ''] : ['Student', 'Courses', 'Previous university', 'Target program', 'AI match', 'Reason', 'Priority', 'Status', ''];
  const sortable = { Student: 'student', 'AI match': 'match', Priority: 'priority', Status: 'status' };
  return `<div class="xtable" role="table">
    <div class="xtr xth" role="row">${head.map((h) => (sortable[h] ? `<button class="xsort ${state.qSort === sortable[h] ? 'on' : ''}" data-sort="${sortable[h]}">${h}${state.qSort === sortable[h] ? (state.qDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>` : `<span>${h}</span>`)).join('')}</div>
    ${processing.map(processingRow).join('')}
    ${items.map(itemRow).join('')}</div>`;
}

function filterBar(subjects) {
  const f = state.qf;
  const chip = (k, v, l) => `<button class="xchip ${f[k] === v ? 'on' : ''}" data-qf="${k}" data-v="${esc(v)}">${l}</button>`;
  return `<div class="xfilters">
    <div class="xsearch">${I.search}<label class="sr-only" for="qsearch">Search</label><input id="qsearch" type="search" placeholder="Search student, university, course, subject or evaluator" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="xchips" role="group" aria-label="Status">${chip('status', 'open', 'Open')}${chip('status', 'Waiting for Confirmation', 'Waiting for confirmation')}${chip('status', 'In Review', 'In review')}${chip('status', 'Needs Information', 'Needs information')}${chip('status', 'done', 'Decided')}${chip('status', 'all', 'All')}</div>
    <label class="xsel"><span>Priority</span><select data-qsel="priority"><option value="all">All</option>${['High', 'Medium', 'Low'].map((p) => `<option ${f.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <label class="xsel"><span>Subject</span><select data-qsel="subject"><option value="all">All</option>${subjects.map((x) => `<option ${f.subject === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    ${f.category ? `<button class="xchip on xcatchip" data-qf="category" data-v="">${esc(CATS[f.category])} <span aria-hidden="true">✕</span><span class="sr-only">Clear filter</span></button>` : ''}
  </div>`;
}

/** Every row, the student name, the course and the Review button open the case. */
export function bindRows(root = document) {
  $$('[data-case]', root).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); app.openCase(b.dataset.case, b.dataset.row); }; });
  $$('.xtr[data-open]', root).forEach((row) => {
    row.onclick = (e) => { if (e.target.closest('button,a,input,select,textarea,label')) return; app.openCase(row.dataset.open, row.dataset.row); };
    row.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); app.openCase(row.dataset.open, row.dataset.row); } };
  });
  $$('[data-intake]', root).forEach((b) => {
    b.onclick = async () => { b.disabled = true; try { const r = await api.post('/intake/run'); toast(`${r.processed.length} transcript${r.processed.length === 1 ? '' : 's'} read, evaluated and routed.`); app.render(); app.refreshShell(); } catch (e) { toast(e.message, 'error'); b.disabled = false; } };
  });
}
function bindFilters(root = document) {
  $$('[data-sort]', root).forEach((b) => { b.onclick = () => { if (state.qSort === b.dataset.sort) state.qDir = state.qDir === 'asc' ? 'desc' : 'asc'; else { state.qSort = b.dataset.sort; state.qDir = 'desc'; } app.render(); }; });
  $$('[data-qf]', root).forEach((b) => { b.onclick = () => { state.qf[b.dataset.qf] = b.dataset.v; app.render(); }; });
  $$('[data-qsel]', root).forEach((s) => { s.onchange = () => { state.qf[s.dataset.qsel] = s.value; app.render(); }; });
  const q = $('#qsearch', root);
  if (q) {
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.qf.q = q.value; state.qFocus = true; app.render(); }, 250); };
    if (state.qFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); state.qFocus = false; }
  }
}

/* ------------------------------------------------------------------ */
/* dashboard                                                            */
/* ------------------------------------------------------------------ */
export async function dashboard(ctx) {
  const d = await api.get('/evaluators/me/dashboard');
  const m = d.metrics; const me = state.user;
  state.cache.navCounts = { queue: m.pendingEvaluations };
  const unit = m.unit;
  const diff = m.evaluatedToday - m.previousWorkingDay.decisions;
  const prevName = new Date(`${m.previousWorkingDay.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
  const yLabel = m.activity.length > 1 && m.previousWorkingDay.day === m.activity[m.activity.length - 2].day ? 'yesterday' : prevName;
  const max = Math.max(1, ...m.activity.map((x) => x.decisions));
  const avg = m.activity.slice(0, 13).reduce((a, x) => a + x.decisions, 0) / 13;
  const dayLbl = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  const weekend = (day) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  const cats = Object.entries(m.queueBreakdown).filter(([, n]) => n);
  if (!ctx.paint(`
  <section class="xhero ev"><div class="xhl"><div class="xey">${greet()}, ${esc(me.fullName)}</div>
      <h2 class="xht">${m.pendingEvaluations ? `${m.pendingEvaluations} ${unit}${m.pendingEvaluations > 1 ? 's' : ''} need${m.pendingEvaluations > 1 ? '' : 's'} your decision${m.highPriority ? `, ${m.highPriority} high priority` : ''}.` : "You're all caught up."}</h2>
      <div class="xhm"><span>${esc(me.title || 'Evaluator')} · ${esc(me.department || '')}</span>${m.evaluator.specializations?.length ? `<span>Specialization: ${esc(m.evaluator.specializations.join(' • '))}</span>` : ''}<span>${esc(m.season.name || '')}</span></div>
      <div class="xprin">${I.spark}<span><b>AI prepares the evidence. You make the decision.</b> Every recommendation shows why, and nothing is posted without an evaluator.</span></div></div>
    <div class="xhr">${d.upNext.length ? `<button class="xbtn pri" id="startrev">Start reviewing ${I.chev}</button>` : '<button class="xbtn" data-go="queue">Open my evaluations</button>'}</div></section>
  ${flowBand(d.flow, m)}
  <div class="xkpis xk5">
    <div class="xkpi"><span class="xki">${I.chart}</span><span class="xkl">Total evaluations</span><b class="xkv">${m.totalEvaluations.toLocaleString()}</b><span class="xks">course decisions, all time ${demoTag()}</span></div>
    <div class="xkpi k-info"><span class="xki">${I.cap}</span><span class="xkl">This season</span><b class="xkv">${m.seasonEvaluations.toLocaleString()}</b><span class="xks">${m.completionRate}% of assigned · ${esc((m.season.name || '').replace(' transfer season', ''))} ${demoTag()}</span></div>
    <div class="xkpi k-ok"><span class="xki">${ico('check')}</span><span class="xkl">Evaluated today</span><b class="xkv">${m.evaluatedToday}</b><span class="xks"><span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '↑' : diff < 0 ? '↓' : '='} ${Math.abs(diff)} ${diff === 0 ? 'same as' : 'vs'} ${esc(yLabel)}</span> · ${m.evaluatedTodayLive} recorded live</span></div>
    <button class="xkpi k-warn" data-go="queue"><span class="xki">${ico('clock')}</span><span class="xkl">Pending</span><b class="xkv">${m.pendingEvaluations}</b><span class="xks">${unit === 'request' ? 'open requests' : 'courses routed to you'}</span></button>
    <button class="xkpi k-bad" data-cat="high"><span class="xki">${ico('flag')}</span><span class="xkl">High priority</span><b class="xkv">${m.highPriority}</b><span class="xks">${m.missingInformation} missing information</span></button>
  </div>
  <div class="xgrid21">
    <section class="xcard"><div class="xch"><h3>Evaluation activity</h3><span class="xmuted">Courses you decided, last 14 days ${demoTag()}</span></div>
      <div class="xact" role="img" aria-label="Courses decided per day over the last 14 days">
        <span class="xavg" style="bottom:${(avg / max) * 100}%"><em>avg ${avg.toFixed(1)}</em></span>
        ${m.activity.map((x, i) => `<div class="xac ${i === m.activity.length - 1 ? 'today' : ''} ${weekend(x.day) ? 'we' : ''}" title="${esc(x.day)}: ${x.decisions} decided${x.live ? ` (${x.live} recorded live)` : ''}"><div class="xab2"><i class="s" style="height:${(x.historical / max) * 100}%"></i>${x.live ? `<i class="l" style="height:${(x.live / max) * 100}%"></i>` : ''}</div><span>${i === m.activity.length - 1 ? 'Today' : i % 2 ? '' : dayLbl(x.day)}</span></div>`).join('')}
      </div>
      <div class="xleg"><span><i class="r" style="background:#c6d5f3"></i>Before go-live (Synthetic Data)</span><span><i class="c"></i>Recorded in this system</span></div>
      <div class="xprod">
        <div><span>This week</span><b>${m.thisWeek}</b><small>${m.thisWeek >= m.previousWeek ? '↑' : '↓'} ${Math.abs(m.thisWeek - m.previousWeek)} vs previous week</small></div>
        <div><span>Average review time</span><b>${m.averageReviewMinutes} min</b><small>${m.averageReviewSource === 'live' ? `measured on ${m.measuredDecisions} decision${m.measuredDecisions === 1 ? '' : 's'}` : 'per course · demo baseline'}</small></div>
        <div><span>Season completion</span><b>${m.completionRate}%</b><small>${m.seasonEvaluations} decided · ${m.pendingEvaluations} pending</small></div>
      </div></section>
    <section class="xcard"><div class="xch"><h3>My queue</h3><span class="xmuted">${m.pendingEvaluations} pending</span></div>
      ${m.pendingEvaluations ? `<ul class="xqb">${cats.map(([k, n]) => `<li><button data-cat="${k}" class="qc-${k}"><i></i><span>${CATS[k]}</span><b>${n}</b>${I.chev}</button></li>`).join('')}</ul>
      <p class="xqnote">Counts overlap: an item can be high priority and missing information. Select a group to filter your queue. Nothing is approved in bulk from here.</p>`
      : empty('Nothing waiting', 'New assignments appear here automatically.')}</section>
  </div>
  <section class="xcard flush"><div class="xch pad"><h3>Up next</h3><button class="xlink" data-go="queue">View all ${d.totalItems}</button></div>
    ${d.upNext.length ? itemTable(d.upNext, { courseHeads: unit === 'course' }) : empty('No evaluations waiting for confirmation', "You're all caught up.")}</section>`)) return;
  bindRows(); bindFilters();
  $$('[data-cat]').forEach((b) => { b.onclick = () => { Object.assign(state.qf, { status: 'open', priority: 'all', subject: 'all', q: '', category: b.dataset.cat }); app.go('queue'); }; });
  const s = $('#startrev'); if (s) s.onclick = () => { const x = d.upNext[0]; app.openCase(x.applicationId, x.course?.id); };
}

/* ------------------------------------------------------------------ */
export async function queue(ctx) {
  const r = await api.get(`/evaluators/me/evaluations${qs(filters())}`);
  state.cache.navCounts = { queue: r.open };
  state.cache.queueOrder = r.items.filter((x) => x.open).map((x) => ({ applicationId: x.applicationId, courseId: x.course?.id }));
  const unitCed = r.evaluator.unit === 'credit_evaluation';
  if (!ctx.paint(`<div class="xph xphr"><p class="xmuted">${unitCed ? 'Transfer requests assigned to you by the Credit Evaluation Department. You confirm approved equivalencies and rule-based rejections, then post the final credit.' : 'Courses routed to you because they match your department and specialization.'} Sorted by priority: risk, missing evidence, deadline and waiting time. Select any row to open it.</p>
      ${r.items.some((x) => x.open) ? `<button class="xbtn pri" id="startrev">Review first in list ${I.chev}</button>` : ''}</div>
    ${filterBar(r.subjects)}
    <section class="xcard flush">${r.items.length || r.processing.length ? itemTable(r.items, { courseHeads: !unitCed, processing: r.processing }) : empty('No evaluations match these filters', r.total ? 'Try a different status or clear the filters.' : "You're all caught up.")}</section>`)) return;
  bindRows(); bindFilters();
  const s = $('#startrev'); if (s) s.onclick = () => { const x = r.items.find((y) => y.open); app.openCase(x.applicationId, x.course?.id); };
}

/* ------------------------------------------------------------------ */
export async function requests(ctx) {
  const r = await api.get(`/applications${qs(filters())}`);
  if (!ctx.paint(`<div class="xph"><p class="xmuted">${state.user.role === 'admin' || state.user.unit === 'credit_evaluation' ? 'Every transfer request in the office.' : 'Transfer requests you are working on.'} Requests are owned by the Credit Evaluation Department; individual courses may be with department evaluators.</p></div>
    ${filterBar(r.subjects)}
    <section class="xcard flush">${r.items.length || r.processing.length ? `<div class="xtable xreq" role="table"><div class="xtr xth" role="row"><span>Student</span><span>Previous university</span><span>Program</span><span>Received</span><span>Progress</span><span>Owner</span><span>Priority</span><span>Status</span><span></span></div>
      ${r.processing.map((p) => `<div class="xtr xproc" role="row"><span class="c-stu">${avatar({ initials: initials(p.student_name), tone: 'st3' })}<span><b>${esc(p.student_name)}</b><small>${p.channel === 'offline' ? 'Paper transcript' : 'Transcript'} · ${esc(p.reference)}</small></span></span><span><span class="sk" style="width:80%"></span></span><span><span class="sk" style="width:60%"></span></span><span>Today</span><span><span class="sk" style="width:70%"></span></span><span class="c-rsn">${p.transcript_status === 'processing' ? 'The agent is reading the transcript' : 'Queued for the intake agent'}</span><span></span><span>${badge(p.transcript_status === 'processing' ? 'Processing' : 'Submitted')}</span><span class="c-act">${state.user.unit === 'credit_evaluation' || state.user.role === 'admin' ? '<button class="xbtn sm" data-intake>Process now</button>' : ''}</span></div>`).join('')}
      ${r.items.map((x) => `<div class="xtr clk" role="row" tabindex="0" data-open="${x.applicationId}"><span class="c-stu" data-l="Student">${avatar(x.student)}<span><b>${esc(x.student.name)}</b><small>${esc(x.student.number)} · ${esc(x.reference)}</small></span></span>
          <span data-l="Previous university">${esc(x.previousUniversity)}</span><span data-l="Program">${esc(x.targetProgram)}</span><span data-l="Received">${esc(recv(x.receivedAt))}</span>
          <span data-l="Progress"><span class="xprog"><i style="width:${(x.summary.decided / Math.max(1, x.summary.courses)) * 100}%"></i></span><small>${x.summary.decided}/${x.summary.courses} decided</small></span>
          <span data-l="Owner" class="c-own">${avatar(x.owner)}<small>${esc(x.owner?.name || '—')}</small></span>
          <span data-l="Priority">${priPill(x.priority)}</span><span data-l="Status">${badge(x.status)}</span>
          <span class="c-act"><button class="xbtn sm" data-case="${x.applicationId}">Open</button></span></div>`).join('')}</div>` : empty('No requests match these filters', 'Try a different status or clear the search.', 'inbox')}</section>`)) return;
  bindRows(); bindFilters();
}

/* ------------------------------------------------------------------ */
export async function students(ctx) {
  const r = await api.get('/students');
  if (!ctx.paint(`<div class="xph"><p class="xmuted">Students with an active or completed transfer request.</p></div>
    <div class="xstudents">${r.items.map((s) => `<button class="xcard xstu" data-case="${s.applicationId}">${avatar(s, true)}<span class="xsn"><b>${esc(s.name)}</b><small>${esc(s.number)} · ${esc(s.intendedMajor)}</small></span>${badge(s.status)}
        <span class="xsm">${esc(s.previousUniversity)}</span><span class="xprog"><i style="width:${(s.decided / Math.max(1, s.courses)) * 100}%"></i></span><span class="xsm">${s.decided} of ${s.courses} decided · ${fmt(s.acceptedCredits)} credits accepted</span></button>`).join('') || empty('No students yet', 'Students appear once their transcript arrives.', 'users')}</div>`)) return;
  bindRows();
}

/* ------------------------------------------------------------------ */
export async function courses(ctx) {
  const r = await api.get(`/catalog/course-matches${qs({ q: state.cq })}`);
  const lv = (l) => (!l || l === '—' ? '' : `<span class="xb ${l.startsWith('Likely') ? 's-ok' : l.startsWith('Partial') ? 's-warn' : l.startsWith('Must') ? 's-info' : 's-neutral'}"><i></i>${esc(l.replace(' - syllabus review', ''))}</span>`);
  if (!ctx.paint(`<div class="xph"><p class="xmuted">BU courses and their closest Northeastern and NYU equivalents, as defined in the sponsor worksheet. "Likely equivalent" pairs seed the equivalency database the agent uses. <span class="xsrc">Source: Worksheet Data</span></p></div>
    <div class="xfilters"><div class="xsearch">${I.search}<label class="sr-only" for="cq">Search courses</label><input id="cq" type="search" placeholder="Search course code, title or notes" value="${esc(state.cq)}"></div></div>
    <section class="xcard flush"><div class="xtable crs" role="table"><div class="xtr xth"><span>BU course</span><span>Program</span><span>Northeastern</span><span>NYU</span><span>Notes</span><span>Requirement</span></div>
      ${r.items.map((m) => `<div class="xtr"><span data-l="BU course"><b class="mono">${esc(m.bu_course)}</b><small>${esc(m.bu_title)}</small></span><span data-l="Program">${esc(m.program)}</span>
        <span data-l="Northeastern"><b class="mono">${esc(m.nu_course || '—')}</b>${lv(m.nu_match_level)}</span><span data-l="NYU"><b class="mono">${esc(m.nyu_course || '—')}</b>${lv(m.nyu_match_level)}</span>
        <span data-l="Notes" class="c-rsn">${esc(m.notes || '')}</span><span data-l="Requirement">${esc(m.requirement_group || '—')}</span></div>`).join('')}</div></section>`)) return;
  const i = $('#cq');
  let t;
  i.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.cq = i.value; state.cqFocus = true; app.render(); }, 250); };
  if (state.cqFocus) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); state.cqFocus = false; }
}

/* ------------------------------------------------------------------ */
export async function team(ctx) {
  const r = await api.get('/evaluators');
  if (!ctx.paint(`<section class="xcard xroute"><div class="xch"><h3>How evaluations are assigned</h3><span class="xsrc">Mirrors today's process at BU</span></div>
      <ol class="xflow"><li><b>Credit Evaluation Department</b><span>Owns every request. Applies courses already in the equivalency database, confirms rule-based rejections, and posts the final credit. The specialist with the lightest workload takes new requests.</span></li>
        <li><b>Agent pre-evaluation</b><span>Reads the transcript, scores each course against the BU catalog and explains the recommendation.</span></li>
        <li><b>Department evaluators</b><span>Courses with no approved equivalency go to the department that owns the subject, then to the evaluator whose specialization fits the target course; program and course-level expertise and workload break ties.</span></li>
        <li><b>Final posting</b><span>When every course is decided, the Credit Evaluation owner completes the evaluation and the student is notified.</span></li></ol></section>
    <div class="xteam">${r.items.map((p) => `<section class="xcard xmem"><div class="xmh">${avatar(p, true)}<div><b>${esc(p.name)}${p.isMe ? ' <small>(you)</small>' : ''}</b><span>${esc(p.title)} · ${esc(p.department)}</span>${p.specializations?.length ? `<span class="xspec">${esc(p.specializations.join(' • '))}</span>` : ''}</div></div>
        <div class="xload"><span>${p.workload} active ${p.unit === 'credit_evaluation' ? 'request' : 'evaluation'}${p.workload === 1 ? '' : 's'} · capacity ${p.maxActiveLoad}${p.available ? '' : ' · unavailable'}</span><span class="xprog"><i style="width:${Math.min(100, (p.workload / p.maxActiveLoad) * 100)}%"></i></span></div>
        <div class="xexp">${p.subjects?.length ? `<span>Subjects: ${esc(p.subjects.join(', '))}</span>` : ''}${p.programExpertise?.length ? `<span>Programs: ${esc(p.programExpertise.join(', '))}</span>` : ''}${p.courseLevels?.length ? `<span>Levels: ${esc(p.courseLevels.join(', '))}</span>` : ''} ${srcTag(p.dataSource)}</div>
        ${p.activeItems ? `<ul class="xml">${p.activeItems.map((x) => `<li><button class="xlink" data-case="${x.applicationId}" ${x.courseEvaluationId ? `data-row="${x.courseEvaluationId}"` : ''}>${esc(x.student)}</button><span>${esc(x.label)}</span>${priPill(x.priority)}</li>`).join('') || '<li class="xmuted">No active work</li>'}</ul>` : ''}</section>`).join('')}</div>`)) return;
  bindRows();
}

/* ------------------------------------------------------------------ */
/* AI Processing → Historical Knowledge → Human Review                 */
/* ------------------------------------------------------------------ */
function flowBand(f, m) {
  if (!f) return '';
  const pct = (n) => (f.courses ? Math.round((n / f.courses) * 100) : 0);
  return `<section class="flowband" aria-label="How courses reach you">
    <div class="fb-step ai"><span class="fb-k">${I.spark} AI processing</span><b>${f.courses.toLocaleString()}</b><span>courses read from ${f.transcripts} transcript${f.transcripts === 1 ? '' : 's'}${f.transcriptsWeek ? ` · ${f.transcriptsWeek} this week` : ''}</span></div>
    <span class="fb-arr" aria-hidden="true">→</span>
    <div class="fb-step kb"><span class="fb-k">${I.brain} Historical knowledge</span><b>${f.reused.toLocaleString()}</b><span>reused from ${f.equivalencies} approved equivalencies (${pct(f.reused)}%)${f.learned ? ` · ${f.learned} learned from evaluators` : ''}</span></div>
    <span class="fb-arr" aria-hidden="true">→</span>
    <div class="fb-step hu"><span class="fb-k">${ico('user')} Human review</span><b>${(f.aiRecommended + f.manualReview).toLocaleString()}</b><span>${f.aiRecommended} AI-recommended to confirm · ${f.manualReview} manual review</span></div>
    <div class="fb-me">${m.unit === 'course' ? `<span>In your queue</span>
      <b class="p-warn-t">${f.myOpenByPath.ai_recommended || 0}</b><small>AI recommended</small>
      <b class="p-bad-t">${f.myOpenByPath.manual_review || 0}</b><small>Manual review</small>` : `<span>Your open requests</span><b>${m.pendingEvaluations}</b><small>known equivalencies are confirmed in one click</small>`}
      <span class="fb-saved">≈ ${f.hoursSaved} evaluator hours saved by reuse</span></div>
  </section>`;
}
