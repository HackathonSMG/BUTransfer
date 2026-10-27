import React, { useState, useEffect } from 'react'
import { Search, X, CalendarDays } from 'lucide-react'
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

// Values are "column:direction"; the dashboard splits them into the API's sort and order params
const SORT_OPTIONS = [
  { value: 'submitted_at:desc', label: 'Newest First' },
  { value: 'submitted_at:asc', label: 'Oldest First' },
  { value: 'student_name:asc', label: 'Student Name A-Z' },
  { value: 'status:asc', label: 'Status' }
]

const SEARCH_DELAY_MS = 350

const dateInput = 'text-sm text-staff-ink border border-staff-line rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function ApplicationFilters({ filters, onChange }) {
  const update = (key, value) => onChange({ ...filters, [key]: value, page: 1 })

  const clearAll = () => onChange({ page: 1, limit: filters.limit })

  const hasFilters = Object.keys(filters).some(k => k !== 'page' && k !== 'limit' && filters[k])

  // Search waits for a pause in typing so each keystroke doesn't call the API
  const [searchText, setSearchText] = useState(filters.search || '')
  useEffect(() => { setSearchText(filters.search || '') }, [filters.search])
  useEffect(() => {
    if (searchText === (filters.search || '')) return
    const t = setTimeout(() => update('search', searchText), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [searchText, filters])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, email, reference or institution..."
            aria-label="Search applications"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Status */}
        <Select
          aria-label="Status"
          placeholder="All Statuses"
          options={STATUS_OPTIONS}
          value={filters.status || ''}
          onChange={(e) => update('status', e.target.value)}
        />

        {/* Source */}
        <Select
          aria-label="Source"
          placeholder="All Sources"
          options={SOURCE_OPTIONS}
          value={filters.source || ''}
          onChange={(e) => update('source', e.target.value)}
        />

        {/* Sort */}
        <Select
          aria-label="Sort"
          placeholder="Sort by..."
          options={SORT_OPTIONS}
          value={filters.sort || ''}
          onChange={(e) => update('sort', e.target.value)}
        />
      </div>

      {/* Date range row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 staff-eyebrow">
          <CalendarDays className="w-3.5 h-3.5" />
          Submitted
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-date-from" className="text-xs text-staff-muted whitespace-nowrap">From</label>
          <input
            id="filter-date-from"
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => update('date_from', e.target.value)}
            className={dateInput}
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-date-to" className="text-xs text-staff-muted whitespace-nowrap">To</label>
          <input
            id="filter-date-to"
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => update('date_to', e.target.value)}
            className={dateInput}
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
