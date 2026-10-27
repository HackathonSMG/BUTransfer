import React from 'react'
import { STATUS_LABELS } from '../application/StatusBadge'

export const TONES = {
  neutral: 'bg-staff-sunk text-slate-600 border-staff-line',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  ai: 'bg-violet-50 text-violet-800 border-violet-200',
  ready: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bad: 'bg-red-50 text-red-700 border-red-200'
}

export const STATUS_TONES = {
  draft: 'neutral',
  submitted: 'info',
  under_evaluation: 'ai',
  information_required: 'warn',
  evaluation_completed: 'ready',
  under_evaluator_review: 'warn',
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
