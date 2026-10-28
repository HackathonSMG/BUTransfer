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
            <li className="hidden md:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_8rem_9rem_1rem] gap-4 px-6 py-2.5 bg-staff-bg/60 staff-eyebrow">
              <span>Application</span><span>Course mapping</span><span>Match</span><span>Status</span><span />
            </li>
            {state.rows.map(r => {
              const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
              return (
                <li key={r.id}>
                  <Link
                    to={`/evaluator/reviews/${r.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_8rem_9rem_1rem] gap-x-4 gap-y-2 items-center px-6 py-4 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-staff-ink truncate">{r.student_name}</span>
                      <span className="block text-[12.5px] text-staff-muted font-mono">{r.reference_number}</span>
                    </span>
                    <span className="min-w-0 order-3 md:order-none col-span-2 md:col-span-1">
                      <span className="block text-[14px] text-staff-ink">
                        <span className="font-mono">{r.course_code}</span>
                        <span className="text-staff-muted"> → </span>
                        {r.target_bu_course
                          ? <span className="font-mono font-semibold text-primary-800">{r.target_bu_course}</span>
                          : <span className="text-staff-muted italic">to be determined</span>}
                      </span>
                      <span className="block text-[12.5px] text-staff-muted truncate">{r.institution}</span>
                      {r.returned_reason && r.status === 'new'
                        ? <span className="block text-[12px] text-amber-800 truncate">Returned by the Credit Evaluation Office: {r.returned_reason}</span>
                        : r.assignment_reason && <span className="block text-[12px] text-staff-muted truncate" title={r.assignment_reason}>{r.assignment_reason}</span>}
                    </span>
                    <span className="hidden md:block">
                      {r.match_label ? (
                        <>
                          {matchDisplay(r).value && <span className="block text-[15px] font-semibold text-staff-ink tabular-nums">{matchDisplay(r).value}</span>}
                          <span className={`block text-[12px] font-medium ${matchLabelClass(r.match_label)}`}>{r.match_label}</span>
                        </>
                      ) : <span className="text-[13px] text-staff-muted">Not scored</span>}
                    </span>
                    <span className="flex flex-col items-end md:items-start gap-1">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      {r.priority === 'high' && <span className="text-[11.5px] font-semibold text-red-700">High priority</span>}
                      {r.assigned_at && (
                        <span className="text-[11.5px] text-staff-muted whitespace-nowrap" title={`Assigned ${formatDateTime(r.assigned_at)}`}>
                          Assigned {formatDateTime(r.assigned_at).split(',')[0]}{!['approved', 'rejected'].includes(r.status) && ` · waiting ${pendingFor(r.assigned_at)}`}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="hidden md:block w-4 h-4 text-staff-muted" />
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
