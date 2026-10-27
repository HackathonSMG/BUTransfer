/**
 * Equivalency knowledge base (administrators manage it; evaluators can search and read it).
 *   Library   search, filter, cursor-paginated list; detail drawer with versions, usage, evidence, aliases
 *   Insights  learning curve, courses repeatedly reviewed by hand, inconsistent decisions,
 *             equivalencies that may need re-evaluation, AI accuracy / overrides
 *   Policy    reuse and AI thresholds, optional auto-close (versioned)
 * Data: /equivalencies/*, /knowledge/*. Every change is recorded as a new equivalency version.
 */
import { api, qs } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, I, ico, dateStr, stamp, empty, kpi } from '../ui.js';

const STATUS = { active: ['Active', 's-ok'], under_review: ['Under review', 's-warn'], rejected: ['Not approved', 's-bad'], expired: ['Expired', 's-neutral'], superseded: ['Superseded', 's-neutral'] };
const ORIGIN = { worksheet: 'Sponsor worksheet', synthetic: 'Historical list', evaluator_decision: 'Learned from evaluators' };
const st = (s) => `<span class="xb ${STATUS[s]?.[1] || 's-neutral'}"><i></i>${esc(STATUS[s]?.[0] || s)}</span>`;
const isAdmin = () => state.user.role === 'admin';

export async function render(ctx) {
  const tab = isAdmin() ? state.kb.tab : 'library';
  const stats = await api.get('/knowledge/stats');
  const head = `
  <section class="xhero kbhero"><div class="xhl"><div class="xey">Institutional knowledge</div>
    <h2 class="xht">Every evaluator decision makes the next transcript faster.</h2>
    <div class="xhm"><span>${stats.active} active equivalencies</span><span>${stats.learned} learned from evaluator decisions</span><span>${stats.aliases} confirmed code aliases</span></div></div>
    <div class="xhr">${isAdmin() ? '<button class="xbtn pri" id="kbadd">Add equivalency</button>' : ''}</div></section>
  <div class="xkpis xk5">
    ${kpi('Reused decisions', stats.reuses.toLocaleString(), `${stats.reusesSeason} this season`, 'k-ok', I.brain)}
    ${kpi('Students benefited', stats.studentsBenefited, 'courses recognised instantly', 'k-info', ico('user'))}
    ${kpi('Reuse rate', `${stats.reuseRate}%`, `of ${stats.paths.total} evaluated courses`, '', I.chart)}
    ${kpi('Evaluator time saved', `${stats.hoursSaved} h`, esc(stats.assumptions), '', ico('clock'))}
    ${kpi('Needs attention', stats.underReview, `${stats.rejected} recorded rejections`, stats.underReview ? 'k-warn' : '', ico('flag'))}
  </div>
  ${isAdmin() ? `<div class="xtabs" role="tablist">${[['library', 'Knowledge base'], ['insights', 'Insights'], ['policy', 'Policy']].map(([t, l]) => `<button role="tab" class="${tab === t ? 'on' : ''}" aria-selected="${tab === t}" data-kbtab="${t}">${l}</button>`).join('')}</div>` : ''}`;
  let body = '';
  if (tab === 'library') body = await library();
  else if (tab === 'insights') body = await insights();
  else body = await policy();
  if (!ctx.paint(`${head}${body}`)) return;
  $$('[data-kbtab]').forEach((b) => { b.onclick = () => { state.kb.tab = b.dataset.kbtab; app.render(); }; });
  const add = $('#kbadd'); if (add) add.onclick = () => addForm();
  bindLibrary();
  bindPolicy();
  $$('[data-kbopen]').forEach((b) => { b.onclick = () => openDetail(b.dataset.kbopen); });
}

/* ------------------------------------------------------------------ */
/* library                                                              */
/* ------------------------------------------------------------------ */
async function library() {
  const f = state.kb;
  const r = await api.get(`/equivalencies/search${qs({ q: f.q, status: f.status, origin: f.origin, institution: f.institution, limit: 60 })}`);
  state.kb.items = r.items; state.kb.next = r.nextCursor;
  const chip = (k, v, l) => `<button class="xchip ${f[k] === v ? 'on' : ''}" data-kbf="${k}" data-v="${v}">${l}${k === 'status' && r.byStatus[v] ? ` <small>${r.byStatus[v]}</small>` : ''}</button>`;
  return `<div class="xfilters">
      <div class="xsearch">${I.search}<label class="sr-only" for="kbq">Search the knowledge base</label><input id="kbq" type="search" placeholder="Search course code, title, school, BU course or approver" value="${esc(f.q)}" autocomplete="off"></div>
      <div class="xchips" role="group" aria-label="Status">${chip('status', 'active', 'Active')}${chip('status', 'under_review', 'Under review')}${chip('status', 'rejected', 'Not approved')}${chip('status', 'expired', 'Expired')}${chip('status', 'all', 'All')}</div>
      <label class="xsel"><span>Institution</span><select data-kbsel="institution"><option value="">All</option>${r.institutions.map((i) => `<option ${f.institution === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
      <label class="xsel"><span>Origin</span><select data-kbsel="origin"><option value="all">All</option>${Object.entries(ORIGIN).map(([k, l]) => `<option value="${k}" ${f.origin === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <section class="xcard flush">${r.items.length ? `<div class="xtable kbt" role="table"><div class="xtr xth" role="row"><span>Code</span><span>Previous institution · course</span><span>Equivalent</span><span>Status</span><span>Usage</span><span>Approved</span><span>Version</span><span></span></div>
      <div id="kbrows">${r.items.map(row).join('')}</div></div>
      ${r.nextCursor ? '<div class="kbmore"><button class="xbtn" id="kbmore">Load more</button></div>' : ''}` : empty('No equivalencies match', 'Try a different status or search.', 'search')}</section>`;
}

const row = (e) => `<div class="xtr clk" role="row" tabindex="0" data-kbopen="${e.id}">
  <span class="mono" data-l="Code"><b>${esc(e.code)}</b></span>
  <span data-l="Course"><b>${esc(e.source.institution)}</b><small class="mono">${esc(e.source.code)} · ${esc(e.source.title)}</small></span>
  <span data-l="Equivalent"><b class="mono">${esc(e.award)}</b><small>${esc(e.target?.title || (e.status === 'rejected' ? 'No credit' : 'Elective credit'))}</small></span>
  <span data-l="Status">${st(e.status)}</span>
  <span data-l="Usage"><b>${e.usage.times}</b><small>${e.usage.students} student${e.usage.students === 1 ? '' : 's'} · ${e.approvals} approval${e.approvals === 1 ? '' : 's'}${e.rejections ? ` · ${e.rejections} rejection${e.rejections > 1 ? 's' : ''}` : ''}</small></span>
  <span data-l="Approved"><b>${esc(e.approvedBy || '—')}</b><small>${esc(dateStr(e.approvedOn))}${e.academicYear ? ` · ${esc(e.academicYear)}` : ''}</small></span>
  <span data-l="Version" class="mono">v${e.version}<small>${esc(ORIGIN[e.origin] || e.origin)}</small></span>
  <span class="c-act"><button class="xbtn sm" data-kbopen="${e.id}">Open</button></span></div>`;

function bindLibrary() {
  $$('[data-kbf]').forEach((b) => { b.onclick = () => { state.kb[b.dataset.kbf] = b.dataset.v; app.render(); }; });
  $$('[data-kbsel]').forEach((s) => { s.onchange = () => { state.kb[s.dataset.kbsel] = s.value; app.render(); }; });
  const q = $('#kbq');
  if (q) {
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.kb.q = q.value; state.kbFocus = true; app.render(); }, 250); };
    if (state.kbFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); state.kbFocus = false; }
  }
  $$('.kbt .xtr.clk').forEach((r) => { r.onkeydown = (e) => { if (e.key === 'Enter') openDetail(r.dataset.kbopen); }; });
  const more = $('#kbmore');
  if (more) {
    more.onclick = async () => {
      const f = state.kb;
      const r = await api.get(`/equivalencies/search${qs({ q: f.q, status: f.status, origin: f.origin, institution: f.institution, limit: 60, cursor: f.next })}`);
      state.kb.next = r.nextCursor;
      $('#kbrows').insertAdjacentHTML('beforeend', r.items.map(row).join(''));
      $$('#kbrows [data-kbopen]').forEach((b) => { b.onclick = () => openDetail(b.dataset.kbopen); });
      if (!r.nextCursor) more.remove();
    };
  }
}

/* ------------------------------------------------------------------ */
/* detail drawer                                                        */
/* ------------------------------------------------------------------ */
async function openDetail(id) {
  const box = $('#notifs');
  box.classList.add('wide');
  box.innerHTML = `<div class="dh"><b>Equivalency</b><button class="xicon" id="nclose" aria-label="Close">✕</button></div><div class="dl kbdl"><p class="xmuted">Loading…</p></div>`;
  box.hidden = false; $('#scrim').hidden = false;
  $('#nclose').onclick = () => { box.classList.remove('wide'); app.closeDrawers(); };
  let d;
  try { d = await api.get(`/equivalencies/${id}`); } catch (e) { $('.dl', box).innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const e = d.equivalency;
  const actions = isAdmin() ? [['review', 'Mark under review', e.status !== 'under_review'], ['expire', 'Mark expired', e.status !== 'expired'],
    ['activate', 'Approve / reactivate', e.status !== 'active'], ['disable', 'Disable (superseded)', e.status !== 'superseded']].filter((a) => a[2]) : [];
  $('.dl', box).innerHTML = `
    <div class="kbd-h"><div><span class="mono xmuted">${esc(e.code)} · v${e.version}</span><h3>${esc(e.source.institution)}</h3></div>${st(e.status)}</div>
    <div class="kbflow big"><span><small>${esc(e.source.institution)}</small><b class="mono">${esc(e.source.code)}</b><em>${esc(e.source.title)} · ${fmt(e.source.credits)} cr</em></span><i>→</i><span><small>Boston University</small><b class="mono">${esc(e.award)}</b><em>${esc(e.target?.title || '')}${e.target ? ` · ${fmt(e.target.credits)} cr` : ''}</em></span></div>
    ${e.statusReason ? `<div class="xinfo">${ico('flag')}<div>${esc(e.statusReason)}</div></div>` : ''}
    <dl class="kbmeta">${[['Effective from', dateStr(e.effectiveFrom)], ['Effective until', e.effectiveUntil ? dateStr(e.effectiveUntil) : 'Open-ended'], ['Academic year', e.academicYear || '—'],
      ['Course version', e.courseVersion || '—'], ['Policy version', e.policyVersion || '—'], ['Approved by', e.approvedBy || '—'], ['Approved on', dateStr(e.approvedOn)], ['Origin', ORIGIN[e.origin] || e.origin]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="kbhist"><div class="kbh-n ok"><b>${e.approvals}</b><span>approvals</span></div><div class="kbh-n bad"><b>${e.rejections}</b><span>rejections</span></div><div class="kbh-n"><b>${e.usage.times}</b><span>times reused</span></div><div class="kbh-n"><b>${e.usage.students}</b><span>students benefited</span></div></div>
    ${actions.length ? `<form class="kbact" id="kbact"><b>Change this equivalency</b><div class="kbacts">${actions.map(([a, l]) => `<label><input type="radio" name="kbaction" value="${a}"> ${l}</label>`).join('')}<label><input type="radio" name="kbaction" value="target"> Change BU course</label></div>
      <div class="kbtgt" hidden><label for="kbtgt">New BU course</label><input id="kbtgt" class="xin" placeholder="CAS CS 112"></div>
      <label for="kbreason">Reason (kept in the version history)</label><textarea id="kbreason" class="xin" rows="2" placeholder="For example: curriculum changed in 2026; credits now 3"></textarea>
      <button class="xbtn pri" type="submit">Save new version</button></form>` : ''}
    ${d.aliases.length ? `<h4>Confirmed aliases</h4><ul class="kbl">${d.aliases.map((a) => `<li><b class="mono">${esc(a.code)}</b> ${esc(a.title)}<small>${a.confidence ? `${a.confidence}% match · ` : ''}added by ${esc(a.addedBy || '—')} · ${esc(dateStr(a.at))}</small></li>`).join('')}</ul>` : ''}
    <h4>Version history</h4><ol class="kbver">${d.versions.map((v) => `<li><span class="mono">v${v.version}</span><div><b>${esc(v.change.replace('_', ' '))}</b> · ${st(v.status)} <span class="mono">${esc(v.award)}</span><small>${esc(stamp(v.at))}${v.by ? ` · ${esc(v.by)}` : ''}${v.policyVersion ? ` · policy ${esc(v.policyVersion)}` : ''}${v.effectiveUntil ? ` · until ${esc(v.effectiveUntil)}` : ''}</small>${v.reason ? `<em>${esc(v.reason)}</em>` : ''}</div></li>`).join('')}</ol>
    <h4>Evaluator decisions and evidence</h4><ul class="kbl">${d.evidence.map((x) => `<li><span class="kbk ${x.kind}">${esc(x.kind.replace('_', ' '))}</span>${esc(x.summary)}<small>${esc(stamp(x.at))}${x.aiMatchPct != null ? ` · AI ${x.aiMatchPct}%${x.aiAgreed === false ? ' (overridden)' : ''}` : ''}</small>${x.reason ? `<em>“${esc(x.reason)}”</em>` : ''}</li>`).join('') || '<li class="xmuted">No decisions recorded yet.</li>'}</ul>
    <h4>Students who benefited</h4><ul class="kbl">${d.usage.map((u) => `<li><button class="xlink" data-case="${u.applicationId}" data-row="${u.courseEvaluationId}">${esc(u.student)}</button> <span class="mono">${esc(u.course)}</span><small>${esc(stamp(u.at))} · ${esc(u.matchType)} match ${u.confidence}% · ${esc(u.outcome.replace('_', ' '))}</small></li>`).join('') || '<li class="xmuted">Not reused yet.</li>'}</ul>`;
  $$('[data-case]', box).forEach((b) => { b.onclick = () => { box.classList.remove('wide'); app.closeDrawers(); app.openCase(b.dataset.case, b.dataset.row); }; });
  const form = $('#kbact');
  if (form) {
    $$('input[name=kbaction]', form).forEach((r) => { r.onchange = () => { $('.kbtgt', form).hidden = r.value !== 'target' || !r.checked; }; });
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const a = $('input[name=kbaction]:checked', form)?.value;
      const reason = $('#kbreason').value.trim();
      if (!a) { toast('Choose what to change.', 'error'); return; }
      if (reason.length < 3) { toast('Give a reason; it is kept in the version history.', 'error'); $('#kbreason').focus(); return; }
      const body = a === 'target' ? { targetCode: $('#kbtgt').value.trim(), reason } : { action: a, reason };
      try { const r = await api.patch(`/equivalencies/${id}`, body); toast(r.message); openDetail(id); app.render(); } catch (e) { toast(e.message, 'error'); }
    };
  }
}

function addForm() {
  const box = $('#notifs');
  box.classList.add('wide');
  box.innerHTML = `<div class="dh"><b>Add an approved equivalency</b><button class="xicon" id="nclose" aria-label="Close">✕</button></div><div class="dl kbdl">
    <p class="xmuted">Use this for decisions made outside the system. Equivalencies are normally learned automatically from evaluator decisions. Duplicates are refused.</p>
    <form id="kbnew" class="kbact"><label for="kn-i">Previous institution</label><input id="kn-i" class="xin" placeholder="Lakeshore State University">
      <label for="kn-c">Course code</label><input id="kn-c" class="xin" placeholder="CS 101">
      <label for="kn-a">BU course or award</label><input id="kn-a" class="xin" placeholder="CAS CS 111">
      <label for="kn-r">Reason / authority</label><textarea id="kn-r" class="xin" rows="2" placeholder="Approved by the CS department, memo of 2026-09-14"></textarea>
      <p class="err" id="kn-err" hidden></p><button class="xbtn pri" type="submit">Save</button></form></div>`;
  box.hidden = false; $('#scrim').hidden = false;
  $('#nclose').onclick = () => { box.classList.remove('wide'); app.closeDrawers(); };
  $('#kbnew').onsubmit = async (e) => {
    e.preventDefault();
    const body = { institution: $('#kn-i').value.trim(), sourceCode: $('#kn-c').value.trim(), award: $('#kn-a').value.trim(), reason: $('#kn-r').value.trim() };
    try { const r = await api.post('/equivalencies', body); toast(r.message); box.classList.remove('wide'); app.closeDrawers(); app.render(); } catch (err) {
      const ex = err.details?.existing?.[0];
      $('#kn-err').innerHTML = `${esc(err.message)}${ex ? ` <button class="xlink" data-kbopen="${ex.id}">Review ${esc(ex.code)}</button>` : ''}`;
      $('#kn-err').hidden = false;
      $$('[data-kbopen]', box).forEach((b) => { b.onclick = () => openDetail(b.dataset.kbopen); });
    }
  };
}

/* ------------------------------------------------------------------ */
/* insights                                                             */
/* ------------------------------------------------------------------ */
function trendChart(trend) {
  const max = Math.max(1, ...trend.map((d) => d.courses));
  const W = 640; const H = 150; const bw = W / trend.length;
  const bars = trend.map((d, i) => {
    const x = i * bw + 2; const w = Math.max(2, bw - 4);
    const hr = (d.reused / max) * (H - 20); const ho = ((d.courses - d.reused) / max) * (H - 20);
    const tip = `${d.day}: ${d.courses} course${d.courses === 1 ? '' : 's'} evaluated, ${d.reused} reused from the knowledge base${d.courses ? ` (${Math.round((d.reused / d.courses) * 100)}%)` : ''}`;
    return `<g><title>${esc(tip)}</title><rect class="tb-hit" x="${i * bw}" y="0" width="${bw}" height="${H}"/>
      ${ho > 0 ? `<rect class="tb-o" x="${x}" y="${H - hr - ho - (hr > 0 ? 2 : 0)}" width="${w}" height="${ho}" rx="2"/>` : ''}
      ${hr > 0 ? `<rect class="tb-r" x="${x}" y="${H - hr}" width="${w}" height="${hr}" rx="2"/>` : ''}</g>`;
  }).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Courses evaluated per day for 30 days, split into reused from the knowledge base and evaluated from scratch">
    <line class="tb-base" x1="0" y1="${H}" x2="${W}" y2="${H}"/>${bars}
    <text x="0" y="${H + 14}">${esc(trend[0]?.day.slice(5) || '')}</text><text x="${W}" y="${H + 14}" text-anchor="end">Today</text></svg>
    <div class="xleg"><span><i class="lg-r"></i>Reused from the knowledge base</span><span><i class="lg-o"></i>Evaluated from scratch</span></div>`;
}

async function insights() {
  const r = await api.get('/knowledge/insights');
  const acc = r.aiAccuracy;
  return `<div class="xgrid2">
    <section class="xcard"><div class="xch"><h3>Learning curve</h3><span class="xmuted">Last 30 days · ${r.stats.learned} equivalencies learned</span></div>${trendChart(r.trend)}</section>
    <section class="xcard"><div class="xch"><h3>AI accuracy and overrides</h3><span class="xmuted">Evaluator decisions by AI confidence</span></div>
      ${acc.length ? `<div class="tablewrap"><table><thead><tr><th>AI confidence</th><th>Decisions</th><th>Accepted as recommended</th><th>Overridden</th></tr></thead><tbody>
        ${acc.map((a) => `<tr><td>${esc(a.band)}</td><td class="code">${a.decisions}</td><td class="code">${a.agreed + a.rejected_as_recommended} (${a.decisions ? Math.round(((a.agreed + a.rejected_as_recommended) / a.decisions) * 100) : 0}%)</td><td class="code">${a.overridden}</td></tr>`).join('')}</tbody></table></div>
        <p class="xmuted" style="font-size:12.5px">High-confidence recommendations that evaluators override are the signal to raise the AI threshold in Policy.</p>` : empty('No decisions yet', 'Decisions appear here as evaluators work.', 'chart')}</section></div>
  <div class="xgrid2">
    <section class="xcard"><div class="xch"><h3>Repeatedly reviewed by hand</h3><span class="xmuted">Same course decided twice or more, still no approved equivalency</span></div>
      ${r.repeatedReviews.length ? `<ul class="kbins">${r.repeatedReviews.map((x) => `<li><b class="mono">${esc(x.course_code)}</b> ${esc(x.title)}<small>${esc(x.institution)} · ${x.reviews} reviews · ${x.approved} approved · ${x.rejected} rejected · ${esc((x.awards || []).join(', '))}</small></li>`).join('')}</ul>` : empty('Nothing repeated', 'Every course reviewed twice has become an equivalency.')}</section>
    <section class="xcard"><div class="xch"><h3>Inconsistent decisions</h3><span class="xmuted">Same course, different outcomes</span></div>
      ${r.inconsistent.length ? `<ul class="kbins">${r.inconsistent.map((x) => `<li><b class="mono">${esc(x.course_code)}</b> ${esc(x.title)}<small>${esc(x.institution)}</small><span>${x.detail.map((d) => `<em>${esc(d.award)} · ${esc(d.evaluator || 'policy')}</em>`).join(' ')}</span></li>`).join('')}</ul>` : empty('Consistent', 'No course has conflicting decisions.')}</section></div>
  <section class="xcard"><div class="xch"><h3>May need re-evaluation</h3><span class="xmuted">Under review, rejected since approval, expiring, or older than ${r.policy.review_after_years} years</span></div>
    ${r.needsReevaluation.length ? `<div class="xtable kbt" role="table">${r.needsReevaluation.map((e) => row({ ...e })).join('')}</div>` : empty('All current', 'No equivalency needs a second look.')}</section>`;
}

/* ------------------------------------------------------------------ */
/* policy                                                               */
/* ------------------------------------------------------------------ */
async function policy() {
  const p = await api.get('/knowledge/policy');
  const n = (k, l, help, min, max) => `<label class="pol"><span><b>${l}</b><small>${help}</small></span><input type="number" class="xin" data-pol="${k}" min="${min}" max="${max}" value="${p[k]}"></label>`;
  return `<section class="xcard polcard"><div class="xch"><h3>Evaluation policy ${esc(p.policy_version)}</h3><span class="xmuted">Every change creates a new policy version; equivalencies record the version they were approved under.</span></div>
    <div class="polgrid">
      ${n('reuse_min_confidence', 'Reuse an approved equivalency at', 'Minimum knowledge-base match (%) for a course with a different code format', 50, 100)}
      ${n('ai_recommend_min_confidence', 'AI recommendation threshold', 'Below this AI match (%) a course goes to manual review', 50, 100)}
      ${n('similar_min_confidence', 'Show similar courses from', 'Similarity (%) for "similar previously evaluated courses"', 30, 100)}
      ${n('review_after_years', 'Re-evaluate equivalencies after', 'Years since approval before an equivalency is flagged', 1, 20)}
      <label class="pol"><span><b>Close known equivalencies automatically</b><small>Institutional opt-in. When on, a course that exactly matches an equivalency approved at least N times is confirmed without an evaluator (logged and shown to the student).</small></span>
        <span class="polsw"><input type="checkbox" data-pol="auto_close_known" ${p.auto_close_known ? 'checked' : ''}> <input type="number" class="xin" data-pol="auto_close_min_approvals" min="1" max="50" value="${p.auto_close_min_approvals}"> approvals</span></label>
    </div>
    <label for="polnotes" class="xcl">Notes</label><textarea id="polnotes" class="xin" rows="2">${esc(p.notes || '')}</textarea>
    <div class="xab"><button class="xbtn pri" id="polsave">Save as new policy version</button></div>
    <p class="xmuted" style="font-size:12.5px">AI-assisted evaluation, human-controlled decisions: with auto-close off (the default) every course is confirmed by an authorised evaluator.</p></section>`;
}

function bindPolicy() {
  const b = $('#polsave');
  if (!b) return;
  b.onclick = async () => {
    const body = { notes: $('#polnotes').value };
    $$('[data-pol]').forEach((i) => { body[i.dataset.pol] = i.type === 'checkbox' ? i.checked : Number(i.value); });
    try { const r = await api.patch('/knowledge/policy', body); toast(r.message); app.render(); } catch (e) { toast(e.message, 'error'); }
  };
}
