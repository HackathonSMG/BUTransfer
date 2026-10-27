import React from 'react'

// Single-series horizontal bar chart: one hue, values labelled at the bar end, a tooltip per row.
// Rows: [{ key, label, value, onClick? }]. With one series no legend is needed; the card title names it.
export const SERIES_1 = '#2a78d6'
export const SERIES_2 = '#eb6834'

export default function BarList({ rows, unit = '', emptyText = 'No data yet' }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (rows.every(r => !r.value)) return <p className="text-sm text-staff-muted py-6 text-center">{emptyText}</p>

  return (
    <ul className="space-y-1">
      {rows.map(r => {
        const Tag = r.onClick ? 'button' : 'div'
        return (
          <li key={r.key}>
            <Tag
              type={r.onClick ? 'button' : undefined}
              onClick={r.onClick}
              title={`${r.label}: ${r.value}${unit ? ` ${unit}` : ''}`}
              className={`w-full grid grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 px-2 py-1.5 rounded-lg text-left text-[13px] ${
                r.onClick ? 'hover:bg-staff-sunk focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500' : 'hover:bg-staff-sunk/60'
              }`}
            >
              <span className="truncate text-staff-ink2">{r.label}</span>
              <span className="h-2.5 rounded-r bg-transparent" aria-hidden="true">
                {r.value > 0 && (
                  <i className="block h-full rounded-r" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SERIES_1 }} />
                )}
              </span>
              <b className="text-right font-semibold tabular-nums text-staff-ink">{r.value}</b>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
