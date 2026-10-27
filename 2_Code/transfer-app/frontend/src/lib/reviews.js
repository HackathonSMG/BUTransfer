// Display vocabulary for course reviews (an evaluator's assigned courses), shared by the evaluator pages

export const REVIEW_STATUS = {
  queued: { label: 'Upcoming', tone: 'neutral' },
  new: { label: 'New', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'neutral' },
  info_requested: { label: 'Waiting on Student', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' }
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
  return label === 'Strong match' ? 'text-emerald-700' : label === 'Partial match' ? 'text-amber-700' : label ? 'text-rose-700' : 'text-staff-muted'
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
