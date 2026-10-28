import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, FilePlus, SlidersHorizontal, AlertTriangle, UserX } from 'lucide-react'
import { listApplications } from '../../api/applications'
import ApplicationFilters from '../../components/evaluator/ApplicationFilters'
import PageHeader from '../../components/staff/PageHeader'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { OwnershipTable } from './ApplicationLookup'

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

// Admin applications list: status chips to narrow it down, more filters on demand, one row per application
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
  const selectClass = 'px-3 py-1.5 text-[14px] border border-staff-line rounded-lg bg-white text-staff-ink2 focus:outline-none focus:border-primary-500'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle={stats ? `${stats.total} transfer applications received` : ' '}
        actions={
          <Button onClick={() => navigate('/evaluator/applications/new')}>
            <FilePlus className="w-4 h-4" />
            New Application
          </Button>
        }
      />

      {/* Operational indicators: where intervention is needed */}
      {own && (own.needs_attention > 0 || own.unassigned_reviews > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => setStage('needs_attention')} className="staff-card px-5 py-3.5 flex items-center gap-3 text-left hover:border-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-700" />
            <span><span className="block text-[13px] text-staff-ink2">Needs attention</span><span className="block text-[20px] font-semibold text-staff-ink tabular-nums">{own.needs_attention}</span></span>
            <span className="ml-auto text-[12.5px] text-staff-muted">Unassigned, unavailable evaluator, failed processing or possible duplicate</span>
          </button>
          <button type="button" onClick={() => setStage('unassigned')} className="staff-card px-5 py-3.5 flex items-center gap-3 text-left hover:border-rose-300">
            <UserX className="w-5 h-5 text-rose-700" />
            <span><span className="block text-[13px] text-staff-ink2">Unassigned reviews</span><span className="block text-[20px] font-semibold text-staff-ink tabular-nums">{own.unassigned_reviews}</span></span>
            <span className="ml-auto text-[12.5px] text-staff-muted">Courses waiting for an evaluator</span>
          </button>
        </div>
      )}

      {/* Stage chips */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by where the application is">
        <Chip active={!filters.stage && !filters.status} onClick={() => setStage('')} label="All" count={stats?.total} />
        {own?.needs_attention > 0 && <Chip active={filters.stage === 'needs_attention'} onClick={() => setStage(filters.stage === 'needs_attention' ? '' : 'needs_attention')} label="Needs attention" count={own.needs_attention} />}
        {STAGE_CHIPS.filter(([s]) => byStage[s] || filters.stage === s).map(([s, label]) => (
          <Chip key={s} active={filters.stage === s} onClick={() => setStage(filters.stage === s ? '' : s)} label={label} count={byStage[s] || 0} />
        ))}
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-medium text-staff-ink2 hover:bg-white hover:text-staff-ink"
        >
          <SlidersHorizontal className="w-4 h-4" />
          More filters{extraFilters ? ` (${extraFilters})` : ''}
        </button>
      </div>

      {/* Who has it */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Evaluator" value={filters.owner_id || ''} onChange={e => setFilter('owner_id', e.target.value)} className={selectClass}>
          <option value="">Any evaluator</option>
          {(own?.owners || []).map(o => <option key={o.id} value={o.id}>{o.name}{o.department ? ` (${o.department})` : ''}</option>)}
        </select>
        <select aria-label="Department" value={filters.department || ''} onChange={e => setFilter('department', e.target.value)} className={selectClass}>
          <option value="">Any department</option>
          {(own?.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label="Age" value={filters.min_age_days || ''} onChange={e => setFilter('min_age_days', e.target.value)} className={selectClass}>
          {AGE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {(filters.owner_id || filters.department || filters.min_age_days) && (
          <button type="button" onClick={() => setFilters(f => ({ ...f, page: 1, owner_id: '', department: '', min_age_days: '' }))} className="text-[13px] font-medium text-primary-700 hover:underline px-1">Clear</button>
        )}
      </div>

      <section className="staff-card overflow-hidden">
        {(showFilters || extraFilters > 0) && (
          <div className="px-6 py-4 border-b border-staff-line2">
            <ApplicationFilters filters={filters} onChange={setFilters} />
          </div>
        )}

        {state.loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
        ) : state.error ? (
          <EmptyState icon={ClipboardList} title="Applications could not be loaded" description={state.error} action={load} actionLabel="Try Again" />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications found"
            description="No applications match your current filters."
            action={() => setFilters(f => ({ ...DEFAULT_FILTERS, limit: f.limit }))}
            actionLabel="Clear Filters"
          />
        ) : (
          <>
            <OwnershipTable rows={apps} detailsPath={id => `/office/applications/${id}`} showAge />

            {totalPages > 1 && (
              <div className="border-t border-staff-line2 px-6 py-4 flex flex-wrap gap-3 items-center justify-between">
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

function Chip({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[14px] font-medium transition-colors ${
        active ? 'bg-staff-ink border-staff-ink text-white' : 'bg-white border-staff-line text-staff-ink2 hover:border-slate-300 hover:text-staff-ink'
      }`}
    >
      {label}
      {count != null && <span className={`tabular-nums ${active ? 'text-white/70' : 'text-staff-muted'}`}>{count}</span>}
    </button>
  )
}
