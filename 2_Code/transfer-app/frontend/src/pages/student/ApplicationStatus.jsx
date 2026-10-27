import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle, Clock, FileText, AlertCircle, Award, Upload, Bell,
  ChevronDown, ChevronUp, RefreshCw, Send
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getApplicationStatus, uploadStudentDocument, getStudentNotifications, respondToInfoRequest } from '../../api/student'
import StatusBadge from '../../components/application/StatusBadge'
import DocumentList from '../../components/application/DocumentList'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import FileUpload from '../../components/ui/FileUpload'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'

const TIMELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_evaluation', label: 'Under Evaluation' },
  { key: 'under_evaluator_review', label: 'Evaluator Review' },
  { key: 'approved', label: 'Decision' }
]

const STATUS_STAGE_MAP = {
  submitted: 0,
  information_required: 1,
  under_evaluation: 1,
  evaluation_completed: 2,
  under_evaluator_review: 2,
  approved: 3,
  rejected: 3,
  closed: 3
}

const DOC_TYPES = [
  { value: 'transcript', label: 'Official Transcript' },
  { value: 'identification', label: 'Government ID' },
  { value: 'syllabus', label: 'Course Syllabus' },
  { value: 'other', label: 'Other Document' }
]

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
}

function Timeline({ status }) {
  const currentStage = STATUS_STAGE_MAP[status] ?? 0
  const isFinal = ['approved', 'rejected', 'closed'].includes(status)

  return (
    <div className="flex items-center gap-2">
      {TIMELINE_STAGES.map((stage, i) => {
        const done = currentStage > i
        const active = currentStage === i && !isFinal
        const isFinalStage = i === TIMELINE_STAGES.length - 1

        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                done || (isFinal && isFinalStage)
                  ? 'bg-green-500 text-white'
                  : active
                  ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {(done || (isFinal && isFinalStage)) ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap font-medium ${
                done || active ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {stage.label}
              </span>
            </div>
            {i < TIMELINE_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100">{children}</div>}
    </div>
  )
}

export default function ApplicationStatus() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [notifications, setNotifications] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadType, setUploadType] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [infoResponse, setInfoResponse] = useState('')
  const [respondingTo, setRespondingTo] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await getApplicationStatus(token)
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || 'Application not found or link is invalid.' })
    }
  }, [token])

  useEffect(() => {
    load()
    getStudentNotifications(token).then(d => setNotifications(d.data || d.notifications || [])).catch(() => {})
  }, [token, load])

  // Auto-refresh during evaluation
  useEffect(() => {
    const app = state.data?.data || state.data
    if (!app) return
    if (['under_evaluation', 'submitted'].includes(app.status)) {
      const timer = setInterval(load, 30000)
      return () => clearInterval(timer)
    }
  }, [state.data, load])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!uploadFile || !uploadType) {
      toast.error('Please select a file and document type')
      return
    }
    setUploading(true)
    try {
      await uploadStudentDocument(token, uploadFile, uploadType)
      toast.success('Document uploaded successfully')
      setShowUpload(false)
      setUploadFile(null)
      setUploadType('')
      load()
    } catch {
      toast.error('Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Spinner size="xl" className="text-primary-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading your application...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Application Not Found</h1>
          <p className="text-gray-500 mb-4">{state.error}</p>
          <p className="text-sm text-gray-400">
            Make sure you are using the exact link from your confirmation email.
          </p>
        </div>
      </div>
    )
  }

  const app = state.data?.data || state.data
  if (!app) return null

  const documents = app.documents || []
  const courses = app.courses || []
  const infoRequests = app.info_requests || []
  const evaluation = app.evaluation || null
  // Decision is available inline on the app object once status is approved/rejected
  const isDecided = ['approved', 'rejected'].includes(app.status)

  const openInfoRequests = infoRequests.filter(r => r.status === 'pending')

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 font-mono">{app.reference_number}</p>
            <h1 className="text-xl font-bold text-gray-900 mt-1">
              {app.student_name}'s Application
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Submitted {formatDate(app.submitted_at || app.created_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={app.status} />
            <button
              onClick={load}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Application Progress</h2>
        <Timeline status={app.status} />
        {app.status === 'information_required' && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Additional information is required. See below.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Decision */}
        {isDecided && (
          <div className={`rounded-xl border p-4 ${
            app.final_decision === 'approved'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {app.final_decision === 'approved'
                ? <Award className="w-5 h-5 text-green-600" />
                : <AlertCircle className="w-5 h-5 text-red-600" />
              }
              <h3 className={`font-bold ${app.final_decision === 'approved' ? 'text-green-800' : 'text-red-800'}`}>
                {app.final_decision === 'approved' ? 'Application Approved!' : 'Application Not Approved'}
              </h3>
            </div>
            {app.evaluator_comments && (
              <p className={`text-sm ${app.final_decision === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                {app.evaluator_comments}
              </p>
            )}
            {app.decision_date && (
              <p className="text-xs text-gray-500 mt-2">Decision date: {formatDate(app.decision_date)}</p>
            )}
          </div>
        )}

        {/* Info Requests */}
        {openInfoRequests.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Action Required — Additional Information Needed
            </h3>
            {openInfoRequests.map(req => (
              <div key={req.id} className="bg-white rounded-lg border border-amber-200 p-3">
                <p className="text-sm text-gray-700 mb-2">{req.message_to_student || req.message}</p>
                {(req.requested_items || req.items) && (
                  <ul className="space-y-1 mb-3">
                    {(req.requested_items || req.items).map((item, i) => (
                      <li key={i} className="text-sm text-amber-800 flex items-center gap-2">
                        <span className="text-amber-500">•</span>{typeof item === 'string' ? item : item.description}
                      </li>
                    ))}
                  </ul>
                )}
                {respondingTo === req.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Your response..."
                      rows={3}
                      value={infoResponse}
                      onChange={e => setInfoResponse(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        if (!infoResponse.trim()) { toast.error('Please enter a response'); return }
                        try {
                          await respondToInfoRequest(token, req.id, { response: infoResponse })
                          toast.success('Response sent')
                          setRespondingTo(null)
                          setInfoResponse('')
                          load()
                        } catch { toast.error('Failed to send response') }
                      }}>
                        <Send className="w-3.5 h-3.5" /> Send Response
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRespondingTo(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setRespondingTo(req.id)}>
                    Respond
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Evaluation Progress */}
        {['under_evaluation', 'submitted'].includes(app.status) && !evaluation && (
          <Section title="AI Evaluation">
            <div className="text-center py-6">
              <Spinner size="lg" className="text-primary-600 mx-auto mb-3" />
              <p className="font-medium text-gray-700">AI is evaluating your application...</p>
              <p className="text-sm text-gray-500 mt-1">This typically takes a few minutes. The page will auto-refresh.</p>
            </div>
          </Section>
        )}

        {/* Evaluation Results — student-safe view */}
        {evaluation && evaluation.status !== 'pending' && evaluation.status !== 'running' && (
          <Section title="Evaluation Summary">
            <div className="pt-4 space-y-3">
              {evaluation.confidence_score != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Overall Assessment</span>
                    <span className={`text-sm font-semibold ${
                      evaluation.confidence_score >= 0.8 ? 'text-green-700'
                      : evaluation.confidence_score >= 0.6 ? 'text-yellow-700'
                      : 'text-red-700'
                    }`}>
                      {evaluation.confidence_score >= 0.8 ? 'Strong'
                       : evaluation.confidence_score >= 0.6 ? 'Moderate'
                       : 'Needs Review'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        evaluation.confidence_score >= 0.8 ? 'bg-green-500'
                        : evaluation.confidence_score >= 0.6 ? 'bg-yellow-400'
                        : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.round(evaluation.confidence_score * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {evaluation.missing_documents?.length > 0 && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-1">Missing Documents:</p>
                  <ul className="text-sm text-amber-700 space-y-0.5">
                    {evaluation.missing_documents.map((d, i) => (
                      <li key={i}>• {typeof d === 'string' ? d : d.name || d.document_type}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-gray-400">
                Evaluated: {formatDate(evaluation.evaluated_at)}
              </p>
            </div>
          </Section>
        )}

        {/* Student Info */}
        <Section title="Your Information" defaultOpen={false}>
          <dl className="grid grid-cols-2 gap-3 pt-4">
            {[
              ['Name', app.student_name],
              ['Email', app.student_email],
              ['Phone', app.student_phone],
              ['From Institution', app.transfer_from_institution],
              ['Program Requested', app.transfer_to_program],
              ['GPA', app.academic_history?.gpa],
              ['Total Credits', app.academic_history?.credits_completed]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-gray-500">{label}</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Courses read from the transcript */}
        {courses.length > 0 && (
          <Section title={`Courses on your transcript (${courses.length})`} defaultOpen={false}>
            <div className="pt-4">
              <p className="text-xs text-gray-500 mb-3">
                We read these courses from your transcript. Each one is reviewed by BU's Credit Evaluation team.
              </p>
              <ul className="divide-y divide-gray-100">
                {courses.map(c => (
                  <li key={c.id} className="py-2 flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-xs text-gray-900">{c.course_code}</span>
                      <span className="text-sm text-gray-700 ml-2">{c.title}</span>
                      <div className="text-xs text-gray-400">{c.institution} · {c.term}</div>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{isDecided ? 'Reviewed' : 'Under review'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )}

        {/* Documents */}
        <Section title={`Documents (${documents.length})`} defaultOpen={false}>
          <div className="pt-4 space-y-4">
            <DocumentList documents={documents} token={token} />

            <Button variant="secondary" size="sm" onClick={() => setShowUpload(!showUpload)} className="w-full">
              <Upload className="w-4 h-4" />
              Upload Additional Document
            </Button>

            {showUpload && (
              <form onSubmit={handleUpload} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                <Select
                  label="Document Type"
                  options={DOC_TYPES}
                  value={uploadType}
                  onChange={e => setUploadType(e.target.value)}
                  required
                />
                <FileUpload label="" onFileSelect={setUploadFile} maxSizeMB={20} />
                <div className="flex gap-2">
                  <Button type="submit" loading={uploading} size="sm">Upload</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowUpload(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </Section>

        {/* Notifications */}
        {notifications.length > 0 && (
          <Section title={`Notifications (${notifications.length})`} defaultOpen={false}>
            <div className="pt-4 space-y-2">
              {notifications.map((n, i) => (
                <div key={n.id || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Bell className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{n.title || n.message}</p>
                    {n.message && n.title && <p className="text-xs text-gray-500">{n.message}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
