import React from 'react'
import { Gauge, ChevronRight } from 'lucide-react'

// Transfer Credit Evaluation Impact: the measured outcome. Every number comes from the API (impact.service),
// counted from stored decisions, syllabus requests and timestamps. A figure without data shows "—".
// compact: one application (Credit Office application page): the headline and the flow only.
const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`)
const fmtHours = (h) => (h == null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`)
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many)
const share = (n, of) => (of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0)

// How the courses were settled; the donut, its legend and the flow use the same colours
const PARTS = [
  { key: 'by_equivalency', label: 'Established equivalency', color: '#7c3aed', cls: 'bg-violet-600' },
  { key: 'by_policy', label: 'BU policy rule', color: '#0ea5e9', cls: 'bg-sky-500' },
  { key: 'by_department', label: 'Decided by departments', color: '#10b981', cls: 'bg-emerald-500' },
  { key: 'pending', label: 'Still pending', color: '#fbbf24', cls: 'bg-amber-400' }
]

export default function ImpactPanel({ impact: m, compact = false }) {
  if (!m || !m.courses) return null
  const k = m.knowledge
  return (
    <section className="staff-card overflow-hidden" aria-labelledby={compact ? undefined : 'impact'}>
      <div className="px-6 py-4 flex items-center gap-3 border-b border-staff-line2">
        <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-violet-50 text-violet-700"><Gauge className="w-[18px] h-[18px]" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <h2 id={compact ? undefined : 'impact'} className="text-[16px] font-semibold text-staff-ink">
            {compact ? 'Evaluation impact for this student' : 'Transfer Credit Evaluation Impact'}
          </h2>
          <p className="text-[12.5px] text-staff-muted">Courses settled without department work, from recorded decisions</p>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x divide-staff-line2">
        <Headline m={m} />
        <div className="p-6 space-y-6 min-w-0">
          <Flow m={m} />
          {!compact && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Outcomes outcomes={m.outcomes} />
              <Agreement value={m.recommendation_agreement} reviewHours={m.median_hours.evaluator_review} />
            </div>
          )}
        </div>
      </div>

      {!compact && k && (
        <div className="border-t border-staff-line2 bg-staff-sunk/50 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="staff-eyebrow">Institutional knowledge · how it grows</p>
            {m.quarter_courses > 0 && (
              <span className="text-[12px] text-staff-muted">{m.quarter_courses} quarter-system {plural(m.quarter_courses, 'course')} converted to semester credit</span>
            )}
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch xl:items-center gap-3" aria-label="How department decisions become reusable equivalencies">
            <li className="rounded-xl bg-white border border-staff-line p-4">
              <p className="font-display tabular-nums text-[26px] font-semibold leading-none text-staff-ink">{k.precedents}</p>
              <p className="text-[12.5px] text-staff-ink2 mt-1.5">past {plural(k.precedents, 'decision')} on record</p>
              <p className="text-[11.5px] text-staff-muted">{k.learned_precedents} by evaluators here</p>
            </li>
            <Arrow />
            <li className="rounded-xl bg-white border border-staff-line p-4">
              <p className="text-[12.5px] font-semibold text-staff-ink">Different evaluators agree</p>
              <p className="text-[11.5px] text-staff-muted mt-1">on the same award for the same course</p>
            </li>
            <Arrow />
            <li className="rounded-xl bg-white border border-violet-200 p-4">
              <p className="font-display tabular-nums text-[26px] font-semibold leading-none text-violet-800">{k.equivalencies}</p>
              <p className="text-[12.5px] text-staff-ink2 mt-1.5">established {plural(k.equivalencies, 'equivalency', 'equivalencies')}</p>
              <p className="text-[11.5px] text-violet-700">{k.learned_equivalencies} learned from decisions or office standards</p>
            </li>
            <Arrow />
            <li className="rounded-xl bg-violet-600 text-white p-4">
              <p className="font-display tabular-nums text-[26px] font-semibold leading-none">{k.reused}</p>
              <p className="text-[12.5px] text-white/90 mt-1.5">{plural(k.reused, 'course')} settled by reuse</p>
              <p className="text-[11.5px] text-white/75">instead of a new review</p>
            </li>
          </ol>
        </div>
      )}
      {compact && m.quarter_courses > 0 && (
        <p className="px-6 py-3 border-t border-staff-line2 text-[12px] text-staff-muted">
          {m.quarter_courses} quarter-system {plural(m.quarter_courses, 'course')} converted to semester credit
        </p>
      )}
    </section>
  )
}

function Arrow() {
  return <li className="hidden xl:block" aria-hidden="true"><ChevronRight className="w-5 h-5 text-staff-muted" /></li>
}

// The share settled automatically, as a donut split by how each course was settled
function Headline({ m }) {
  const parts = PARTS.map(p => ({ ...p, value: m[p.key] || 0 }))
  const total = parts.reduce((n, p) => n + p.value, 0)
  let offset = 0
  const arcs = parts.filter(p => p.value > 0).map(p => {
    const len = share(p.value, total)
    const arc = { ...p, len, offset }
    offset += len
    return arc
  })
  return (
    <div className="p-6 flex flex-col items-center text-center">
      <div className="relative w-[188px] h-[188px]" role="img"
        aria-label={`${fmt(m.automation_rate, '%')} settled automatically: ${parts.map(p => `${p.value} ${p.label.toLowerCase()}`).join(', ')}`}>
        <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eef0f3" strokeWidth="5" />
          {arcs.map(a => (
            <circle key={a.key} cx="21" cy="21" r="15.9155" fill="none" stroke={a.color} strokeWidth="5"
              strokeDasharray={`${a.len} ${100 - a.len}`} strokeDashoffset={-a.offset} />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className="font-display tabular-nums text-[40px] font-semibold leading-none text-staff-ink">
              {m.automation_rate == null ? '—' : <>{m.automation_rate}<span className="text-[22px]">%</span></>}
            </p>
            <p className="text-[11.5px] text-staff-muted mt-1">settled<br />automatically</p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-staff-ink2">
        <b className="text-staff-ink">{m.automatic} of {m.courses}</b> {plural(m.courses, 'course')} needed no department review
      </p>
      <ul className="mt-4 w-full space-y-1.5 text-[12.5px] text-left">
        {parts.map(p => (
          <li key={p.key} className="flex items-center gap-2 text-staff-ink2">
            <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${p.cls}`} aria-hidden="true" />{p.label}
            <span className="ml-auto font-semibold text-staff-ink tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// How the submitted courses moved: automatic, department, pending; each bar's width is its share of the submitted
function Flow({ m }) {
  const rows = [
    { label: 'Submitted', value: m.courses, bar: <span className="block h-full rounded-md bg-staff-ink" /> },
    {
      label: 'Automatic', value: m.automatic,
      bar: (
        <span className="flex h-full rounded-md overflow-hidden">
          <span className="bg-violet-600" style={{ flex: m.by_equivalency || 0 }} />
          <span className="bg-sky-500" style={{ flex: m.by_policy || 0 }} />
        </span>
      ),
      detail: `${m.by_equivalency} equivalency · ${m.by_policy} policy · median ${fmtHours(m.median_hours.to_decision_automatic)}`
    },
    {
      label: 'Departments', value: m.by_department, bar: <span className="block h-full rounded-md bg-emerald-500" />,
      detail: `decided · median ${fmtHours(m.median_hours.to_decision_department)} · ${m.syllabus_requested} ${plural(m.syllabus_requested, 'syllabus', 'syllabi')} requested · ${m.department_without_request} decided without one`
    },
    {
      label: 'Pending', value: m.pending, bar: <span className="block h-full rounded-md bg-amber-400" />,
      detail: m.with_department ? `${m.with_department} with departments now` : null
    }
  ]
  return (
    <div>
      <p className="staff-eyebrow mb-3">How the {m.courses} submitted {plural(m.courses, 'course')} moved</p>
      <ul className="space-y-2.5 text-[13px]">
        {rows.map(r => (
          <li key={r.label} className="grid grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)] gap-x-4 items-center">
            <span className="text-staff-ink2">{r.label}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span className="flex items-center gap-3 flex-1 min-w-[140px]">
                <span className="h-7 flex-1" aria-hidden="true">
                  <span className="block h-full" style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, share(r.value, m.courses))}%` }}>{r.value > 0 && r.bar}</span>
                </span>
                <span className="font-display tabular-nums text-[16px] font-semibold text-staff-ink w-10 text-right">{r.value}</span>
              </span>
              {r.detail && <span className="text-[12px] text-staff-muted sm:basis-auto basis-full">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// What the decided courses earned, as one stacked bar
function Outcomes({ outcomes: o }) {
  const parts = [
    { label: 'BU equivalent', value: o.equivalent || 0, bar: 'bg-emerald-500', text: 'text-emerald-700' },
    { label: 'elective credit', value: o.elective || 0, bar: 'bg-sky-500', text: 'text-sky-700' },
    { label: 'no credit', value: o.no_credit || 0, bar: 'bg-rose-400', text: 'text-rose-600' }
  ]
  const total = parts.reduce((n, p) => n + p.value, 0)
  return (
    <div className="rounded-xl border border-staff-line p-4">
      <p className="staff-eyebrow mb-3">What decided courses earned</p>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-staff-line2" role="img"
        aria-label={parts.map(p => `${p.value} ${p.label}`).join(', ')}>
        {total > 0 && parts.filter(p => p.value > 0).map(p => <span key={p.label} className={p.bar} style={{ flex: p.value }} />)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
        {parts.map(p => (
          <div key={p.label}>
            <p className={`font-display tabular-nums text-[22px] font-semibold leading-none ${p.text}`}>{p.value}</p>
            <p className="text-staff-muted mt-1">{p.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// How often department evaluators agreed with the recommendation, as a half gauge
function Agreement({ value, reviewHours }) {
  const ARC = Math.PI * 42
  const color = value == null ? '#cbd5e1' : value >= 75 ? '#059669' : '#d97706'
  return (
    <div className="rounded-xl border border-staff-line p-4 flex items-center gap-5">
      <div className="relative w-[110px] h-[62px] flex-shrink-0" role="img" aria-label={`Evaluator agreement ${fmt(value, '%')}`}>
        <svg viewBox="0 0 100 55" className="w-full h-full" aria-hidden="true">
          <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke="#eef0f3" strokeWidth="10" strokeLinecap="round" />
          {value > 0 && (
            <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(share(value, 100) / 100) * ARC} ${ARC}`} />
          )}
        </svg>
        <p className="absolute inset-x-0 bottom-0 text-center font-display tabular-nums text-[20px] font-semibold text-staff-ink">{fmt(value, '%')}</p>
      </div>
      <div className="min-w-0">
        <p className="staff-eyebrow">Evaluator agreement</p>
        <p className="text-[13px] text-staff-ink2 mt-1">of department decisions matched the system's recommendation</p>
        <p className="text-[11.5px] text-staff-muted mt-1">Evaluator review: {fmtHours(reviewHours)} median</p>
      </div>
    </div>
  )
}
