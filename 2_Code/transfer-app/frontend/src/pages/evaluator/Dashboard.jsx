import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ClipboardList, Clock, MessageSquare, CheckCircle, Globe, Mail, UserCheck,
  RefreshCw, FilePlus, ArrowRight, ChevronRight, Library
} from 'lucide-react'
import toast from 'react-hot-toast'
import { listApplications } from '../../api/applications'
import { getMemory } from '../../api/memory'
import { useAuth } from '../../hooks/useAuth'
import ApplicationFilters from '../../components/evaluator/ApplicationFilters'
import StatusPill, { STATUS_TONES } from '../../components/staff/StatusPill'
import KpiCard from '../../components/staff/KpiCard'
import ScoreMeter from '../../components/staff/ScoreMeter'
import BUCrest from '../../components/layout/BUCrest'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'

const SOURCE_ICONS = {
  website: Globe,
  web: Globe,
  email: Mail,
  evaluator_submitted: UserCheck,
  evaluator: UserCheck
}

const SOURCE_LABELS = {
  website: 'Web Portal',
  web: 'Web Portal',
  email: 'Email',
  evaluator_submitted: 'Evaluator Submitted',
  evaluator: 'Evaluator Submitted'
}

// The review workflow in order; each row filters the queue to that status
const PIPELINE = [
  { status: 'draft', label: 'Draft', hideWhenEmpty: true },
  { status: 'submitted', label: 'Submitted' },
  { status: 'under_evaluation', label: 'Evaluation in progress' },
  { status: 'validation_failed', label: 'Validation failed', hideWhenEmpty: true },
  { status: 'information_required', label: 'Waiting on student' },
  { status: 'evaluation_completed', label: 'Ready for review' },
  { status: 'under_evaluator_review', label: 'Under evaluator review' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'closed', label: 'Closed' }
]

const BAR_COLORS = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
  ai: 'bg-violet-500',
  ready: 'bg-indigo-600',
  warn: 'bg-amber-500',
  ok: 'bg-emerald-600',
  bad: 'bg-red-600'
}

const FINAL_STATUSES = ['approved', 'rejected', 'closed']
const DEFAULT_FILTERS = { page: 1, limit: 20 }

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d))
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Drops empty filters and turns the "column:direction" sort value into the API's sort + order params
function toQuery(filters) {
  const { sort, ...rest } = filters
  const params = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v != null))
  if (sort) {
    const [column, direction] = sort.split(':')
    params.sort = column
    params.order = direction || 'desc'
  }
  return params
}

export default function EvaluatorDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const urlSearch = searchParams.get('search') || ''
  const urlStatus = searchParams.get('status') || ''
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    ...(urlSearch && { search: urlSearch }),
    ...(urlStatus && { status: urlStatus })
  }))

  // The admin dashboard's status chart links here with ?status=
  useEffect(() => {
    if (urlStatus) setFilters(f => (f.status === urlStatus ? f : { ...f, status: urlStatus, page: 1 }))
  }, [urlStatus])
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [memory, setMemory] = useState({ loading: true, data: null })
  const [starting, setStarting] = useState(false)

  // The top bar's search navigates here with ?search=
  useEffect(() => {
    if (urlSearch) setFilters(f => (f.search === urlSearch ? f : { ...f, search: urlSearch, page: 1 }))
  }, [urlSearch])

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const data = await listApplications(toQuery(filters))
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.message })
    }
  }, [filters])

  const loadMemory = useCallback(async () => {
    try {
      const res = await getMemory()
      setMemory({ loading: false, data: res.data || null })
    } catch {
      setMemory({ loading: false, data: null })
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadMemory() }, [loadMemory])

  const refresh = () => { load(); loadMemory() }

  const apps = state.data?.data || state.data?.applications || []
  const total = state.data?.meta?.total || state.data?.total || 0
  const totalPages = Math.ceil(total / (filters.limit || DEFAULT_FILTERS.limit))

  // Queue-wide counts from the API (not limited to the current page or filters)
  const stats = state.data?.stats
  const byStatus = stats?.by_status || {}
  const count = (s) => byStatus[s] || 0
  const hasStats = Boolean(stats)
  const decided = FINAL_STATUSES.reduce((n, s) => n + count(s), 0)
  const openCases = hasStats ? stats.total - decided - count('draft') : null
  const readyForReview = count('evaluation_completed')
  const inReview = count('under_evaluator_review')
  const pendingInfo = count('information_required')
  const inPipeline = count('submitted') + count('under_evaluation')

  // Toggles a status filter and keeps any search, source or date filters
  const filterStatus = (status) => setFilters(f => ({ ...f, page: 1, status: f.status === status ? '' : status }))

  // Opens the application that has waited longest for review
  const startReviewing = async () => {
    setStarting(true)
    try {
      const res = await listApplications({ status: 'evaluation_completed', sort: 'submitted_at', order: 'asc', limit: 1 })
      const next = (res.data || [])[0]
      if (next) navigate(`/evaluator/applications/${next.id}`)
      else toast('No applications are waiting for review.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open the next application')
    } finally {
      setStarting(false)
    }
  }

  const firstName = (user?.full_name || '').split(' ')[0]
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[#dfe6f5] bg-gradient-to-br from-white via-[#f2f6fe] to-[#e9f0fd] px-5 sm:px-7 py-6">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-brand" aria-hidden="true" />
        <BUCrest className="absolute -right-6 -bottom-10 w-48 h-56 opacity-[0.06] pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="text-[13px] font-semibold text-primary-800">
              {greeting()}{firstName ? `, ${firstName}` : ''}
            </p>
            <h1 className="mt-1 mb-3 text-[26px] leading-tight text-staff-ink">
              {!hasStats
                ? 'Transfer credit evaluation'
                : readyForReview > 0
                  ? `${plural(readyForReview, 'application')} ${readyForReview === 1 ? 'is' : 'are'} ready for an evaluator's decision.`
                  : "You're all caught up on reviews."}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-staff-ink2">
              <span>{user?.role === 'admin' ? 'Administrator' : 'Evaluator'} · Transfer Credit Evaluation</span>
              <span className="text-staff-muted">{today}</span>
              {hasStats && inPipeline > 0 && <span className="text-staff-muted">{inPipeline} more being evaluated</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} aria-label="Refresh" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="secondary" onClick={() => navigate('/evaluator/applications/new')}>
              <FilePlus className="w-4 h-4" />
              New Application
            </Button>
            {readyForReview > 0 && (
              <Button onClick={startReviewing} loading={starting}>
                Start reviewing
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={ClipboardList}
          tone="info"
          label="Open applications"
          value={openCases}
          sub={hasStats ? `${stats.total} total received` : undefined}
        />
        <KpiCard
          icon={Clock}
          tone="warn"
          label="Ready for review"
          value={hasStats ? readyForReview : null}
          sub={hasStats ? `${inReview} under evaluator review` : undefined}
          onClick={() => filterStatus('evaluation_completed')}
          active={filters.status === 'evaluation_completed'}
        />
        <KpiCard
          icon={MessageSquare}
          tone="neutral"
          label="Waiting on student"
          value={hasStats ? pendingInfo : null}
          sub="Information requested"
          onClick={() => filterStatus('information_required')}
          active={filters.status === 'information_required'}
        />
        <KpiCard
          icon={CheckCircle}
          tone="ok"
          label="Decided this month"
          value={hasStats ? stats.decided_this_month : null}
          sub={hasStats ? `${count('approved')} approved · ${count('rejected')} rejected overall` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        {/* Workflow pipeline */}
        <section className="staff-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[15px] font-semibold text-staff-ink">Review pipeline</h2>
            <span className="text-xs text-staff-muted">Select a stage to filter the queue</span>
          </div>
          {!hasStats ? (
            <p className="text-sm text-staff-muted py-6 text-center">{state.loading ? 'Loading…' : 'Pipeline counts are unavailable.'}</p>
          ) : (
            <>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-staff-sunk mb-4" aria-hidden="true">
                {PIPELINE.filter(p => count(p.status) > 0).map(p => (
                  <span
                    key={p.status}
                    className={BAR_COLORS[STATUS_TONES[p.status]]}
                    style={{ width: `${(count(p.status) / Math.max(stats.total, 1)) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="grid sm:grid-cols-2 gap-x-6">
                {PIPELINE.filter(p => !p.hideWhenEmpty || count(p.status) > 0).map(p => {
                  const n = count(p.status)
                  const active = filters.status === p.status
                  return (
                    <li key={p.status}>
                      <button
                        type="button"
                        onClick={() => filterStatus(p.status)}
                        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left text-[13px] transition-colors ${
                          active ? 'bg-primary-50 text-primary-800 font-semibold' : 'text-staff-ink hover:bg-staff-sunk'
                        }`}
                      >
                        <i className={`w-2.5 h-2.5 rounded-[3px] flex-shrink-0 ${BAR_COLORS[STATUS_TONES[p.status]]}`} aria-hidden="true" />
                        <span className="flex-1 truncate">{p.label}</span>
                        <b className={`tabular-nums ${n ? 'text-staff-ink' : 'text-staff-muted font-medium'}`}>{n}</b>
                        <ChevronRight className="w-3.5 h-3.5 text-staff-muted" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        {/* Equivalency knowledge base */}
        <section className="staff-card p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[15px] font-semibold text-staff-ink">Equivalency knowledge base</h2>
            <Library className="w-4 h-4 text-staff-muted" />
          </div>
          {memory.loading ? (
            <p className="text-sm text-staff-muted py-6 text-center">Loading…</p>
          ) : !memory.data ? (
            <p className="text-sm text-staff-muted py-6 text-center">The knowledge base is unavailable right now.</p>
          ) : (
            <KnowledgeSummary memory={memory.data} />
          )}
        </section>
      </div>

      {/* Applications queue */}
      <section className="staff-card overflow-hidden">
        <div className="px-5 pt-4 pb-4 border-b border-staff-line2 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-staff-ink">Applications</h2>
            <span className="text-xs text-staff-muted">
              {state.loading ? 'Loading…' : `${plural(total, 'application')}${Object.keys(toQuery(filters)).some(k => !['page', 'limit'].includes(k)) ? ' match your filters' : ''}`}
            </span>
          </div>
          <ApplicationFilters filters={filters} onChange={setFilters} />
        </div>

        {state.loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" className="text-primary-600" />
          </div>
        ) : state.error ? (
          <EmptyState
            icon={ClipboardList}
            title="Applications could not be loaded"
            description={state.error}
            action={load}
            actionLabel="Try Again"
          />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications found"
            description="No applications match your current filters. Try adjusting the search criteria."
            action={() => setFilters(f => ({ ...DEFAULT_FILTERS, limit: f.limit }))}
            actionLabel="Clear Filters"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-staff-line bg-staff-bg/60">
                    <th className="staff-th">Reference / Source</th>
                    <th className="staff-th">Student</th>
                    <th className="staff-th hidden md:table-cell">From Institution → BU Program</th>
                    <th className="staff-th">Status</th>
                    <th className="staff-th hidden lg:table-cell">Submitted</th>
                    <th className="staff-th hidden md:table-cell">Eligibility</th>
                    <th className="staff-th text-right"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-staff-line2">
                  {apps.map(app => {
                    const SourceIcon = SOURCE_ICONS[app.source] || Globe
                    return (
                      <tr key={app.id} className="group hover:bg-staff-bg transition-colors cursor-pointer" onClick={() => navigate(`/evaluator/applications/${app.id}`)}>
                        <td className="px-4 py-3 align-top">
                          <span className="font-mono text-xs text-staff-ink2 bg-staff-sunk border border-staff-line2 px-2 py-0.5 rounded whitespace-nowrap">
                            {app.reference_number || `#${app.id}`}
                          </span>
                          <span className="hidden sm:flex items-center gap-1 mt-1.5 text-xs text-staff-muted whitespace-nowrap" title="Source">
                            <SourceIcon className="w-3.5 h-3.5" />
                            {SOURCE_LABELS[app.source] || app.source || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-staff-ink whitespace-nowrap">
                            {app.student_name || `${app.first_name || ''} ${app.last_name || ''}`.trim()}
                          </p>
                          <p className="text-xs text-staff-muted">{app.student_email || app.email}</p>
                        </td>
                        <td className="px-4 py-3 align-top hidden md:table-cell text-staff-ink2 max-w-[240px]">
                          <p className="truncate" title={app.transfer_from_institution || app.from_institution || ''}>
                            {app.transfer_from_institution || app.from_institution || '—'}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-staff-muted min-w-0" title={app.transfer_to_department || ''}>
                            <ArrowRight className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{app.transfer_to_program || app.program || '—'}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill status={app.status} />
                          {app.evaluator_name && (
                            <p className="text-xs text-staff-muted mt-1 whitespace-nowrap">Assigned to {app.evaluator_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top hidden lg:table-cell text-xs text-staff-ink2 whitespace-nowrap">
                          {formatDate(app.submitted_at || app.created_at)}
                        </td>
                        <td className="px-4 py-3 align-top hidden md:table-cell">
                          <ScoreMeter score={app.ai_confidence_score} label="Eligibility" />
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={e => { e.stopPropagation(); navigate(`/evaluator/applications/${app.id}`) }}
                            aria-label={`Review ${app.reference_number || 'application'}`}
                          >
                            <span className="hidden 2xl:inline">Review</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="border-t border-staff-line2 px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
                <p className="text-xs text-staff-muted">
                  Showing {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, total)} of {total} applications
                </p>
                <Pagination
                  currentPage={filters.page}
                  totalPages={totalPages}
                  onPageChange={page => setFilters(p => ({ ...p, page }))}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// Summary of /memory: how many approved mappings and precedents the engine reuses, with one example
function KnowledgeSummary({ memory }) {
  const equivalencies = memory.equivalencies || []
  const precedents = memory.past_decisions || []
  const s = memory.stats || {}
  const activeEq = equivalencies.filter(e => e.status === 'active')
  const activePrecedents = precedents.filter(p => p.status === 'active').length
  const example = activeEq.find(e => e.bu_course) || null

  return (
    <>
      <p className="text-[13px] text-staff-ink2">
        Approved mappings from other institutions to BU courses. They apply automatically to new transcripts,
        and evaluator decisions are kept as precedents for the next review.
      </p>
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <MiniStat label="Equivalencies" value={activeEq.length} />
        <MiniStat label="Precedents" value={activePrecedents} />
        <MiniStat label="Learned" value={s.learned_precedents || 0} hint="Precedents created from evaluator decisions in this system" />
      </div>
      {example && (
        <div className="mt-3 rounded-lg border border-dashed border-staff-line px-3 py-2.5 text-[12.5px]">
          <p className="staff-eyebrow mb-1">Example mapping</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-staff-ink">
            <span className="text-staff-muted">{example.institution}</span>
            <span className="font-mono font-medium">{example.course_code}</span>
            <ArrowRight className="w-3.5 h-3.5 text-staff-muted" />
            <span className="font-mono font-semibold text-primary-800">{example.bu_course}</span>
            <StatusPill tone="ok" className="ml-1">{example.outcome}</StatusPill>
          </p>
        </div>
      )}
      {s.decisions > 0 && (
        <p className="mt-3 text-xs text-staff-muted">
          Evaluators agreed with the recommendation on {s.agreement_rate}% of {s.decisions} course decisions.
        </p>
      )}
      <Link to="/evaluator/equivalencies" className="mt-auto pt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-600 hover:text-primary-700">
        Browse equivalencies
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </>
  )
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="rounded-[9px] bg-staff-sunk px-3 py-2.5 min-w-0" title={hint}>
      <span className="block text-[11.5px] font-medium text-staff-muted truncate">{label}</span>
      <b className="block text-lg font-bold text-staff-ink tabular-nums">{value}</b>
    </div>
  )
}
