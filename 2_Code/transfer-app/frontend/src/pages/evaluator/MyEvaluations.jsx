import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ClipboardCheck, ChevronRight } from 'lucide-react'
import { getMyReviews } from '../../api/my'
import StatusPill from '../../components/staff/StatusPill'
import PageHeader from '../../components/staff/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, matchLabelClass, matchDisplay } from '../../lib/reviews'
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

  return (
    <div className="space-y-6">
      <PageHeader title="My Evaluations" subtitle="Courses assigned to you, most urgent first. Open one to review it." />

      <section className="staff-card overflow-hidden">
        <div className="px-5 pt-4 pb-4 border-b border-staff-line2 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 p-[3px] rounded-lg bg-staff-sunk" role="tablist">
            {TABS.filter(([key]) => key !== 'upcoming' || state.counts.upcoming > 0 || tab === 'upcoming').map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParam('status', key === 'open' ? '' : key)}
                className={`px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
                  tab === key ? 'bg-white text-staff-ink shadow-card' : 'text-staff-muted hover:text-staff-ink'
                }`}
              >
                {label}
                <span className={`text-[11px] font-semibold tabular-nums px-1.5 rounded-full ${tab === key ? 'bg-primary-600 text-white' : 'bg-white/70 text-staff-ink2'}`}>
                  {state.counts[key] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-60">
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
            description={search ? 'Try another student, reference or course code.' : 'Courses assigned to you appear here as applications are evaluated.'}
          />
        ) : (
          <ul className="divide-y divide-staff-line2">
            <li className="hidden lg:grid grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.5fr)_9.5rem_7rem_5.5rem_1rem] gap-4 px-6 py-2.5 bg-staff-bg/60 staff-eyebrow">
              <span>Application</span><span>Student</span><span>Course</span><span>Status</span><span>Assigned</span><span className="text-right">Waiting</span><span />
            </li>
            {state.rows.map(r => {
              const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
              const open = !['approved', 'rejected'].includes(r.status)
              return (
                <li key={r.id}>
                  <Link
                    to={`/evaluator/reviews/${r.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.5fr)_9.5rem_7rem_5.5rem_1rem] gap-x-4 gap-y-1.5 items-center px-6 py-3.5 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg text-[14px]"
                  >
                    <span className="font-mono font-medium text-staff-ink">{r.reference_number}</span>
                    <span className="min-w-0 order-3 lg:order-none col-span-2 lg:col-span-1">
                      <span className="block text-staff-ink font-medium truncate">{r.student_name}</span>
                      {r.priority === 'high' && <span className="block text-[11.5px] font-semibold text-red-700">High priority</span>}
                    </span>
                    <span className="min-w-0 order-4 lg:order-none col-span-2 lg:col-span-1">
                      <span className="block text-staff-ink">
                        <span className="font-mono">{r.course_code}</span>
                        <span className="text-staff-muted"> → </span>
                        {r.target_bu_course
                          ? <span className="font-mono font-semibold text-primary-800">{r.target_bu_course}</span>
                          : <span className="text-staff-muted italic">to be determined</span>}
                      </span>
                      <span className="block text-[12.5px] text-staff-muted truncate">
                        {r.institution}
                        {r.match_label && <> · <span className={matchLabelClass(r.match_label)}>{matchDisplay(r).value ? `${matchDisplay(r).value} ` : ''}{r.match_label}</span></>}
                      </span>
                      {r.returned_reason && r.status === 'new'
                        ? <span className="block text-[12px] text-amber-800 truncate">Returned by the Credit Evaluation Office: {r.returned_reason}</span>
                        : r.assignment_reason && <span className="block text-[12px] text-staff-muted truncate" title={r.assignment_reason}>{r.assignment_reason}</span>}
                    </span>
                    <span className="justify-self-end lg:justify-self-start"><StatusPill tone={status.tone}>{status.label}</StatusPill></span>
                    <span className="hidden lg:block text-[13px] text-staff-ink2" title={r.assigned_at ? formatDateTime(r.assigned_at) : ''}>{r.assigned_at ? formatDateTime(r.assigned_at).split(',').slice(0, 2).join(',') : '—'}</span>
                    <span className="hidden lg:block text-right tabular-nums text-[13px] text-staff-ink2">{open && r.assigned_at ? pendingFor(r.assigned_at) : '—'}</span>
                    <span className="lg:hidden order-5 col-span-2 text-[12.5px] text-staff-muted">
                      {r.assigned_at ? `Assigned ${formatDateTime(r.assigned_at)}${open ? ` · waiting ${pendingFor(r.assigned_at)}` : ''}` : ''}
                    </span>
                    <ChevronRight className="hidden lg:block w-4 h-4 text-staff-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
