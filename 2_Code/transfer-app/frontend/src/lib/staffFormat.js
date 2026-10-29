// Small formatting helpers shared by the staff dashboards

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function timeAgo(d) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} d ago`
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d))
}

const ACTIVITY_LABELS = {
  application_created: 'Transcripts received',
  evaluation_triggered: 'Evaluation started',
  evaluation_failed: 'Evaluation could not complete',
  validation_failed: 'Evaluation failed validation',
  reviews_assigned: 'Courses assigned to evaluators',
  staff_roster_imported: 'Staff roster imported',
  status_changed: 'Status updated',
  decision_made: 'Decision recorded',
  info_request_created: 'Information requested from student',
  review_started: 'Course review started',
  review_decided: 'Course decision recorded',
  course_decision: 'Course decision recorded',
  review_info_requested: 'Information requested for a course',
  transfer_request_created: 'Evaluation handed to the next evaluator',
  evaluation_assigned: 'New evaluation assigned',
  transfer_request: 'Transfer request received',
  note_added: 'Note added',
  syllabus_requested: 'Syllabus requested from the student',
  syllabus_received: 'Syllabus received from the student',
  info_request_responded: 'Student replied',
  established_outcomes_applied: 'Established equivalencies applied',
  review_reassigned: 'Course reassigned',
  reassignment_requested: 'Handed back for reassignment',
  queued_reviews_opened: 'Courses opened for parallel review',
  credit_posted: 'Transfer credit posted',
  duplicate_suspected: 'Possible duplicate evaluation flagged',
  duplicate_resolved: 'Duplicate check resolved',
  deadline_exception_recorded: 'Deadline exception recorded',
  conflict_escalated: 'Additional review requested',
  conflict_resolved: 'Equivalency conflict resolved',
  conflict_override: 'Earlier decisions overridden',
  conflict_use_established: 'Established equivalency confirmed',
  equivalency_standardized: 'Standard equivalency recorded',
  evaluator_availability_changed: 'Evaluator availability changed',
  ready_for_posting: 'Ready for posting',
  assignment_needed: 'Course needs an evaluator',
  information_received: 'Student answered a request',
  decision_returned: 'Decision returned by the Credit Evaluation Office',
  transcript_unreadable: 'Transcript could not be read',
  student_registered: 'Student account created',
  existing_applications_processed: 'Existing applications processed'
}

export function activityLabel(action) {
  return ACTIVITY_LABELS[action] || String(action).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

// How long something has been waiting, e.g. "2h 18m", "3d 4h" (operational information, not an SLA)
export function pendingFor(since, now = new Date()) {
  if (!since) return '—'
  const mins = Math.max(0, Math.floor((now - new Date(since)) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatDateTime(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
}
