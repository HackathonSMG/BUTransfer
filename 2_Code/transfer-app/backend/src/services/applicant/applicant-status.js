// What an applicant sees of an application's status: a plain-language label, a description, and the
// six-stage progress timeline. Everything is derived from the persisted application status, its courses and its
// status history (audit_logs 'status_changed'); nothing is estimated or simulated.

// Internal status -> applicant wording. validation_failed is an internal problem the Credit Evaluation Office
// resolves, so the applicant just sees the application as under review.
const PRESENTATION = {
  draft: { label: 'Not Submitted', tone: 'waiting', description: 'These transcripts have not been submitted yet.' },
  submitted: { label: 'Submitted', tone: 'progress', description: 'Your transcripts have been received and are waiting to be processed.' },
  under_evaluation: { label: 'Processing', tone: 'progress', description: 'We are reading your transcript and checking each course against BU\'s transfer equivalency records.' },
  evaluation_completed: { label: 'Processing', tone: 'progress', description: 'Your courses have been checked. We are routing the ones that need a closer look to the academic departments.' },
  validation_failed: { label: 'Under Review', tone: 'progress', description: 'The transfer credit team is reviewing your documents.' },
  under_evaluator_review: { label: 'Department Review', tone: 'progress', description: 'Academic department evaluators are reviewing your courses.' },
  information_required: { label: 'Action Required', tone: 'action', description: 'We need something from you to continue. See the courses marked "Action needed".' },
  ready_for_posting: { label: 'Final Review', tone: 'progress', description: 'Every course has a decision. The Credit Evaluation Office is completing the final review.' },
  credit_posted: { label: 'Completed', tone: 'done', description: 'Your transfer credit evaluation is complete and the results are posted.' },
  approved: { label: 'Decision Available', tone: 'done', description: 'A decision has been made on your application.' },
  rejected: { label: 'Decision Available', tone: 'done', description: 'A decision has been made on your application.' },
  closed: { label: 'Closed', tone: 'waiting', description: 'This transfer credit evaluation has been closed by the Credit Evaluation Office.' },
};

export function applicantStatus(status) {
  return { key: status, ...(PRESENTATION[status] || { label: 'In Progress', tone: 'progress', description: 'Your transfer credit evaluation is being processed.' }) };
}

/** Statuses after which the applicant has a final outcome (used for "active application" checks). */
export const FINISHED_STATUSES = ['credit_posted', 'approved', 'rejected', 'closed'];

export const STAGES = [
  { key: 'submitted', label: 'Transcripts Submitted' },
  { key: 'documents', label: 'Documents Processing' },
  { key: 'evaluation', label: 'Course Evaluation' },
  { key: 'department', label: 'Department Review' },
  { key: 'decision', label: 'Credit Decision' },
  { key: 'completed', label: 'Completed' },
];

const firstAt = (history, statuses) => history.find((h) => statuses.includes(h.status))?.at || null;

/**
 * The timeline. Each stage is done, current, upcoming or skipped (not needed for this application), with the time it was reached when known.
 * @param {object} app the application row (status, submitted_at, decision_date)
 * @param {{ courses: Array<{state: string}>, history: Array<{status: string, at: string}>, evaluationDone: boolean }} facts
 */
export function buildProgress(app, { courses, history, evaluationDone }) {
  const s = app.status;
  const visible = courses.filter((c) => c.state !== 'withdrawn');
  const settled = visible.length > 0 && visible.every((c) => ['decided', 'posted'].includes(c.state));
  const reviewed = visible.some((c) => !['processing'].includes(c.state));
  const finished = FINISHED_STATUSES.includes(s);

  const done = {
    submitted: s !== 'draft',
    documents: s !== 'draft' && (visible.length > 0 || evaluationDone || finished),
    evaluation: evaluationDone && (reviewed || finished || s === 'evaluation_completed'),
    department: settled || finished,
    decision: s === 'credit_posted' || ['approved', 'rejected'].includes(s),
    completed: finished,
  };
  const at = {
    submitted: app.submitted_at,
    documents: firstAt(history, ['under_evaluation']) || app.submitted_at,
    evaluation: firstAt(history, ['evaluation_completed', 'under_evaluator_review', 'information_required', 'ready_for_posting']),
    department: firstAt(history, ['ready_for_posting', 'credit_posted']),
    decision: firstAt(history, ['credit_posted', 'approved', 'rejected']) || (done.decision ? app.decision_date : null),
    completed: firstAt(history, ['credit_posted', 'approved', 'rejected', 'closed']) || (finished ? app.decision_date : null),
  };
  let currentFound = false;
  // Every course settled without a department evaluator (established equivalencies, policy rules)
  const noDepartmentReview = done.department && visible.length > 0 && !visible.some((c) => c.review_id);
  const stages = STAGES.map((stage) => {
    if (stage.key === 'department' && noDepartmentReview) return { ...stage, state: 'skipped', at: null, note: 'Not needed' };
    if (done[stage.key]) return { ...stage, state: 'done', at: at[stage.key] || null };
    if (!currentFound && s !== 'draft' && s !== 'closed') { currentFound = true; return { ...stage, state: 'current', at: null }; }
    return { ...stage, state: 'upcoming', at: null };
  });
  return { stages, current: stages.find((x) => x.state === 'current')?.key || (finished ? 'completed' : null) };
}

export default { applicantStatus, buildProgress, STAGES, FINISHED_STATUSES };
