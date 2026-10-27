import React from 'react'

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  information_required: 'bg-amber-100 text-amber-800',
  under_evaluation: 'bg-purple-100 text-purple-800',
  evaluation_completed: 'bg-indigo-100 text-indigo-800',
  under_evaluator_review: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-600',
  // Generic
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  default: 'bg-gray-100 text-gray-700',
  // Severity
  high: 'bg-red-100 text-red-800',
  medium: 'bg-orange-100 text-orange-800',
  low: 'bg-yellow-100 text-yellow-800',
  // Criterion results
  met: 'bg-green-100 text-green-800',
  not_met: 'bg-red-100 text-red-800',
  needs_verification: 'bg-yellow-100 text-yellow-800',
  partial: 'bg-orange-100 text-orange-800'
}

export default function Badge({ children, variant = 'default', className = '' }) {
  const colorClass = STATUS_COLORS[variant] || STATUS_COLORS.default
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}>
      {children}
    </span>
  )
}
