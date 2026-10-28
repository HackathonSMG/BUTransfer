import React, { useState } from 'react'
import {
  ChevronDown, ChevronUp,
  RefreshCw, Loader2, FileX, Flag, ClipboardList, AlignLeft
} from 'lucide-react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

// The evaluation report for staff: missing documents, flags, the course-evaluation summary and the full report.
// Students are already admitted, so no admission-eligibility score is shown.

export default function AIEvaluationReport({ evaluation, onTrigger, triggering = false }) {
  const [showFullReport, setShowFullReport] = useState(false)

  if (!evaluation) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
        <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h4 className="font-semibold text-gray-700 mb-1">Evaluation Not Started</h4>
        <p className="text-sm text-gray-500 mb-4">
          Run the evaluation to read the transcript and evaluate each course for BU credit.
        </p>
        <Button onClick={onTrigger} loading={triggering} size="sm">
          <RefreshCw className="w-4 h-4" />
          Run Evaluation
        </Button>
      </div>
    )
  }

  if (evaluation.status === 'pending' || evaluation.status === 'running') {
    return (
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="font-semibold text-blue-900">Evaluation In Progress</span>
        </div>
        <p className="text-sm text-blue-700">
          This application is being evaluated. This typically takes 30–60 seconds.
        </p>
      </div>
    )
  }

  const flags = evaluation.flags || []
  const missingDocs = evaluation.missing_documents || []
  // The backend stores recommendations as a single paragraph
  const recommendations = [].concat(evaluation.recommendations || [])
  const evaluatedAt = evaluation.evaluated_at || evaluation.completed_at
  const reportText = evaluation.report_text || evaluation.evaluation_report

  return (
    <div className="space-y-5">
      {/* Admitted students: no admission-eligibility score here; this report covers the course evaluation */}
      {evaluatedAt && (
        <p className="text-xs text-gray-400">
          Evaluated: {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(evaluatedAt))}
        </p>
      )}

      {/* Missing Documents */}
      {missingDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h5 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
            <FileX className="w-4 h-4" />
            Missing Documents ({missingDocs.length})
          </h5>
          <ul className="space-y-1">
            {missingDocs.map((doc, i) => (
              <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                {typeof doc === 'string' ? doc : doc.description || doc.name || doc.document_type || JSON.stringify(doc)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h5 className="text-sm font-semibold text-red-900 mb-2 flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Flags ({flags.length})
          </h5>
          <div className="space-y-2">
            {flags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge variant={flag.severity || FLAG_VARIANTS[flag.type] || 'error'} className="mt-0.5 flex-shrink-0">
                  {flag.severity || flag.type || 'flag'}
                </Badge>
                <p className="text-sm text-red-800">
                  {flag.title && <span className="font-medium">{flag.title}: </span>}
                  {flag.message || flag.description || String(flag)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h5 className="text-sm font-semibold text-blue-900 mb-2">Recommendations</h5>
          <ul className="space-y-1">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">→</span>
                {typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Report */}
      {reportText && (
        <div>
          <button
            onClick={() => setShowFullReport(!showFullReport)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <AlignLeft className="w-4 h-4" />
            {showFullReport ? 'Hide' : 'Show'} Full Evaluation Report
            {showFullReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showFullReport && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{reportText}</p>
            </div>
          )}
        </div>
      )}

      {/* Re-evaluate */}
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onTrigger} loading={triggering}>
          <RefreshCw className="w-3.5 h-3.5" />
          Re-run Evaluation
        </Button>
      </div>
    </div>
  )
}
