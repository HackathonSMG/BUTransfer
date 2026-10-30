import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

// Meaning colours, the same on every dashboard: blue new or received, amber in progress, green completed,
// violet people and precedent, red needs attention
export const TONES = {
  sky: { chip: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500', ring: '#0ea5e9', track: '#e0f2fe', edge: '#0ea5e9', text: 'text-sky-800' },
  amber: { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-400', ring: '#d97706', track: '#fef3c7', edge: '#fbbf24', text: 'text-amber-800' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', ring: '#059669', track: '#d1fae5', edge: '#10b981', text: 'text-emerald-800' },
  violet: { chip: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500', ring: '#7c3aed', track: '#ede9fe', edge: '#8b5cf6', text: 'text-violet-800' },
  red: { chip: 'bg-red-50 text-red-700', bar: 'bg-red-500', ring: '#dc2626', track: '#fee2e2', edge: '#ef4444', text: 'text-red-700' },
  slate: { chip: 'bg-staff-sunk text-staff-ink2', bar: 'bg-slate-400', ring: '#64748b', track: '#eef0f3', edge: '#cbd5e1', text: 'text-staff-ink' }
}

const pct = (n, of) => (of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0)

// A share of a whole as a ring, with the value in the middle
function Ring({ value, max, tone }) {
  const t = TONES[tone] || TONES.slate
  const c = 2 * Math.PI * 15.5
  return (
    <span className="relative w-[84px] h-[84px] flex-shrink-0" role="img" aria-label={`${value} of ${max}`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={t.track} strokeWidth="4" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={t.ring} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct(value, max) / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span><span className="font-display text-[20px] font-semibold text-staff-ink">{value}</span><span className="text-[11px] text-staff-muted">/{max}</span></span>
      </span>
    </span>
  )
}

/**
 * A headline number: label, large value, one short line of detail. Links somewhere when `to` is given.
 * Optional: icon and tone (its meaning colour), badge (a short fact beside the icon), bar (a share of a whole:
 * { value, of } or segments [{ value, tone, label }] out of barOf), ring ({ value, max }: shown instead of the large value).
 */
export default function Metric({ label, value, detail, to, accent = false, icon: Icon, tone, badge, bar, barOf, ring, edge = false }) {
  const t = tone ? TONES[tone] : null
  const segments = Array.isArray(bar) ? bar.filter(s => s.value > 0) : null
  const segTotal = segments?.reduce((n, s) => n + s.value, 0) || 0

  const body = ring ? (
    <span className="flex items-center gap-4">
      <Ring value={ring.value} max={ring.max} tone={tone} />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-staff-ink">{label}</span>
        {detail && <span className="block mt-0.5 text-[12.5px] text-staff-muted">{detail}</span>}
        {badge && <span className="mt-2 inline-flex">{badge}</span>}
      </span>
    </span>
  ) : (
    <>
      {(Icon || badge) && (
        <span className="flex items-center justify-between gap-2 mb-3">
          {Icon ? <span className={`w-10 h-10 rounded-lg grid place-items-center ${t?.chip || TONES.slate.chip}`}><Icon className="w-5 h-5" aria-hidden="true" /></span> : <span />}
          {badge || (to && <ArrowUpRight className="w-4 h-4 text-staff-muted" aria-hidden="true" />)}
        </span>
      )}
      <span className={`block font-display text-[38px] leading-none font-semibold tracking-tight tabular-nums ${accent ? 'text-brand' : edge && t ? t.text : 'text-staff-ink'}`}>
        {value ?? '—'}
      </span>
      <span className="block mt-2 text-[14px] font-medium text-staff-ink">{label}</span>
      {detail && <span className="block mt-0.5 text-[12.5px] text-staff-muted">{detail}</span>}
      {segments && segTotal > 0 && (
        <span className="block mt-4">
          <span className="flex h-1.5 rounded-full overflow-hidden bg-staff-line2">
            {segments.map((s, i) => <span key={i} className={TONES[s.tone]?.bar} style={{ width: `${pct(s.value, barOf ?? segTotal)}%` }} />)}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-staff-muted">
            {segments.map((s, i) => <span key={i} className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${TONES[s.tone]?.bar}`} />{s.value} {s.label}</span>)}
          </span>
        </span>
      )}
      {bar && !segments && bar.of > 0 && (
        <span className="block mt-4 h-1.5 rounded-full bg-staff-line2"><span className={`block h-full rounded-full ${t?.bar || TONES.slate.bar}`} style={{ width: `${pct(bar.value, bar.of)}%` }} /></span>
      )}
    </>
  )
  const cls = `block bg-white rounded-xl border border-staff-line px-5 py-5 min-w-0 ${t || Icon ? 'shadow-card' : ''}`
  const style = edge && t ? { borderTop: `3px solid ${t.edge}` } : undefined
  return to ? (
    <Link to={to} style={style} className={`${cls} transition hover:border-slate-300 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}>{body}</Link>
  ) : (
    <div style={style} className={cls}>{body}</div>
  )
}

export function MetricBadge({ tone = 'slate', icon: Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${TONES[tone]?.chip}`}>
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}{children}
    </span>
  )
}
