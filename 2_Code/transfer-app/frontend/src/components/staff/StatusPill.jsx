import React from 'react'
import { STATUS_LABELS } from '../application/StatusBadge'

// Five meanings only: neutral (in progress, general), info (new / ready), warn (needs attention, waiting),
// ok (approved, completed), bad (rejected, failed)
export const TONES = {
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bad: 'bg-rose-50 text-rose-800 border-rose-200'
}

export const STATUS_TONES = {
  draft: 'neutral',
  submitted: 'neutral',
  under_evaluation: 'neutral',
  information_required: 'warn',
  evaluation_completed: 'info',
  under_evaluator_review: 'warn',
  validation_failed: 'bad',
  approved: 'ok',
  rejected: 'bad',
  closed: 'neutral'
}

// Prototype-style pill with a leading dot; pass `status` for application statuses or `tone` + children for anything else
export default function StatusPill({ status, tone, children, className = '' }) {
  const t = tone || STATUS_TONES[status] || 'neutral'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold leading-none whitespace-nowrap ${TONES[t]} ${className}`}>
      <i className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" aria-hidden="true" />
      {children ?? (STATUS_LABELS[status] || status || 'Unknown')}
    </span>
  )
}
