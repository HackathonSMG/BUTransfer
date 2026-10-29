import React from 'react'
import { Gauge } from 'lucide-react'

// Transfer Credit Evaluation Impact: the measured outcome. Every number comes from the API (impact.service),
// counted from stored decisions, syllabus requests and timestamps. A figure without data shows "—".
// compact: one application (Credit Office application page).
const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`)
const fmtHours = (h) => (h == null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`)

export default function ImpactPanel({ impact: m, compact = false }) {
  if (!m || !m.courses) return null
  const facts = [
    [m.courses, `course${m.courses === 1 ? '' : 's'} submitted`],
    [m.automatic, 'resolved automatically', `${m.by_equivalency} established equivalenc${m.by_equivalency === 1 ? 'y' : 'ies'} · ${m.by_policy} policy rule${m.by_policy === 1 ? '' : 's'}`],
    [m.by_department, 'decided by department evaluators'],
    [m.pending, 'pending', m.with_department ? `${m.with_department} with departments` : null],
    ...(m.quarter_courses ? [[m.quarter_courses, `quarter-system course${m.quarter_courses === 1 ? '' : 's'} converted`]] : [])
  ]
  return (
    <section className="staff-card overflow-hidden" aria-labelledby={compact ? undefined : 'impact'}>
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-end justify-between gap-4 border-b border-staff-line2">
        <div>
          <h2 id={compact ? undefined : 'impact'} className="flex items-center gap-2 text-[17px] font-semibold text-staff-ink">
            <Gauge className="w-[18px] h-[18px] text-staff-ink2" />{compact ? 'Evaluation impact for this student' : 'Transfer Credit Evaluation Impact'}
          </h2>
          <p className="text-[13px] text-staff-muted mt-0.5">Courses settled without department work, from recorded decisions.</p>
        </div>
        <div className="text-right">
          <p className="text-[34px] leading-none font-semibold text-staff-ink tabular-nums">{fmt(m.automation_rate, '%')}</p>
          <p className="text-[12.5px] text-staff-ink2 mt-1">resolved without department intervention</p>
          <p className="text-[11.5px] text-staff-muted">{m.automatic} of {m.courses} course{m.courses === 1 ? '' : 's'} evaluated</p>
        </div>
      </div>
      <ul className={`grid grid-cols-2 ${facts.length > 4 ? 'md:grid-cols-5' : 'md:grid-cols-4'} divide-x divide-y md:divide-y-0 divide-staff-line2`}>
        {facts.map(([value, label, detail]) => (
          <li key={label} className="px-5 py-4">
            <p className="text-[24px] font-semibold text-staff-ink tabular-nums leading-tight">{value}</p>
            <p className="text-[13px] text-staff-ink2">{label}</p>
            {detail && <p className="text-[11.5px] text-staff-muted mt-0.5">{detail}</p>}
          </li>
        ))}
      </ul>
      {!compact && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 px-6 py-4 border-t border-staff-line2 text-[13px]">
          <Stat label="Outcomes" value={`${m.outcomes.equivalent} equivalent · ${m.outcomes.elective} elective · ${m.outcomes.no_credit} no credit`} />
          <Stat label="Syllabus requested" value={`${m.syllabus_requested} course${m.syllabus_requested === 1 ? '' : 's'}`} hint={`${m.department_without_request} department decision${m.department_without_request === 1 ? '' : 's'} needed no syllabus or information request`} />
          <Stat label="Evaluators agreed with the recommendation" value={fmt(m.recommendation_agreement, '%')} hint="of department decisions" />
          <Stat label="Median time to decision" value={`${fmtHours(m.median_hours.to_decision_automatic)} automatic · ${fmtHours(m.median_hours.to_decision_department)} department`} hint={`Evaluator review: ${fmtHours(m.median_hours.evaluator_review)} median`} />
        </dl>
      )}
      {!compact && m.knowledge && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 px-6 py-4 border-t border-staff-line2 text-[13px]">
          <Stat label="Institutional knowledge" value={`${m.knowledge.equivalencies} established equivalencies`} hint={`${m.knowledge.learned_equivalencies} learned from department decisions or office standards`} />
          <Stat label="Precedents on record" value={`${m.knowledge.precedents} past decisions`} hint={`${m.knowledge.learned_precedents} recorded by department evaluators in this system`} />
          <Stat label="Courses settled by reuse" value={`${m.knowledge.reused} course${m.knowledge.reused === 1 ? '' : 's'}`} hint="settled by an established equivalency instead of a new review" />
          <Stat label="How it grows" value="Each department decision becomes a precedent" hint="Agreeing decisions by different evaluators become an equivalency" />
        </dl>
      )}
    </section>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <dt className="text-staff-muted">{label}</dt>
      <dd className="text-staff-ink font-medium mt-0.5">{value}</dd>
      {hint && <dd className="text-[11.5px] text-staff-muted">{hint}</dd>}
    </div>
  )
}
