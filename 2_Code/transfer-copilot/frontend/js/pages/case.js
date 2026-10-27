/**
 * Evaluation detail page: case summary, "What needs your attention?", side-by-side course comparison,
 * AI recommendation with "Why?", evidence, similar evaluations, decision panel, history, prev/next and
 * keyboard shortcuts. All data from GET /evaluations/:id; every action is an API call.
 */
import { api, qs } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, I, ico, badge, priPill, avatar, empty, bandPill, riskDot, matchCls, matchLabel, REC_CLS, srcTag, stamp, CH_SHORT, dateStr, pathPill } from '../ui.js';
import { reasonBanner, knowledgePanel, duplicateGuard, activityStrip, extractionTab } from './case-kb.js';

let current = null; // last loaded case DTO
const REC_LABEL = { Accept: 'Accept transfer', 'Accept as elective': 'Accept as elective credit', 'Partial credit': 'Accept with partial credit', Reject: 'Do not transfer', 'Needs info': 'Request more information' };
const ACCEPTISH = (d) => ['Accept', 'Accept as elective', 'Partial credit'].includes(d);
const isPending = (c) => c.state === 'pending' || c.state === 'info_requested';
const DEC_LABEL = { pending: 'Needs your decision', info_requested: 'Info requested', confirmed: 'Accepted', rejected: 'Rejected', overridden: 'Overridden' };
const DEC_CLS = { pending: 'd-pend', info_requested: 'd-info', confirmed: 'd-ok', rejected: 'd-bad', overridden: 'd-ovr' };

/* ------------------------------------------------------------------ */
function why(c) {
  const rc = c.recommendation; const out = [];
  (rc.criteria || []).forEach((k) => {
    if (k.key === 'content') out.push([k.status === 'ok' ? 'ok' : 'warn', `${k.value} content overlap with the BU course`]);
    if (k.key === 'credits') out.push([k.status === 'ok' ? 'ok' : 'warn', k.status === 'ok' ? 'Same credit hours' : `Credit hours differ (${k.value})`]);
    if (k.key === 'level') out.push([k.status === 'ok' ? 'ok' : 'warn', k.status === 'ok' ? 'Equivalent course level' : `Course level differs (${k.value})`]);
    if (k.key === 'worksheet') out.push([k.status === 'ok' ? 'ok' : 'warn', `Worksheet lists the pair as ${k.value.replace(' - syllabus review', ' (syllabus review)')}`]);
  });
  (rc.reasons || []).forEach(([k, t]) => { if (!/match\)$|meets the C minimum/.test(t)) out.push([k, t]); });
  if (rc.coveredTopics?.length) out.push(['ok', `Shared learning outcomes: ${rc.coveredTopics.slice(0, 4).join(', ')}`]);
  if (rc.missingTopics?.length) out.push(['warn', `Not found in the previous course: ${rc.missingTopics.slice(0, 3).join(', ')}`]);
  return out;
}
function cmpRows(c) {
  const k = (key) => (c.recommendation.criteria || []).find((x) => x.key === key);
  const ct = k('content'); const lv = k('level'); const op = c.analysis.outcomePct; const cp = c.analysis.creditPct;
  const gradeOk = !(c.recommendation.exceptions || []).includes('Grade below C') && c.source.grade !== 'W';
  const pre = c.prerequisites || { status: 'Not in data' };
  return [
    ['Content match', ct ? ct.value : '—', ct ? ct.score * 100 : 0, !ct ? 'na' : ct.score >= 0.85 ? 'ok' : ct.score >= 0.7 ? 'mid' : 'warn'],
    ['Learning outcomes', op == null ? '—' : `${op}%`, op || 0, op == null ? 'na' : op >= 85 ? 'ok' : op >= 60 ? 'mid' : 'warn', c.recommendation.missingTopics?.length ? `Not found: ${c.recommendation.missingTopics.slice(0, 4).join(', ')}` : ''],
    ['Credit equivalency', cp == null ? '—' : `${cp}%`, cp || 0, cp == null ? 'na' : cp === 100 ? 'ok' : 'warn', cp != null && cp !== 100 ? `${fmt(c.source.requestedCredits)} → ${c.recommendation.targetCredits} credits` : ''],
    ['Course level', lv ? (lv.status === 'ok' ? 'Equivalent' : 'Differs') : '—', lv ? lv.score * 100 : 0, !lv ? 'na' : lv.status === 'ok' ? 'ok' : 'warn', lv && lv.status !== 'ok' ? lv.value : ''],
    ['Grade requirement', gradeOk ? 'Satisfied' : 'Not met', gradeOk ? 100 : 15, gradeOk ? 'ok' : 'bad', `${c.source.grade} · C minimum`],
    ['Prerequisites', pre.status, pre.status === 'Compatible' || pre.status === 'None required' ? 100 : pre.status === 'Check' ? 50 : 0,
      pre.status === 'Compatible' || pre.status === 'None required' ? 'ok' : pre.status === 'Check' ? 'warn' : 'na',
      pre.required?.length ? `${pre.required.join(', ')}${pre.satisfied?.length ? ` · covered by ${pre.satisfied.map((s) => `${s.by}`).join(', ')}` : ''}${pre.missing?.length ? ` · not on transcript: ${pre.missing.join(', ')}` : ''}` : pre.status === 'None required' ? `No prerequisites listed for ${c.target?.code || 'the target course'}` : 'Prerequisite data is not in the data set'],
  ];
}

function decisionBox(c) {
  return `<div class="decbox ${DEC_CLS[c.state]}"><div><b>Final decision:</b> <span class="code">${esc(c.suggestion)}</span> · ${fmt(c.credits)} cr
    <span class="muted">· ${esc(DEC_LABEL[c.state])}${c.decision?.by ? ` by ${esc(c.decision.by)}` : ''}${c.decision?.at ? ` · ${esc(stamp(c.decision.at))}` : ''}</span></div>
    ${c.state === 'overridden' ? `<div class="muted">The AI had recommended ${esc(c.recommendation.decision)}: ${esc(c.recommendation.award)}</div>` : ''}
    ${c.decision?.note ? `<div>Comment: ${esc(c.decision.note)}</div>` : ''}
    ${c.permissions.canReopen ? `<button class="btn ghost sm" data-reopen="${c.id}">Reopen</button>` : ''}</div>`;
}

function overrideForm(c) {
  const opts = c.overrideOptions || [];
  return `<form class="ovr" data-ovrform="${c.id}">
    <div class="eyebrow">Override the recommendation</div>
    <div class="ovrow"><label for="ov-a-${c.id}">Award</label><select id="ov-a-${c.id}">${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>
      <label for="ov-c-${c.id}">Credits</label><input id="ov-c-${c.id}" type="number" min="0" max="12" step="0.01" value="${fmt(c.source.requestedCredits)}"></div>
    <label for="ov-r-${c.id}">Reason (required, shown to the student and kept for audit)</label>
    <textarea id="ov-r-${c.id}" rows="2" placeholder="Why your decision differs from the AI recommendation"></textarea>
    <div class="actions"><button class="btn primary" type="submit">Save override</button><button class="btn ghost" type="button" data-cancelovr>Cancel</button></div>
  </form>`;
}

function oneLine(c, kind) {
  const rc = c.recommendation; const pend = c.state === 'pending';
  const to = pend ? rc.award : c.suggestion;
  const credits = pend ? (kind === 'rej' ? 0 : rc.credits) : c.credits;
  const km = rc.knowledgeMatch;
  const whyTxt = kind === 'rej' ? rc.rejectCause : rc.equivalencyCode ? `Approved equivalency ${rc.equivalencyCode}${km && km.type !== 'exact' ? ` · ${km.type === 'alias' ? 'known alias' : `${km.confidence}% knowledge-base match`}` : ''}${km?.timesUsed ? ` · reused ${km.timesUsed}×` : ''}` : (rc.reasons || [])[0]?.[1] || '';
  const act = !pend ? `<span class="dchip ${DEC_CLS[c.state]}">${esc(DEC_LABEL[c.state])}</span>`
    : !c.permissions.canDecide ? '' : kind === 'rej' ? `<button class="btn sm rejb" data-act="reject" data-id="${c.id}">Reject</button>` : `<button class="btn sm accb" data-act="confirm" data-id="${c.id}">Accept</button>`;
  return `<div class="prow ${kind}" id="cc-${c.id}">
    <span class="pfrom"><span class="code">${esc(c.source.code)}</span> <span class="pt">${esc(c.source.title)}</span><span class="pm">${fmt(c.source.requestedCredits)} cr · ${esc(c.source.grade)}${c.source.creditSystem === 'Quarter' ? ' · quarter' : ''}</span></span>
    <span class="parr" aria-hidden="true">→</span>
    <span class="pto">${kind === 'rej' && pend ? `<span class="code">No credit</span><span class="pm">${esc(whyTxt)}</span>` : `<span class="code">${esc(to)}</span> <span class="pt">${esc(c.target?.code === to ? c.target.title : '')}</span><span class="pm">${fmt(credits)} cr${kind !== 'rej' && rc.matchPct != null ? ` · ${rc.matchPct}% match` : ''}${kind !== 'rej' && whyTxt ? ` · ${esc(whyTxt)}` : ''}</span>`}</span>
    <span class="pact">${act}<button class="linkbtn" data-tog="${c.id}" aria-expanded="false">Details</button></span>
  </div>`;
}

function cmpCard(cs, c) {
  const rc = c.recommendation; const id = c.id; const a = c.analysis; const pct = rc.matchPct;
  const act = c.permissions.canDecide; const info = c.state === 'info_requested';
  const reasons = why(c); const rows = cmpRows(c); const ev = c.evidence || []; const sim = c.similar || {};
  const diffs = rows.filter((x) => ['warn', 'bad'].includes(x[3]));
  const mDiff = rc.missingTopics?.length ? `Topics in the BU course not found in the previous course: ${rc.missingTopics.slice(0, 4).join(', ')}.` : '';
  const prim = rc.decision === 'Reject' ? 'reject' : rc.decision === 'Needs info' ? 'info' : 'confirm';
  const btn = (k, label, klass) => `<button class="xbtn ${klass}" data-act="${k}" data-id="${id}" ${k === 'confirm' && rc.decision === 'Needs info' ? 'aria-disabled="true" title="Information is missing. Request it first."' : ''}>${label}<kbd>${{ confirm: 'A', reject: 'R', info: 'I', ovr: 'O' }[k]}</kbd></button>`;
  const miss = a.missingInfo || [];
  const side = (lbl, s, extra, prev) => `<section class="xcs"><div class="xcl">${lbl} ${srcTag(s?.dataSource)}</div><div class="xcc">${esc(s?.code || '—')}</div><div class="xct">${esc(s?.title || 'No direct equivalent')}</div>
      <dl class="xcd"><div><dt>University</dt><dd>${esc(s?.institution || '—')}</dd></div><div><dt>Credits</dt><dd>${esc(prev ? `${fmt(s.sourceCredits)}${s.creditSystem === 'Quarter' ? ` qtr (${fmt(s.requestedCredits)} BU)` : ''}` : s?.credits ?? '—')}</dd></div>${extra}</dl>
      ${s?.description ? `<p class="xdesc">${esc(s.description)}</p>` : '<p class="xdesc miss">No course description on file.</p>'}
      <div class="xlo"><b>Learning outcomes</b>${s?.learningOutcomes ? `<span>${esc(s.learningOutcomes)}</span>` : '<span class="miss">Not on file</span>'}</div>
      <div class="xlo"><b>Prerequisites</b>${s?.prerequisites ? `<span>${esc(s.prerequisites)}</span> ${srcTag('Synthetic Data')}` : '<span class="xmuted">Not in the data set</span>'}</div>
      ${s?.syllabus ? `<details class="xsy"><summary>Syllabus${prev && s.contentSource === 'Student upload' ? ' · uploaded by the student' : ''}</summary><p>${esc(s.syllabus)}</p></details>` : `<div class="xlo"><b>Syllabus</b><span class="${prev ? 'miss' : 'xmuted'}">${prev ? 'Not provided' : 'Not on file'}</span></div>`}</section>`;
  const routeTo = c.routing.evaluator;
  return `<article class="xcmp ${act ? 'mine' : ''} ${state.focusCourse === id ? 'focus' : ''}" id="cc-${id}" data-card="${id}">
    <header class="xcmph"><div>${badge(c.statusLabel)}<span class="xrisk">${riskDot(a.risk)}${esc(a.risk)} risk</span>${routeTo ? `<span class="xrt">${avatar(routeTo)} ${esc(routeTo.name)} · ${esc(routeTo.department)}</span>` : ''}${c.infoReceivedAt && isPending(c) ? '<span class="xb s-info"><i></i>Student sent information</span>' : ''}</div>
      <div class="xexs">${pathPill(c.evaluationPath)}${(a.hardExceptions || []).map((e) => `<span class="xex">${esc(e)}</span>`).join('')}${c.source.scan && c.source.scan.confidence < 85 ? `<span class="xex">Scanned grade ${esc(c.source.scan.read)} · ${c.source.scan.confidence}% OCR confidence</span>` : ''}</div></header>
    ${reasonBanner(c)}
    ${isPending(c) && !info && miss.length && ((miss.includes('syllabus') && a.band !== 'High') || miss.includes('course description')) ? `<div class="xmiss">${ico('flag')}<div><b>Missing information</b><span>The ${esc(miss.join(' and '))} for ${esc(c.source.code)} ${miss.length > 1 ? 'are' : 'is'} unavailable. This may affect the confidence of the recommendation.</span></div>${act ? `<button class="xbtn sm" data-act="info" data-id="${id}">Request information</button>` : ''}</div>` : ''}
    <div class="xcmpg">
      ${side('Previous course', { ...c.source, credits: c.source.sourceCredits }, `<div><dt>Grade</dt><dd class="${rows[4][3] === 'bad' ? 'bad' : ''}">${esc(c.source.grade)}</dd></div><div><dt>Term</dt><dd>${esc(c.source.term)}</dd></div>`, true)}
      <div class="xcmid"><div class="xring ${matchCls(pct)}" style="--p:${pct || 0}"><b>${pct == null ? '—' : `${pct}%`}</b><span>AI match</span></div><span class="xml2">${matchLabel(pct)}</span><span class="xcr">${fmt(c.source.requestedCredits)} → ${c.target ? c.target.credits : '—'} credits</span></div>
      ${side('Target course', c.target, `<div><dt>Requirement</dt><dd>${esc(c.target?.requirement || '—')}</dd></div><div><dt>Required grade</dt><dd>C or higher</dd></div>`, false)}
    </div>
    <div class="xcmpb">
      <section class="xcomp"><div class="xcl">Comparison</div>
        ${rows.map(([n, v, w, k, note]) => `<div class="xcrow ${k}"><span>${n}</span><span class="xcrt ${k === 'mid' ? 'warn' : k}"><i style="width:${Math.round(w)}%"></i></span><b>${esc(v)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`).join('')}
        ${diffs.length ? `<div class="xdiffs"><b>Differences to check</b> ${diffs.map((x) => esc(x[0])).join(' · ')}</div>` : '<div class="xdiffs ok"><b>No material differences found.</b></div>'}
      </section>
      <section class="xrec ${REC_CLS[rc.decision] || ''}">
        <div class="xrech"><span class="xai">${I.spark} AI recommendation</span><span class="xmuted">You decide</span></div>
        <div class="xrdec"><b>${esc(REC_LABEL[rc.decision])}</b>${rc.award && ACCEPTISH(rc.decision) ? `<span class="mono">${esc(rc.award)} · ${fmt(rc.credits)} cr</span>` : ''}</div>
        <div class="xconf"><span>AI confidence <b>${pct == null ? '—' : `${pct}%`}</b></span>${bandPill(a.band)}</div>
        <p class="xbandtxt">${esc(a.bandText)}</p>
        <div class="xbec">Why?</div>
        <ul class="xwhy">${reasons.slice(0, 5).map(([k, t]) => `<li class="${k}"><span>${k === 'ok' ? '✓' : k === 'warn' ? '!' : '✕'}</span>${esc(t)}</li>`).join('')}</ul>
        ${mDiff && ACCEPTISH(rc.decision) ? `<div class="xminor"><b>⚠ Difference:</b> ${esc(mDiff)}</div>` : ''}
        ${rc.partial ? `<div class="xpart"><b>Partial credit.</b> ${fmt(rc.partial.applied_credits)} credits → ${esc(rc.partial.applied)}; ${fmt(rc.partial.elective_credits)} credit → general elective. ${esc(rc.partial.note)}.</div>` : ''}
        ${rc.candidates?.length > 1 ? `<div class="xcand">Other candidates considered: ${rc.candidates.slice(0, 3).filter((x) => x.bu_course !== rc.targetCode).map((x) => `<span class="mono">${esc(x.bu_course)}</span> (${Math.round(x.score * 100)}%)`).join(' · ')}</div>` : ''}
        <div class="xcand">Generated ${esc(stamp(rc.generatedAt))} · ${esc(rc.engineVersion || '')} · version ${rc.version}${rc.trigger === 'student_upload' ? ' · re-scored with the student\'s upload' : ''}</div>
      </section>
    </div>
    <div class="xcmpf">
      ${knowledgePanel(c)}
      <details class="xevd"><summary><b>Evidence used</b> <span class="xmuted">${ev.filter((e) => e.available).length} of ${ev.length} sources</span><span class="xevchips">${ev.map((e) => `<span class="${e.available ? 'ev-y' : 'ev-n'}">${e.available ? '✓' : '✕'} ${esc(e.label)}</span>`).join('')}</span></summary>
        <div class="xevl">${ev.map((e) => `<details><summary><span class="${e.available ? 'ev-y' : 'ev-n'}">${e.available ? '✓' : '✕'}</span>${esc(e.label)}${e.source ? ` <small class="xmuted">· ${esc(e.source)}</small>` : ''}</summary><p>${esc(e.content || '').replace(/\n/g, '<br>')}</p></details>`).join('')}
        <div class="xsrcline">Match score and recommendation: System-generated · Course codes and credits: ${esc(c.source.dataSource)} · Grades, descriptions and syllabi: ${esc(c.source.contentSource)}</div></div></details>
      <details class="xevd xsim"><summary><b>Similar evaluations</b> <span class="xmuted">${sim.sameCourse?.count ? `${sim.sameCourse.count} past decision${sim.sameCourse.count > 1 ? 's' : ''} on ${esc(c.source.code)}` : sim.sameTarget?.count ? `${sim.sameTarget.count} on ${esc(rc.targetCode)}` : 'none on record'}${sim.thisSystem?.length ? ` · ${sim.thisSystem.length} in this system` : ''}</span><span class="xdemo">Synthetic Data</span></summary>
        <div class="xsimg">
          <div><span>${esc(c.source.institution)} ${esc(c.source.code)}</span>${sim.sameCourse?.count ? `<b>${sim.sameCourse.count}</b><small>${sim.sameCourse.granted} credit granted · ${sim.sameCourse.noCredit} no credit${sim.sameCourse.mostCommon ? ` · most often ${esc(sim.sameCourse.mostCommon)}` : ''}${sim.sameCourse.avgDays ? ` · ${sim.sameCourse.avgDays} days to decide` : ''}</small>` : '<b>0</b><small>Not evaluated before</small>'}</div>
          <div><span>Any course → ${esc(rc.targetCode || '—')}</span>${sim.sameTarget?.count ? `<b>${sim.sameTarget.count}</b><small>${sim.sameTarget.granted} credit granted · ${sim.sameTarget.noCredit} no credit</small>` : '<b>0</b><small>No other decisions</small>'}</div>
          <div><span>Decided in this system</span><b>${sim.thisSystem?.length || 0}</b><small>${sim.thisSystem?.length ? sim.thisSystem.slice(0, 2).map((x) => `${esc(x.student)}: ${esc(x.award)}`).join(' · ') : 'Same course for other students'}</small></div>
        </div>
        ${sim.decisions?.length ? `<ul class="xsiml">${sim.decisions.map((p) => `<li><span class="mono">${esc(p.code)}</span> ${esc(p.decidedOn)} · <b>${esc(p.decision)}</b> → ${esc(p.award)}<small>${esc(p.reason)}</small></li>`).join('')}</ul>` : ''}
        <p class="xsimnote">Past decisions are Synthetic Data written for the demo, not real BU precedent.</p></details>
    </div>
    ${!isPending(c) ? `<div class="xdone">${decisionBox(c)}</div>` : info ? `<div class="xinfo">${ico('clock')}<div><b>Waiting on the student.</b> ${esc(cs.informationRequests.find((q) => q.courseEvaluationId === id && q.status === 'open')?.message || '')}</div></div>` : act ? `<div class="xacts">
        <div class="xdeclbl">Your decision <span class="xmuted">· the student sees your comment, not the AI wording</span></div>
        <label class="sr-only" for="cm-${id}">Comment for the student</label><input id="cm-${id}" class="cin xin" placeholder="Comment for the student (required to reject)" value="${esc(state.draft[id] || '')}">
        <div class="xab">
          ${prim === 'confirm' ? btn('confirm', `${ico('check')} Confirm transfer`, 'ok') : ''}
          ${prim === 'reject' ? `<button class="xbtn bad solid" data-act="reject" data-id="${id}">Confirm rejection<kbd>R</kbd></button>` : ''}
          ${prim === 'info' ? btn('info', 'Request more information', 'pri') : ''}
          ${prim !== 'info' ? btn('info', 'Request more information', '') : ''}
          ${prim !== 'reject' ? btn('reject', 'Reject', 'bad') : ''}
          ${prim === 'reject' ? btn('ovr', 'Grant credit instead…', '') : btn('ovr', 'Override recommendation', 'ghost')}</div>
        ${state.disagree === id ? `<form class="xdis" data-disagree="${id}"><b>You are overriding the AI recommendation (${esc(REC_LABEL[rc.decision])}).</b><label for="dis-${id}">Reason, shown to the student as the rejection reason and kept for audit</label><textarea id="dis-${id}" rows="2" placeholder="For example: the syllabus does not cover hash tables or heaps, which CS 112 requires.">${esc(state.draft[id] || '')}</textarea><div class="xab"><button class="xbtn bad solid" type="submit">Confirm override and reject</button><button class="xbtn ghost" type="button" data-cancel-dis>Cancel</button></div></form>` : ''}
        ${state.overrideFor === id ? overrideForm(c) : ''}<p class="err" id="er-${id}" hidden></p></div>`
      : `<div class="xlock">${ico('user')} ${routeTo ? `Assigned to ${esc(routeTo.name)}.` : ''} You can read the evaluation; only the assigned evaluator can decide.</div>`}
  </article>`;
}

/* ------------------------------------------------------------------ */
export async function render(ctx, params) {
  const id = params.id;
  const cs = await api.get(`/evaluations/${id}`);
  let order = [];
  if (state.user.role === 'evaluator') {
    try { order = (await api.get('/evaluators/me/evaluations?status=open')).items.map((x) => x.applicationId).filter((v, i, a) => a.indexOf(v) === i); } catch { /* optional */ }
    if (!state.caseOpenedAt[id]) { state.caseOpenedAt[id] = Date.now(); api.post(`/evaluations/${id}/open`).catch(() => {}); }
  }
  if (ctx.stale()) return;
  current = cs;
  if (params.course && !state.focusCourse) state.focusCourse = params.course;
  paint(ctx, cs, order);
}

function paint(ctx, cs, order) {
  const s = cs.student; const app0 = cs.application; const sm = cs.summary; const p = cs.permissions;
  app.setTitle(s.name, ['Transfer Management', 'Student Evaluation', s.name]);
  const tab = state.rqTab || 'courses';
  const courses = cs.courses;
  const mine = courses.filter((c) => c.permissions.canDecide && c.routing.routed);
  const pre = courses.filter((c) => c.analysis.isPreApproved);
  const rej = courses.filter((c) => c.analysis.isRecommendedRejection);
  const others = courses.filter((c) => c.routing.routed && isPending(c) && !c.permissions.canDecide);
  const decided = courses.filter((c) => !isPending(c));
  const ownerReview = courses.filter((c) => !c.routing.routed && isPending(c) && !c.analysis.isPreApproved && !c.analysis.isRecommendedRejection);
  const pend = courses.filter(isPending);
  const asks = cs.informationRequests.filter((q) => q.status === 'open' && !q.courseEvaluationId);
  const pos = order.indexOf(app0.id); const prev = pos > 0 ? order[pos - 1] : null; const next = pos >= 0 ? order[pos + 1] : order.find((x) => x !== app0.id);
  const sect = (title, sub, list, body, extra = '') => (list.length ? `<section class="xsec"><div class="xsech"><div><h3>${title} <span class="xcnt">${list.length}</span></h3><p>${sub}</p></div>${extra}</div>${body}</section>` : '');
  const lineOrCard = (c, kind) => (state.open[c.id] ? cmpCard(cs, c) : oneLine(c, kind));
  const hist = cs.history;
  const allPreOrRej = pend.length && pend.every((c) => c.analysis.isPreApproved || c.analysis.isRecommendedRejection) && !asks.length;
  const banner = p.isOwner && !app0.completedAt ? (allPreOrRej && !others.length
    ? `<div class="banner ok"><span class="bico">${ico('check')}</span><div><b>Everything here matches a recommendation.</b> ${pre.length} pre-approved match${pre.length === 1 ? '' : 'es'}${rej.length ? ` and ${rej.length} recommended rejection${rej.length > 1 ? 's' : ''}` : ''}. Scan the lines below, then finish in one click.</div><button class="btn primary" data-bulk="approve_all_and_complete">Approve all ${pend.length} and complete</button></div>`
    : !pend.length && !asks.length ? `<div class="banner ok"><span class="bico">${ico('check')}</span><div><b>Every course has a decision.</b> Complete the evaluation to post the credit to the student's record.</div><button class="btn primary" data-complete>Complete evaluation</button></div>` : '') : '';
  if (!ctx.paint(`
  <div class="xcasebar"><button class="xlink" data-go="${state.user.role === 'admin' ? 'requests' : 'queue'}">← ${state.user.role === 'admin' ? 'Transfer requests' : 'My evaluations'}</button>
    ${state.user.role === 'evaluator' ? `<span class="xnav">${prev ? `<button class="xbtn sm ghost" data-case="${prev}" title="Previous case ( [ )">← Previous</button>` : '<button class="xbtn sm ghost" aria-disabled="true">← Previous</button>'}
      <span class="xmuted">${pos >= 0 ? `${pos + 1} of ${order.length} open` : `${order.length} open`}</span>
      ${next ? `<button class="xbtn sm ghost" data-case="${next}" title="Next case ( ] )">Next →</button>` : '<button class="xbtn sm ghost" aria-disabled="true">Next →</button>'}</span>
    <button class="xlink xkbd" id="kbdhelp">Keyboard shortcuts <kbd>?</kbd></button>` : ''}</div>
  <section class="xcard xsumm">
    <div class="xsid">${avatar(s, true)}<div><h2>${esc(s.name)}</h2><div class="xcsub">${esc(s.targetProgram)} · from ${esc(s.previousUniversity)}</div>
      <div class="xcm">${badge(app0.statusLabel)}${priPill(cs.priority)}<span class="xmuted">${esc((cs.priority.why || []).slice(0, 2).join(' · '))}</span></div>
      <div class="xchr"><button class="xbtn sm" data-tx="${app0.id}">${I.doc} Transcript</button><span class="xmuted mono">${esc(s.number)} · ${esc(app0.reference)} · ${esc(CH_SHORT[app0.intake.channel] || '')}</span></div></div></div>
    <div class="xsnum">
      <div><b>${sm.courses}</b><span>Courses submitted</span></div>
      <div class="o"><b>${sm.recommended}</b><span>Recommended</span></div>
      <div class="w"><b>${sm.needReview}</b><span>Need review</span></div>
      <div class="b"><b>${sm.notRecommended}</b><span>Not recommended</span></div>
      <div class="w"><b>${sm.needInformation}</b><span>Need information</span></div>
      <div class="cr"><b>${fmt(sm.creditsRecommended)}</b><span>Credits recommended</span></div>
      <div class="cr"><b>${fmt(sm.creditsPending)}</b><span>Credits pending</span></div>
      <div class="cr o"><b>${fmt(sm.accepted)}</b><span>Credits accepted</span></div>
    </div>
    <div class="xoconf"><div class="xring sm ${matchCls(sm.overallConfidence)}" style="--p:${sm.overallConfidence || 0}"><b>${sm.overallConfidence ?? '—'}%</b></div><div><span class="xcl">Overall transfer confidence</span><b class="xrl">${riskDot(sm.risk)}${esc(sm.risk)} risk</b><small>Credit-weighted AI match across scored courses${sm.highRiskCourses ? ` · ${sm.highRiskCourses} high-risk course${sm.highRiskCourses > 1 ? 's' : ''}` : ''}</small></div></div>
    <div class="xnext"><b>What happens next</b><span>${esc(cs.nextStep)}</span><div class="xprog"><i style="width:${(sm.decided / Math.max(1, sm.courses)) * 100}%"></i></div><small class="xmuted">${sm.decided} of ${sm.courses} courses decided</small></div>
  </section>
  <div class="xgrid3 xcase3">
    <section class="xcard xattnc ${cs.attention.length ? '' : 'calm'}"><div class="xch"><h3>What needs your attention?</h3><span class="xmuted">${cs.attention.length} item${cs.attention.length === 1 ? '' : 's'}</span></div>
      ${asks.map((q) => `<div class="xatt i"><span class="xatic">${ico('clock')}</span><div><b>Waiting on the student</b><small>${esc(q.message)}</small></div></div>`).join('')}
      ${cs.attention.length ? `<ul class="xatl">${cs.attention.map((x) => `<li><button class="xatt ${x.risk.toLowerCase()} ${x.mine ? '' : 'other'}" data-jump="${x.courseEvaluationId}"><span class="xatic">⚠</span><div><b class="mono">${esc(x.code)} → ${esc((x.targetCode || '—').replace('CAS ', ''))}</b><small>${x.matchPct != null ? `${x.matchPct}% match · ` : ''}${esc(x.issue)}${x.moreIssues ? ` · +${x.moreIssues}` : ''}</small>${x.mine ? '' : `<small class="xwho">With ${esc(x.with || '')}</small>`}</div>${I.chev}</button></li>`).join('')}</ul>`
        : empty('Nothing unusual', pre.length ? `${pre.length} pre-approved match${pre.length > 1 ? 'es' : ''} ${p.isOwner ? 'ready for you to confirm' : 'handled by Credit Evaluation'}.` : 'Every course is straightforward.')}
      ${p.isOwner && pre.length && !app0.completedAt ? `<p class="xstraight">${ico('check')} <span><b>${pre.length} straightforward</b> pre-approved match${pre.length > 1 ? 'es' : ''} below${rej.length ? ` and ${rej.length} rule-based rejection${rej.length > 1 ? 's' : ''}` : ''}.</span></p>` : ''}</section>
    <section class="xcard"><div class="xch"><h3>Evaluation assignment</h3></div>
      ${cs.owner ? `<div class="xasg">${avatar(cs.owner, true)}<div><dt>Case owner</dt><b>${esc(cs.owner.name)}${cs.owner.id === state.user.evaluatorId ? ' (you)' : ''}</b><span>Credit Evaluation Department</span><small>Owns the request and posts credit</small></div></div>` : ''}
      ${cs.reviewers.map((r) => `<div class="xasg">${avatar(r, true)}<div><dt>Department evaluator</dt><b>${esc(r.name)}${r.id === state.user.evaluatorId ? ' (you)' : ''}</b><span>${esc(r.department)} · ${esc((r.specializations || []).join(' • '))}</span><small title="${esc(r.reason || '')}">${esc(r.courses.join(', '))} · ${esc(r.basis?.specializationMatch ? 'matched by subject and specialization' : 'matched by subject')} · workload at assignment: ${r.basis?.workload ?? '—'}</small></div></div>`).join('')}</section>
    <section class="xcard"><div class="xch"><h3>Evaluation history</h3><button class="xlink" data-rqtab="activity">View all</button></div>
      <ol class="xhist">${hist.slice(-6).reverse().map((h) => `<li><span class="xht2">${esc(new Date(h.at).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span><div><b>${esc(h.actor)}</b> ${esc(h.message.length > 110 ? `${h.message.slice(0, 108)}…` : h.message)}</div></li>`).join('')}</ol></section>
  </div>
  <section class="xcard xstuinfo"><dl class="xkv xkvrow"><div><dt>Previous university</dt><dd>${esc(s.previousUniversity)} ${srcTag(s.sources.previousUniversity)}</dd></div><div><dt>Previous program</dt><dd>${esc(s.previousProgram || '—')}</dd></div><div><dt>Target</dt><dd>${esc(s.targetUniversity)} · ${esc(s.targetProgram)}</dd></div><div><dt>Request date</dt><dd>${esc(dateStr(app0.submittedAt))}</dd></div><div><dt>Transfer deadline</dt><dd>${s.deadlineDays} days</dd></div></dl></section>
  ${activityStrip(cs)}
  <div class="xtabs" role="tablist">${[['courses', 'Courses'], ['extraction', 'AI extraction'], ['transcript', 'Transcript'], ['activity', 'Activity & notes']].map(([t, l]) => `<button role="tab" class="${tab === t ? 'on' : ''}" aria-selected="${tab === t}" data-rqtab="${t}">${l}</button>`).join('')}</div>
  ${tab === 'courses' ? `
    ${asks.map((q) => `<div class="xinfo">${ico('clock')}<div><b>Waiting on the student:</b> ${esc(q.message)}</div></div>`).join('')}
    ${state.askOpen ? `<form class="ovr xcard" id="ev-askform"><label for="ev-askmsg" class="xcl">What should the student send?</label><textarea id="ev-askmsg" rows="2" placeholder="For example: an official copy of the transcript"></textarea><div class="xab"><button class="xbtn pri" type="submit">Send request</button><button class="xbtn ghost" type="button" id="ev-askcancel">Cancel</button></div></form>` : ''}
    ${banner}
    ${sect('Assigned to you', 'Review the evidence, then confirm, reject or request information. The AI recommendation is guidance only.', mine, mine.map((c) => cmpCard(cs, c)).join(''))}
    ${sect(p.isOwner ? 'Needs your review' : 'With Credit Evaluation', 'Not routed to a department; the case owner decides.', ownerReview, ownerReview.map((c) => cmpCard(cs, c)).join(''))}
    ${sect(p.isOwner ? 'Pre-approved matches' : 'Pre-approved matches · handled by Credit Evaluation', 'Approved equivalencies. Each line shows the course received and the BU course it matches; open Details for the evidence.', pre, `<div class="xcard flush xlines ${p.isOwner ? '' : 'ro'}">${pre.map((c) => lineOrCard(c, 'pre')).join('')}</div>`, p.canBulkConfirm ? `<button class="xbtn pri" data-bulk="confirm_pre_approved">Confirm all ${pre.length}</button>` : '')}
    ${sect(p.isOwner ? 'Recommended rejections' : 'Recommended rejections · handled by Credit Evaluation', 'Rule-based: the reason is on each line.', rej, `<div class="xcard flush xlines ${p.isOwner ? '' : 'ro'}">${rej.map((c) => lineOrCard(c, 'rej')).join('')}</div>`, p.canBulkConfirm ? `<button class="xbtn" data-bulk="reject_recommended">Reject all ${rej.length} as recommended</button>` : '')}
    ${sect('With department evaluators', 'Routed to colleagues by subject and specialization. Read-only for you.', others, others.map((c) => cmpCard(cs, c)).join(''))}
    ${sect('Decided', 'Decisions recorded so far.', decided, `<div class="xcard flush xlines">${decided.map((c) => lineOrCard(c, 'done')).join('')}</div>`)}`
  : tab === 'transcript' ? '<section class="xcard" id="txinline"></section>'
  : tab === 'extraction' ? '<section class="xcard" id="exinline"><p class="xmuted">Loading the AI extraction…</p></section>'
  : `<div class="xgrid2"><section class="xcard"><div class="xch"><h3>How the transcript arrived</h3></div><ol class="agentlog static">${hist.filter((h) => h.type.startsWith('intake.') || h.type === 'assignment.routed').map((h) => `<li class="done"><span class="aico">${ico(h.actorType === 'agent' ? 'agent' : app0.intake.channel === 'offline' ? 'offline' : 'online')}</span><span><span class="mono xmuted">${esc(new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span> <b>${esc(h.actor)}</b> ${esc(h.message)}</span></li>`).join('')}</ol></section>
      <section class="xcard"><div class="xch"><h3>Internal notes</h3></div><label class="xmuted" for="ev-notes">Visible to evaluators only</label><textarea id="ev-notes" class="xin" rows="4" placeholder="Add a note for other evaluators" ${p.canEditNotes ? '' : 'disabled'}>${esc(app0.internalNotes || '')}</textarea>${p.canEditNotes ? '<button class="xbtn" id="ev-savenotes">Save note</button>' : ''}
        <div class="xch" style="margin-top:16px"><h3>Evaluation history</h3></div><ol class="hist">${[...hist].reverse().map((h) => `<li><span class="mono xmuted">${esc(stamp(h.at))}</span> <b>${esc(h.actor)}</b> ${esc(h.message)}${h.visibility === 'student' ? ' <span class="xmuted">· visible to student</span>' : ''}</li>`).join('')}</ol></section></div>`}
  <div class="xactbar"><div>${app0.completedAt ? `<b>Completed</b> <span class="xmuted">${esc(stamp(app0.completedAt))} · credit posted</span>` : p.isOwner ? (pend.length ? `<b>${pend.length} course${pend.length > 1 ? 's' : ''} still need a decision</b> <span class="xmuted">${others.length ? `${others.length} with department evaluators` : ''}</span>` : asks.length ? "<b>Waiting for the student's reply</b>" : '<b>Every course has a decision.</b> <span class="xmuted">Complete to post the credit.</span>') : mine.filter(isPending).length ? `<b>${mine.filter(isPending).length} course${mine.filter(isPending).length > 1 ? 's' : ''} assigned to you</b>` : state.user.role === 'admin' ? '<b>Read-only for administrators.</b> <span class="xmuted">Department evaluators make the decisions.</span>' : `<b>Your part is done.</b> <span class="xmuted">${esc(cs.owner?.name || '')} posts the final result.</span>`}</div>
    <div class="xab">${prev ? `<button class="xbtn ghost" data-case="${prev}">← Previous</button>` : ''}${app0.completedAt ? '' : `${p.canRequestInformation ? '<button class="xbtn" id="ev-ask">Request information</button>' : ''}${p.isOwner ? `<button class="xbtn pri" data-complete ${p.canComplete ? '' : 'aria-disabled="true"'}>Complete evaluation</button>` : ''}`}${next ? `<button class="xbtn ${app0.completedAt || !p.isOwner ? 'pri' : ''}" data-case="${next}">Next case ${I.chev}</button>` : ''}</div></div>`)) return;

  if (tab === 'transcript') loadTranscriptInline(app0.id);
  if (tab === 'extraction') extractionTab(cs);
  bind(cs);
  if (state.focusCourse && !state.focusScrolled) {
    state.focusScrolled = true;
    const el = $(`#cc-${state.focusCourse}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
}

async function loadTranscriptInline(id) {
  const { transcriptHTML } = await import('../transcript.js');
  try { const t = await api.get(`/evaluations/${id}/transcript`); const box = $('#txinline'); if (box) box.innerHTML = transcriptHTML(t); } catch (e) { toast(e.message, 'error'); }
}

/* ------------------------------------------------------------------ */
/* actions                                                              */
/* ------------------------------------------------------------------ */
const reviewSeconds = (appId) => { const t0 = state.caseOpenedAt[appId]; state.caseOpenedAt[appId] = Date.now(); return t0 ? Math.round((Date.now() - t0) / 1000) : undefined; };

async function act(fn, { advance = true } = {}) {
  const cs = current;
  try {
    const r = await fn();
    if (r?.message) toast(r.message);
    state.disagree = null; state.overrideFor = null;
    await app.render();
    app.refreshShell();
    if (advance) maybeAdvance(cs.application.id);
    return r;
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

/** After my part of a case is done, open the next case in my queue. */
async function maybeAdvance(appId) {
  if (state.user.role !== 'evaluator' || !current || current.application.id !== appId) return;
  const myOpen = current.courses.some((c) => c.permissions.canDecide && isPending(c));
  const ownerOpen = current.permissions.isOwner && !current.application.completedAt;
  if (myOpen || ownerOpen) return;
  try {
    const list = await api.get('/evaluators/me/evaluations?status=open');
    const nx = list.items.find((x) => x.applicationId !== appId);
    if (!nx) { toast('Your queue is empty. Nice work.'); return; }
    setTimeout(() => {
      if (state.page === 'case' && state.params.id === appId) {
        toast(`${current.permissions.isOwner ? 'Evaluation completed' : `Your courses for ${current.student.name} are decided`}. Opening the next case: ${nx.student.name}.`);
        app.openCase(nx.applicationId, nx.course?.id);
      }
    }, 1100);
  } catch { /* ignore */ }
}

function bind(cs) {
  const appId = cs.application.id;
  const byId = (id) => cs.courses.find((c) => c.id === id);
  $$('[data-case]').forEach((b) => { b.onclick = () => app.openCase(b.dataset.case); });
  $$('[data-rqtab]').forEach((b) => { b.onclick = () => { state.rqTab = b.dataset.rqtab; app.render(); }; });
  $$('[data-tog]').forEach((b) => { b.onclick = () => { state.open[b.dataset.tog] = !state.open[b.dataset.tog]; app.render(); }; });
  $$('[data-jump]').forEach((b) => { b.onclick = () => jumpTo(b.dataset.jump); });
  $$('[data-card]').forEach((c) => c.addEventListener('click', () => setFocus(c.dataset.card, false)));
  $$('.cin').forEach((i) => { i.oninput = () => { state.draft[i.id.slice(3)] = i.value; }; });
  $$('[data-act]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id; const c = byId(id); const rc = c.recommendation;
      const note = ($(`#cm-${id}`)?.value || '').trim();
      const fail = (m) => { const err = $(`#er-${id}`); if (!err) { toast(m, 'error'); return; } err.textContent = m; err.hidden = false; $(`#cm-${id}`)?.focus(); };
      if (b.dataset.act === 'confirm') {
        if (b.getAttribute('aria-disabled') === 'true') return fail("This course can't be accepted until the missing information arrives. Use Request information.");
        if (rc.decision === 'Reject') { state.overrideFor = id; return app.render(); }
        const g = await duplicateGuard(c, rc.award);
        if (g === null) return null;
        if (g.reuseEquivalencyId && !g.sameAward) {
          return act(() => api.patch(`/course-evaluations/${id}/decision`, { action: 'override', award: g.award, credits: c.source.requestedCredits, reason: `Reused the existing approved equivalency for consistency${note ? `: ${note}` : ''}`, reuseEquivalencyId: g.reuseEquivalencyId, reviewSeconds: reviewSeconds(appId) }));
        }
        return act(() => api.patch(`/course-evaluations/${id}/decision`, { action: 'accept', comment: note, reuseEquivalencyId: g.reuseEquivalencyId, reviewSeconds: reviewSeconds(appId) }));
      }
      if (b.dataset.act === 'reject') {
        if (ACCEPTISH(rc.decision)) { state.draft[id] = note; state.disagree = id; state.overrideFor = null; await app.render(); $(`#dis-${id}`)?.focus(); return null; }
        if (!note && rc.decision !== 'Reject') return fail('Add a comment explaining the rejection. The student will see it.');
        return act(() => api.patch(`/course-evaluations/${id}/decision`, { action: 'reject', reason: note, reviewSeconds: reviewSeconds(appId) }));
      }
      if (b.dataset.act === 'info') return act(() => api.post(`/course-evaluations/${id}/request-information`, { message: note }), { advance: false });
      if (b.dataset.act === 'ovr') { state.overrideFor = state.overrideFor === id ? null : id; state.disagree = null; return app.render(); }
      return null;
    };
  });
  $$('[data-disagree]').forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const id = f.dataset.disagree; const reason = $(`#dis-${id}`).value.trim();
      if (!reason) { toast('Add a short reason for overriding the recommendation.', 'error'); $(`#dis-${id}`).focus(); return; }
      act(() => api.patch(`/course-evaluations/${id}/decision`, { action: 'reject', reason, reviewSeconds: reviewSeconds(appId) }));
    };
  });
  $$('[data-cancel-dis]').forEach((b) => { b.onclick = () => { state.disagree = null; app.render(); }; });
  $$('[data-ovrform]').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const id = f.dataset.ovrform;
      const body = { action: 'override', award: $(`#ov-a-${id}`).value, credits: Number($(`#ov-c-${id}`).value), reason: $(`#ov-r-${id}`).value.trim(), reviewSeconds: reviewSeconds(appId) };
      if (body.reason.length < 3) { toast('An override needs a reason. It is shown to the student and kept for audit.', 'error'); $(`#ov-r-${id}`).focus(); return; }
      if (body.award !== 'No credit') {
        const g = await duplicateGuard(byId(id), body.award);
        if (g === null) return;
        if (g.reuseEquivalencyId) Object.assign(body, { award: g.award, reuseEquivalencyId: g.reuseEquivalencyId });
      }
      act(() => api.patch(`/course-evaluations/${id}/decision`, body));
    };
  });
  $$('[data-proc]').forEach((b) => { b.onclick = () => app.go('processing', { id: b.dataset.proc }); });
  $$('[data-cancelovr]').forEach((b) => { b.onclick = () => { state.overrideFor = null; app.render(); }; });
  $$('[data-reopen]').forEach((b) => { b.onclick = () => act(() => api.patch(`/course-evaluations/${b.dataset.reopen}/decision`, { action: 'reopen' }), { advance: false }); });
  $$('[data-bulk]').forEach((b) => { b.onclick = () => act(() => api.post(`/evaluations/${appId}/bulk`, { action: b.dataset.bulk, reviewSeconds: reviewSeconds(appId) })); });
  $$('[data-complete]').forEach((b) => {
    b.onclick = () => {
      if (b.getAttribute('aria-disabled') === 'true') { toast(cs.summary.nPend ? `Cannot complete yet: ${cs.courses.filter(isPending).length} course(s) still need a decision.` : "Cannot complete yet: the student hasn't answered your request.", 'error'); return; }
      act(() => api.post(`/evaluations/${appId}/complete`));
    };
  });
  const ask = $('#ev-ask'); if (ask) ask.onclick = () => { state.askOpen = !state.askOpen; app.render().then(() => $('#ev-askmsg')?.focus()); };
  const askc = $('#ev-askcancel'); if (askc) askc.onclick = () => { state.askOpen = false; app.render(); };
  const askf = $('#ev-askform'); if (askf) askf.onsubmit = (e) => { e.preventDefault(); const message = $('#ev-askmsg').value.trim(); if (message.length < 3) { toast('Write what the student should send.', 'error'); return; } state.askOpen = false; act(() => api.post(`/evaluations/${appId}/request-information`, { message }), { advance: false }); };
  const sn = $('#ev-savenotes'); if (sn) sn.onclick = () => act(() => api.patch(`/evaluations/${appId}/notes`, { notes: $('#ev-notes').value }), { advance: false });
  const kh = $('#kbdhelp'); if (kh) kh.onclick = showKeys;
}

function setFocus(id, scroll = true) {
  state.focusCourse = id;
  $$('.xcmp.focus').forEach((c) => c.classList.remove('focus'));
  const el = $(`#cc-${id}`);
  if (el) { el.classList.add('focus'); if (scroll) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}
function jumpTo(id) {
  if (!$(`#cc-${id}.xcmp`)) { state.open[id] = true; state.focusCourse = id; state.focusScrolled = false; app.render(); return; }
  setFocus(id);
}

/* ------------------------------------------------------------------ */
/* keyboard                                                             */
/* ------------------------------------------------------------------ */
function showKeys() {
  const box = $('#notifs');
  box.innerHTML = `<div class="dh"><b>Keyboard shortcuts</b><button class="xicon" id="nclose" aria-label="Close">✕</button></div><div class="dl"><dl class="xkeys">
    ${[['J / K', 'Next / previous course that needs attention'], ['A', 'Confirm the focused course'], ['R', 'Reject the focused course'], ['I', 'Request information for the focused course'], ['O', 'Override the recommendation'], ['] / [', 'Next / previous case'], ['/', 'Search'], ['?', 'Show this list'], ['Esc', 'Close panels']].map(([k, t]) => `<div><dt>${k.split(' / ').map((x) => `<kbd>${esc(x.trim())}</kbd>`).join(' / ')}</dt><dd>${t}</dd></div>`).join('')}</dl>
    <p class="xmuted" style="padding:0 12px;font-size:12.5px">Shortcuts act on the highlighted course card. Click a card or use J / K to move the highlight. Decisions follow the same rules: rejecting needs a reason, and only the assigned evaluator can decide.</p></div>`;
  box.hidden = false; $('#scrim').hidden = false;
  $('#nclose').onclick = () => app.closeDrawers();
}
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (!state.user || state.user.role !== 'evaluator') return;
  if (e.key === '?') { e.preventDefault(); showKeys(); return; }
  if (state.page !== 'case' || !current) return;
  if (e.key === ']') { $('.xnav [data-case]:last-child')?.click(); return; }
  if (e.key === '[') { const b = $$('.xnav [data-case]').find((x) => x.textContent.includes('Previous')); b?.click(); return; }
  const cards = $$('.xcmp').filter((c) => c.querySelector('.xacts')).map((c) => c.dataset.card);
  const list = cards.length ? cards : $$('[data-jump]').map((b) => b.dataset.jump);
  if (e.key === 'j' || e.key === 'k') {
    if (!list.length) return;
    const i = list.indexOf(state.focusCourse);
    const n = e.key === 'j' ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1);
    jumpTo(list[n]); e.preventDefault(); return;
  }
  const id = state.focusCourse || cards[0];
  if (!id) return;
  const actName = { a: 'confirm', r: 'reject', i: 'info', o: 'ovr' }[e.key.toLowerCase()];
  if (actName) { const b = $(`#cc-${id} [data-act="${actName}"]`); if (b) { e.preventDefault(); setFocus(id, false); b.click(); } }
});
