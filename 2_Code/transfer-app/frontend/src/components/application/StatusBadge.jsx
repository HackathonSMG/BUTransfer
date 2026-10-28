import React from 'react'
import Badge from '../ui/Badge'

export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  information_required: 'Information Required',
  under_evaluation: 'Under Evaluation',
  evaluation_completed: 'Evaluation Completed',
  under_evaluator_review: 'Under Evaluator Review',
  validation_failed: 'Validation Failed',
  ready_for_posting: 'Decided, Posting Pending',
  credit_posted: 'Credit Posted',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed'
}

export default function StatusBadge({ status, className = '' }) {
  const label = STATUS_LABELS[status] || status || 'Unknown'
  return (
    <Badge variant={status || 'default'} className={className}>
      {label}
    </Badge>
  )
}
