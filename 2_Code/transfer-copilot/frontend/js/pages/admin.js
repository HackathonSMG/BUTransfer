/**
 * Administrator pages: office impact, decision consistency, scenario validation (TC-01..TC-06,
 * replayed server-side in a rolled-back transaction) and settings (evaluator availability, demo tools).
 */
import { api } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, avatar, srcTag, stamp } from '../ui.js';

export async function dashboard(ctx) {
  const o = await api.get('/admin/overview');
  const c = o.paths; const n = Math.max(1, o.courses);
  const paths = [['Auto-applied', 'var(--ok)'], ['Evaluator decided', 'var(--accent)'], ['Precedent', 'var(--info)'], ['Needs review', 'var(--warn)'], ['Rule', 'var(--bad)']];
  const max = Math.max(...paths.map((p) => c[p[0]] || 0), 1);
  if (!ctx.paint(`
  <div class="shead"><div><div class="eyebrow">Credit Evaluation Department</div><h1>Impact</h1>
    <div class="muted">${o.applications} transfer requests · ${o.courses} transfer courses · ${o.completed} completed</div></div></div>
  <div class="kpis">
    <div class="panel kpi"><span class="eyebrow">Auto-applied</span><b>${o.autoAppliedPct}%</b><span class="muted">from equivalency database</span></div>
    <div class="panel kpi"><span class="eyebrow">No review from scratch</span><b>${o.noScratchPct}%</b><span class="muted">auto, precedent, rule or decided</span></div>
    <div class="panel kpi"><span class="eyebrow">Awaiting a decision</span><b>${o.pending}</b><span class="muted">courses, each with an AI draft</span></div>
    <div class="panel kpi"><span class="eyebrow">Equivalency rows</span><b>${o.equivalencies}</b><span class="muted">+${o.equivalenciesAdded} learned from decisions</span></div>
    <div class="panel kpi"><span class="eyebrow">Avg days to decide</span><b>${o.avgDaysBaseline}</b><span class="muted">baseline from past decisions</span></div>
  </div>
  ${o.knowledge ? `<section class="flowband adm" aria-label="Knowledge base impact">
    <div class="fb-step ai"><span class="fb-k">AI processing</span><b>${o.knowledge.paths.total}</b><span>courses read and scored</span></div><span class="fb-arr" aria-hidden="true">→</span>
    <div class="fb-step kb"><span class="fb-k">Historical knowledge</span><b>${o.knowledge.paths.known}</b><span>reused (${o.knowledge.reuseRate}%) · ${o.knowledge.active} active equivalencies, ${o.knowledge.learned} learned</span></div><span class="fb-arr" aria-hidden="true">→</span>
    <div class="fb-step hu"><span class="fb-k">Human review</span><b>${o.knowledge.paths.aiRecommended + o.knowledge.paths.manualReview}</b><span>${o.knowledge.paths.aiRecommended} AI-recommended · ${o.knowledge.paths.manualReview} manual</span></div>
    <div class="fb-me"><span>Impact</span><b>${o.knowledge.studentsBenefited}</b><small>students benefited</small><b>${o.knowledge.hoursSaved} h</b><small>evaluator time saved</small><button class="xbtn sm" data-go="knowledge">Open knowledge base</button></div></section>` : ''}
  <div class="grid2">
    <section class="panel" style="padding:18px 20px"><h2>How courses were routed</h2>
      ${paths.map(([k, col]) => `<div class="hbar"><span>${k}</span><span class="trk"><i style="width:${((c[k] || 0) / max) * 100}%;background:${col}"></i></span><span>${c[k] || 0}</span></div>`).join('')}
      <div class="eyebrow" style="margin-top:16px">Pipeline</div>
      <div class="flow"><span>Grade rule</span><em>→</em><span>Equivalency lookup</span><em>→</em><span>BU-only rule</span><em>→</em><span>Precedent</span><em>→</em><span>AI match</span><em>→</em><span>Evaluator</span><em>→</em><span>Write back</span></div>
    </section>
    <section class="panel" style="padding:18px 20px"><h2>Engine accuracy on the answer key</h2>
      <div class="tablewrap"><table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>
        <tr><td>Routing (right path for each course)</td><td class="code">${esc(o.engine.routing)}</td></tr>
        <tr><td>Matcher top-1 on ${o.engine.cases} "maybe" cases</td><td class="code">${esc(o.engine.top1)}</td></tr>
        <tr><td>Matcher top-3 on ${o.engine.cases} "maybe" cases</td><td class="code">${esc(o.engine.top3)}</td></tr>
      </tbody></table></div>
      <p class="muted" style="font-size:12.5px">${esc(o.engine.source)}. Top-1 at 68% is why the evaluator picks from a short list instead of the engine deciding alone.</p>
    </section>
  </div>
  <section class="panel" style="padding:18px 20px;margin-top:20px"><h2>Recent decisions</h2>
    ${o.recentDecisions.length ? `<div class="tablewrap"><table><thead><tr><th>Time</th><th>Student</th><th>Course</th><th>Decision</th><th>Awarded</th><th>Evaluator</th></tr></thead><tbody>
      ${o.recentDecisions.map((d) => `<tr><td class="code">${esc(stamp(d.at))}</td><td>${esc(d.student)}</td><td class="code">${esc(d.course)}</td><td>${esc(d.action)}</td><td class="code">${esc(d.award || '')}</td><td>${esc(d.evaluator)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">No decisions yet.</p>'}
  </section>
  ${simulatorShell()}`)) return;
  bindSimulator();
}

/* ---- learning flywheel what-if simulator (assumed inputs, clearly labelled) ---- */
function mulberry32(a) { return function rnd() { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function runSim(p) {
  const rnd = mulberry32(7); const w = new Float64Array(p.uniq); let tot = 0;
  for (let i = 0; i < p.uniq; i += 1) { tot += 1 / ((i + 1) ** 0.85); w[i] = tot; }
  const known = new Uint8Array(p.uniq); for (let i = 0; i < 600; i += 1) known[i] = 1;
  const out = [];
  for (let t = 0; t < 8; t += 1) {
    let auto = 0; let n = 0; const rev = new Set(); const per = Math.round(p.perYear / 2);
    for (let s = 0; s < per; s += 1) for (let c = 0; c < 7; c += 1) { const x = rnd() * tot; let lo = 0; let hi = p.uniq - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (w[m] < x) lo = m + 1; else hi = m; } n += 1; if (known[lo]) auto += 1; else rev.add(lo); }
    rev.forEach((i) => { known[i] = 1; });
    out.push({ auto: auto / n, reviews: rev.size, hManual: (rev.size * p.manual) / 60, hAi: (rev.size * p.ai) / 60 });
  }
  return out;
}
const TERMS = ['F26', 'S27', 'F27', 'S28', 'F28', 'S29', 'F29', 'S30'];
function simulatorShell() {
  const p = state.sim;
  const sl = (id, label, min, mx, step, val, unit) => `<label for="${id}">${label}<input type="range" id="${id}" min="${min}" max="${mx}" step="${step}" value="${val}"><output id="${id}-o">${val.toLocaleString()}${unit}</output></label>`;
  return `<section class="panel sim"><h2>Learning flywheel</h2>
    <p class="muted" style="margin:0">What-if model: every reviewed course is saved to the equivalency database, so later students match automatically, and the AI draft shortens every review that remains.</p>
    <div class="controls">${sl('s-per', 'Transfer students a year', 200, 2000, 100, p.perYear, '')}${sl('s-uniq', 'Distinct source courses in circulation', 10000, 60000, 5000, p.uniq, '')}${sl('s-man', 'Minutes per review today', 10, 60, 5, p.manual, ' min')}${sl('s-ai', 'Minutes per review with AI draft', 3, 30, 1, p.ai, ' min')}</div>
    <div id="simout"></div>
    <p class="note" style="margin-top:12px">Simulation with assumed inputs (not institutional data): 7 courses per student, two intakes a year, long-tail course popularity, 600 courses already in the equivalency database.</p></section>`;
}
function bindSimulator() {
  const map = { 's-per': 'perYear', 's-uniq': 'uniq', 's-man': 'manual', 's-ai': 'ai' };
  Object.entries(map).forEach(([id, k]) => { $(`#${id}`).oninput = (e) => { state.sim[k] = Number(e.target.value); $(`#${id}-o`).textContent = Number(e.target.value).toLocaleString() + (id === 's-man' || id === 's-ai' ? ' min' : ''); drawSim(); }; });
  drawSim();
}
function drawSim() {
  const d = runSim(state.sim);
  const W = 460; const H = 220; const L = 40; const R = 12; const T = 14; const B = 28; const iw = W - L - R; const ih = H - T - B; const x = (i) => L + i * (iw / (d.length - 1)); const y1 = (v) => T + ih - v * ih;
  const line = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Auto-match rate by term">${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y1(v)}" y2="${y1(v)}"/><text x="${L - 6}" y="${y1(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('')}
    ${d.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${TERMS[i]}</text>`).join('')}
    <path d="M${d.map((p, i) => `${x(i)},${y1(p.auto)}`).join(' L')} L${x(d.length - 1)},${y1(0)} L${x(0)},${y1(0)} Z" fill="var(--ok)" opacity=".12"/>
    <polyline points="${d.map((p, i) => `${x(i)},${y1(p.auto)}`).join(' ')}" fill="none" stroke="var(--ok)" stroke-width="2.5"/>${d.map((p, i) => `<circle cx="${x(i)}" cy="${y1(p.auto)}" r="${i === d.length - 1 ? 4.5 : 3}" fill="var(--ok)"/>`).join('')}</svg>`;
  const maxH = Math.max(...d.map((p) => p.hManual)) * 1.1; const y2 = (v) => T + ih - (v / maxH) * ih; const bw = iw / d.length / 2.8;
  const bars = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evaluator hours per term">${[0, 0.5, 1].map((f) => Math.round((maxH * f) / 10) * 10).map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y2(v)}" y2="${y2(v)}"/><text x="${L - 6}" y="${y2(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${d.map((p, i) => { const cx = L + (i + 0.5) * (iw / d.length); return `<rect x="${cx - bw - 1}" y="${y2(p.hManual)}" width="${bw}" height="${y2(0) - y2(p.hManual)}" fill="var(--bad)" rx="2"/><rect x="${cx + 1}" y="${y2(p.hAi)}" width="${bw}" height="${y2(0) - y2(p.hAi)}" fill="var(--accent)" rx="2"/><text x="${cx}" y="${H - 8}" text-anchor="middle">${TERMS[i]}</text>`; }).join('')}</svg>`;
  const tm = d.reduce((a, p) => a + p.hManual, 0); const ta = d.reduce((a, p) => a + p.hAi, 0);
  $('#simout').innerHTML = `<div class="charts"><div><div class="eyebrow">Courses matched automatically</div>${line}</div><div><div class="eyebrow">Evaluator hours per term</div><div class="lg"><span><i class="sw" style="background:var(--bad)"></i>Today</span><span><i class="sw" style="background:var(--accent)"></i>With co-pilot</span></div>${bars}</div></div>
    <div class="simk"><div><span class="muted">Auto-matched, first term → year four</span><b>${Math.round(d[0].auto * 100)}% → ${Math.round(d[7].auto * 100)}%</b></div><div><span class="muted">Reviews per term, first → last</span><b>${d[0].reviews.toLocaleString()} → ${d[7].reviews.toLocaleString()}</b></div><div><span class="muted">Evaluator hours saved over 4 years</span><b>${Math.round(tm - ta).toLocaleString()} h</b></div></div>`;
}

/* ------------------------------------------------------------------ */
export async function reports(ctx) {
  const r = await api.get('/admin/reports/consistency');
  const maxd = Math.max(...r.turnaround.map((e) => e.avgDays), 1);
  if (!ctx.paint(`
  <div class="shead"><div><div class="eyebrow">Quality and fairness</div><h1>Decision consistency</h1>
    <div class="muted">Same course, same outcome, whoever reviews it. Based on ${r.total} past decisions (${esc(r.dataSource)}).</div></div></div>
  <div class="kpis">
    <div class="panel kpi"><span class="eyebrow">AI agreed with evaluator</span><b>${r.aiAgreement.agreed} / ${r.aiAgreement.scored}</b><span class="muted">counting BU substitutions</span></div>
    <div class="panel kpi"><span class="eyebrow">Conflicting decisions</span><b>${r.unresolvedConflicts}</b><span class="muted">same course, different outcome</span></div>
    <div class="panel kpi"><span class="eyebrow">Turnaround spread</span><b>${Math.round(Math.min(...r.turnaround.map((e) => e.avgDays)))}–${Math.round(maxd)} days</b><span class="muted">average by evaluator</span></div>
  </div>
  <div class="grid2">
    <section class="panel card"><h2>Conflicting decisions</h2>
      ${r.conflicts.map((cf) => `<div class="cflict ${cf.standard ? 'done' : ''}"><div><span class="code">${esc(cf.course)}</span> <span class="muted">${esc(cf.institution)}</span></div>
        <div class="vs">${cf.decisions.map((p) => `<div><b class="code">${esc(p.award)}</b><div class="muted">${esc(p.evaluator)} · ${esc(p.decidedOn)} · ${esc(p.code)}</div><div style="margin-top:4px">${esc(p.reason)}</div>
          ${cf.standard ? (cf.standard === p.code ? '<div style="margin-top:6px;color:var(--ok);font-weight:600">Adopted as standard</div>' : '') : `<button class="btn" style="margin-top:8px" data-std="${esc(p.code)}">Make this the standard</button>`}</div>`).join('')}</div></div>`).join('') || '<p class="muted">No conflicts.</p>'}
    </section>
    <section class="panel card"><h2>Where the AI and evaluators differ</h2>
      <div class="tablewrap"><table><thead><tr><th>Course</th><th>AI first pick</th><th>Evaluator</th></tr></thead><tbody>
      ${r.disagreements.map((p) => `<tr><td class="code">${esc(p.course)}</td><td class="code">${esc(p.aiFirstPick)}</td><td><span class="code">${esc(p.awarded)}</span><div class="muted" style="font-size:12px">${esc(p.reason)}</div></td></tr>`).join('')}
      </tbody></table></div>
      <h2 style="margin-top:18px">Average days to decide, by evaluator</h2>
      ${r.turnaround.map((e) => `<div class="hbar"><span class="code">${esc(e.evaluator)}</span><span class="trk"><i style="width:${(e.avgDays / maxd) * 100}%;background:var(--accent)"></i></span><span>${Math.round(e.avgDays)}</span></div>`).join('')}
    </section>
  </div>`)) return;
  $$('[data-std]').forEach((b) => { b.onclick = async () => { try { const x = await api.post('/admin/reports/consistency/standards', { decisionCode: b.dataset.std }); toast(x.message); app.render(); } catch (e) { toast(e.message, 'error'); } }; });
}

/* ------------------------------------------------------------------ */
export async function scenarios(ctx) {
  ctx.paint(`<div class="shead"><div><div class="eyebrow">End-to-end validation</div><h1>Test cases</h1><div class="muted">Replaying TC-01 to TC-06 through the API services…</div></div></div><section class="panel"><span class="sk" style="width:60%"></span><span class="sk" style="width:40%"></span></section>`);
  const r = await api.get('/admin/scenarios');
  if (!ctx.paint(`
  <div class="shead"><div><div class="eyebrow">End-to-end validation</div><h1>Test cases</h1>
    <div class="muted">Each case replays the student's application from intake through the same services the screens call (engine, routing, decisions, upload, completion) inside a database transaction that is rolled back, so live data never changes. <b>${r.passed} of ${r.total} cases pass</b> their expected outcome.</div></div></div>
  <div class="tcnav">${r.scenarios.map((sc) => `<a href="#/scenarios" data-jump="${sc.id}" class="${sc.pass ? 'pass' : 'fail'}">${sc.id} · ${esc(sc.name)}</a>`).join('')}</div>
  ${r.scenarios.map((sc) => `<section class="panel tcase" id="${sc.id}">
    <div class="tchead"><div><div class="eyebrow">${sc.id}</div><h2>${esc(sc.name)}</h2><p class="muted" style="margin:0">${esc(sc.summary)}</p></div><span class="verdict ${sc.pass ? 'pass' : 'fail'}">${sc.pass ? 'PASS' : 'FAIL'}</span></div>
    <div class="tcgrid">
      <div><div class="eyebrow">Test case information</div><dl class="tci">
        <dt>Test case ID</dt><dd>${sc.id}</dd><dt>Scenario</dt><dd>${esc(sc.name)}</dd>
        <dt>Student</dt><dd>${esc(sc.student)} (${esc(sc.studentNumber)}) ${srcTag('Synthetic Data', true, true)}</dd>
        <dt>Previous university</dt><dd>${esc(sc.previousUniversity)}</dd>
        <dt>Target</dt><dd>Boston University · ${esc(sc.targetProgram)} ${srcTag('Worksheet', true, true)}</dd>
        <dt>Expected outcome</dt><dd>${esc(sc.expected.status)} · ${fmt(sc.expected.accepted)} cr accepted · ${fmt(sc.expected.rejected)} cr rejected</dd></dl></div>
      <div><div class="eyebrow">Data traceability</div><div class="tablewrap"><table class="trtab"><thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead><tbody>
        ${sc.traceability.map((t) => `<tr><td>${esc(t.field)}</td><td>${esc(t.value)}</td><td>${srcTag(t.source, true, true)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>
    <div class="eyebrow" style="margin-top:14px">Transcript</div>
    <div class="transcript">${sc.transcript.map((l) => `<div class="tl who-${l.who.toLowerCase().split(' ')[0]}"><span class="tw">${esc(l.who)}:</span><span class="tt">${esc(l.text)}</span></div>`).join('')}</div>
    <div class="eyebrow" style="margin-top:14px">Validation</div>
    <div class="tablewrap"><table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th></th></tr></thead><tbody>
      ${sc.checks.map((c) => `<tr><td>${esc(c.check)}</td><td class="code">${esc(c.expected)}</td><td class="code">${esc(c.actual)}</td><td>${c.pass ? '<span class="pill s-Confirmed">Pass</span>' : '<span class="pill s-none">Fail</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="actions"><button class="btn" data-case="${sc.applicationId}">Open ${esc(sc.student.split(' ')[0])}'s evaluation</button>${state.cache.demo ? `<button class="btn primary" data-play="${sc.id}">Play this case for real (demo)</button>` : ''}</div>
  </section>`).join('')}`)) return;
  $$('[data-jump]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); $(`#${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth' }); }; });
  $$('[data-case]').forEach((b) => { b.onclick = () => app.openCase(b.dataset.case); });
  $$('[data-play]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try { const x = await api.post(`/admin/scenarios/${b.dataset.play}/play`); toast(`${b.dataset.play} played for real${x.pass ? '' : ' (with differences)'}. Opening the evaluation.`); app.openCase(x.applicationId); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    };
  });
}

/* ------------------------------------------------------------------ */
export async function settings(ctx) {
  const [team, rules] = [await api.get('/evaluators'), await api.get('/catalog/rules')];
  if (!ctx.paint(`<div class="xgrid2">
    <section class="xcard"><div class="xch"><h3>Data sources</h3></div><p class="xmuted">Show where each value comes from: the sponsor worksheet, Synthetic Data written for the demo, or the engine.</p>
      <label class="xswitch"><input type="checkbox" id="setsrc" ${state.showSrc ? 'checked' : ''}><span></span>Show data-source labels across the portal</label></section>
    <section class="xcard"><div class="xch"><h3>Intake and demo data</h3></div><p class="xmuted">Process queued transcripts now, or restore every application to its seeded starting point (demo mode only).</p>
      <div class="xab"><button class="xbtn" id="runintake">Process intake queue</button>${state.cache.demo ? '<button class="xbtn" id="setreset">Reset demo data</button>' : ''}</div></section>
    <section class="xcard"><div class="xch"><h3>Routing rules</h3></div><ul class="xwhy"><li class="ok"><span>✓</span>Every request is owned by the Credit Evaluation Department; the specialist with the lightest workload takes it.</li><li class="ok"><span>✓</span>Courses without an approved equivalency go to the department that owns the subject.</li><li class="ok"><span>✓</span>Within a department, specialization decides; program and course-level expertise, availability and workload break ties.</li><li class="ok"><span>✓</span>Only the assigned evaluator can decide a course; only the owner can complete. Administrators cannot make academic decisions.</li></ul></section>
    <section class="xcard"><div class="xch"><h3>Transfer rules</h3></div><ul class="xml">${rules.items.map((r) => `<li><span class="mono">${esc(r.id)}</span><span><b>${esc(r.name)}</b> · ${esc(r.detail)}</span></li>`).join('')}</ul></section>
  </div>
  <section class="xcard flush"><div class="xch pad"><h3>Evaluators</h3><span class="xmuted">Availability and capacity drive routing · Synthetic Data</span></div>
    <div class="xtable evt" role="table"><div class="xtr xth"><span>Evaluator</span><span>Unit</span><span>Expertise</span><span>Workload</span><span>Capacity</span><span>Available</span></div>
    ${team.items.map((p) => `<div class="xtr"><span class="c-stu" data-l="Evaluator">${avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(p.staffCode)}</small></span></span><span data-l="Unit">${esc(p.department)}</span>
      <span data-l="Expertise" class="c-rsn">${esc([...(p.subjects || []), ...(p.specializations || [])].join(' · '))}</span><span data-l="Workload">${p.workload} active</span>
      <span data-l="Capacity"><input type="number" min="1" max="200" value="${p.maxActiveLoad}" data-cap="${p.id}" class="xin capin" aria-label="Capacity for ${esc(p.name)}"></span>
      <span data-l="Available"><label class="xswitch"><input type="checkbox" data-avail="${p.id}" ${p.available ? 'checked' : ''}><span></span><span class="sr-only">Available</span></label></span></div>`).join('')}</div></section>`)) return;
  $('#setsrc').onchange = (e) => { state.showSrc = e.target.checked; app.render(); };
  $('#runintake').onclick = async () => { try { const r = await api.post('/admin/intake/run'); toast(`${r.processed.length} transcript${r.processed.length === 1 ? '' : 's'} processed.`); app.refreshShell(); } catch (e) { toast(e.message, 'error'); } };
  const rs = $('#setreset'); if (rs) rs.onclick = async () => { rs.disabled = true; try { await api.post('/admin/demo/reset'); toast('Demo data reset.'); state.demo = {}; app.render(); app.refreshShell(); } catch (e) { toast(e.message, 'error'); rs.disabled = false; } };
  $$('[data-avail]').forEach((i) => { i.onchange = async () => { try { const r = await api.patch(`/evaluators/${i.dataset.avail}`, { isAvailable: i.checked }); toast(r.message); } catch (e) { toast(e.message, 'error'); } }; });
  $$('[data-cap]').forEach((i) => { i.onchange = async () => { try { const r = await api.patch(`/evaluators/${i.dataset.cap}`, { maxActiveLoad: Number(i.value) }); toast(r.message); } catch (e) { toast(e.message, 'error'); } }; });
}
