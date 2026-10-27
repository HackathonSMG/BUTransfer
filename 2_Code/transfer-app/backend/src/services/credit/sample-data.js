// Maps the hackathon sample data (3_Data/BU_Synthetic_Transfer_Data_csv/all_data.json) to the engine's
// reference-data shape. Used by the database seed and by the answer-key evaluation script.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const DEFAULT_SAMPLE_DATA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../3_Data/BU_Synthetic_Transfer_Data_csv/all_data.json',
);

// TC-05 (5_Test_Cases/TEST_CASES.md): "Course descriptions and syllabi: Missing for MATH-UA 235 until
// uploaded". The catalog sheet already carries the text, so it is withheld here to reproduce the test case.
const WITHHELD_DESCRIPTIONS = new Set(['New York University|MATH-UA 235']);

export function loadSampleData(file = DEFAULT_SAMPLE_DATA) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const blank = (v) => (v === undefined || v === null || v === '—' ? '' : String(v));

  return {
    catalog: d.course_catalog.map((c) => {
      const withheld = WITHHELD_DESCRIPTIONS.has(`${c.institution}|${c.course}`);
      return {
        institution: c.institution, course_code: c.course, title: c.title, program: c.program,
        credits: Number(c.credits), credit_system: c.credit_system, level: c.level,
        description: withheld ? '' : blank(c.description), learning_outcomes: withheld ? '' : blank(c.learning_outcomes),
      };
    }),
    equivalencies: d.equivalency_db.map((e) => ({
      eq_id: e.eq_id, institution: e.institution, course_code: e.course, title: e.title,
      bu_course: blank(e.bu_course), outcome: e.outcome, dept: blank(e.dept), approved_on: blank(e.approved), evaluator: blank(e.evaluator),
    })),
    pastDecisions: d.past_decisions.map((p) => ({
      decision_id: p.decision_id, institution: p.institution, course_code: p.course, proposed_bu: blank(p.proposed_bu),
      decision: p.decision, bu_awarded: blank(p.bu_awarded), reason: blank(p.reason), credit_system: blank(p.credit_system),
      decided_on: blank(p.decided), evaluator: blank(p.evaluator), days_to_decision: p.days_to_decision === '' ? null : Number(p.days_to_decision),
    })),
    syllabi: d.syllabi.map((s) => ({ institution: s.institution, course_code: s.course, syllabus: s.syllabus })),
    rules: d.rules.map((r) => ({ rule_id: r.rule_id, rule: r.rule, detail: r.detail, applies_to: r.applies_to, source: r.source })),
    students: d.students,
    transcripts: d.transcripts,
  };
}
