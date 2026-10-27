import React from 'react'

// AI confidence (0–1) as a short bar plus percentage, using the dashboard's existing 80% / 60% bands
export default function ScoreMeter({ score }) {
  if (score == null) return <span className="text-staff-muted text-xs">—</span>
  const pct = Math.round(Number(score) * 100)
  const color = score >= 0.8 ? 'bg-emerald-600' : score >= 0.6 ? 'bg-amber-500' : 'bg-red-600'
  return (
    <span className="inline-flex items-center gap-2 min-w-[96px]" title={`AI confidence ${pct}%`}>
      <span className="flex-1 h-1.5 min-w-[44px] rounded-full bg-staff-line2 overflow-hidden">
        <i className={`block h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </span>
      <b className="text-[12.5px] font-semibold text-staff-ink min-w-[34px] text-right tabular-nums">{pct}%</b>
    </span>
  )
}
