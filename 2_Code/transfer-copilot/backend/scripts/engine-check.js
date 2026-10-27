/**
 * Compares the Node engine with the reference Python engine output (prototype JSON).
 * Usage: node scripts/engine-check.js path/to/proto.json
 */
import fs from 'node:fs';
import { createEngine } from '../src/services/engine/index.js';
import { loadSourceData, snapshotInput } from './lib/source-data.js';

const ref = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const src = loadSourceData();
const engine = createEngine(snapshotInput(src));
let rows = 0; const diffs = [];
for (const st of src.students) {
  const tr = src.transcripts.filter((t) => t.student_id === st.student_id);
  const out = engine.evaluate(tr);
  out.forEach((n, i) => {
    rows += 1;
    const p = ref.results[st.student_id][i];
    const cmp = {
      path: [n.path, p.path], status: [n.status, p.status], suggestion: [n.suggestion, p.suggestion], bu_credits: [n.bu_credits, p.bu_credits],
      reason: [n.reason, p.reason], trace: [JSON.stringify(n.trace), JSON.stringify(p.trace)], rules: [n.rules.join(), p.rules.join()],
      cands: [JSON.stringify(n.candidates), JSON.stringify(p.candidates)],
      decision: [n.rec.decision, p.rec.decision], award: [n.rec.award, p.rec.award], pct: [n.rec.pct, p.rec.pct], conf: [n.rec.confidence, p.rec.confidence],
      reasons: [JSON.stringify(n.rec.reasons), JSON.stringify(p.rec.reasons)], exceptions: [n.rec.exceptions.join(), p.rec.exceptions.join()],
      criteria: [JSON.stringify(n.rec.criteria), JSON.stringify(p.rec.criteria)],
    };
    for (const [k, [a, b]] of Object.entries(cmp)) if (String(a) !== String(b)) diffs.push(`${p.row_id} ${p.course} ${k}\n   node: ${String(a).slice(0, 300)}\n   py:   ${String(b).slice(0, 300)}`);
  });
}
console.log(`rows ${rows}, differences ${diffs.length}`);
console.log(diffs.slice(0, 25).join('\n'));
// after-upload re-score (missing information scenario)
for (const [sid, rs] of Object.entries(ref.results)) for (const p of rs) if (p.after_upload) {
  const row = src.transcripts.find((t) => t.row_id === p.row_id);
  const cat = src.catalog.find((c) => c.institution === p.institution && c.course === p.course);
  const n = engine.rescore(row, { description: cat.description, outcomes: cat.learning_outcomes, syllabus: p.after_upload.syllabus });
  console.log('rescore', p.course, 'node:', n.rec.decision, n.rec.award, n.rec.pct, '| py:', p.after_upload.decision, p.after_upload.award, p.after_upload.pct);
}
