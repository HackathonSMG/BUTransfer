/**
 * Scores the transfer credit engine against the sample data's answer key
 * (expected_path and expected_bu for all 76 transcript rows).
 * Usage: node scripts/eval-credit-engine.js [path/to/all_data.json] [--verbose]
 */
import { createEngine } from '../src/services/credit/engine.js';
import { loadSampleData } from '../src/services/credit/sample-data.js';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const data = loadSampleData(args.find((a) => !a.startsWith('--')));
const engine = createEngine(data);

const TERM_ORDER = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
const termKey = (t) => { const [season, year] = String(t).split(' '); return Number(year) * 10 + (TERM_ORDER[season] ?? 9); };
const codes = (s) => (String(s).match(/CAS [A-Z]{2} [0-9X]{3}/g) || []).sort().join(' + ');

function expectedPath(p) {
  if (p.startsWith('Existing equivalency')) return 'equivalency';
  if (p.startsWith('Rule:')) return 'rule';
  if (p.startsWith('Elective (past') || p.startsWith('No credit (past')) return 'precedent';
  if (p.startsWith('Maybe → needs information')) return 'needs_information';
  if (p.startsWith('Maybe')) return 'review';
  throw new Error(`Unknown expected path: ${p}`);
}

// Rows whose expected_bu is the evaluator's final override rather than the system's recommendation.
// TC-06: "The system recommends EC 204; the evaluator awards elective credit instead."
const SYSTEM_RECOMMENDATION = { 'TR-070': 'CAS EC 204' };

function expectedLabel(row) {
  const bu = SYSTEM_RECOMMENDATION[row.row_id] || row.expected_bu;
  if (/^No credit|^Skipped/.test(bu)) return 'No credit';
  if (bu === 'Elective credit') return 'Elective credit';
  return codes(bu);
}

let pathOk = 0, labelOk = 0, total = 0;
const mismatches = [];

for (const st of data.students) {
  // Same order as the sample PDFs: one transcript per institution (files sort by institution), courses by term
  const rows = data.transcripts
    .map((t, i) => ({ ...t, i }))
    .filter((t) => t.student_id === st.student_id)
    .sort((a, b) => a.institution.localeCompare(b.institution) || termKey(a.term) - termKey(b.term) || a.i - b.i);

  const { results } = engine.evaluateTranscript(
    rows.map((t) => ({ institution: t.institution, course_code: t.course, title: t.title, term: t.term, credit_system: t.credit_system, source_credits: t.source_credits, grade: t.grade })),
    { major: st.intended_major },
  );

  rows.forEach((t, i) => {
    const r = results[i];
    total += 1;
    const wantPath = expectedPath(t.expected_path);
    const gotLabel = r.outcome === 'no_credit' ? 'No credit' : (r.award === 'Elective credit' ? 'Elective credit' : codes(r.award || r.suggestion || ''));
    const wantLabel = expectedLabel(t);
    const pOk = r.path === wantPath;
    const lOk = wantPath === 'needs_information' || gotLabel === wantLabel;
    pathOk += pOk; labelOk += lOk;
    if (!pOk || !lOk || verbose) {
      (pOk && lOk ? console.log : mismatches.push.bind(mismatches))(
        `${t.row_id} ${t.course.padEnd(12)} path ${r.path.padEnd(17)} want ${wantPath.padEnd(17)} | got "${gotLabel}" want "${wantLabel}"${pOk && lOk ? '' : '  ✗'}`,
      );
    }
  });
}

if (mismatches.length) { console.log('Mismatches:'); mismatches.forEach((m) => console.log('  ' + m)); }
console.log(`\nPath accuracy:  ${pathOk}/${total} (${Math.round((100 * pathOk) / total)}%)`);
console.log(`Award accuracy: ${labelOk}/${total} (${Math.round((100 * labelOk) / total)}%)  (BU course or credit label; needs-information rows have no award)`);
process.exit(pathOk === total && labelOk === total ? 0 : 1);
