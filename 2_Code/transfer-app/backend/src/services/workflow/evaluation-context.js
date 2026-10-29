// Evaluation context for one course review, built from the evidence the review package already holds: the
// course comparison, the established equivalency, earlier decisions on this course, how similar courses at other
// institutions were decided, conflicts and policy holds. Three uses:
//   buildBrief       what supports the proposed course, where it differs, what needs attention, a suggested next step
//   suggestRequest   a specific information request drawn from the gaps (instead of "please send more information")
//   checkDecision    the evaluator's chosen outcome checked against the institution's record before it is saved
// Pure and deterministic: every sentence states a fact the package holds. Nothing here decides a course; the
// consistency check warns and never blocks.

const BU_CODE = /\bCAS [A-Z]{2} \d{3}\b/g;
const codesOf = (text) => [...new Set(String(text || '').match(BU_CODE) || [])].sort();
const sameCodes = (a, b) => {
  const x = codesOf(a);
  const y = codesOf(b);
  return x.length > 0 && x.length === y.length && x.every((c, i) => c === y[i]);
};
const times = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (t) => `“${String(t).trim().replace(/[.;]+$/, '')}”`;

/** The award an earlier decision made, as a comparable label (mirrors knowledge.service's grouping). */
function decisionAward(d) {
  const codes = codesOf(d.bu_awarded);
  if (d.decision === 'BU equivalent' && codes.length) return codes.join(' + ');
  // Reference data also records "Partial / elective"; it counts as elective credit when compared with a choice
  return /elective/i.test(d.decision || '') ? 'Elective credit' : d.decision;
}

/** The outcome a choice awards, as the same label: BU course(s), "Elective credit" or "No credit". */
function choiceAward(outcome, award) {
  if (outcome === 'no_credit') return 'No credit';
  if (outcome === 'elective') return 'Elective credit';
  return codesOf(award).join(' + ') || award || null;
}

const coverageRatio = (c) => (c?.total ? (c.covered + 0.5 * c.partial) / c.total : null);

/**
 * @param {object} pkg the evaluator's review package (review.service getReview) with similar_elsewhere
 * @returns {{ supporting: string[], differences: string[], attention: string[], precedent: object, next_step: {action, text}|null }|null}
 */
export function buildBrief(pkg) {
  const src = pkg?.source_course;
  if (!src) return null;
  const target = pkg.review?.target_bu_course || null;
  const cmp = pkg.comparison;
  const k = pkg.knowledge;
  const sim = pkg.similar_elsewhere;
  const supporting = [];
  const differences = [];
  const attention = [];

  const est = k?.established;
  const estAgrees = est && (!target || sameCodes(est.bu_course, target));
  if (est) {
    const line = `Established equivalency ${est.eq_id}: ${src.course_code} → ${est.bu_course || est.outcome}${est.times_applied ? `, applied ${times(est.times_applied, 'time')}` : ''}.`;
    (estAgrees ? supporting : differences).push(line);
  }

  for (const m of pkg.evidence?.sponsor_matches || []) {
    if (target && !sameCodes(m.bu_course, target)) continue;
    if (m.match_level === 'Likely equivalent') supporting.push(`Listed as a likely equivalent of ${m.bu_course} in the BU course-match catalog.`);
    else if (m.match_level === 'Partial - syllabus review') differences.push(`Listed as a partial match of ${m.bu_course} in the BU course-match catalog; a syllabus review is recommended.`);
    else if (m.match_level === 'Must be taken at BU') attention.push(`${m.bu_course} must be taken at BU according to the course-match catalog.`);
  }

  if (cmp?.has_source_text) {
    const oc = cmp.outcome_coverage;
    if (oc?.total) {
      const line = `${oc.covered} of ${oc.total} BU learning outcomes evident in the transfer course${oc.partial ? ` (${oc.partial} more partly)` : ''}.`;
      (coverageRatio(oc) >= 0.5 ? supporting : differences).push(line);
    }
    const tc = cmp.topic_coverage;
    if (tc?.total && !oc?.total) {
      (coverageRatio(tc) >= 0.5 ? supporting : differences).push(`${tc.covered} of ${tc.total} BU course topics evident in the transfer course.`);
    }
    for (const o of (cmp.outcomes || []).filter((x) => x.status === 'not_evident').slice(0, 2)) differences.push(`Not evident: ${quote(o.text)}.`);
    const cr = cmp.credits;
    if (cr?.comparison === 'equal') supporting.push(`Same credit value: ${cr.source_units} BU units; ${target} carries ${cr.bu}.`);
    else if (cr?.comparison === 'fewer') differences.push(`Fewer credits: ${cr.source_units} BU units against ${cr.bu} for ${target}.`);
    else if (cr?.comparison === 'more') supporting.push(`${cr.source_units} BU units cover the ${cr.bu} credits of ${target}.`);
    if (pkg.syllabus?.compared) supporting.push('The syllabus the student sent was compared with the BU catalog.');
  } else if (cmp && !cmp.has_source_text) {
    attention.push('No course description or syllabus on file, so the content cannot be compared.');
  }

  const prev = k?.previous;
  if (prev?.total) {
    if (prev.outcomes.length === 1) {
      const award = prev.outcomes[0].award;
      const line = `${times(prev.total, 'earlier decision')} on ${src.course_code}: ${award}.`;
      (!target || sameCodes(award, target) ? supporting : differences).push(line);
    } else {
      attention.push(`Earlier decisions on ${src.course_code} differ: ${prev.outcomes.map((o) => `${o.award} ×${o.count}`).join(', ')}.`);
    }
  }

  const top = sim?.tally?.[0];
  if (top) {
    const n = sim.courses.length;
    if (!target) supporting.push(`${top.count} of ${times(n, 'similar course')} at other institutions received ${top.award}.`);
    else if (sameCodes(top.award, target)) supporting.push(`${top.count} of ${times(n, 'similar course')} at other institutions transferred as ${top.award}.`);
    else differences.push(`Similar courses at other institutions most often received ${top.award} (${top.count} of ${n}).`);
  }

  for (const c of k?.conflicts || []) attention.push(c.summary);
  const rules = pkg.evidence?.rules || [];
  if (rules.includes('PASS')) attention.push(`Graded Pass: confirm it meets the ${pkg.policy?.minimum_grade || 'C'} minimum.`);
  if (rules.includes('GRADE')) attention.push('The final grade is missing or unreadable.');
  if (pkg.units?.required) attention.push(`Credits are not shown on the transcript for ${src.course_code}; the BU units must be recorded.`);
  if (src.repeat_of) attention.push('Another attempt of this course is on the transcript; credit is awarded once.');
  if (pkg.combined_with?.length) attention.push(`Evaluated together with ${pkg.combined_with.map((c) => c.course_code).join(', ')}.`);

  const open = ['new', 'in_progress', 'info_requested'].includes(pkg.review?.status);
  const waiting = pkg.review?.status === 'info_requested' && pkg.info_request?.status === 'pending';
  let next = null;
  if (open) {
    if (waiting) next = { action: 'wait', text: 'Waiting on the student. The course returns to you when they answer.' };
    else if (k?.conflicts?.length) next = { action: 'review_conflict', text: 'Earlier decisions disagree. Review them, then record whether you follow the established equivalency or override it.' };
    else if (cmp && !cmp.has_source_text && !pkg.syllabus) next = { action: 'request_syllabus', text: 'Request the syllabus: there is no course content to compare yet.' };
    else if (est && estAgrees) next = { action: 'confirm', text: 'The established equivalency applies. Confirm it, or record why this transcript differs.' };
    else if (target && differences.length > supporting.length) next = { action: 'review_differences', text: `The evidence for ${target} is mixed. Review the differences; a syllabus may close the gaps.` };
    else if (target) next = { action: 'confirm', text: `The evidence supports ${target}. Confirm it, or record a different outcome.` };
    else if (top) next = { action: 'decide', text: `No BU course is proposed. Similar courses elsewhere most often received ${top.award}.` };
    else next = { action: 'decide', text: 'No BU course is proposed and there is no precedent. Your judgement is needed.' };
  }

  return {
    supporting,
    differences,
    attention,
    precedent: {
      same_course: prev ? { total: prev.total, outcomes: prev.outcomes.map(({ award, count }) => ({ award, count })) } : { total: 0, outcomes: [] },
      established: est ? { eq_id: est.eq_id, bu_course: est.bu_course, times_applied: est.times_applied || 0 } : null,
      similar_elsewhere: sim ? { courses: sim.courses.length, tally: sim.tally.map(({ award, count }) => ({ award, count })) } : { courses: 0, tally: [] },
    },
    next_step: next,
  };
}

/**
 * A specific information request drawn from what the comparison could not find. The evaluator sees it prefilled
 * and can edit it before sending; nothing is sent automatically.
 * @returns {{ kind: 'syllabus'|'information', items: string[], message: string }|null}
 */
export function suggestRequest(pkg) {
  const src = pkg?.source_course;
  if (!src) return null;
  const target = pkg.review?.target_bu_course;
  const cmp = pkg.comparison;
  const items = [];
  let kind = 'information';

  if (!cmp || !cmp.has_source_text) {
    kind = 'syllabus';
    items.push('the course syllabus', 'the weekly topics or schedule', 'the learning outcomes', 'how the course was assessed (exams, projects, labs)');
  } else {
    const gaps = (cmp.outcomes || []).filter((o) => o.status === 'not_evident').slice(0, 3).map((o) => o.text.replace(/[.;]+$/, '').trim());
    if (gaps.length) {
      if (!pkg.syllabus) kind = 'syllabus';
      items.push(`${pkg.syllabus ? 'weekly topics or assignments' : 'the course syllabus with its weekly topics'} showing coverage of: ${gaps.join('; ')}`);
    }
    if (cmp.credits?.comparison === 'fewer') items.push('the contact hours per week');
    const buText = (pkg.target_courses || []).map((c) => `${c.title} ${c.description || ''}`).join(' ');
    const srcText = `${src.title || ''} ${src.description || ''} ${src.learning_outcomes || ''}`;
    if (/\blab(oratory)?s?\b/i.test(buText) && !/\blab(oratory)?s?\b/i.test(srcText)) items.push('whether the course included a lab, and its hours per week');
  }
  if (pkg.units?.required) items.push(`the number of credits for ${src.course_code}`);
  const rules = pkg.evidence?.rules || [];
  if (rules.includes('GRADE')) items.push(`the official final grade for ${src.course_code}`);
  if (!items.length) return null;

  const against = target ? ` with Boston University's ${target}` : ' with Boston University courses';
  return { kind, items, message: `To compare ${src.course_code} ${src.title || ''}`.trim() + `${against}, please send ${items.join('; ')}.` };
}

/**
 * Checks a decision before it is saved. choice: { outcome: 'transfer'|'elective'|'no_credit', award, units,
 * conflict_action, comparison } where comparison is the course comparison for the BU course(s) being awarded.
 * @returns {{ status: 'consistent'|'review', headline: string, checks: Array<{key, tone: 'ok'|'warn'|'info', title, detail?}> }}
 */
export function checkDecision(pkg, choice) {
  const checks = [];
  const add = (key, tone, title, detail = null) => checks.push({ key, tone, title, ...(detail ? { detail } : {}) });
  const src = pkg.source_course || {};
  const k = pkg.knowledge;
  const award = choiceAward(choice.outcome, choice.award);

  // The established equivalency
  const est = k?.established;
  if (est) {
    const estAward = est.bu_course ? codesOf(est.bu_course).join(' + ') : 'Elective credit';
    if (award === estAward) add('established', 'ok', `Matches the established equivalency ${est.eq_id}`);
    else {
      add('established', 'warn', `Differs from the established equivalency ${est.eq_id} (${estAward})`,
        `${est.eq_id} has been applied ${times(est.times_applied || 0, 'time')}. ${choice.conflict_action === 'override'
          ? 'Recorded as an override; the Credit Evaluation Office will be told.'
          : 'If this is deliberate, record it as an override from the conflict section so the office can review the standard.'}`);
    }
  }

  // Earlier decisions on this same course
  const decisions = k?.previous?.decisions || [];
  if (decisions.length) {
    const agree = decisions.filter((d) => decisionAward(d) === award).length;
    const n = decisions.length;
    if (agree === n) add('previous', 'ok', `Consistent with ${n === 1 ? 'the earlier decision' : `all ${n} earlier decisions`} on ${src.course_code}`);
    else {
      const others = [...new Set(decisions.filter((d) => decisionAward(d) !== award).map(decisionAward))];
      add('previous', 'warn', agree ? `${agree} of ${n} earlier decisions on ${src.course_code} agree` : `This decision differs from ${n === 1 ? 'the earlier decision' : `all ${n} earlier decisions`} on ${src.course_code}`,
        `Earlier outcome${others.length === 1 ? '' : 's'}: ${others.join(', ')}. Review the previous decisions before finalizing.`);
    }
  }

  // How similar courses at other institutions were decided (context, never a warning on its own)
  const sim = pkg.similar_elsewhere;
  if (sim?.courses?.length >= 2) {
    const top = sim.tally[0];
    const same = sim.tally.find((t) => t.award === award);
    if (same && same === top) add('similar', 'ok', `In line with similar courses at other institutions (${same.count} of ${sim.courses.length} received ${award})`);
    else add('similar', 'info', `Similar courses at other institutions most often received ${top.award} (${top.count} of ${sim.courses.length})`);
  }

  // An open conflict on this course
  if (k?.conflicts?.length) {
    if (choice.conflict_action) add('conflict', 'ok', choice.conflict_action === 'override' ? 'Conflict: recorded as overriding earlier decisions' : 'Conflict: recorded as following the established equivalency');
    else add('conflict', 'warn', 'Earlier decisions on this course disagree', k.conflicts.map((c) => c.summary).join(' '));
  }

  // Content: does the transfer course show what the awarded BU course teaches?
  const cmp = choice.comparison;
  if (choice.outcome === 'transfer') {
    if (!cmp || !cmp.has_source_text) add('content', 'warn', 'No course content on file to compare with the awarded BU course', 'Consider requesting the syllabus first.');
    else {
      const oc = cmp.outcome_coverage?.total ? cmp.outcome_coverage : cmp.topic_coverage;
      const what = cmp.outcome_coverage?.total ? 'learning outcomes' : 'topics';
      const r = coverageRatio(oc);
      if (r == null) add('content', 'info', 'The awarded BU course lists no outcomes or topics to compare');
      else if (r >= 0.75) add('content', 'ok', `${oc.covered} of ${oc.total} BU ${what} are evident in the transfer course`);
      else if (r >= 0.5) add('content', 'info', `${oc.covered} of ${oc.total} BU ${what} are evident (${oc.partial} partly)`);
      else add('content', 'warn', `Only ${oc.covered} of ${oc.total} BU ${what} are evident in the transfer course`, 'State in the reason why the course still earns this BU course, or choose elective credit.');
    }
  } else if (choice.outcome === 'no_credit' && pkg.comparison?.has_source_text && coverageRatio(pkg.comparison.outcome_coverage) >= 0.75) {
    add('content', 'info', `The transfer course shows ${pkg.comparison.outcome_coverage.covered} of ${pkg.comparison.outcome_coverage.total} outcomes of ${pkg.review?.target_bu_course}`, 'Make sure the reason explains what is missing.');
  }

  // Credits and units
  if (choice.outcome !== 'no_credit') {
    const units = choice.units != null && choice.units !== '' ? Number(choice.units) : pkg.units?.default;
    if (units == null) add('units', 'warn', 'BU units are required: the transcript shows no credits for this course');
    else {
      if (pkg.units?.default != null && units > pkg.units.default) add('units', 'warn', `More units than the transcript shows (${units} against ${pkg.units.default})`);
      const buCredits = cmp?.credits?.bu;
      if (choice.outcome === 'transfer' && buCredits && units < buCredits) add('units', 'info', `${units} BU units for ${award}, which carries ${buCredits} credits`);
      else if (!(pkg.units?.default != null && units > pkg.units.default)) add('units', 'ok', `${units} BU units, posted with a grade of ${pkg.policy?.transfer_grade || 'T'}`);
    }
  }

  // Policy holds that only the evaluator can clear
  const rules = pkg.evidence?.rules || [];
  if (choice.outcome !== 'no_credit') {
    if (rules.includes('PASS')) add('grade', 'warn', `Graded Pass: confirm it meets the ${pkg.policy?.minimum_grade || 'C'} minimum before awarding credit`);
    if (rules.includes('GRADE')) add('grade', 'warn', 'The final grade is missing or unreadable; credit needs a confirmed grade');
    if (src.repeat_of) add('repeat', 'warn', 'Another attempt of this course is on the transcript; credit is awarded once');
  }

  const warns = checks.filter((c) => c.tone === 'warn');
  return {
    status: warns.length ? 'review' : 'consistent',
    headline: warns.length ? `Review before finalizing (${times(warns.length, 'item')})` : 'Consistent with the institution’s record',
    checks,
  };
}

export default { buildBrief, suggestRequest, checkDecision };
