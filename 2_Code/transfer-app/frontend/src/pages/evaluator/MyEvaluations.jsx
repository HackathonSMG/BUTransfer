import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ClipboardCheck, ChevronRight } from 'lucide-react'
import { getMyReviews } from '../../api/my'
import StatusPill from '../../components/staff/StatusPill'
import ScoreMeter from '../../components/staff/ScoreMeter'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, matchBasisLabel, formatDate, initials, avatarTint } from '../../lib/reviews'

const TABS = [
  ['open', 'Open'],
  ['new', 'New'],
  ['in_progress', 'In progress'],
  ['info_requested', 'Waiting on student'],
  ['upcoming', 'Upcoming'],
  ['completed', 'Completed'],
  ['all', 'All']
]

const SEARCH_DELAY_MS = 350

export default function MyEvaluations() {
  const navigate = useNavigate()
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
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] leading-tight text-staff-ink">My Evaluations</h1>
        <p className="text-sm text-staff-muted mt-1">Courses assigned to you, highest priority and longest waiting first. Select a row to open the application.</p>
      </div>

      <section className="staff-card overflow-hidden">
        <div className="px-5 pt-4 pb-4 border-b border-staff-line2 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 p-[3px] rounded-lg bg-staff-sunk" role="tablist">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParam('status', key === 'open' ? '' : key)}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
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
          <div className="relative ml-auto w-full sm:w-72">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-staff-line bg-staff-bg/60">
                  <th className="staff-th">Student</th>
                  <th className="staff-th">Course</th>
                  <th className="staff-th hidden lg:table-cell">Target BU course</th>
                  <th className="staff-th hidden md:table-cell">Course match</th>
                  <th className="staff-th hidden xl:table-cell">Priority</th>
                  <th className="staff-th">Status</th>
                  <th className="staff-th hidden md:table-cell">Assigned</th>
                  <th className="staff-th"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-staff-line2">
                {state.rows.map(r => {
                  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
                  return (
                    <tr key={r.id} className="hover:bg-staff-bg cursor-pointer" onClick={() => navigate(`/evaluator/applications/${r.application_id}`)}>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${avatarTint(r.student_name)}`}>{initials(r.student_name)}</span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-staff-ink whitespace-nowrap">{r.student_name}</span>
                            <span className="block text-xs text-staff-muted font-mono">{r.reference_number}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="whitespace-nowrap">
                          <span className="font-mono text-[12.5px] font-medium text-staff-ink">{r.course_code}</span>
                          <span className="text-staff-muted"> → </span>
                          {r.target_bu_course
                            ? <span className="font-mono text-[12.5px] font-semibold text-primary-800">{r.target_bu_course}</span>
                            : <span className="text-xs italic text-staff-muted">target to be determined</span>}
                        </p>
                        <p className="text-xs text-staff-muted max-w-[260px] truncate" title={`${r.course_title || ''} · ${r.institution}`}>{r.course_title} · {r.institution}</p>
                      </td>
                      <td className="px-4 py-3 align-top hidden lg:table-cell">
                        <p className="text-staff-ink2 max-w-[220px] truncate" title={r.target_title || ''}>{r.target_title || (r.target_bu_course ? '—' : 'Evaluator to decide')}</p>
                        <p className="text-xs text-staff-muted">{matchBasisLabel(r)}</p>
                      </td>
                      <td className="px-4 py-3 align-top hidden md:table-cell"><ScoreMeter score={r.match_score} /></td>
                      <td className="px-4 py-3 align-top hidden xl:table-cell">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${r.priority === 'high' ? 'text-red-700' : r.priority === 'low' ? 'text-staff-muted' : 'text-staff-ink2'}`}>
                          <i className={`w-2 h-2 rounded-[2px] ${r.priority === 'high' ? 'bg-red-600' : r.priority === 'low' ? 'bg-slate-300' : 'bg-slate-400'}`} />
                          {r.priority === 'high' ? 'High' : r.priority === 'low' ? 'Low' : 'Normal'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                      <td className="px-4 py-3 align-top hidden md:table-cell text-xs text-staff-ink2 whitespace-nowrap">{formatDate(r.assigned_at || r.created_at)}</td>
                      <td className="px-4 py-3 align-top text-right"><ChevronRight className="w-4 h-4 text-staff-muted inline" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
