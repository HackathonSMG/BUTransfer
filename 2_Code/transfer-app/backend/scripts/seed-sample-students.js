/**
 * Adds the 11 hackathon sample students (3_Data students sheet) as applications. Their sample transcript
 * PDFs (4_Sample_Transcripts) go through the normal document upload, so courses are read from the PDFs,
 * then the evaluation runs. Students who already have an application (same email) are skipped.
 * Requires `npm run db:seed:credit` first.
 * Usage: node scripts/seed-sample-students.js
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from '../src/config/db.js';
import * as applicationService from '../src/services/application.service.js';
import * as documentService from '../src/services/document.service.js';
import { loadSampleData } from '../src/services/credit/sample-data.js';
import { buCredits } from '../src/services/credit/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = path.resolve(__dirname, '../../../../4_Sample_Transcripts');
const GRADE_POINTS = { A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, F: 0.0 };

function academicHistory(rows) {
  let points = 0, graded = 0, earned = 0;
  for (const r of rows) {
    const gp = GRADE_POINTS[r.grade];
    if (gp === undefined) continue; // W and other non-graded marks
    const credits = buCredits(r.source_credits, r.credit_system);
    points += gp * credits;
    graded += credits;
    if (gp >= 1.0) earned += credits;
  }
  return { gpa: graded ? Math.round((points / graded) * 100) / 100 : null, credits_completed: Math.round(earned * 100) / 100 };
}

async function waitForEvaluation(evaluationId) {
  for (let i = 0; i < 60; i++) {
    const { rows } = await query(`SELECT status, error_message FROM ai_evaluations WHERE id = $1`, [evaluationId]);
    if (['completed', 'failed'].includes(rows[0]?.status)) return rows[0];
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: 'timeout' };
}

async function seed() {
  const { students, transcripts } = loadSampleData();
  const files = fs.readdirSync(TRANSCRIPTS_DIR).filter((f) => f.endsWith('.pdf')).sort();
  console.log(`[Seed samples] ${students.length} students, ${files.length} transcript PDFs\n`);

  for (const st of students) {
    const name = st.name.replace(/\s*\(synthetic\)\s*$/i, '');
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@students.example.org`;
    const existing = await query(`SELECT reference_number FROM applications WHERE student_email = $1 LIMIT 1`, [email]);
    if (existing.rows.length) { console.log(`  ${st.student_id} ${name}: already exists (${existing.rows[0].reference_number}), skipped`); continue; }

    const app = await applicationService.createApplication({
      student_name: name,
      student_email: email,
      transfer_from_institution: st.prior_institutions,
      transfer_to_program: st.intended_major,
      transfer_to_department: 'College of Arts & Sciences',
      expected_start_term: st.bu_start_term,
      academic_history: academicHistory(transcripts.filter((t) => t.student_id === st.student_id)),
      additional_info: { sample_student_id: st.student_id, scenario: st.scenario },
    }, 'website', null);

    let courses = 0;
    for (const file of files.filter((f) => f.startsWith(`Transcript_${st.student_id}_`))) {
      const buffer = fs.readFileSync(path.join(TRANSCRIPTS_DIR, file));
      const doc = await documentService.uploadDocument({
        buffer, originalName: file, fileSize: buffer.length, mimeType: 'application/pdf',
        applicationId: app.id, documentType: 'transcript', uploadedBy: null, uploadSource: 'student',
      });
      courses += doc.transcript_import?.courses || 0;
    }

    const { evaluation_id: evaluationId } = await applicationService.triggerEvaluation(app.id, null);
    const evaluation = await waitForEvaluation(evaluationId);
    const summary = (await query(`SELECT credit_summary FROM ai_evaluations WHERE id = $1`, [evaluationId])).rows[0]?.credit_summary;
    console.log(`  ${st.student_id} ${name.padEnd(15)} ${app.reference_number}  ${courses} courses read  evaluation ${evaluation.status}`
      + (summary ? `  → ${summary.transferred_credits} transfer, ${summary.elective_credits} elective, ${summary.pending_credits} pending, ${summary.no_credit_courses} no credit` : ''));
  }
}

seed()
  .catch((err) => { console.error('[Seed samples] Fatal error:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
