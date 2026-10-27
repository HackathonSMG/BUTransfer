import React from 'react'
import { SERIES_1, SERIES_2 } from './BarList'
import { initials, avatarTint } from '../../lib/reviews'

export function WorkloadLegend() {
  return (
    <span className="flex items-center gap-3 text-xs text-staff-ink2">
      {[[SERIES_1, 'Open'], [SERIES_2, 'Completed']].map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
          {label}
        </span>
      ))}
    </span>
  )
}

// Stacked bar per evaluator: open (series 1) then completed (series 2), with a 2px gap between segments
export default function WorkloadChart({ rows }) {
  if (rows.length === 0) return <p className="text-sm text-staff-muted py-6 text-center">No active evaluators</p>
  const max = Math.max(1, ...rows.map(r => r.open + r.completed))
  return (
    <ul className="space-y-3">
      {rows.map(r => (
        <li
          key={r.full_name}
          className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]"
          title={`${r.full_name}: ${r.open} open, ${r.completed} completed, ${r.queued} upcoming`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${avatarTint(r.full_name)}`}>{initials(r.full_name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-staff-ink">{r.full_name}</span>
              <span className="block truncate text-xs text-staff-muted">{r.department}</span>
            </span>
          </span>
          <span className="flex h-2.5 gap-[2px]" aria-hidden="true">
            {r.open > 0 && <i className="block h-full" style={{ width: `${(r.open / max) * 100}%`, background: SERIES_1, borderRadius: r.completed ? '4px 0 0 4px' : 4 }} />}
            {r.completed > 0 && <i className="block h-full" style={{ width: `${(r.completed / max) * 100}%`, background: SERIES_2, borderRadius: r.open ? '0 4px 4px 0' : 4 }} />}
            {r.open + r.completed === 0 && <i className="block h-full w-full rounded bg-staff-sunk" />}
          </span>
          <span className="text-xs text-staff-ink2 tabular-nums whitespace-nowrap">
            <b className="text-staff-ink">{r.open}</b> open · {r.completed} done
          </span>
        </li>
      ))}
    </ul>
  )
}
