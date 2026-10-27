/**
 * Transcript intake: upload (students, or staff on a student's behalf) and the live processing timeline.
 * The timeline shows the stages the server actually records (GET /transcripts/:id/processing-status);
 * nothing here is a canned animation.
 */
import { api } from '../api.js';
import { state, app } from '../store.js';
import { $, $$, esc, fmt, toast, I, ico, pathPill, confChip } from '../ui.js';

const MAX_MB = 10;
const TYPES = /\.(pdf|png|jpe?g|webp|txt)$/i;
const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';
const firstName = (n) => String(n || '').split(' ')[0];

/* ------------------------------------------------------------------ */
/* upload                                                               */
/* ------------------------------------------------------------------ */
export async function upload(ctx, params = {}, status = null) {
  const st = status || await api.get('/students/me/status');
  let samples = [];
  try { samples = (await api.get('/demo/sample-transcripts')).items.filter((x) => x.studentNumber === state.user.studentNumber); } catch { /* demo mode only */ }
  if (!st.canUpload) {
    const t = st.latestTranscript;
    ctx.paint(`<section class="xcard upblocked">${ico('check')}<div><h2>Your transcript is already with us</h2>
      <p class="xmuted">Request ${esc(st.application?.reference || '')} is ${t && ['queued', 'running'].includes(t.jobStatus) ? 'being processed right now' : 'in review'}. You can follow every course on your dashboard. To add another transcript, contact the Registrar.</p>
      <div class="xab">${t ? `<button class="xbtn" data-proc="${t.id}">View processing</button>` : ''}<button class="xbtn pri" data-go="dashboard">Go to my dashboard</button></div></div></section>`);
    $$('[data-proc]').forEach((b) => { b.onclick = () => app.go('processing', { id: b.dataset.proc }); });
    return;
  }
  const failed = st.latestTranscript?.status === 'failed';
  if (!ctx.paint(`
  <section class="uphero">
    <div class="uph-l"><div class="xey">${state.user.role === 'student' ? `Welcome, ${esc(firstName(state.user.fullName))}` : 'Transcript intake'}</div>
      <h2>Upload your transcript to begin the transfer-credit evaluation.</h2>
      <p>We read it, match every course against courses the university has already evaluated, and send only what needs a person to an evaluator. Most students see results in minutes, not weeks.</p></div>
    <div class="uph-r"><span class="uphk"><b>Every transcript</b> makes the next one faster</span></div>
  </section>
  ${failed ? `<div class="xinfo bad">${ico('flag')}<div><b>We could not finish reading ${esc(st.latestTranscript.fileName)}.</b> Upload a clearer copy (a digital PDF works best), or the Registrar will enter it for you.</div></div>` : ''}
  <div class="upgrid">
    <section class="xcard upcard">
      <label class="dropz" id="dropz" for="upfile" tabindex="0">
        <input type="file" id="upfile" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*">
        <span class="dzic">${ico('doc')}</span>
        <b>Drop your transcript here</b>
        <span>or <u>browse files</u></span>
        <small>PDF, scanned image (PNG, JPG) or text export · up to ${MAX_MB} MB</small>
      </label>
      <div class="upstate" id="upstate" hidden></div>
      ${samples.length ? `<div class="upsample"><span>${ico('flag')} Demo: use the sample transcript prepared for ${esc(state.user.fullName)}</span>${samples.map((x) => `<button class="xbtn sm" data-sample="${esc(x.file)}">Upload ${esc(x.file.replace(/_/g, ' ').replace('.pdf', ''))}</button>`).join('')}</div>` : ''}
      <p class="upprivacy">${ico('user')} Your document is stored privately and only seen by the Registrar and the evaluators working on your request.</p>
    </section>
    <section class="xcard upwill"><h3>AI will automatically</h3>
      <ul class="aiwill">
        <li><i>✓</i><div><b>Read your transcript</b><span>Digital PDFs, scans and photos</span></div></li>
        <li><i>✓</i><div><b>Extract your courses</b><span>Codes, titles, credits, grades and terms, each with a confidence check</span></div></li>
        <li><i>✓</i><div><b>Check previous evaluations</b><span>Courses the university already approved are reused instantly</span></div></li>
        <li><i>✓</i><div><b>Compare course equivalencies</b><span>Content, credits and level against the catalog</span></div></li>
        <li><i>✓</i><div><b>Identify what needs review</b><span>Only new or uncertain courses go to an evaluator</span></div></li>
      </ul>
      <p class="xmuted upnote">An authorised evaluator makes every final decision. The AI prepares the evidence.</p></section>
  </div>`)) return;

  const input = $('#upfile');
  const dz = $('#dropz');
  input.onchange = () => input.files[0] && start(input.files[0]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) start(f); };
  dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  $$('[data-sample]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const res = await fetch(`${BASE}/demo/samples/${encodeURIComponent(b.dataset.sample)}`);
        if (!res.ok) throw new Error('Sample not available.');
        start(new File([await res.blob()], b.dataset.sample, { type: 'application/pdf' }));
      } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    };
  });

  async function start(file) {
    if (!TYPES.test(file.name)) { toast('Upload a PDF, a PNG/JPG image or a text export of the transcript.', 'error'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast(`The file is larger than ${MAX_MB} MB.`, 'error'); return; }
    dz.hidden = true;
    const box = $('#upstate');
    box.hidden = false;
    const draw = (p) => { box.innerHTML = `<div class="upfile">${ico('doc')}<div><b>${esc(file.name)}</b><small>${fmt(file.size / 1024)} KB</small></div></div>
      <div class="upbar"><i style="width:${Math.round(p * 100)}%"></i></div><span class="xmuted">Uploading transcript · ${Math.round(p * 100)}%</span>`; };
    draw(0);
    try {
      const r = await api.uploadWithProgress('/transcripts/upload', file, params.studentId ? { studentId: params.studentId, source: 'MANUAL_UPLOAD' } : {}, draw);
      draw(1);
      app.go('processing', { id: r.transcriptId });
    } catch (e) {
      toast(e.message, 'error');
      box.hidden = true; dz.hidden = false; input.value = '';
    }
  }
}

/* ------------------------------------------------------------------ */
/* processing timeline                                                  */
/* ------------------------------------------------------------------ */
const STAGE_ICON = { done: '✓', running: '', pending: '', failed: '✕' };

function activity(job, tr) {
  const s = job?.summary || {};
  const st = Object.fromEntries((job?.stages || []).map((x) => [x.key, x]));
  const done = (k) => st[k]?.status === 'done';
  const out = [];
  if (done('received')) out.push(['ok', 'Transcript received', st.received.detail]);
  if (done('reading')) out.push(['ok', 'Document structure identified', st.reading.detail]);
  if (done('extracting')) out.push(['ok', `${s.courses} course${s.courses === 1 ? '' : 's'} extracted`, s.institution ? `${s.institution}${s.newInstitution ? ' (new institution added to the catalog)' : ''}` : '']);
  if (done('extracting') && s.lowConfidence) out.push(['warn', `${s.lowConfidence} value${s.lowConfidence > 1 ? 's' : ''} flagged for verification`, 'Read with low confidence; a person checks it against the document']);
  if (done('history')) out.push([s.reused ? 'ok' : 'info', `${s.reused || 0} course${s.reused === 1 ? '' : 's'} matched to historical equivalencies`, s.reused ? 'Reused from earlier evaluator decisions: no review from scratch' : 'Nothing from this school was evaluated before; this transcript teaches the knowledge base']);
  if (done('evaluating')) {
    out.push(['ok', `${s.aiRecommended || 0} course${s.aiRecommended === 1 ? '' : 's'} recommended by AI`, 'Above the confidence threshold; an evaluator confirms']);
    if (s.manualReview) out.push(['warn', `${s.manualReview} course${s.manualReview > 1 ? 's' : ''} require${s.manualReview > 1 ? '' : 's'} evaluator review`, 'Low confidence, missing information or an exception']);
    if (s.rules) out.push(['info', `${s.rules} settled by institutional rules`, 'For example a grade below C']);
  }
  if (done('routing')) out.push(['ok', 'Routed to the right evaluators', st.routing.detail]);
  if (tr?.extraction?.warnings?.length) tr.extraction.warnings.forEach((w) => out.push(['warn', 'Check', w]));
  return out;
}

function timeline(job) {
  return `<ol class="ptl">
    <li class="done"><span class="pti">✓</span><div><b>Uploading transcript</b><small>Complete</small></div></li>
    ${(job?.stages || []).map((x) => `<li class="${x.status}"><span class="pti">${x.status === 'running' ? '<span class="spin"></span>' : STAGE_ICON[x.status] || ''}</span>
      <div><b>${esc(x.label)}${x.status === 'done' && x.key !== 'ready' ? ' ✓' : ''}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : x.status === 'running' ? '<small class="xmuted">Working…</small>' : ''}${x.warning ? `<small class="ptwarn">⚠ ${esc(x.warning)}</small>` : ''}</div></li>`).join('')}
  </ol>`;
}

function extractedTable(tr, staff) {
  if (!tr?.courses?.length) return '';
  const ex = tr.extraction || {};
  const low = ex.lowConfidenceThreshold || 80;
  const st = ex.student || {};
  const studentPath = { known_equivalency: 'Recognized course', ai_recommended: 'Being confirmed', manual_review: 'With an evaluator', policy_rule: 'Rule applies' };
  return `<section class="xcard exsec"><div class="xch"><h3>What we read from your transcript</h3><span class="xmuted">${esc(ex.documentType || '')} · ${ex.overallConfidence ?? '—'}% overall confidence</span></div>
    <dl class="exstu">${[['name', 'Student'], ['studentId', 'Student ID'], ['institution', 'Institution'], ['program', 'Program'], ['term', 'Academic term'], ['graduation', 'Graduation']].filter(([k]) => st[k]).map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(st[k].value)} ${confChip(st[k].confidence, low)}</dd></div>`).join('')}</dl>
    <div class="extable"><div class="exr exh"><span>Course</span><span>Title</span><span>Credits</span><span>Grade</span><span>Term</span><span>${staff ? 'Evaluation path' : 'Status'}</span></div>
    ${tr.courses.map((c) => {
      const f = c.confidence || {};
      const lowF = Object.entries(f).filter(([, v]) => Number(v.confidence) < low);
      return `<div class="exr ${c.needsVerification ? 'lowc' : ''}"><span class="mono"><b>${esc(c.code)}</b> ${confChip(f.code?.confidence, low)}</span><span>${esc(c.title)} ${confChip(f.title?.confidence, low)}</span>
        <span class="mono">${fmt(c.credits)} ${confChip(f.credits?.confidence, low)}</span><span class="mono"><b>${esc(c.grade)}</b> ${confChip(f.grade?.confidence, low)}</span><span>${esc(c.term)}</span>
        <span>${staff ? pathPill(c.evaluationPath) : c.evaluationPath ? `<span class="xmuted">${esc(studentPath[c.evaluationPath])}</span>` : ''}</span>
        ${lowF.length ? `<div class="exwarn">⚠ <b>Low confidence.</b> The AI could not confidently read the ${lowF.map(([k]) => k).join(' and ')}. ${staff ? 'Verify it against the document.' : 'The Registrar will verify this value.'}</div>` : ''}</div>`;
    }).join('')}</div></section>`;
}

export async function processing(ctx, params) {
  const id = params.id;
  const staff = state.user.role !== 'student';
  let tr = null;
  let s = await api.get(`/transcripts/${id}/processing-status`);
  const shell = () => `<div class="procgrid"><section class="xcard proccard"><div class="xch"><h3>${I.spark} AI processing</h3><span class="xmuted" id="procstate"></span></div><div id="proctl"></div><div id="procdone"></div></section>
    <section class="xcard aiact"><div class="xch"><h3>AI activity</h3><span class="xmuted">What the system is doing</span></div><ul id="procact" class="aial"></ul></section></div><div id="procex"></div>`;
  if (!ctx.paint(shell())) return;
  const render = () => {
    const job = s.job;
    $('#proctl').innerHTML = timeline(job);
    $('#procstate').textContent = job?.status === 'completed' ? 'Complete' : job?.status === 'failed' ? 'Stopped' : 'In progress';
    const acts = activity(job, tr);
    $('#procact').innerHTML = acts.length ? acts.map(([k, t, d]) => `<li class="${k}"><i>${k === 'ok' ? '✓' : k === 'warn' ? '⚠' : '•'}</i><div><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ''}</div></li>`).join('') : '<li class="info"><i>•</i><div><b>Starting…</b></div></li>';
    if (job?.status === 'completed') {
      const x = job.summary || {};
      $('#procdone').innerHTML = `<div class="procready"><span class="prbig">✓</span><div><b>Evaluation ready</b><span>${x.courses} courses · ${x.reused || 0} reused from earlier decisions · ${x.aiRecommended || 0} AI-recommended · ${x.manualReview || 0} with an evaluator</span></div>
        ${staff ? `<button class="xbtn pri" data-open="${s.applicationId}">Open evaluation</button>` : '<button class="xbtn pri" data-go="courses">View my course results</button>'}</div>
        ${x.reused ? `<div class="kbwin">${I.brain}<span><b>${x.reused} of ${x.courses} courses</b> were recognised from previous evaluations, so no evaluator had to start from zero.</span></div>` : `<div class="kbwin new">${I.brain}<span>This is the first time these courses were seen. The evaluator's decisions will be saved, so the next student from this school is faster.</span></div>`}`;
    } else if (job?.status === 'failed') {
      $('#procdone').innerHTML = `<div class="xinfo bad">${ico('flag')}<div><b>Processing stopped.</b> ${esc(job.error || '')}</div>${staff ? '' : '<button class="xbtn" data-go="upload">Upload again</button>'}</div>`;
    } else $('#procdone').innerHTML = '';
    $$('[data-go]', $('#view')).forEach((b) => { b.onclick = () => app.go(b.dataset.go); });
    $$('[data-open]').forEach((b) => { b.onclick = () => app.openCase(b.dataset.open); });
  };
  render();
  while (!ctx.stale() && s.job && !['completed', 'failed'].includes(s.job.status)) {
    await new Promise((r) => { setTimeout(r, 700); });
    if (ctx.stale()) return;
    try { s = await api.get(`/transcripts/${id}/processing-status`); } catch { continue; }
    if (!ctx.stale()) render();
  }
  if (ctx.stale()) return;
  try { tr = await api.get(`/transcripts/${id}`); } catch { tr = null; }
  if (ctx.stale()) return;
  render();
  $('#procex').innerHTML = extractedTable(tr, staff);
  app.refreshShell();
  if (s.job?.status === 'completed' && !staff) toast('Your transcript has been evaluated.');
}

