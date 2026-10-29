import React from 'react'
import { formatDate } from '../../lib/reviews'

const DOT = { done: 'bg-emerald-500', skipped: 'bg-slate-300', failed: 'bg-amber-500' }
const duration = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

// What each automated stage of the latest evaluation did (ai_evaluations.pipeline_trace), in order, with its
// timing. It shows the work done before a department evaluator opened the application; it decides nothing.
export default function PreparationTrace({ trace }) {
  if (!trace?.stages?.length) return null
  const routing = trace.stages.find(s => s.key === 'routing')
  const left = routing?.metrics?.reviews
  return (
    <section className="staff-card">
      <div className="px-6 pt-5 pb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[17px] font-semibold text-staff-ink">How this evaluation was prepared</h2>
        <p className="text-[12.5px] text-staff-muted tabular-nums">{formatDate(trace.started_at)} · {duration(trace.total_ms)} in total</p>
      </div>
      <ol className="px-6 pb-2">
        {trace.stages.map((s, i) => (
          <li key={s.key} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 pb-4">
            {i < trace.stages.length - 1 && <span className="absolute left-[0.55rem] top-4 bottom-0 w-px bg-staff-line" aria-hidden="true" />}
            <span className={`relative mt-1.5 w-2.5 h-2.5 rounded-full ${DOT[s.status] || DOT.done}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-staff-ink">{s.label}{s.status === 'skipped' ? <span className="font-normal text-staff-muted"> · not run</span> : s.status === 'failed' ? <span className="font-normal text-amber-800"> · needs attention</span> : null}</span>
              <span className="block text-[13.5px] text-staff-ink2">{s.summary}</span>
            </span>
            <span className="text-[12px] text-staff-muted tabular-nums mt-0.5">{duration(s.ms)}</span>
          </li>
        ))}
      </ol>
      <p className="px-6 py-3 border-t border-staff-line2 text-[12.5px] text-staff-muted">
        {left != null ? `${left} course${left === 1 ? '' : 's'} left for department evaluators. ` : ''}
        These steps ran before any evaluator opened the application. Every academic decision stays with the department evaluators and the Credit Evaluation Office.
      </p>
    </section>
  )
}
