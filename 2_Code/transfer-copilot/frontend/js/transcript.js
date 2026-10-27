/** Transcript viewer (Synthetic Data sample transcripts). */
import { esc, fmt, srcTag } from './ui.js';

const GPV = { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, F: 0 };
const TERM_ORD = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
export function transcriptHTML(t) {
  return `<div class="txhead"><div class="eyebrow">Sample transcript · Synthetic Data</div><h2 style="margin:2px 0">${esc(t.student.name)} <span class="muted code" style="font-size:13px">${esc(t.student.number)}</span></h2>
    <div class="muted" style="font-size:12.5px">Test document, not issued by any institution. Course codes, titles and credits for Northeastern and NYU come from the worksheet; grades and terms are synthetic.</div></div>
  ${t.institutions.map((inst) => {
    const terms = {}; inst.courses.forEach((c) => { (terms[c.term] = terms[c.term] || []).push(c); });
    const order = Object.keys(terms).sort((a, b) => (Number(a.split(' ')[1]) - Number(b.split(' ')[1])) || (TERM_ORD[a.split(' ')[0]] - TERM_ORD[b.split(' ')[0]]));
    let qp = 0; let gc = 0; let earned = 0;
    inst.courses.forEach((c) => { if (GPV[c.grade] != null) { qp += GPV[c.grade] * c.credits; gc += c.credits; } if (c.grade !== 'W') earned += c.credits; });
    return `<section class="txinst"><div class="txih"><b>${esc(inst.name)}</b> ${srcTag(inst.dataSource)} <span class="muted">· ${esc(inst.creditSystem)} system · ${esc(inst.channel === 'offline' ? 'paper, scanned' : inst.channel === 'etx' ? 'e-transcript' : 'portal upload')}</span></div>
      ${order.map((term) => `<div class="txterm"><div class="eyebrow">${esc(term)}</div><div class="tablewrap"><table><thead><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th></tr></thead><tbody>
        ${terms[term].map((c) => `<tr><td class="code">${esc(c.code)}</td><td>${esc(c.title)}</td><td class="code">${fmt(c.credits)}</td><td class="code"><b>${esc(c.grade)}</b></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
      <div class="txtot"><span>Earned: <b>${fmt(earned)}</b> ${inst.creditSystem === 'Quarter' ? 'quarter units' : 'semester hours'}</span><span>GPA: <b>${gc ? (qp / gc).toFixed(2) : '—'}</b></span></div></section>`;
  }).join('')}`;
}
