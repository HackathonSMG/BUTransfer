import React from 'react'
import { Search, X } from 'lucide-react'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'information_required', label: 'Information Required' },
  { value: 'under_evaluation', label: 'Under Evaluation' },
  { value: 'evaluation_completed', label: 'Evaluation Completed' },
  { value: 'under_evaluator_review', label: 'Under Evaluator Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' }
]

const SOURCE_OPTIONS = [
  { value: 'website', label: 'Web Portal' },
  { value: 'email', label: 'Email' },
  { value: 'evaluator_submitted', label: 'Evaluator Submitted' }
]

const SORT_OPTIONS = [
  { value: 'submitted_at:desc', label: 'Newest First' },
  { value: 'submitted_at:asc', label: 'Oldest First' },
  { value: 'student_name:asc', label: 'Student Name A-Z' },
  { value: 'status:asc', label: 'Status' }
]

export default function ApplicationFilters({ filters, onChange }) {
  const update = (key, value) => onChange({ ...filters, [key]: value, page: 1 })

  const clearAll = () => onChange({ page: 1 })

  const hasFilters = Object.keys(filters).some(k => k !== 'page' && k !== 'limit' && filters[k])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name or reference..."
            value={filters.search || ''}
            onChange={(e) => update('search', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Status */}
        <Select
          placeholder="All Statuses"
          options={STATUS_OPTIONS}
          value={filters.status || ''}
          onChange={(e) => update('status', e.target.value)}
        />

        {/* Source */}
        <Select
          placeholder="All Sources"
          options={SOURCE_OPTIONS}
          value={filters.source || ''}
          onChange={(e) => update('source', e.target.value)}
        />

        {/* Sort */}
        <Select
          placeholder="Sort by..."
          options={SORT_OPTIONS}
          value={filters.sort || ''}
          onChange={(e) => update('sort', e.target.value)}
        />
      </div>

      {/* Date range row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">From:</label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => update('date_from', e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">To:</label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => update('date_to', e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-500"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="ml-auto">
            <X className="w-3.5 h-3.5" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  )
}
