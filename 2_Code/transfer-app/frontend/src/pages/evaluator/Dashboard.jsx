import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, FilePlus, SlidersHorizontal, AlertTriangle, UserX, UserRound, Building2, Clock, X, ChevronRight } from 'lucide-react'
import { listApplications } from '../../api/applications'
import ApplicationFilters from '../../components/evaluator/ApplicationFilters'
import PageHeader from '../../components/staff/PageHeader'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { stageOf, stageColor, StagePill, DuplicatePill, initials, ATTENTION_STAGES } from './ApplicationLookup'
import { pendingFor, formatDateTime } from '../../lib/staffFormat'

// Where applications are (ownership.service stages), in workflow order; empty ones are hidden
const STAGE_CHIPS = [
  ['unassigned', 'Unassigned'],
  ['reassignment_required', 'Reassignment required'],
  ['processing', 'Processing'],
  ['pending_review', 'Pending evaluator review'],
  ['in_review', 'In review'],
  ['waiting_for_applicant', 'Waiting for student'],
  ['credit_office_review', 'Credit Office review'],
  ['completed', 'Completed'],
  ['closed', 'Closed']
]

// Every stage the server counts, in workflow order, for the proportional stage bar
const STAGE_ORDER = ['needs_attention', 'unassigned', 'reassignment_required', 'draft', 'processing', 'pending_review', 'in_review', 'waiting_for_applicant', 'credit_office_review', 'completed', 'closed']

// Operational age of the pending review (not an SLA)
const AGE_OPTIONS = [['', 'Any age'], ['1', 'Pending 1+ day'], ['3', 'Pending 3+ days'], ['7', 'Pending 7+ days'], ['14', 'Pending 14+ days']]

const DEFAULT_FILTERS = { page: 1, limit: 20 }

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

// Admin applications list: the stage pipeline doubles as the status filter, more filters on demand, one row per application
export default function ApplicationsList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlSearch = searchParams.get('search') || ''
  const urlStatus = searchParams.get('status') || ''
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    ...(urlSearch && { search: urlSearch }),
    ...(urlStatus && { status: urlStatus })
  }))
  const [showFilters, setShowFilters] = useState(false)
  const [state, setState] = useState({ loading: true, data: null, error: null })

  // The top bar search and dashboard links land here with ?search= or ?status=
  useEffect(() => {
    if (urlSearch) setFilters(f => (f.search === urlSearch ? f : { ...f, search: urlSearch, page: 1 }))
  }, [urlSearch])
  useEffect(() => {
    if (urlStatus) setFilters(f => (f.status === urlStatus ? f : { ...f, status: urlStatus, page: 1 }))
  }, [urlStatus])

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const data = await listApplications(toQuery(filters))
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.message })
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const apps = state.data?.data || state.data?.applications || []
  const total = state.data?.meta?.total || state.data?.total || 0
  const totalPages = Math.ceil(total / (filters.limit || DEFAULT_FILTERS.limit))
  const stats = state.data?.stats
  const own = stats?.ownership
  const byStage = own?.by_stage || {}
  const setStage = (stage) => setFilters(f => ({ ...f, page: 1, stage, status: '' }))
  const setFilter = (key, value) => setFilters(f => ({ ...f, page: 1, [key]: value }))
  const extraFilters = ['search', 'source', 'sort', 'date_from', 'date_to', 'status'].filter(k => filters[k]).length
  const selectClass = 'bg-transparent pr-1 text-[13.5px] font-medium focus:outline-none cursor-pointer'
  // Each filter reads as a pill; a set filter takes the brand tint so it is easy to spot and clear
  const pickClass = (on) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 focus-within:ring-2 focus-within:ring-primary-100 ${
    on ? 'bg-red-50 border-brand/30 text-brand' : 'bg-white border-staff-line text-staff-ink2 hover:border-slate-300'
  }`
  const barStages = STAGE_ORDER.map(s => [s, byStage[s] || 0]).filter(([, n]) => n > 0)
  const barTotal = barStages.reduce((n, [, c]) => n + c, 0)
  const attentionPill = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-left bg-red-50 text-red-700 hover:ring-1 hover:ring-red-200'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Evaluations"
        subtitle={stats ? `${stats.total} transfer credit evaluations received` : ' '}
        actions={
          <Button onClick={() => navigate('/evaluator/applications/new')}>
            <FilePlus className="w-4 h-4" />
            New Evaluation
          </Button>
        }
      />

      {/* The pipeline: each stage tile is a filter; the bar shows each stage's share of every evaluation */}
      <section className="staff-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-[13px] font-semibold text-staff-ink2">{stats ? `Where the ${stats.total} evaluations are` : 'Where the evaluations are'}</p>
          {/* Operational indicators: where intervention is needed */}
          <div className="flex flex-wrap gap-2">
            {own?.needs_attention > 0 && (
              <button type="button" onClick={() => setStage('needs_attention')} className={attentionPill}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                {own.needs_attention} need attention: unassigned, unavailable evaluator, failed processing or possible duplicate
              </button>
            )}
            {own?.unassigned_reviews > 0 && (
              <button type="button" onClick={() => setStage('unassigned')} className={attentionPill}>
                <UserX className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                {own.unassigned_reviews} course{own.unassigned_reviews === 1 ? '' : 's'} waiting for an evaluator
              </button>
            )}
          </div>
        </div>
        {barTotal > 0 && (
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-4" role="img" aria-label={barStages.map(([s, n]) => `${stageOf(s)[0]}: ${n}`).join(', ')}>
            {barStages.map(([s, n]) => <span key={s} title={`${stageOf(s)[0]}: ${n}`} className={stageColor(s).bar} style={{ width: `${(n / barTotal) * 100}%` }} />)}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2" role="group" aria-label="Filter by where the evaluation is">
          <StageTile active={!filters.stage && !filters.status} onClick={() => setStage('')} label="All" count={stats?.total} />
          {own?.needs_attention > 0 && (
            <StageTile active={filters.stage === 'needs_attention'} onClick={() => setStage(filters.stage === 'needs_attention' ? '' : 'needs_attention')} label="Needs attention" count={own.needs_attention} dot="bg-red-500" />
          )}
          {STAGE_CHIPS.filter(([s]) => byStage[s] || filters.stage === s).map(([s, label]) => (
            <StageTile key={s} active={filters.stage === s} onClick={() => setStage(filters.stage === s ? '' : s)} label={label} count={byStage[s] || 0} dot={stageColor(s).dot || stageColor(s).bar} />
          ))}
        </div>
      </section>

      <section className="staff-card overflow-hidden">
        {/* Who has it and how long it has waited; the rest of the filters on demand */}
        <div className="px-5 py-3.5 border-b border-staff-line2 flex flex-wrap items-center gap-2">
          <label className={pickClass(filters.owner_id)}>
            <UserRound className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <select aria-label="Evaluator" value={filters.owner_id || ''} onChange={e => setFilter('owner_id', e.target.value)} className={selectClass}>
              <option value="">Any evaluator</option>
              {(own?.owners || []).map(o => <option key={o.id} value={o.id}>{o.name}{o.department ? ` (${o.department})` : ''}</option>)}
            </select>
          </label>
          <label className={pickClass(filters.department)}>
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <select aria-label="Department" value={filters.department || ''} onChange={e => setFilter('department', e.target.value)} className={selectClass}>
              <option value="">Any department</option>
              {(own?.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className={pickClass(filters.min_age_days)}>
            <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <select aria-label="Age" value={filters.min_age_days || ''} onChange={e => setFilter('min_age_days', e.target.value)} className={selectClass}>
              {AGE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {(filters.owner_id || filters.department || filters.min_age_days) && (
            <button type="button" onClick={() => setFilters(f => ({ ...f, page: 1, owner_id: '', department: '', min_age_days: '' }))} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 hover:underline px-1">
              <X className="w-3.5 h-3.5" aria-hidden="true" />Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.5px] font-medium text-staff-ink2 hover:bg-staff-sunk hover:text-staff-ink"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            More filters{extraFilters ? ` (${extraFilters})` : ''}
          </button>
        </div>

        {(showFilters || extraFilters > 0) && (
          <div className="px-5 py-4 border-b border-staff-line2">
            <ApplicationFilters filters={filters} onChange={setFilters} />
          </div>
        )}

        {state.loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
        ) : state.error ? (
          <EmptyState icon={ClipboardList} title="Evaluations could not be loaded" description={state.error} action={load} actionLabel="Try Again" />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No evaluations found"
            description="No evaluations match your current filters."
            action={() => setFilters(f => ({ ...DEFAULT_FILTERS, limit: f.limit }))}
            actionLabel="Clear Filters"
          />
        ) : (
          <>
            <EvaluationTable rows={apps} detailsPath={id => `/office/applications/${id}`} />

            {totalPages > 1 && (
              <div className="border-t border-staff-line2 px-5 py-3 flex flex-wrap gap-3 items-center justify-between">
                <p className="text-[13px] text-staff-muted">
                  Showing {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, total)} of {total}
                </p>
                <Pagination currentPage={filters.page} totalPages={totalPages} onPageChange={page => setFilters(p => ({ ...p, page }))} />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// A stage in the pipeline with its count; pressing it filters the list to that stage
function StageTile({ active, onClick, label, count, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
        active ? 'bg-staff-ink ring-2 ring-staff-ink text-white' : 'border border-staff-line bg-white hover:border-slate-300'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-[11.5px] leading-tight ${active ? 'text-white/70' : 'text-staff-muted'}`}>
        {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`block font-display tabular-nums text-[24px] font-semibold leading-tight ${active ? 'text-white' : 'text-staff-ink'}`}>{count ?? '—'}</span>
    </button>
  )
}

// How long the pending course has waited, coloured by age: under 4 hours plain, under 3 days amber, longer red
function AgeChip({ since }) {
  if (!since) return <span className="text-staff-muted">—</span>
  const hours = (Date.now() - new Date(since).getTime()) / 3600000
  const tone = hours < 4 ? 'bg-staff-sunk text-staff-ink2' : hours < 72 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums whitespace-nowrap ${tone}`} title={`Pending since ${formatDateTime(since)}`}>
      <span className="sr-only">Waiting </span>{pendingFor(since)}
    </span>
  )
}

const GRID = 'lg:grid-cols-[4px_minmax(0,1.6fr)_11.5rem_minmax(0,1.3fr)_8rem_5.5rem_1rem]'

/** Student | Stage | Now with | Courses | Waiting, one link per row with a stripe in the stage colour. */
function EvaluationTable({ rows, detailsPath }) {
  return (
    <ul className="divide-y divide-staff-line2">
      <li className={`hidden lg:grid ${GRID} gap-x-4 px-5 py-2.5 bg-staff-sunk/60 staff-eyebrow`}>
        <span /><span>Student</span><span>Stage</span><span>Now with</span><span>Courses</span><span className="text-right">Waiting</span><span />
      </li>
      {rows.map(a => {
        const c = stageColor(a.stage)
        const more = (a.owners_count || 0) > 1 ? ` +${a.owners_count - 1} more` : ''
        const owner = a.current_owner_name
          ? <><span className="text-staff-ink">{a.current_owner_name}</span>{more && <span className="text-staff-muted">{more}</span>}</>
          : a.unassigned_reviews > 0 ? <span className="text-red-700 font-medium">Unassigned</span>
            : <span className="text-staff-muted">{a.stage === 'credit_office_review' ? 'Credit Evaluation Office' : '—'}</span>
        const open = a.open_reviews || 0
        const unassigned = a.unassigned_reviews || 0
        return (
          <li key={a.id}>
            <Link to={detailsPath(a.id)}
              className={`grid grid-cols-[4px_minmax(0,1fr)_auto] ${GRID} gap-x-4 gap-y-1.5 items-center px-5 py-3 text-[14px] hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg ${ATTENTION_STAGES.includes(a.stage) ? 'bg-red-50/30' : ''}`}>
              <span className={`row-span-3 lg:row-span-1 self-stretch w-1 min-h-[2.5rem] rounded-full ${c.bar}`} aria-hidden="true" />

              <span className="min-w-0 flex items-center gap-3">
                <span className={`hidden sm:grid w-9 h-9 rounded-full place-items-center text-[12px] font-semibold flex-shrink-0 ${c.pill}`} aria-hidden="true">{initials(a.student_name)}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium text-staff-ink truncate">{a.student_name}</span>
                    <span className="font-mono text-[12px] text-staff-muted">{a.reference_number}</span>
                    {a.duplicate_status === 'suspected' && <DuplicatePill />}
                  </span>
                  <span className="block text-[12.5px] text-staff-muted truncate">{a.transfer_from_institution || a.student_email}</span>
                </span>
              </span>

              <span className="justify-self-end lg:justify-self-start"><StagePill stage={a.stage} /></span>

              <span className="min-w-0 col-start-2 col-span-2 lg:col-start-auto lg:col-span-1">
                <span className="block text-[13.5px] truncate"><span className="lg:hidden text-staff-muted">With: </span>{owner}</span>
                {(a.pending_course || a.current_owner_department) && (
                  <span className="block text-[12px] text-staff-muted truncate">
                    {a.pending_course && <>Pending <span className="font-mono">{a.pending_course}</span></>}
                    {a.pending_course && a.current_owner_department && ' · '}
                    {a.current_owner_department}
                  </span>
                )}
              </span>

              <span className="col-start-2 lg:col-start-auto">
                {open > 0 ? (
                  <span className="block w-28">
                    <span className="flex h-1.5 rounded-full overflow-hidden bg-staff-line2" aria-hidden="true">
                      {unassigned > 0 && <span className="bg-red-400" style={{ width: `${(Math.min(unassigned, open) / open) * 100}%` }} />}
                      <span className={c.bar} style={{ width: `${((open - Math.min(unassigned, open)) / open) * 100}%` }} />
                    </span>
                    <span className="block text-[11.5px] text-staff-muted mt-1">{unassigned > 0 ? `${unassigned} unassigned · ` : ''}{open} open</span>
                  </span>
                ) : <span className="text-[12px] text-staff-muted">No open courses</span>}
              </span>

              <span className="justify-self-end"><AgeChip since={a.pending_since} /></span>
              <ChevronRight className="hidden lg:block w-4 h-4 text-staff-muted" aria-hidden="true" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
