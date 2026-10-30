import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ClipboardCheck, ChevronRight, ChevronDown, ArrowRight, Play, Flame, ShieldCheck, FileQuestion } from 'lucide-react'
import { getMyReviews } from '../../api/my'
import StatusPill from '../../components/staff/StatusPill'
import PageHeader from '../../components/staff/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, matchLabelClass, matchDisplay, initials } from '../../lib/reviews'
import { pendingFor, formatDateTime } from '../../lib/staffFormat'

const TABS = [
  ['open', 'Open'],
  ['new', 'New'],
  ['in_progress', 'In progress'],
  ['info_requested', 'Waiting'],
  ['upcoming', 'Upcoming'],
  ['completed', 'Completed'],
  ['all', 'All']
]

// Status colours on the tabs (the same meanings as on the dashboards)
const TAB_DOTS = {
  new: 'bg-sky-500',
  in_progress: 'bg-amber-400',
  info_requested: 'bg-amber-200 ring-1 ring-amber-400',
  upcoming: 'bg-slate-400',
  completed: 'bg-emerald-500'
}

// Statuses an evaluator can work on now (the "Next up" card picks from these)
const ACTIVE = ['new', 'in_progress', 'info_requested']

const SEARCH_DELAY_MS = 350

export default function MyEvaluations() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('status')) ? params.get('status') : 'open'
  const search = params.get('search') || ''
  const [searchText, setSearchText] = useState(search)
  const [state, setState] = useState({ loading: true, rows: [], counts: {}, error: null })

  // Keep tab and search in the URL so the top bar search and dashboard links land here filtered
  const setParam = (key, value) => setParams(p => {
    const next = new URLSearchParams(p)
    if (value) next.set(key, value); else next.delete(key)
    return next
  }, { replace: true })

  useEffect(() => { setSearchText(search) }, [search])
  useEffect(() => {
    if (searchText === search) return
    const t = setTimeout(() => setParam('search', searchText.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [searchText, search])

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const res = await getMyReviews({ status: tab, ...(search && { search }) })
      setState({ loading: false, rows: res.data || [], counts: res.meta?.counts || {}, error: null })
    } catch (err) {
      setState({ loading: false, rows: [], counts: {}, error: err.response?.data?.message || err.message })
    }
  }, [tab, search])

  useEffect(() => { load() }, [load])

  const nextUp = state.rows.find(r => ACTIVE.includes(r.status))

  return (
    <div className="space-y-6">
      <PageHeader title="My Evaluations" subtitle="Your courses, grouped by student, most urgent first. Expand a student and open a course to review it." />

      {!state.loading && !state.error && nextUp && <NextUp r={nextUp} />}

      <section className="staff-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-staff-line2 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-0.5 p-1 rounded-lg bg-staff-sunk" role="tablist">
            {TABS.filter(([key]) => key !== 'upcoming' || state.counts.upcoming > 0 || tab === 'upcoming').map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParam('status', key === 'open' ? '' : key)}
                className={`px-3 py-1 rounded-md text-[13px] transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  tab === key ? 'bg-white text-staff-ink font-medium shadow-card' : 'text-staff-muted hover:text-staff-ink'
                }`}
              >
                {TAB_DOTS[key] && <span className={`w-1.5 h-1.5 rounded-full ${TAB_DOTS[key]}`} aria-hidden="true" />}
                {label}
                <span className={`text-[11px] tabular-nums ${tab === key ? 'font-semibold px-1.5 rounded-full bg-brand text-white' : ''}`}>
                  {state.counts[key] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Student, reference, course..."
              aria-label="Search my evaluations"
              className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        {state.loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
        ) : state.error ? (
          <EmptyState icon={ClipboardCheck} title="Your evaluations could not be loaded" description={state.error} action={load} actionLabel="Try Again" />
        ) : state.rows.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={search ? 'Nothing matches your search' : 'Nothing here'}
            description={search ? 'Try another student, reference or course code.' : 'Courses assigned to you appear here as transcripts are evaluated.'}
          />
        ) : (
          <>
            <ul className="divide-y divide-staff-line2">
              {groupByApplication(state.rows).map(g => (
                <ApplicationGroup key={g.application_id} g={g} defaultOpen={Boolean(search)} />
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-staff-line2 text-[12.5px] text-staff-muted flex flex-wrap gap-x-5 gap-y-1">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Strong or approved</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />Partial</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-rose-400" aria-hidden="true" />Weak or must be taken at BU</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-staff-line2 ring-1 ring-staff-line" aria-hidden="true" />Not scored</span>
              <span className="sm:ml-auto">Match strength is advisory; the decision is yours</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// The course to open now: the first reviewable course in the list's order (high priority first, then oldest)
function NextUp({ r }) {
  const m = matchDisplay(r)
  const inProgress = r.status === 'in_progress'
  const since = inProgress ? r.started_at || r.assigned_at : r.assigned_at
  const detail = [
    m.label ? [m.value, m.label].filter(Boolean).join(' ') : 'Not scored',
    r.institution,
    since && (inProgress ? `in progress for ${pendingFor(since)}` : `waiting ${pendingFor(since)}`)
  ].filter(Boolean).join(' · ')
  return (
    <section aria-label="Next up" className="rounded-2xl bg-staff-ink text-white p-5 flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-5 shadow-card">
      <span className="w-12 h-12 rounded-xl bg-white/10 grid place-items-center flex-shrink-0"><Play className="w-5 h-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/60 font-semibold">Next up{r.priority === 'high' ? ' · high priority' : ''}</p>
        <p className="text-[18px] font-semibold mt-0.5 truncate">
          {r.student_name} · <span className="font-mono">{r.course_code}</span>
          <span className="text-white/60"> → </span>
          {r.target_bu_course ? <span className="font-mono text-red-300">{r.target_bu_course}</span> : <span className="italic font-normal text-white/70">to be determined</span>}
        </p>
        <p className="text-[13px] text-white/70 truncate">{detail}</p>
      </div>
      <Link
        to={`/evaluator/reviews/${r.id}`}
        className="inline-flex items-center gap-2 rounded-lg bg-white text-staff-ink px-4 py-2.5 text-[14px] font-semibold hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-staff-ink whitespace-nowrap"
      >
        {inProgress ? 'Continue review' : 'Start review'}<ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  )
}

// One record per application (Transfer Credit ID), in the order the API ranked its most urgent course. Progress is
// counted per course by the API across all of this evaluator's courses on the application, not only this tab.
function groupByApplication(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r.application_id)) {
      groups.set(r.application_id, { application_id: r.application_id, reference_number: r.reference_number, student_name: r.student_name,
        total: r.my_courses_on_application ?? null, evaluated: r.my_evaluated_on_application ?? null, rows: [] })
    }
    groups.get(r.application_id).rows.push(r)
  }
  return [...groups.values()]
}

const isOpen = (r) => !['approved', 'rejected'].includes(r.status)

function ApplicationGroup({ g, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const institutions = [...new Set(g.rows.map(r => r.institution))]
  const total = g.total ?? g.rows.length
  const evaluated = g.evaluated ?? g.rows.filter(r => !isOpen(r)).length
  const pending = total - evaluated
  const highPriority = g.rows.some(r => r.priority === 'high' && isOpen(r))
  const assigned = g.rows.map(r => r.assigned_at).filter(Boolean).sort()[0]
  const oldestOpen = g.rows.filter(isOpen).map(r => r.assigned_at).filter(Boolean).sort()[0]
  const stripe = highPriority ? 'bg-red-500' : pending ? 'bg-sky-500' : 'bg-emerald-500'
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left px-5 py-3 flex items-center gap-3 bg-staff-sunk/40 hover:bg-staff-sunk focus:outline-none focus-visible:bg-staff-sunk text-[14px]"
      >
        <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${stripe}`} aria-hidden="true" />
        <span className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-semibold flex-shrink-0 ${highPriority ? 'bg-red-50 text-brand' : 'bg-sky-50 text-sky-700'}`} aria-hidden="true">
          {initials(g.student_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-staff-ink">{g.student_name}</span>
            <span className="font-mono text-[12px] text-staff-muted">{g.reference_number}</span>
            {highPriority && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap bg-red-50 text-red-700">
                <Flame className="w-3 h-3" aria-hidden="true" />High priority
              </span>
            )}
          </span>
          <span className="block text-[12.5px] text-staff-muted truncate">
            {institutions.join(', ')} · {total} course{total === 1 ? '' : 's'}
            {evaluated > 0 && <> · <span className="text-emerald-700">{evaluated} evaluated</span></>}
            {evaluated > 0 && pending > 0 && <> · <span className="text-amber-800">{pending} pending</span></>}
          </span>
        </span>
        <span className="hidden sm:block text-right text-[12.5px] text-staff-muted whitespace-nowrap">
          {assigned && <span className="block" title={formatDateTime(assigned)}>Assigned {formatDateTime(assigned).split(',')[0]}</span>}
          {oldestOpen && <span className="block tabular-nums">Waiting {pendingFor(oldestOpen)}</span>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-staff-muted flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-staff-muted flex-shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <ul className="border-t border-staff-line2 divide-y divide-staff-line2">
          {g.rows.map(r => <CourseRow key={r.id} r={r} />)}
        </ul>
      )}
    </li>
  )
}

// Catalog levels as steps of a 4-part meter (strongest first); content scores show as a percentage bar instead
const LEVEL_STEPS = { 'Approved equivalency': 4, 'Likely equivalent': 3, 'Partial - syllabus review': 2, 'Must be taken at BU': 1 }
const LEVEL_ICONS = { 'Approved equivalency': ShieldCheck, 'Partial - syllabus review': FileQuestion }

// Meter colour from the same meaning as the label colour: green strong, amber partial, rose weak
function meterColour(label, steps) {
  const cls = matchLabelClass(label)
  if (steps === 1) return 'bg-rose-400'
  return cls === 'text-emerald-700' ? 'bg-emerald-500' : cls === 'text-amber-700' ? 'bg-amber-400' : 'bg-rose-400'
}

// How strong the suggested match is: a percentage bar for a content score, a stepped meter for a named level
function MatchMeter({ r }) {
  const m = matchDisplay(r)
  if (!m.label) {
    return (
      <span className="block">
        <span className="block text-[12px] font-medium text-staff-muted">Not scored</span>
        <span className="block mt-1 h-1.5 rounded-full bg-staff-line2" aria-hidden="true" />
      </span>
    )
  }
  if (m.value) {
    const percent = r.match_percent ?? Math.round(r.match_score * 100)
    return (
      <span className="block">
        <span className={`block text-[12px] font-medium truncate ${matchLabelClass(m.label)}`}>{m.value} · {m.label}</span>
        <span className="block mt-1 h-1.5 rounded-full bg-staff-line2" aria-hidden="true">
          <span className={`block h-full rounded-full ${meterColour(m.label)}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </span>
      </span>
    )
  }
  const steps = LEVEL_STEPS[m.label] ?? 0
  const Icon = LEVEL_ICONS[m.label]
  const colour = meterColour(m.label, steps)
  return (
    <span className="block">
      <span className={`flex items-center gap-1 text-[12px] font-medium ${matchLabelClass(m.label)}`}>
        {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
        <span className="truncate">{m.label.replace(' - ', ' · ')}</span>
      </span>
      <span className="flex gap-0.5 mt-1" aria-hidden="true">
        {[1, 2, 3, 4].map(i => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= steps ? colour : 'bg-staff-line2'}`} />)}
      </span>
    </span>
  )
}

// One course inside an application record; each course is still reviewed and counted on its own
function CourseRow({ r }) {
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  const open = isOpen(r)
  return (
    <li>
      <Link
        to={`/evaluator/reviews/${r.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.4fr)_11rem_9rem_5rem_1rem] gap-x-4 gap-y-2 items-center pl-9 sm:pl-[76px] pr-5 py-3 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg text-[13.5px]"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-1.5 text-staff-ink">
            <span className="font-mono font-semibold">{r.course_code}</span>
            <ArrowRight className="w-3.5 h-3.5 text-staff-muted" aria-label="maps to" />
            {r.target_bu_course
              ? <span className="font-mono font-semibold text-brand">{r.target_bu_course}</span>
              : <span className="text-staff-muted italic">to be determined</span>}
          </span>
          <span className="block text-[12.5px] text-staff-muted truncate">{r.course_title}</span>
          {r.returned_reason && r.status === 'new'
            ? <span className="block text-[12px] text-amber-800 truncate">Returned by the Credit Evaluation Office: {r.returned_reason}</span>
            : r.assignment_reason && <span className="block text-[12px] text-staff-muted truncate" title={r.assignment_reason}>{r.assignment_reason}</span>}
        </span>
        <span className="col-span-2 lg:col-span-1 max-w-[16rem] lg:max-w-none order-last lg:order-none"><MatchMeter r={r} /></span>
        <span className="justify-self-end lg:justify-self-start"><StatusPill tone={status.tone}>{status.label}</StatusPill></span>
        <span
          className={`hidden lg:block text-right tabular-nums text-[12.5px] ${r.status === 'in_progress' ? 'text-amber-800' : 'text-staff-muted'}`}
          title={r.assigned_at ? `Assigned ${formatDateTime(r.assigned_at)}` : ''}
        >
          {open && r.assigned_at ? pendingFor(r.assigned_at) : '—'}
        </span>
        <ChevronRight className="hidden lg:block w-4 h-4 text-staff-muted" aria-hidden="true" />
      </Link>
    </li>
  )
}
