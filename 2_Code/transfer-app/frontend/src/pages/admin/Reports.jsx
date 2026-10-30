import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Files, BookOpen, Sparkles, BadgeCheck, GitCompare, Printer, Download, ChevronDown, Info, FileDown, FileText, ArrowRight } from 'lucide-react'
import { getOverview, getReports, getConflicts } from '../../api/admin'
import { getMemory } from '../../api/memory'
import { listApplications } from '../../api/applications'
import notify from '../../lib/notify'
import PageHeader from '../../components/staff/PageHeader'
import Metric from '../../components/staff/Metric'
import Spinner from '../../components/ui/Spinner'
import ImpactPanel from '../../components/staff/ImpactPanel'
import { STATUS_LABELS } from '../../components/application/StatusBadge'

// Workflow order for the status chart, each with its colour: blue with evaluators, amber waiting on the student,
// red failed, violet awaiting final review, green posted or approved, grey closed or draft
const STATUS_ORDER = ['submitted', 'under_evaluation', 'evaluation_completed', 'under_evaluator_review', 'information_required',
  'validation_failed', 'ready_for_posting', 'credit_posted', 'approved', 'rejected', 'closed', 'draft']
const STATUS_COLORS = {
  submitted: '#7dd3fc', under_evaluation: '#0ea5e9', evaluation_completed: '#0284c7', under_evaluator_review: '#0369a1',
  information_required: '#fbbf24', validation_failed: '#ef4444', ready_for_posting: '#8b5cf6', credit_posted: '#10b981',
  approved: '#059669', rejected: '#fb7185', closed: '#94a3b8', draft: '#cbd5e1'
}

const num = (v) => (v == null ? 0 : Number(v) || 0)
const pct = (n, of) => (of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0)
const monthLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(y, (m || 1) - 1, 1))
}

// Hides the staff navigation when the page is printed or saved as PDF, and keeps the chart colours
const PRINT_CSS = `@media print {
  .staff-shell aside, .staff-shell header.sticky, .staff-shell main > .sticky { display: none !important; }
  .staff-shell { display: block !important; border: 0 !important; background: #fff !important; }
  .staff-shell main { max-width: none !important; padding: 0 !important; }
  .staff-card { box-shadow: none !important; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`

export default function Reports() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  // Supplementary: submissions by month and source, and the open conflicts. The page loads without them.
  const [extra, setExtra] = useState({ reports: null, conflicts: null })

  useEffect(() => {
    getOverview().then(res => setD(res.data)).catch(err => setError(err.response?.data?.message || err.message))
    Promise.all([
      getReports().then(res => res.data).catch(() => null),
      getConflicts().then(res => res.data).catch(() => null)
    ]).then(([reports, conflicts]) => setExtra({ reports, conflicts }))
  }, [])

  const downloads = useDownloads(d, extra.conflicts)

  return (
    <div className="space-y-6">
      <style>{PRINT_CSS}</style>
      <PageHeader
        title="Reports"
        subtitle="Volume, outcomes, workload and what the system has learned."
        actions={d && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-staff-line bg-white px-3.5 py-2 text-[14px] font-medium text-staff-ink2 hover:bg-staff-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <Printer className="w-4 h-4" aria-hidden="true" />Print
            </button>
            <DownloadMenu downloads={downloads} />
          </div>
        )}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : !d ? (
        <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : (
        <>
          <Kpis d={d} reports={extra.reports} conflicts={extra.conflicts} />

          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            <Received reports={extra.reports} />
            <WhereEvaluationsAre byStatus={d.by_status} total={d.applications} onPick={s => navigate(`/admin/applications?status=${s}`)} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {d.impact && <Outcomes outcomes={d.impact.outcomes} />}
            <Programs rows={d.by_program} />
          </div>

          <Workload rows={d.evaluator_workload} />

          <ImpactPanel impact={d.impact} />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-5 items-start">
            <ConflictsCard rows={extra.conflicts} count={d.attention?.conflicts} />
            <DownloadCentre downloads={downloads} />
          </div>
        </>
      )}
    </div>
  )
}

function Card({ title, subtitle, right, children, className = '', label }) {
  return (
    <section className={`staff-card p-5 min-w-0 ${className}`} aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-staff-ink">{title}</h2>
          {subtitle && <p className="text-[12.5px] text-staff-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Kpis({ d, reports, conflicts }) {
  const m = d.impact
  const src = reports?.by_source
  const following = conflicts ? conflicts.reduce((n, c) => n + (c.open_reviews || 0), 0) : null
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" aria-label="Key figures">
      <Metric icon={Files} tone="sky" label="Evaluations" value={d.applications}
        detail={src ? Object.entries(src).map(([k, v]) => `${v} ${k}`).join(' · ') : `${d.open_applications} open`} />
      <Metric icon={BookOpen} tone="slate" label="Courses evaluated" value={m?.courses ?? null}
        detail={m?.quarter_courses ? `${m.quarter_courses} converted from quarters` : null} />
      <Metric icon={Sparkles} tone="violet" label="Settled automatically" value={m?.automation_rate == null ? null : `${m.automation_rate}%`}
        detail={m ? `${m.automatic} of ${m.courses} courses` : null} bar={m ? { value: m.automatic, of: m.courses } : undefined} />
      <Metric icon={BadgeCheck} tone="emerald" label="Credits posted" value={d.credits_posted}
        detail={`${d.completed_applications} evaluation${d.completed_applications === 1 ? '' : 's'} complete`} />
      <Metric icon={GitCompare} tone="red" label="Open conflicts" value={d.attention?.conflicts ?? null} to="/admin/conflicts"
        detail={following == null ? null : `${following} open review${following === 1 ? '' : 's'} follow them`} />
    </section>
  )
}

// Evaluations received per month (last six months, from the reports endpoint). Only months on record are drawn:
// from the first month with an evaluation to the latest; months in between with none show as zero.
function Received({ reports }) {
  const raw = (reports?.monthly_submissions || []).map(r => ({ month: r.month, count: num(r.count) }))
  const months = []
  if (raw.length) {
    const byMonth = Object.fromEntries(raw.map(r => [r.month, r.count]))
    let [y, m] = raw[0].month.split('-').map(Number)
    const last = raw[raw.length - 1].month
    for (let guard = 0; guard < 24; guard++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      months.push({ month: key, count: byMonth[key] || 0 })
      if (key === last) break
      m += 1; if (m > 12) { m = 1; y += 1 }
    }
  }
  const max = Math.max(1, ...months.map(x => x.count))
  const src = reports?.by_source
  return (
    <Card title="Evaluations received" subtitle="By month received, website and email together">
      {!reports ? (
        <p className="mt-6 text-[13px] text-staff-muted">Monthly figures are unavailable right now.</p>
      ) : months.length === 0 ? (
        <p className="mt-6 text-[13px] text-staff-muted">No evaluations received in the last six months.</p>
      ) : (
        <>
          <div className="mt-4 h-[180px] flex items-end gap-3 border-b border-staff-line relative" role="img"
            aria-label={`Evaluations received: ${months.map(x => `${monthLabel(x.month)} ${x.count}`).join(', ')}`}>
            <span className="absolute inset-x-0 top-0 border-t border-dashed border-staff-line2" aria-hidden="true" />
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-staff-line2" aria-hidden="true" />
            {months.map(x => (
              <span key={x.month} className={`relative flex flex-col justify-end h-full ${months.length === 1 ? 'w-24' : 'flex-1 max-w-[96px]'}`}>
                <span className="text-center text-[12px] font-semibold text-staff-ink mb-1 tabular-nums">{x.count}</span>
                <span className="rounded-t-md bg-sky-500" style={{ height: `${Math.max(x.count ? 2 : 0, pct(x.count, max) * 0.85)}%` }} />
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3 text-[11px] text-staff-muted" aria-hidden="true">
            {months.map(x => <span key={x.month} className={`text-center ${months.length === 1 ? 'w-24' : 'flex-1 max-w-[96px]'}`}>{monthLabel(x.month)}</span>)}
          </div>
        </>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-staff-muted">
        {src && Object.entries(src).map(([k, v]) => <span key={k} className="capitalize">{k} {v}</span>)}
        {months.length === 1 && (
          <span className="sm:ml-auto inline-flex items-center gap-1.5"><Info className="w-3.5 h-3.5" aria-hidden="true" />Records start in {monthLabel(months[0].month)}; the trend fills in as evaluations arrive</span>
        )}
      </p>
    </Card>
  )
}

// Where evaluations are: a donut of applications by status; each legend row opens that list
function WhereEvaluationsAre({ byStatus = {}, total, onPick }) {
  const known = STATUS_ORDER.filter(s => byStatus[s])
  const others = Object.keys(byStatus).filter(s => byStatus[s] && !STATUS_ORDER.includes(s))
  const rows = [...known, ...others].map(s => ({ key: s, label: STATUS_LABELS[s] || s, value: byStatus[s], color: STATUS_COLORS[s] || '#94a3b8' }))
  const sum = rows.reduce((n, r) => n + r.value, 0)
  let offset = 0
  return (
    <Card title="Where evaluations are" subtitle="Select a status to see those evaluations">
      {rows.length === 0 ? <p className="mt-6 text-[13px] text-staff-muted">No evaluations yet</p> : (
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative w-[140px] h-[140px] flex-shrink-0" role="img" aria-label={`Evaluations by status: ${rows.map(r => `${r.label} ${r.value}`).join(', ')}`}>
            <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eef0f3" strokeWidth="6" />
              {rows.map(r => {
                const len = pct(r.value, sum)
                const el = <circle key={r.key} cx="21" cy="21" r="15.9155" fill="none" stroke={r.color} strokeWidth="6" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-offset} />
                offset += len
                return el
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div><p className="font-display tabular-nums text-[26px] font-semibold leading-none text-staff-ink">{total ?? sum}</p><p className="text-[11px] text-staff-muted">total</p></div>
            </div>
          </div>
          <ul className="flex-1 w-full space-y-0.5 text-[12.5px]">
            {rows.map(r => (
              <li key={r.key}>
                <button type="button" onClick={() => onPick(r.key)}
                  className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-staff-ink2 hover:bg-staff-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: r.color }} aria-hidden="true" />{r.label}
                  <span className="ml-auto font-semibold text-staff-ink tabular-nums">{r.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Outcomes({ outcomes: o }) {
  const parts = [
    { label: 'BU equivalent', value: num(o.equivalent), bar: 'bg-emerald-500', tile: 'bg-emerald-50/70', text: 'text-emerald-700' },
    { label: 'elective credit', value: num(o.elective), bar: 'bg-sky-500', tile: 'bg-sky-50/70', text: 'text-sky-700' },
    { label: 'no credit', value: num(o.no_credit), bar: 'bg-rose-400', tile: 'bg-rose-50/70', text: 'text-rose-600' }
  ]
  const total = parts.reduce((n, p) => n + p.value, 0)
  const share = (v) => (total ? `${Math.round((v / total) * 1000) / 10}%` : '—')
  return (
    <Card title="Credit transfer outcomes" subtitle={`${total} decided course${total === 1 ? '' : 's'}`}>
      <div className="mt-4 flex h-10 rounded-lg overflow-hidden text-white text-[12.5px] font-semibold bg-staff-line2" role="img"
        aria-label={parts.map(p => `${p.label} ${p.value}`).join(', ')}>
        {parts.filter(p => p.value > 0).map((p, i) => (
          <span key={p.label} className={`${p.bar} flex items-center ${i === 0 ? 'px-3' : 'justify-center'} min-w-0 overflow-hidden whitespace-nowrap`} style={{ flex: p.value }}>
            {i === 0 && pct(p.value, total) > 40 ? `${p.label} · ${p.value}` : p.value}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px]">
        {parts.map(p => (
          <div key={p.label} className={`rounded-lg p-3 ${p.tile}`}>
            <p className={`font-display tabular-nums text-[20px] font-semibold leading-none ${p.text}`}>{share(p.value)}</p>
            <p className="text-staff-ink2 mt-1">{p.value} {p.label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Programs({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.count))
  const tint = ['bg-brand', 'bg-brand/70', 'bg-brand/55', 'bg-brand/40']
  return (
    <Card title="Evaluations by BU program" subtitle="Where transfer students are heading">
      {rows.length === 0 ? <p className="mt-6 text-[13px] text-staff-muted">No evaluations yet</p> : (
        <ul className="mt-4 space-y-2.5 text-[13px]">
          {rows.map((r, i) => (
            <li key={r.program} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_2rem] items-center gap-3">
              <span className="text-staff-ink2 truncate" title={r.program}>{r.program}</span>
              <span className="h-3" aria-hidden="true"><span className={`block h-full rounded-sm ${tint[Math.min(i, tint.length - 1)]}`} style={{ width: `${Math.max(2, pct(r.count, max))}%` }} /></span>
              <span className="text-right font-semibold text-staff-ink tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// Open course reviews against each evaluator's capacity (the red marker), then completed reviews
function Workload({ rows }) {
  const scale = Math.max(1, ...rows.map(r => Math.max(num(r.max_concurrent_cases), num(r.open) + num(r.completed))))
  return (
    <Card title="Evaluator workload" subtitle="Open course reviews against each evaluator's capacity, and reviews completed"
      right={(
        <p className="flex flex-wrap gap-4 text-[12px] text-staff-muted">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-sky-500" aria-hidden="true" />Open</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" aria-hidden="true" />Open, near capacity</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" aria-hidden="true" />Completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-px h-3 bg-red-500" aria-hidden="true" />Capacity</span>
        </p>
      )}>
      {rows.length === 0 ? <p className="mt-6 text-[13px] text-staff-muted">No active evaluators</p> : (
        <ul className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-3 text-[12.5px]">
          {rows.map(r => {
            const cap = num(r.max_concurrent_cases)
            const open = num(r.open)
            const done = num(r.completed)
            const tone = cap && open > cap ? 'bg-red-500' : cap && open >= 0.8 * cap ? 'bg-amber-500' : 'bg-sky-500'
            return (
              <li key={r.full_name} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3"
                title={`${r.full_name}: ${open} open${cap ? ` of ${cap}` : ''}, ${done} completed, ${num(r.queued)} upcoming`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-staff-ink">{r.full_name}</span>
                  {r.department && <span className="block truncate text-[11.5px] text-staff-muted">{r.department}</span>}
                </span>
                <span className="relative h-3 rounded-sm bg-staff-sunk flex" aria-hidden="true">
                  {open > 0 && <span className={`${tone} ${done ? 'rounded-l-sm' : 'rounded-sm'}`} style={{ width: `${pct(open, scale)}%` }} />}
                  {done > 0 && <span className={`bg-emerald-500 ${open ? 'rounded-r-sm' : 'rounded-sm'}`} style={{ width: `${pct(done, scale)}%` }} />}
                  {cap > 0 && <span className="absolute -top-[3px] -bottom-[3px] w-px bg-red-500" style={{ left: `${pct(cap, scale)}%` }} />}
                </span>
                <span className="text-right text-staff-ink2 tabular-nums whitespace-nowrap">
                  <b className="text-staff-ink">{open}</b>{cap ? ` / ${cap}` : ''} open · {done} done
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

const TYPE_LABELS = { different_bu_course: ['Different BU course', 'bg-red-500'], different_outcome: ['Different outcome', 'bg-amber-400'], match_divergence: ['Match scores differ', 'bg-sky-500'] }

function ConflictsCard({ rows, count }) {
  const byType = {}
  ;(rows || []).forEach(c => c.conflicts.forEach(x => { byType[x.type] = (byType[x.type] || 0) + 1 }))
  const types = Object.entries(byType)
  const following = (rows || []).reduce((n, c) => n + (c.open_reviews || 0), 0)
  const open = rows ? rows.length : count
  return (
    <Card title="Equivalency conflicts" subtitle="Courses where earlier decisions disagree"
      right={<Link to="/admin/conflicts" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 hover:text-primary-800 print:hidden">Review<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>}>
      <div className="mt-3 flex items-end gap-6">
        <div><p className="font-display tabular-nums text-[28px] font-semibold text-red-700 leading-none">{open ?? '—'}</p><p className="text-[12px] text-staff-muted mt-1">open</p></div>
        {rows && <div><p className="font-display tabular-nums text-[28px] font-semibold text-staff-ink leading-none">{following}</p><p className="text-[12px] text-staff-muted mt-1">open reviews follow them</p></div>}
      </div>
      {types.length > 0 && (
        <>
          <div className="mt-3 flex h-2 rounded-full overflow-hidden gap-0.5" role="img" aria-label={types.map(([t, n]) => `${(TYPE_LABELS[t] || [t])[0]} ${n}`).join(', ')}>
            {types.map(([t, n]) => <span key={t} className={(TYPE_LABELS[t] || [t, 'bg-slate-400'])[1]} style={{ flex: n }} />)}
          </div>
          <p className="mt-1.5 text-[12px] text-staff-muted">{types.map(([t, n]) => `${n} ${((TYPE_LABELS[t] || [t])[0]).toLowerCase()}`).join(' · ')}</p>
        </>
      )}
    </Card>
  )
}

// ---- Downloads: built in the browser from data the portal already serves. CSV opens in Excel; PDF is the
// browser's print dialog ("Save as PDF").

function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(c => cell(c[0])), ...rows.map(r => columns.map(c => cell(typeof c[1] === 'function' ? c[1](r) : r[c[1]])))]
    .map(line => line.join(',')).join('\r\n')
}

function saveCsv(name, columns, rows) {
  // The byte-order mark lets Excel read accented names correctly
  const blob = new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Every application, one page of 100 at a time
async function allApplications() {
  const rows = []
  for (let page = 1; page <= 200; page++) {
    const res = await listApplications({ page, limit: 100 })
    rows.push(...(res.data || []))
    if (page >= (res.meta?.pages || 1)) break
  }
  return rows
}

function useDownloads(d, conflicts) {
  const [busy, setBusy] = useState(null)
  const run = (key, fn) => async () => {
    if (busy) return
    setBusy(key)
    try { await fn() } catch (err) { notify.error(err.response?.data?.message || 'The download could not be prepared') } finally { setBusy(null) }
  }
  const list = [
    {
      key: 'summary', title: 'Transfer credit summary', format: 'PDF',
      detail: 'The figures and charts on this page. Opens the print dialog; choose “Save as PDF”.',
      action: () => window.print()
    },
    {
      key: 'register', title: 'Evaluations register', format: 'CSV',
      detail: 'One row per evaluation: reference, student, source, college, BU program and department, start term, status, submitted, decision',
      action: run('register', async () => saveCsv('evaluations-register', [
        ['Reference', 'reference_number'], ['Student', 'student_name'], ['Student email', 'student_email'], ['Source', 'source'],
        ['Transfer from', 'transfer_from_institution'], ['BU program', 'transfer_to_program'], ['BU department', 'transfer_to_department'],
        ['Start term', 'expected_start_term'], ['Status', r => STATUS_LABELS[r.status] || r.status], ['Received', 'created_at'],
        ['Submitted', 'submitted_at'], ['Final decision', 'final_decision'], ['Decision date', 'decision_date'],
        ['Open course reviews', 'open_reviews'], ['Current owner', 'current_owner_name']
      ], await allApplications()))
    },
    {
      key: 'decisions', title: 'Decisions on record', format: 'CSV',
      detail: 'One row per past decision (precedent): source course, decision, BU award, reason, evaluator, date, origin, status',
      action: run('decisions', async () => {
        const res = await getMemory()
        saveCsv('decisions-on-record', [
          ['Decision ID', 'decision_id'], ['Institution', 'institution'], ['Course code', 'course_code'], ['Proposed BU course', 'proposed_bu'],
          ['Decision', 'decision'], ['BU awarded', 'bu_awarded'], ['Reason', 'reason'], ['Decided on', 'decided_on'],
          ['Evaluator', 'evaluator'], ['Origin', r => (r.source === 'evaluator' ? 'Evaluator in this system' : r.source)], ['Status', 'status']
        ], res.data?.past_decisions || [])
      })
    },
    {
      key: 'workload', title: 'Evaluator workload', format: 'CSV',
      detail: 'Per active evaluator: department, open, upcoming and completed course reviews, capacity',
      action: run('workload', async () => saveCsv('evaluator-workload', [
        ['Evaluator', 'full_name'], ['Department', 'department'], ['Open reviews', 'open'], ['Upcoming (queued)', 'queued'],
        ['Completed reviews', 'completed'], ['Capacity', 'max_concurrent_cases']
      ], d?.evaluator_workload || []))
    },
    {
      key: 'catalog', title: 'Equivalency catalog', format: 'CSV',
      detail: 'Every equivalency with its BU course, outcome, approval date, origin and status, for departments and advisors',
      action: run('catalog', async () => {
        const res = await getMemory()
        saveCsv('equivalency-catalog', [
          ['ID', 'eq_id'], ['Institution', 'institution'], ['Course code', 'course_code'], ['Title', 'title'], ['BU course', 'bu_course'],
          ['Outcome', 'outcome'], ['Approved on', 'approved_on'], ['Evaluator', 'evaluator'],
          ['Origin', r => ({ promoted: 'Learned from evaluator decisions', standard: 'Office standard', manual: 'Added by the Credit Evaluation Office', imported: 'Imported' }[r.source] || r.source)], ['Status', 'status'],
          ['Learned from decisions', 'promoted_from']
        ], res.data?.equivalencies || [])
      })
    },
    {
      key: 'conflicts', title: 'Open conflicts', format: 'CSV',
      detail: 'Each open conflict with the decisions on each side: award, who decided, when and why',
      action: run('conflicts', async () => {
        const rows = (await getConflicts()).data || conflicts || []
        const flat = rows.flatMap(c => {
          const base = {
            institution: c.institution, course_code: c.course_code, title: c.title, open_reviews: c.open_reviews,
            types: c.conflicts.map(x => x.type.replace(/_/g, ' ')).join('; '),
            established: c.established ? c.established.bu_course || c.established.outcome : ''
          }
          const decisions = c.previous?.decisions || []
          return decisions.length ? decisions.map(dc => ({
            ...base, award: (c.previous.outcomes.find(o => o.decision_ids.includes(dc.decision_id)) || {}).award,
            decided_by: dc.source === 'evaluator' ? dc.evaluator || 'Evaluator' : 'Reference record', decided_on: dc.decided_on, reason: dc.reason
          })) : [base]
        })
        saveCsv('open-conflicts', [
          ['Institution', 'institution'], ['Course code', 'course_code'], ['Title', 'title'], ['Conflict type', 'types'],
          ['Open reviews', 'open_reviews'], ['Established equivalency', 'established'], ['Award', 'award'],
          ['Decided by', 'decided_by'], ['Decided on', 'decided_on'], ['Reason', 'reason']
        ], flat)
      })
    }
  ]
  return { list, busy }
}

function FormatButton({ item, busy }) {
  const pdf = item.format === 'PDF'
  return (
    <button type="button" onClick={item.action} disabled={!!busy} aria-label={`Download ${item.title} as ${item.format}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 whitespace-nowrap disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
        ${pdf ? 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}>
      {busy === item.key ? <Spinner size="sm" /> : pdf ? <FileText className="w-3.5 h-3.5" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
      {item.format}
    </button>
  )
}

function DownloadCentre({ downloads }) {
  return (
    <section className="staff-card overflow-hidden print:hidden" aria-labelledby="downloads">
      <div className="px-6 py-4 border-b border-staff-line2 flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-red-50 text-brand"><FileDown className="w-[18px] h-[18px]" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <h2 id="downloads" className="text-[16px] font-semibold text-staff-ink">Download reports</h2>
          <p className="text-[12.5px] text-staff-muted">Current data, all evaluations. CSV files open in Excel; PDF uses your browser's “Save as PDF”.</p>
        </span>
      </div>
      <ul className="divide-y divide-staff-line2 text-[14px]">
        {downloads.list.map(item => (
          <li key={item.key} className="px-6 py-3.5 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2">
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-staff-ink">{item.title}</span>
              <span className="block text-[12.5px] text-staff-muted">{item.detail}</span>
            </span>
            <FormatButton item={item} busy={downloads.busy} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// The header's download menu: the same downloads as the card
function DownloadMenu({ downloads }) {
  const ref = useRef(null)
  const pick = (item) => { if (ref.current) ref.current.open = false; item.action() }
  return (
    <details ref={ref} className="relative">
      <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 rounded-lg bg-brand text-white px-4 py-2 text-[14px] font-semibold shadow-sm cursor-pointer hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        {downloads.busy ? <Spinner size="sm" /> : <Download className="w-4 h-4" aria-hidden="true" />}Download report<ChevronDown className="w-4 h-4" aria-hidden="true" />
      </summary>
      <ul className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-staff-line bg-white py-1.5 shadow-lift">
        {downloads.list.map(item => (
          <li key={item.key}>
            <button type="button" onClick={() => pick(item)} disabled={!!downloads.busy}
              className="w-full flex items-center gap-3 px-4 py-2 text-left text-[13.5px] text-staff-ink hover:bg-staff-bg disabled:opacity-60 focus:outline-none focus-visible:bg-staff-bg">
              <span className="flex-1 min-w-0 truncate">{item.title}</span>
              <span className={`text-[11px] font-semibold ${item.format === 'PDF' ? 'text-red-700' : 'text-emerald-700'}`}>{item.format}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
