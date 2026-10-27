import React from 'react'

const TONE_ICON = {
  neutral: 'bg-staff-sunk text-staff-ink2',
  info: 'bg-primary-50 text-primary-600',
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700'
}

// Metric tile; renders as a button when `onClick` is given (e.g. to filter the queue)
export default function KpiCard({ icon: Icon, label, value, sub, tone = 'neutral', onClick, active = false }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`staff-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 items-center text-left px-4 py-4 min-w-0 ${
        onClick ? 'transition hover:shadow-lift hover:-translate-y-px hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500' : ''
      } ${active ? 'ring-2 ring-primary-500 border-transparent' : ''}`}
    >
      <span className={`row-span-3 w-10 h-10 rounded-[10px] grid place-items-center ${TONE_ICON[tone]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-[12.5px] font-medium text-staff-muted truncate">{label}</span>
      <b className="text-[26px] leading-tight font-bold tracking-tight text-staff-ink tabular-nums">{value ?? '—'}</b>
      {sub && <span className="text-xs text-staff-muted truncate">{sub}</span>}
    </Tag>
  )
}
