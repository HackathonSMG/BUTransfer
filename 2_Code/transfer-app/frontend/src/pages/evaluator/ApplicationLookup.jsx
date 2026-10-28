import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, FileSearch, ChevronRight, Info } from 'lucide-react'
import { listApplications } from '../../api/applications'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/staff/PageHeader'
import StatusPill from '../../components/staff/StatusPill'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { pendingFor, formatDateTime } from '../../lib/staffFormat'

// Stage tones match ownership.service STAGES (labels come from there too, via the row's stage)
const STAGE = {
  draft: ['Draft', 'neutral'], processing: ['Processing', 'neutral'], needs_attention: ['Needs Attention', 'bad'],
  unassigned: ['Unassigned', 'bad'], reassignment_required: ['Reassignment Required', 'bad'],
  pending_review: ['Pending Evaluator Review', 'info'], in_review: ['In Review', 'info'],
  waiting_for_applicant: ['Waiting for Student', 'warn'], credit_office_review: ['Credit Office Review', 'info'],
  completed: ['Completed', 'ok'], closed: ['Closed', 'neutral']
}
export const stageOf = (key) => STAGE[key] || [key || 'Unknown', 'neutral']

// "Where is this application, and who has it?" Searches by application number, applicant name or email on the
// server. Evaluators find the applications they have (or had) a course on, the same scope as the details page.
export default function ApplicationLookup() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') || '')
  const [state, setState] = useState({ loading: false, rows: null, total: 0, error: null })
  const q = text.trim()

  useEffect(() => {
    if (q.length < 2) { setState({ loading: false, rows: null, total: 0, error: null }); return }
    setState(s => ({ ...s, loading: true }))
    const t = setTimeout(async () => {
      setParams(q ? { q } : {}, { replace: true })
      try {
        const res = await listApplications({ search: q, limit: 25, sort: 'pending_since', order: 'asc' })
        setState({ loading: false, rows: res.data || [], total: res.meta?.total || 0, error: null })
      } catch (err) {
        setState({ loading: false, rows: null, total: 0, error: err.response?.data?.message || 'The search could not be completed.' })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const detailsPath = (id) => (user?.role === 'evaluator' ? `/evaluator/applications/${id}` : `/office/applications/${id}`)

  return (
    <div className="space-y-6">
      <PageHeader title="Application Lookup" subtitle="Find where an application is and who currently has it." />

      <section className="staff-card p-5">
        <label htmlFor="lookup" className="block text-[14px] font-medium text-staff-ink mb-2">Application number, student name or email</label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-staff-muted pointer-events-none" />
          <input
            id="lookup"
            type="search"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. APP-2026-0012, Jamie Rivera, jamie@example.com"
            className="w-full pl-11 pr-4 py-3 text-[15px] border border-staff-line rounded-xl placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
        </div>
        {user?.role === 'evaluator' && (
          <p className="text-[12.5px] text-staff-muted mt-2 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />Shows applications with a course assigned to you, now or earlier.</p>
        )}
      </section>

      <section className="staff-card overflow-hidden">
        {q.length < 2 ? (
          <EmptyState icon={FileSearch} title="Search for an application" description="Enter at least two characters of an application number, student name or email address." />
        ) : state.loading && !state.rows ? (
          <div className="flex justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
        ) : state.error ? (
          <EmptyState icon={FileSearch} title="Search failed" description={state.error} />
        ) : !state.rows?.length ? (
          <EmptyState icon={FileSearch} title="No applications found" description={`Nothing matches "${q}".`} />
        ) : (
          <>
            <div className="px-6 py-3 text-[13px] text-staff-muted border-b border-staff-line2 flex items-center gap-2">
              {state.total} result{state.total === 1 ? '' : 's'}{state.total > state.rows.length ? `, showing ${state.rows.length}` : ''}
              {state.loading && <Spinner size="sm" className="text-primary-600" />}
            </div>
            <OwnershipTable rows={state.rows} detailsPath={detailsPath} />
          </>
        )}
      </section>
    </div>
  )
}

/** Application | Applicant | Status | Current evaluator | Department | Pending since, one link per row. */
export function OwnershipTable({ rows, detailsPath, showAge = false }) {
  return (
    <ul className="divide-y divide-staff-line2">
      <li className={`hidden lg:grid ${showAge ? 'grid-cols-[9rem_minmax(0,1.2fr)_11rem_minmax(0,1.2fr)_minmax(0,1fr)_9rem_5rem_1rem]' : 'grid-cols-[9rem_minmax(0,1.2fr)_11rem_minmax(0,1.2fr)_minmax(0,1fr)_10rem_1rem]'} gap-4 px-6 py-2.5 bg-staff-bg/60 staff-eyebrow`}>
        <span>Application</span><span>Student</span><span>Status</span><span>Current evaluator</span><span>Department</span><span>Pending since</span>{showAge && <span className="text-right">Age</span>}<span />
      </li>
      {rows.map(a => {
        const [label, tone] = stageOf(a.stage)
        const more = (a.owners_count || 0) > 1 ? ` +${a.owners_count - 1} more` : ''
        const owner = a.current_owner_name
          ? <><span className="text-staff-ink font-medium">{a.current_owner_name}</span>{more && <span className="text-staff-muted">{more}</span>}</>
          : a.unassigned_reviews > 0 ? <span className="text-rose-800 font-medium">Unassigned</span>
            : <span className="text-staff-muted">{a.stage === 'credit_office_review' ? 'Credit Evaluation Office' : '—'}</span>
        return (
          <li key={a.id}>
            <Link to={detailsPath(a.id)}
              className={`grid grid-cols-[minmax(0,1fr)_auto] ${showAge ? 'lg:grid-cols-[9rem_minmax(0,1.2fr)_11rem_minmax(0,1.2fr)_minmax(0,1fr)_9rem_5rem_1rem]' : 'lg:grid-cols-[9rem_minmax(0,1.2fr)_11rem_minmax(0,1.2fr)_minmax(0,1fr)_10rem_1rem]'} gap-x-4 gap-y-1 items-center px-6 py-3.5 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg text-[14px]`}>
              <span className="font-mono font-medium text-staff-ink">{a.reference_number}</span>
              <span className="min-w-0 order-3 lg:order-none col-span-2 lg:col-span-1">
                <span className="block text-staff-ink truncate">{a.student_name}</span>
                <span className="block text-[12.5px] text-staff-muted truncate">{a.student_email}</span>
              </span>
              <span className="justify-self-end lg:justify-self-start flex flex-col items-end lg:items-start gap-1">
                <StatusPill tone={tone}>{label}</StatusPill>
                {a.duplicate_status === 'suspected' && <StatusPill tone="warn">Possible duplicate</StatusPill>}
              </span>
              <span className="min-w-0 order-4 lg:order-none col-span-2 lg:col-span-1">
                <span className="lg:hidden text-staff-muted">With: </span>{owner}
                {a.pending_course && <span className="block text-[12.5px] text-staff-muted">Pending: <span className="font-mono">{a.pending_course}</span></span>}
              </span>
              <span className="hidden lg:block text-staff-ink2 truncate">{a.current_owner_department || '—'}</span>
              <span className="order-5 lg:order-none col-span-2 lg:col-span-1 text-[13px] text-staff-ink2">
                <span className="lg:hidden text-staff-muted">Pending since: </span>{a.pending_since ? formatDateTime(a.pending_since) : '—'}
              </span>
              {showAge && <span className="hidden lg:block text-right tabular-nums text-staff-ink2">{a.pending_since ? pendingFor(a.pending_since) : '—'}</span>}
              <ChevronRight className="hidden lg:block w-4 h-4 text-staff-muted" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
