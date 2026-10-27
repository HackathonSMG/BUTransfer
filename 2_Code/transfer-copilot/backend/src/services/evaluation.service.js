/**
 * Core evaluation pipeline: run the engine on a transcript and persist results.
 */
import { pool } from '../config/db.js';
import { recommend, invalidateMatcher } from './engine/recommender.js';
import { assignCaseOwner, assignDepartmentReviewer } from './routing.service.js';
import { buCredits } from './engine/rules.js';

export async function evaluateTranscript(transcriptId, trigger = 'intake', db = pool) {
  // Load transcript + courses + source institution
  const { rows: txRows } = await db.query(
    `select t.*, a.id as application_id, a.student_id,
            i.id as src_inst_id, i.name as src_inst_name
     from public.transcripts t
     join public.applications a on a.id = t.application_id
     join public.institutions i on i.id = t.source_institution_id
     where t.id = $1`,
    [transcriptId],
  );
  if (!txRows[0]) throw new Error('Transcript not found');
  const tx = txRows[0];

  const { rows: courses } = await db.query(
    `select tc.*, c.description, c.learning_outcomes, c.level as course_level, c.program_area
     from public.transcript_courses tc
     left join public.courses c on c.id = tc.course_id
     where tc.transcript_id = $1 order by tc.line_no`,
    [transcriptId],
  );

  const srcInst = { id: tx.src_inst_id, name: tx.src_inst_name };

  for (const course of courses) {
    const bc = buCredits(course.source_credits, course.credit_system);
    const rec = await recommend(course, srcInst, trigger, db);

    // Upsert course_evaluations
    const { rows: ceRows } = await db.query(
      `select id from public.course_evaluations where transcript_course_id = $1`,
      [course.id],
    );

    let ceId;
    if (ceRows[0]) {
      ceId = ceRows[0].id;
      await db.query(
        `update public.course_evaluations set
           pipeline_path = $1, state = 'pending', student_status = $2, suggestion = $3,
           requested_credits = $4, awarded_credits = $5, system_reason = $6,
           trace = $7, rules_fired = $8, updated_at = now()
         where id = $9`,
        [rec.evaluation_path === 'known_equivalency' ? 'Auto-applied' : rec.evaluation_path === 'policy_rule' ? 'Rule' : 'Needs review',
         studentStatus(rec), rec.award_label, bc, rec.auto_eligible ? rec.award_credits : 0,
         null, JSON.stringify([]), JSON.stringify([]), ceId],
      );
      // invalidate old recommendations
      await db.query(`update public.ai_recommendations set is_current = false where course_evaluation_id = $1`, [ceId]);
    } else {
      const { rows: ins } = await db.query(
        `insert into public.course_evaluations
           (application_id, transcript_course_id, pipeline_path, state, student_status, suggestion,
            requested_credits, awarded_credits, trace, rules_fired, baseline)
         values ($1,$2,$3,'pending',$4,$5,$6,$7,'[]','{}','{}')
         returning id`,
        [tx.application_id, course.id,
         pipelinePath(rec), studentStatus(rec), rec.award_label, bc, rec.auto_eligible ? rec.award_credits : 0],
      );
      ceId = ins[0].id;
    }

    // Insert ai_recommendation
    const { rows: vRows } = await db.query(
      `select coalesce(max(version),0)+1 as next from public.ai_recommendations where course_evaluation_id = $1`,
      [ceId],
    );
    const { rows: recRows } = await db.query(
      `insert into public.ai_recommendations
         (course_evaluation_id, version, is_current, engine_version, trigger, decision, award_label, award_credits,
          target_course_id, target_code, match_pct, confidence, auto_eligible, criteria, reasons, exceptions,
          candidates, covered_topics, missing_topics, equivalency_code, evaluation_path, kb_equivalency_id, kb_match)
       values ($1,$2,true,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       returning id`,
      [ceId, vRows[0].next, rec.engine_version, rec.trigger,
       rec.decision, rec.award_label, rec.award_credits,
       rec.target_course_id || null, rec.target_code || null,
       rec.pct, rec.confidence, rec.auto_eligible,
       JSON.stringify(rec.criteria), JSON.stringify(rec.reasons.map(r => r.text || r)),
       JSON.stringify(rec.exceptions), JSON.stringify(rec.candidates),
       JSON.stringify(rec.covered_topics), JSON.stringify(rec.missing_topics),
       rec.equivalency_code || null, rec.evaluation_path,
       rec.kb_equivalency_id || null, rec.kb_match ? JSON.stringify(rec.kb_match) : null],
    );
    const recId = recRows[0].id;
    await db.query(`update public.course_evaluations set current_recommendation_id = $1 where id = $2`, [recId, ceId]);

    // Auto-assign department reviewer if not auto-eligible
    if (!rec.auto_eligible && rec.evaluation_path !== 'policy_rule') {
      await assignDepartmentReviewer(tx.application_id, ceId, {
        target_code:  rec.target_code,
        target_title: '',
        course_level: course.course_level,
        program_area: course.program_area,
      }, db).catch(() => {/* routing failure is non-fatal */});
    }
  }

  // Update application status
  await db.query(
    `update public.applications set status = 'in_review', updated_at = now() where id = $1 and status = 'received'`,
    [tx.application_id],
  );

  return courses.length;
}

function pipelinePath(rec) {
  if (rec.evaluation_path === 'known_equivalency') return 'Auto-applied';
  if (rec.evaluation_path === 'policy_rule')       return 'Rule';
  if (rec.auto_eligible)                           return 'Precedent';
  return 'Needs review';
}

function studentStatus(rec) {
  if (rec.decision === 'Reject')     return 'Not transferable';
  if (rec.auto_eligible)             return 'Confirmed';
  if (rec.pct !== null && rec.pct >= 85) return 'Likely';
  return 'Under review';
}
