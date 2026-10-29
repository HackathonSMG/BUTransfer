// Transcript quality check: reads the course rows of one transcript, as parsed, and lists what will need more
// review before or during evaluation (missing credits, unreadable, incomplete or Pass grades, repeats, rows read
// twice, courses not in the course records, an unknown calendar). Deterministic and advisory: nothing is blocked,
// changed or decided. Each finding carries a staff wording; findings the student should know about also carry a
// plain student wording with no internal terms. Grades are read with the same rules the credit engine uses.
import { normalizeGrade, gradeEligibility, courseKey, POLICY } from './policy.js';

const list = (codes) => {
  const unique = [...new Set(codes)];
  return unique.length <= 4 ? unique.join(', ') : `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} more`;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const uniq = (codes) => [...new Set(codes)];

/**
 * @param {{ institution?: string|null, credit_system?: string|null, courses: Array<{course_code, title?, term?, source_credits?, credits?, grade?}> }} transcript
 * @param {{ knownCodes?: Set<string>|null }} [options] courseKey()s of the institution's courses in the course records;
 *   null when the institution has none on file (every course is then unknown); omitted to skip this check
 * @returns {{ findings: Array<{type, severity: 'attention'|'info', courses: string[], staff: string, student: string|null}>,
 *   needs_review: boolean, student_summary: string|null }}
 */
export function checkTranscript({ institution = null, credit_system: creditSystem = null, courses = [] }, { knownCodes } = {}) {
  const findings = [];
  const add = (type, severity, codes, staff, student = null) => findings.push({ type, severity, courses: uniq(codes), staff, student });

  if (!courses.length) {
    add('no_courses', 'attention', [], 'No course rows could be read from the transcript.',
      'We could not read the courses on this transcript. Our office may contact you or the college for an official copy.');
    return summarise(findings);
  }
  if (!institution) {
    add('institution_unknown', 'attention', [], 'The issuing institution is not shown on the transcript.',
      'We could not confirm which college issued this transcript. Our office will check it.');
  }
  if (!creditSystem) {
    add('calendar_unknown', 'attention', [], 'The calendar (semester or quarter) is not shown, so the credit conversion must be confirmed.',
      'Your transcript does not say whether your college uses semesters or quarters. We will confirm this when converting your credits.');
  } else if (/quarter/i.test(creditSystem)) {
    add('quarter_system', 'info', [], `Quarter calendar: credits convert at 2/3 of a semester credit (R2).`,
      'Your college uses the quarter system, so your credits are converted to BU semester credits (a 4-credit course becomes 2.66).');
  }

  const codeOf = (c) => String(c.course_code || '').trim();
  const creditsOf = (c) => c.source_credits ?? c.credits;
  const missingCredits = uniq(courses.filter((c) => creditsOf(c) == null || creditsOf(c) === '').map(codeOf));
  if (missingCredits.length) {
    add('missing_credits', 'attention', missingCredits, `Credits not shown for ${list(missingCredits)}; the department confirms them before awarding units.`,
      `Credits are not shown for ${plural(missingCredits.length, 'course')} (${list(missingCredits)}). The department will confirm them.`);
  }

  const byKind = (kinds) => uniq(courses.filter((c) => kinds.includes(normalizeGrade(c.grade).kind)).map(codeOf));
  const unreadable = byKind(['missing', 'invalid']);
  if (unreadable.length) {
    add('grade_unreadable', 'attention', unreadable, `Final grade missing or unreadable for ${list(unreadable)}.`,
      `The final grade could not be read for ${list(unreadable)}. The department will confirm it before deciding.`);
  }
  const incomplete = byKind(['incomplete']);
  if (incomplete.length) {
    add('grade_incomplete', 'attention', incomplete, `Incomplete or in-progress grade for ${list(incomplete)}; a final grade is needed.`,
      `${list(incomplete)} ${incomplete.length === 1 ? 'shows' : 'show'} an incomplete or in-progress grade. A final grade is needed before credit can be awarded.`);
  }
  const passed = byKind(['pass']);
  if (passed.length && POLICY.passGradePolicy === 'review') {
    add('grade_pass', 'attention', passed, `Pass/Fail grade for ${list(passed)}; the department confirms it meets the ${POLICY.minimumGrade} minimum.`,
      `${list(passed)} ${passed.length === 1 ? 'was' : 'were'} graded Pass/Fail. The department will confirm ${passed.length === 1 ? 'it meets' : 'they meet'} the grade requirement.`);
  }
  const below = uniq(courses.filter((c) => gradeEligibility(c.grade).eligible === false && normalizeGrade(c.grade).kind !== 'withdrawn').map(codeOf));
  if (below.length) {
    add('below_minimum', 'info', below, `Grade below ${POLICY.minimumGrade} or not passed for ${list(below)} (R1): no credit.`,
      `Many BU schools require a ${POLICY.minimumGrade} or higher for transfer credit, so ${list(below)} may not transfer.`);
  }
  const withdrawn = byKind(['withdrawn']);
  if (withdrawn.length) add('withdrawn', 'info', withdrawn, `Withdrawn (W): ${list(withdrawn)} earn no credit.`, null);

  // The same course more than once: a different term is a repeat (credit once); the same term and grade is
  // most likely the same row read twice
  const groups = new Map();
  courses.forEach((c) => {
    const k = courseKey(c.course_code);
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  });
  const repeats = [];
  const doubles = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const terms = new Set(rows.map((r) => `${String(r.term || '').trim().toUpperCase()}|${String(r.grade || '').trim().toUpperCase()}`));
    (terms.size < rows.length ? doubles : repeats).push(codeOf(rows[0]));
  }
  if (repeats.length) {
    add('repeated_course', 'info', repeats, `Repeated: ${list(repeats)}. Credit is awarded once (best grade).`,
      `You took ${list(repeats)} more than once. Credit is awarded once, for your best attempt.`);
  }
  if (doubles.length) {
    add('duplicate_row', 'attention', doubles, `${list(doubles)} ${doubles.length === 1 ? 'appears' : 'appear'} twice with the same term and grade; check the transcript was read correctly.`,
      null);
  }

  const noTerm = uniq(courses.filter((c) => !String(c.term || '').trim()).map(codeOf));
  if (noTerm.length) add('missing_term', 'info', noTerm, `Term not shown for ${list(noTerm)}.`, null);

  if (institution && knownCodes !== undefined) {
    const unknown = uniq(knownCodes ? courses.filter((c) => !knownCodes.has(courseKey(c.course_code))).map(codeOf) : courses.map(codeOf));
    if (unknown.length) {
      const all = !knownCodes; // the institution has no courses on file at all
      add('unknown_courses', 'attention', unknown,
        all ? `${institution} has no courses in the course records; every course needs content review (syllabus likely).`
          : `${plural(unknown.length, 'course')} not in the course records for ${institution}: ${list(unknown)}. A syllabus may be needed.`,
        all ? 'Courses from this college have not been evaluated before, so the department may ask you for course syllabi.'
          : `${list(unknown)} ${unknown.length === 1 ? 'has' : 'have'} not been evaluated before. The department may ask you for ${unknown.length === 1 ? 'its syllabus' : 'the syllabi'}.`);
    }
  }
  return summarise(findings);
}

function summarise(findings) {
  const needsReview = findings.some((f) => f.severity === 'attention');
  return {
    findings,
    needs_review: needsReview,
    student_summary: needsReview ? 'We found information that may require additional review.' : null,
  };
}

export default { checkTranscript };
