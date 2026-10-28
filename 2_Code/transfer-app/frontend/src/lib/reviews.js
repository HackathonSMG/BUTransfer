// Display vocabulary for course reviews (an evaluator's assigned courses), shared by the evaluator pages

export const REVIEW_STATUS = {
  queued: { label: 'Upcoming', tone: 'neutral' },
  new: { label: 'New', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'neutral' },
  info_requested: { label: 'Waiting for Applicant', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'No Credit', tone: 'bad' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' }
}

// Where the recommended BU course came from, in the evaluator's terms
export function matchBasisLabel(review) {
  switch (review.match_basis) {
    case 'equivalency': return 'Approved equivalency'
    case 'sponsor_match':
      return review.sponsor_match_level === 'Partial - syllabus review' ? 'Partial match · syllabus review' : 'Catalog match'
    case 'precedent': return 'Past decision'
    case 'similarity': return 'Content comparison'
    case 'rule':
      return review.sponsor_match_level === 'Must be taken at BU' ? 'Must be taken at BU' : 'Transfer policy rule'
    default: return 'No match on file'
  }
}

// Colour for the match label the API returns (presentation only)
export function matchLabelClass(label) {
  if (['Strong match', 'Likely equivalent', 'Approved equivalency'].includes(label)) return 'text-emerald-700'
  if (['Partial match', 'Partial - syllabus review'].includes(label)) return 'text-amber-700'
  return label ? 'text-rose-700' : 'text-staff-muted'
}

// How a review's match reads: a percentage only for a computed content similarity; catalog levels and
// approved equivalencies are named levels (the API sets match_kind / match_percent)
export function matchDisplay(r) {
  if (r.match_kind === 'level') return { value: null, label: r.match_label }
  if (r.match_kind === 'score' || (r.match_kind === undefined && r.match_score != null)) {
    return { value: `${r.match_percent ?? Math.round(r.match_score * 100)}%`, label: r.match_label }
  }
  return { value: null, label: null }
}

// The evaluator's possible decisions on a course (Problem 1, step 6)
export const DECISION_LABELS = {
  equivalent_course: 'BU equivalent course',
  different_course: 'Different BU course',
  elective: 'Elective credit',
  no_credit: 'No credit',
  established_equivalency: 'Established equivalency',
  policy_rule: 'Transfer credit policy'
}

export function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d))
}

export function initials(name = '') {
  return name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?'
}

// Avatar tints, picked by name so a person keeps the same color everywhere
const AVATAR_TINTS = [
  'bg-blue-100 text-blue-800', 'bg-teal-100 text-teal-800', 'bg-indigo-100 text-indigo-800',
  'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-slate-200 text-slate-700'
]
export function avatarTint(name = '') {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length]
}
