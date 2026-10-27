import React, { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Clock, MessageSquare, CheckCircle, Globe, Mail, UserCheck } from 'lucide-react'
import { listApplications } from '../../api/applications'
import ApplicationFilters from '../../components/evaluator/ApplicationFilters'
import StatusBadge from '../../components/application/StatusBadge'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { useNavigate } from 'react-router-dom'

const SOURCE_ICONS = {
  website: Globe,
  web: Globe,
  email: Mail,
  evaluator_submitted: UserCheck,
  evaluator: UserCheck
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(new Date(d))
}

export default function EvaluatorDashboard() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ page: 1, limit: 20 })
  const [state, setState] = useState({ loading: true, data: null, error: null })

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const data = await listApplications(filters)
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.message })
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const apps = state.data?.data || state.data?.applications || []
  const total = state.data?.meta?.total || state.data?.total || 0
  const totalPages = Math.ceil(total / filters.limit)

  // Stats
  const stats = state.data?.stats || {}
  const openCases = stats.open_cases ?? apps.filter(a => !['approved', 'rejected', 'closed'].includes(a.status)).length
  const awaitingReview = stats.awaiting_review ?? apps.filter(a => a.status === 'evaluation_completed').length
  const pendingInfo = stats.pending_info ?? apps.filter(a => a.status === 'information_required').length
  const completedMonth = stats.completed_month ?? 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Evaluator Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage and review transfer applications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={load} variant="secondary">
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/evaluator/applications/new')}>
            New Application
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="My Open Cases" value={openCases} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Clock} label="Awaiting My Review" value={awaitingReview} color="bg-orange-100 text-orange-600" />
        <StatCard icon={MessageSquare} label="Pending Info from Student" value={pendingInfo} color="bg-amber-100 text-amber-600" />
        <StatCard icon={CheckCircle} label="Completed This Month" value={completedMonth} color="bg-green-100 text-green-600" />
      </div>

      {/* Filters */}
      <ApplicationFilters filters={filters} onChange={setFilters} />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {state.loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" className="text-primary-600" />
          </div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications found"
            description="No applications match your current filters. Try adjusting the search criteria."
            action={() => setFilters({ page: 1, limit: 20 })}
            actionLabel="Clear Filters"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Reference</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Student</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap hidden md:table-cell">From Institution</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap hidden lg:table-cell">Program</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap hidden sm:table-cell">Source</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap hidden lg:table-cell">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap hidden md:table-cell">AI Score</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {apps.map(app => {
                    const SourceIcon = SOURCE_ICONS[app.source] || Globe
                    return (
                      <tr key={app.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/evaluator/applications/${app.id}`)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {app.reference_number || `#${app.id}`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 whitespace-nowrap">
                            {app.student_name || `${app.first_name || ''} ${app.last_name || ''}`.trim()}
                          </p>
                          <p className="text-xs text-gray-400">{app.email}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-600 max-w-[150px] truncate">
                          {app.transfer_from_institution || app.from_institution || '—'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                          {app.transfer_to_program || app.program || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <SourceIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{app.source || '—'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(app.submitted_at || app.created_at)}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {app.ai_confidence_score != null ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              app.ai_confidence_score >= 0.8 ? 'bg-green-100 text-green-700'
                              : app.ai_confidence_score >= 0.6 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(app.ai_confidence_score * 100)}%
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={e => { e.stopPropagation(); navigate(`/evaluator/applications/${app.id}`) }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="border-t border-gray-100 px-4 py-4 flex items-center justify-between">
                <p className="text-xs text-gray-500">
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
      </div>
    </div>
  )
}
