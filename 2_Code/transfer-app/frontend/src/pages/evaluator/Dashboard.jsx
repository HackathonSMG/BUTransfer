import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, FilePlus, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { listApplications } from '../../api/applications'
import ApplicationFilters from '../../components/evaluator/ApplicationFilters'
import StatusPill from '../../components/staff/StatusPill'
import PageHeader from '../../components/staff/PageHeader'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'

const SOURCE_LABELS = {
  website: 'Web portal',
  web: 'Web portal',
  email: 'Email',
  evaluator_submitted: 'Raised by staff',
  evaluator: 'Raised by staff'
}

// Status chips in workflow order; empty ones are hidden
const STATUS_CHIPS = [
  ['submitted', 'Submitted'],
  ['under_evaluation', 'Being evaluated'],
  ['validation_failed', 'Validation failed'],
  ['information_required', 'Waiting on student'],
  ['evaluation_completed', 'Ready for review'],
  ['under_evaluator_review', 'In evaluator review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['closed', 'Closed']
]

const DEFAULT_FILTERS = { page: 1, limit: 20 }

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d))
}

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
  const byStatus = stats?.by_status || {}
  const setStatus = (status) => setFilters(f => ({ ...f, page: 1, status }))
  const extraFilters = ['search', 'source', 'sort', 'date_from', 'date_to'].filter(k => filters[k]).length

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

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        <Chip active={!filters.status} onClick={() => setStatus('')} label="All" count={stats?.total} />
        {STATUS_CHIPS.filter(([s]) => byStatus[s] || filters.status === s).map(([s, label]) => (
          <Chip key={s} active={filters.status === s} onClick={() => setStatus(filters.status === s ? '' : s)} label={label} count={byStatus[s] || 0} />
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
            <ul className="divide-y divide-staff-line2">
              <li className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_11rem_8rem_1rem] gap-4 px-6 py-2.5 bg-staff-bg/60 staff-eyebrow">
                <span>Student</span><span>Transfer</span><span>Status</span><span>Submitted</span><span />
              </li>
              {apps.map(app => (
                <li key={app.id}>
                  <Link
                    to={`/office/applications/${app.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_11rem_8rem_1rem] gap-x-4 gap-y-1.5 items-center px-6 py-4 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-staff-ink truncate">
                        {app.student_name || `${app.first_name || ''} ${app.last_name || ''}`.trim()}
                      </span>
                      <span className="block text-[12.5px] text-staff-muted">
                        <span className="font-mono">{app.reference_number || `#${app.id}`}</span>
                        {app.source && <span> · {SOURCE_LABELS[app.source] || app.source}</span>}
                      </span>
                    </span>
                    <span className="min-w-0 order-3 md:order-none col-span-2 md:col-span-1 text-[14px]">
                      <span className="block text-staff-ink truncate">{app.transfer_to_program || app.program || '—'}</span>
                      <span className="block text-[12.5px] text-staff-muted truncate">from {app.transfer_from_institution || app.from_institution || '—'}</span>
                    </span>
                    <span className="flex flex-col items-end md:items-start gap-1">
                      <StatusPill status={app.status} />
                      {app.duplicate_status === 'suspected' && <StatusPill tone="warn">Possible duplicate</StatusPill>}
                      {app.evaluator_name && <span className="text-[12px] text-staff-muted truncate max-w-[11rem]">{app.evaluator_name}</span>}
                    </span>
                    <span className="hidden md:block text-[13px] text-staff-ink2 whitespace-nowrap">{formatDate(app.submitted_at || app.created_at)}</span>
                    <ChevronRight className="hidden md:block w-4 h-4 text-staff-muted" />
                  </Link>
                </li>
              ))}
            </ul>

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
