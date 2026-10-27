/**
 * Knowledge-base pieces of the evaluation page:
 *  - "Why am I seeing this?" banner (previously approved / AI recommendation / manual review)
 *  - knowledge panel: equivalency reused, how often the course was evaluated, similar courses, earlier reasoning
 *  - duplicate guard: before approving, offers to reuse an existing equivalency instead of creating a new one
 *  - AI extraction tab: what was read from the transcript, with confidence, and staff verification
 *  - AI activity strip: the processing stages recorded for uploaded transcripts
 */
import { api } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, I, ico, dateStr, pathPill, confChip } from '../ui.js';

const REASON_ICON = { known_equivalency: '🟢', ai_recommended: '🟡', manual_review: '🔴', policy_rule: '⚪' };

export function reasonBanner(c) {
  const k = c.knowledge;
  if (!k) return '';
  return `<div class="whyband ${k.tone}"><span class="wb-ic" aria-hidden="true">${REASON_ICON[k.path] || ''}</span><div><b>Evaluation reason · ${esc(k.pathLabel)}</b><span>${esc(k.reason)}</span></div>
    ${k.match ? `<span class="wb-m"><small>Knowledge-base match</small><b>${k.match.confidence}%</b></span>` : c.recommendation.matchPct != null ? `<span class="wb-m"><small>AI match</small><b>${c.recommendation.matchPct}%</b></span>` : ''}</div>`;
}

export function knowledgePanel(c) {
  const k = c.knowledge;
  if (!k) return '';
  const m = k.match;
  const h = k.history;
  const eqCard = m ? `<div class="kbeq ${m.reusable && m.status === 'active' ? '' : 'warn'}">
      <div class="kbeqh">${m.reusable && m.status === 'active' ? '<span class="pathpill p-ok"><i></i>Existing approved equivalency found</span>' : m.status === 'rejected' ? '<span class="pathpill p-bad"><i></i>Previously reviewed and not approved</span>' : '<span class="pathpill p-warn"><i></i>Possible match, not reused</span>'}
        <span class="kbconf">Match confidence <b>${m.confidence}%</b></span></div>
      <div class="kbflow"><span><small>${esc(c.source.institution)}</small><b class="mono">${esc(m.sourceCode)}</b><em>${esc(m.sourceTitle || '')}</em></span><i>→</i><span><small>${esc(c.target?.institution || 'Boston University')}</small><b class="mono">${esc(m.target || '—')}</b><em>${esc(m.eqId)}</em></span></div>
      <dl class="kbmeta"><div><dt>Approved by</dt><dd>${esc(m.approvedBy || '—')}</dd></div><div><dt>Approved on</dt><dd>${esc(m.approvedOn ? dateStr(m.approvedOn) : '—')}</dd></div>
        <div><dt>Approvals</dt><dd>${m.approvals ?? '—'}</dd></div><div><dt>Reused</dt><dd>${m.timesUsed ?? 0}×</dd></div><div><dt>Match type</dt><dd>${esc({ exact: 'Same code', alias: 'Known alias', fuzzy: 'Code format / title' }[m.type] || m.type)}</dd></div></dl>
      ${m.signals?.length ? `<div class="kbsig">${m.signals.map((s) => `<span title="${esc(s.detail)}"><i style="width:${Math.round(s.score * 100)}%"></i>${esc(s.name)} ${Math.round(s.score * 100)}%</span>`).join('')}</div>` : ''}
      <small class="xmuted">${esc(m.reason)}. Reuse threshold: ${m.policyThreshold}% (policy ${esc(k.policy.version)}).</small></div>` : '';
  const hist = `<div class="kbhist"><div class="kbh-n"><b>${h.evaluated}</b><span>previous evaluation${h.evaluated === 1 ? '' : 's'} of this course</span></div>
      <div class="kbh-n ok"><b>${h.approved}</b><span>approved</span></div><div class="kbh-n bad"><b>${h.rejected}</b><span>rejected</span></div>
      <div class="kbh-n"><b>${h.lastApproval ? dateStr(h.lastApproval) : '—'}</b><span>most recent approval</span></div></div>`;
  const dec = h.decisions.length ? `<ul class="kbdec">${h.decisions.map((d) => `<li><span class="${d.outcome === 'Approved' ? 'ok' : 'bad'}">${esc(d.outcome)}</span><b class="mono">${esc(d.code)} → ${esc(d.award)}</b><small>${esc(d.evaluator || 'Policy')} · ${esc(d.at ? dateStr(d.at) : '')} · ${esc(d.student)}${d.note ? ` · “${esc(d.note)}”` : ''}</small></li>`).join('')}</ul>` : '';
  const sim = k.similar.length ? `<div class="kbsim"><b>Similar previously evaluated courses</b><ul>${k.similar.map((s) => `<li><span class="mono">${esc(s.source)} → ${esc(String(s.target).replace('CAS ', ''))}</span><small>${esc(s.institution)}${s.status !== 'active' ? ` · ${esc(s.status.replace('_', ' '))}` : ''}${s.approvals ? ` · approved ${s.approvals}×` : ''}</small><span class="simbar"><i style="width:${s.similarity}%"></i></span><b>${s.similarity}%</b></li>`).join('')}</ul></div>` : '';
  return `<details class="xevd kbpanel" ${c.permissions.canDecide && (m || h.evaluated) ? 'open' : ''}><summary><b>${I.brain} Institutional knowledge</b> <span class="xmuted">${h.evaluated ? `evaluated ${h.evaluated} time${h.evaluated === 1 ? '' : 's'} · ${h.approved} approved · ${h.rejected} rejected` : m ? `${esc(m.eqId)} · ${m.confidence}% match` : 'not evaluated before'}${k.similar.length ? ` · ${k.similar.length} similar` : ''}</span></summary>
    <div class="kbbody">${eqCard}${hist}${dec}${sim}${!m && !h.evaluated && !k.similar.length ? '<p class="xmuted">No previous decision on this course or anything similar. Your decision will be saved so the next student from this school is evaluated faster.</p>' : ''}</div></details>`;
}

/* ---------------- duplicate guard ---------------- */
/**
 * Before an approval: looks for an equivalency that already covers this course at the same school.
 * Resolves to { reuseEquivalencyId, award } to reuse, {} to continue with the evaluator's own decision,
 * or null when the evaluator cancels.
 */
export async function duplicateGuard(c, award) {
  if (c.evaluationPath === 'known_equivalency') return {};
  let r;
  try { r = await api.get(`/course-evaluations/${c.id}/equivalency-check?award=${encodeURIComponent(award || '')}`); } catch { return {}; }
  const hits = r.existing.filter((x) => x.status === 'active' && (x.sameCourse || x.matchType !== 'similar' || x.sameAward));
  if (!hits.length) return {};
  return new Promise((resolve) => {
    const box = $('#kbmodal') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'kbmodal' });
    box.className = 'modal kbmodal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const e = hits[0];
    box.innerHTML = `<div class="mbox"><div class="kbmh">${I.brain}<div><h3>Existing equivalency found</h3><p class="xmuted">Approving this would duplicate knowledge the university already has.</p></div></div>
      <div class="kbflow big"><span><small>${esc(e.institution)}</small><b class="mono">${esc(e.source)}</b><em>${esc(e.sourceTitle)}</em></span><i>→</i><span><small>Boston University</small><b class="mono">${esc(e.target)}</b><em>${esc(e.code)}</em></span></div>
      <p>Previously approved <b>${e.approvals || 0} time${e.approvals === 1 ? '' : 's'}</b>${e.timesUsed ? `, reused for ${e.timesUsed} student${e.timesUsed === 1 ? '' : 's'}` : ''}${e.approvedBy ? `, first approved by ${esc(e.approvedBy)}` : ''}. Match with ${esc(c.source.code)}: <b>${e.confidence}%</b>${e.sameCourse ? ' (same course code)' : ''}.</p>
      ${!e.sameAward && award ? `<p class="xinfo">${ico('flag')} Your decision (${esc(award)}) differs from this equivalency (${esc(e.target)}). Reusing it applies ${esc(e.target)}.</p>` : ''}
      <details class="kbmhist"><summary>Review the historical decisions (${e.history.length})</summary><ul>${e.history.map((x) => `<li><small>${esc(dateStr(x.at))} · ${esc(x.evaluator || 'Record')}</small>${esc(x.summary)}${x.reason ? `<em>“${esc(x.reason)}”</em>` : ''}</li>`).join('') || '<li class="xmuted">No recorded decisions.</li>'}</ul></details>
      <p class="xmuted">Would you like to reuse the existing equivalency? ${e.sameCourse ? '' : `${esc(c.source.code)} will be linked to ${esc(e.code)} as a known alias, so it is recognised automatically next time.`}</p>
      <div class="xab"><button class="xbtn pri" data-kb="reuse">Reuse ${esc(e.code)}</button><button class="xbtn" data-kb="own">Continue with my decision</button><button class="xbtn ghost" data-kb="cancel">Cancel</button></div></div>`;
    box.hidden = false;
    const done = (v) => { box.hidden = true; resolve(v); };
    $('[data-kb="reuse"]', box).onclick = () => done({ reuseEquivalencyId: e.id, award: e.target, sameAward: e.sameAward || !award });
    $('[data-kb="own"]', box).onclick = () => done({});
    $('[data-kb="cancel"]', box).onclick = () => done(null);
    $('[data-kb="reuse"]', box).focus();
  });
}

/* ---------------- AI activity strip ---------------- */
export function activityStrip(cs) {
  const t = (cs.transcripts || []).filter((x) => x.job).slice(-1)[0];
  if (!t) return '';
  const s = t.job.summary || {};
  const items = [['ok', 'Transcript received'], ['ok', 'Document structure identified'], ['ok', `${s.courses ?? '—'} courses extracted`],
    [s.reused ? 'ok' : 'info', `${s.reused || 0} matched to historical equivalencies`], ['ok', `${s.aiRecommended || 0} evaluated by AI`],
    [s.manualReview ? 'warn' : 'ok', `${s.manualReview || 0} require${s.manualReview === 1 ? 's' : ''} evaluator review`], ...(s.lowConfidence ? [['warn', `${s.lowConfidence} extracted value${s.lowConfidence > 1 ? 's' : ''} to verify`]] : [])];
  return `<section class="actstrip"><span class="as-k">${I.spark} AI processing</span>${items.map(([k, l]) => `<span class="as-i ${k}"><i>${k === 'warn' ? '⚠' : '✓'}</i>${esc(l)}</span>`).join('')}
    <button class="xlink" data-proc="${t.id}">Timeline</button>${t.extractionStatus === 'needs_verification' ? '<button class="xlink" data-rqtab="extraction">Verify extraction</button>' : ''}</section>`;
}

/* ---------------- AI extraction tab ---------------- */
const FIELDS = [['code', 'Course code'], ['title', 'Course name'], ['credits', 'Credits'], ['grade', 'Grade'], ['term', 'Term']];

export async function extractionTab(cs) {
  const box = $('#exinline');
  if (!box) return;
  const ups = cs.transcripts || [];
  if (!ups.length) { box.innerHTML = `<p class="xmuted">This request arrived before AI extraction (seeded or e-transcript data). The transcript tab shows the course lines.</p>`; return; }
  const parts = [];
  for (const u of ups) {
    let t;
    try { t = await api.get(`/transcripts/${u.id}`); } catch (e) { parts.push(`<p class="err">${esc(e.message)}</p>`); continue; }
    const ex = t.extraction || {};
    const low = ex.lowConfidenceThreshold || 80;
    const st = ex.student || {};
    parts.push(`<section class="exsec"><div class="xch"><h3>${esc(t.documents[0]?.fileName || 'Transcript')}</h3><span class="xmuted">${esc(t.sourceLabel)} · ${esc(ex.documentType || '')} · read by ${esc(ex.provider || '—')}${ex.model ? ` (${esc(ex.model)})` : ''} · ${ex.overallConfidence ?? '—'}% overall</span>
        <span class="xab">${t.documents.length ? `<button class="xbtn sm" data-doc="${t.id}">${I.doc} Original document</button>` : ''}${t.permissions.canReprocess ? `<button class="xbtn sm ghost" data-reprocess="${t.id}">Re-process</button>` : ''}</span></div>
      ${(ex.warnings || []).map((w) => `<div class="xinfo">${ico('flag')}<div>${esc(w)}</div></div>`).join('')}
      <dl class="exstu">${[['name', 'Student'], ['studentId', 'Student ID'], ['institution', 'Institution'], ['program', 'Degree / program'], ['term', 'Academic term'], ['graduation', 'Graduation']].map(([k, l]) => `<div><dt>${l}</dt><dd>${st[k] ? `${esc(st[k].value)} ${confChip(st[k].confidence, low)}` : '<span class="xmuted">Not found</span>'}</dd></div>`).join('')}</dl>
      <div class="extable ed"><div class="exr exh"><span>Course</span><span>Title</span><span>Credits</span><span>Grade</span><span>Term</span><span>Path</span><span></span></div>
      ${t.courses.map((c) => {
        const f = c.confidence || {};
        const lowF = FIELDS.filter(([k]) => f[k] && Number(f[k].confidence) < low);
        const editing = state.exEdit === c.id;
        const cell = (k, v) => (editing ? `<input class="xin" data-f="${k}" value="${esc(v)}" aria-label="${k}">` : `${esc(v)} ${confChip(f[k]?.confidence, low)}${f[k]?.corrected != null ? `<small class="corr" title="Corrected">was ${esc(f[k].value)}</small>` : ''}`);
        return `<div class="exr ${c.needsVerification ? 'lowc' : ''}" data-line="${c.id}" data-t="${t.id}">
          <span class="mono"><b>${cell('code', c.code)}</b></span><span>${cell('title', c.title)}</span><span class="mono">${cell('credits', fmt(c.credits))}</span><span class="mono"><b>${cell('grade', c.grade)}</b></span><span>${cell('term', c.term)}</span>
          <span>${pathPill(c.evaluationPath)}</span>
          <span class="exact">${t.permissions.canCorrect ? (editing ? '<button class="xbtn sm pri" data-exsave>Save</button><button class="xbtn sm ghost" data-excancel>Cancel</button>' : `${c.needsVerification ? '<button class="xbtn sm" data-exok>Verify</button>' : ''}<button class="xbtn sm ghost" data-exedit>Correct</button>`) : ''}${c.verifiedBy ? `<small class="xmuted">Verified by ${esc(c.verifiedBy)}</small>` : ''}</span>
          ${lowF.length && !c.verifiedBy ? `<div class="exwarn">⚠ <b>Low confidence.</b> The AI could not confidently determine the ${lowF.map(([, l]) => l.toLowerCase()).join(' and ')}. Please verify this information against the original document.</div>` : ''}</div>`;
      }).join('')}</div>
      <p class="xmuted exnote">Correcting a value re-evaluates the course: the knowledge base is checked again and a new recommendation version is recorded. The original AI reading is kept for audit.</p></section>`);
  }
  box.innerHTML = parts.join('');
  bindExtraction(box);
}

function bindExtraction(box) {
  $$('[data-exedit]', box).forEach((b) => { b.onclick = () => { state.exEdit = b.closest('[data-line]').dataset.line; app.render(); }; });
  $$('[data-excancel]', box).forEach((b) => { b.onclick = () => { state.exEdit = null; app.render(); }; });
  const send = async (row, body) => {
    try { const r = await api.patch(`/transcripts/${row.dataset.t}/courses/${row.dataset.line}`, body); toast(r.message); state.exEdit = null; app.render(); } catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-exok]', box).forEach((b) => { b.onclick = () => send(b.closest('[data-line]'), {}); });
  $$('[data-exsave]', box).forEach((b) => {
    b.onclick = () => {
      const row = b.closest('[data-line]');
      const body = Object.fromEntries($$('[data-f]', row).map((i) => [i.dataset.f, i.value.trim()]));
      body.credits = Number(body.credits);
      send(row, body);
    };
  });
  $$('[data-doc]', box).forEach((b) => {
    b.onclick = async () => {
      try { const blob = await api.blob(`/transcripts/${b.dataset.doc}/document`); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); } catch (e) { toast(e.message, 'error'); }
    };
  });
  $$('[data-reprocess]', box).forEach((b) => {
    b.onclick = async () => {
      try { await api.post(`/transcripts/${b.dataset.reprocess}/process`); app.go('processing', { id: b.dataset.reprocess }); } catch (e) { toast(e.message, 'error'); }
    };
  });
}
