import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Mail, UserCheck, Calendar, Building } from 'lucide-react'
import StatusBadge from './StatusBadge'
import Button from '../ui/Button'

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
  evaluator_submitted: 'Evaluator',
  evaluator: 'Evaluator'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(dateStr))
}

export default function ApplicationCard({ application }) {
  const navigate = useNavigate()
  const SourceIcon = SOURCE_ICONS[application.source] || Globe

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => navigate(`/evaluator/applications/${application.id}`)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {application.reference_number || `APP-${application.id}`}
            </span>
            <StatusBadge status={application.status} />
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <SourceIcon className="w-3 h-3" />
              {SOURCE_LABELS[application.source] || application.source}
            </span>
          </div>

          <h3 className="mt-2 font-semibold text-gray-900 text-sm truncate">
            {application.student_name || `${application.first_name || ''} ${application.last_name || ''}`.trim() || 'Unknown Student'}
          </h3>

          <div className="mt-1 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Building className="w-3 h-3" />
              {application.transfer_from_institution || application.from_institution || 'Unknown Institution'}
            </span>
            {application.program && (
              <span className="text-xs text-gray-500">→ {application.program}</span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="w-3 h-3" />
              {formatDate(application.submitted_at || application.created_at)}
            </span>
            {application.ai_confidence_score != null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                application.ai_confidence_score >= 0.8
                  ? 'bg-green-100 text-green-700'
                  : application.ai_confidence_score >= 0.6
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                Eligibility: {Math.round(application.ai_confidence_score * 100)}%
              </span>
            )}
          </div>

          {application.assigned_evaluator_name && (
            <p className="mt-1 text-xs text-gray-400">
              Assigned: {application.assigned_evaluator_name}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/evaluator/applications/${application.id}`)
          }}
          className="flex-shrink-0"
        >
          View
        </Button>
      </div>
    </div>
  )
}
