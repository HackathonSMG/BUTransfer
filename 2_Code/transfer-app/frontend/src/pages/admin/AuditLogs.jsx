import React, { useState, useEffect, useCallback } from 'react'
import { Download, ChevronDown, ChevronUp, ScrollText, Search, X } from 'lucide-react'
import { getAuditLogs } from '../../api/admin'
import Pagination from '../../components/ui/Pagination'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'

const ACTION_TYPES = [
  { value: 'status_change', label: 'Status Change' },
  { value: 'decision', label: 'Decision Submitted' },
  { value: 'evaluation', label: 'AI Evaluation' },
  { value: 'info_request', label: 'Info Request' },
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'note', label: 'Note Added' },
  { value: 'create', label: 'Application Created' },
  { value: 'login', label: 'User Login' }
]

const ROLE_OPTIONS = [
  { value: 'evaluator', label: 'Evaluator' },
  { value: 'admin', label: 'Admin' },
  { value: 'student', label: 'Student' },
  { value: 'system', label: 'System' }
]

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
}

function ExpandableRow({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = entry.details && (typeof entry.details === 'object' ? Object.keys(entry.details).length > 0 : Boolean(entry.details))

  return (
    <>
      <tr
        className={`hover:bg-gray-50 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(entry.created_at || entry.timestamp)}</td>
        <td className="px-5 py-3">
          <span className="font-mono text-xs text-primary-600 bg-blue-50 px-2 py-0.5 rounded">
            {entry.reference_number || entry.application_id || '—'}
          </span>
        </td>
        <td className="px-5 py-3">
          <Badge variant="info">{entry.action || entry.action_type}</Badge>
        </td>
        <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
          {entry.actor_name || entry.actor || '—'}
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          <Badge variant="default">{entry.actor_role || entry.role || '—'}</Badge>
        </td>
        <td className="px-5 py-3 text-right">
          {hasDetails && (
            <button className="text-gray-400 hover:text-gray-600">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr>
          <td colSpan={6} className="px-5 py-2 bg-gray-50 border-b border-gray-100">
            <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
              {typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

function downloadCSV(entries) {
  const headers = ['Timestamp', 'Application', 'Action', 'Actor', 'Role', 'Details']
  const rows = entries.map(e => [
    formatDate(e.created_at || e.timestamp),
    e.reference_number || e.application_id || '',
    e.action || e.action_type || '',
    e.actor_name || e.actor || '',
    e.actor_role || e.role || '',
    typeof e.details === 'string' ? e.details : JSON.stringify(e.details || '')
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditLogs() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ page: 1, limit: 25 })

  const update = (key, value) => setFilters(p => ({ ...p, [key]: value, page: 1 }))
  const clear = () => setFilters({ page: 1, limit: 25 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAuditLogs(filters)
      setEntries(data.entries || data.data || data || [])
      setTotal(data.meta?.total || data.total || 0)
    } catch {
      // Silently fail — show empty
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const hasFilters = Object.keys(filters).some(k => !['page', 'limit'].includes(k) && filters[k])
  const totalPages = Math.ceil(total / filters.limit)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete history of all application actions</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => downloadCSV(entries)} disabled={entries.length === 0}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Application reference..."
              value={filters.reference || ''}
              onChange={e => update('reference', e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <Select
            placeholder="All Actions"
            options={ACTION_TYPES}
            value={filters.action_type || ''}
            onChange={e => update('action_type', e.target.value)}
          />

          <Select
            placeholder="All Roles"
            options={ROLE_OPTIONS}
            value={filters.actor_role || ''}
            onChange={e => update('actor_role', e.target.value)}
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={e => update('date_from', e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-primary-500"
              title="From date"
            />
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={e => update('date_to', e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:border-primary-500"
              title="To date"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clear}>
              <X className="w-3.5 h-3.5" />
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="xl" className="text-primary-600" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit log entries"
            description="No audit entries match your current filters."
            action={hasFilters ? clear : undefined}
            actionLabel="Clear Filters"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 whitespace-nowrap">Application</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Action</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Actor</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden md:table-cell">Role</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry, i) => (
                    <ExpandableRow key={entry.id || i} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {total > 0 ? `Showing ${((filters.page - 1) * filters.limit) + 1}–${Math.min(filters.page * filters.limit, total)} of ${total} entries` : `${entries.length} entries`}
              </p>
              <Pagination
                currentPage={filters.page}
                totalPages={totalPages || 1}
                onPageChange={page => setFilters(p => ({ ...p, page }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
