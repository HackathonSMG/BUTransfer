import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Globe, Mail, UserCheck, RefreshCw, ClipboardCheck,
  MessageSquare, FileText, Clock, User, StickyNote, Link2
} from 'lucide-react'
import notify from '../../lib/notify'
import {
  getApplication, triggerEvaluation, uploadDocument, getAuditLog, addEvaluatorNote
} from '../../api/applications'
import AIEvaluationReport from '../../components/evaluator/AIEvaluationReport'
import CreditEvaluation from '../../components/evaluator/CreditEvaluation'
import InfoRequestForm from '../../components/evaluator/InfoRequestForm'
import StatusBadge from '../../components/application/StatusBadge'
import DocumentList from '../../components/application/DocumentList'
import DocumentUpload from '../../components/application/DocumentUpload'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Textarea from '../../components/ui/Textarea'
import { activityLabel } from '../../lib/staffFormat'
import ReviewAssignment from '../../components/staff/ReviewAssignment'
import AssignDialog from '../../components/staff/AssignDialog'
import { useAuth } from '../../hooks/useAuth'

const SOURCE_CONFIG = {
  website: { Icon: Globe, label: 'Web Portal' },
  web: { Icon: Globe, label: 'Web Portal' },
  email: { Icon: Mail, label: 'Email' },
  evaluator_submitted: { Icon: UserCheck, label: 'Evaluator' }
}

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
}

function InfoField({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}

// The human-readable part of an audit entry (a reason or note); ids and raw payloads stay in the database
function auditNote(entry) {
  const d = typeof entry.details === 'string' ? { note: entry.details } : entry.details || {}
  const status = entry.new_value?.status ? `Status: ${String(entry.new_value.status).replace(/_/g, ' ')}` : null
  return [status, d.reason || d.note || d.note_preview || null].filter(Boolean).join(' · ') || null
}

function AuditEntry({ entry }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-2 h-2 bg-gray-400 rounded-full mt-1.5 flex-shrink-0" />
        <div className="w-px bg-gray-200 flex-1 mt-1" />
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium text-gray-900">{activityLabel(entry.action)}</p>
        <p className="text-xs text-gray-500">{entry.actor_name || entry.actor || entry.actor_email || 'System'} · {formatDate(entry.created_at || entry.timestamp)}</p>
        {auditNote(entry) && <p className="text-xs text-gray-600 mt-0.5">{auditNote(entry)}</p>}
      </div>
    </div>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  // The Credit Evaluation Office and administrators can move an open course to another evaluator from here
  const canReassign = ['admin', 'credit_office'].includes(user?.role)
  const [assigning, setAssigning] = useState(null)
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [auditLog, setAuditLog] = useState([])
  const [triggering, setTriggering] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showInfoRequest, setShowInfoRequest] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getApplication(id)
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || 'Evaluation not found' })
    }
  }, [id])

  useEffect(() => {
    load()
    getAuditLog(id).then(d => setAuditLog(d.data || d.entries || [])).catch(() => {})
  }, [id, load])

  const handleTriggerEvaluation = async () => {
    setTriggering(true)
    try {
      await triggerEvaluation(id)
      notify.success('Evaluation started. This may take a minute...')
      setTimeout(load, 3000)
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to trigger evaluation')
    } finally {
      setTriggering(false)
    }
  }

  const handleUpload = async (file, documentType) => {
    setUploading(true)
    try {
      await uploadDocument(id, file, documentType)
      await load()
    } finally {
      setUploading(false)
    }
  }

  const handleSaveNote = async () => {
    if (!note.trim()) return
    setSavingNote(true)
    try {
      await addEvaluatorNote(id, note)
      notify.success('Note saved')
      setNote('')
      await load()
    } catch {
      notify.error('Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="xl" className="text-primary-600" />
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">{state.error}</p>
        <Button onClick={() => navigate('/evaluator')}>Back to Dashboard</Button>
      </div>
    )
  }

  const app = state.data?.data || state.data?.application || state.data
  if (!app) return null

  const documents = app.documents || []
  const evaluation = app.latest_ai_evaluation || null
  const infoRequests = app.information_requests || []
  const transcriptCourses = app.transcript_courses || []
  const isDecided = ['approved', 'rejected'].includes(app.status)
  const statusLink = app.reference_number ? `${window.location.origin}/track?application=${encodeURIComponent(app.reference_number)}` : null

  const copyStatusLink = async () => {
    try {
      await navigator.clipboard.writeText(statusLink)
      notify.success('Tracking link copied')
    } catch {
      notify.error('Could not copy; select the link and copy it manually')
    }
  }

  const src = SOURCE_CONFIG[app.source] || SOURCE_CONFIG.website
  const SourceIcon = src.Icon

  const canEvaluate = ['submitted', 'information_required', 'evaluation_completed'].includes(app.status)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/evaluator')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {app.reference_number}
              </span>
              <StatusBadge status={app.status} />
              <Badge variant="info" className="flex items-center gap-1 text-xs">
                <SourceIcon className="w-3 h-3" />
                {src.label}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-1">
              {app.student_name}
            </h1>
            <p className="text-sm text-gray-500">
              Submitted {formatDate(app.submitted_at || app.created_at)}
              {app.updated_at && ` · Updated ${formatDate(app.updated_at)}`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Where the application is and who holds each course */}
      <ReviewAssignment ownership={app.ownership} onReassign={canReassign ? setAssigning : null} />
      {canReassign && <AssignDialog course={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); load() }} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Student Info */}
          <Card title="Student Information">
            <dl className="grid grid-cols-2 gap-4">
              <InfoField label="Full Name" value={app.student_name} />
              <InfoField label="Email" value={app.student_email} />
              <InfoField label="Phone" value={app.student_phone} />
              <InfoField label="Date of Birth" value={app.date_of_birth} />
            </dl>
          </Card>

          {/* Transfer Details */}
          <Card title="Transfer Details">
            <dl className="grid grid-cols-2 gap-4">
              <InfoField label="From Institution" value={app.transfer_from_institution} />
              <InfoField label="From Program" value={app.transfer_from_program} />
              <InfoField label="To Program" value={app.transfer_to_program} />
              <InfoField label="To Department" value={app.transfer_to_department} />
              <InfoField label="Expected Start Term" value={app.expected_start_term} />
            </dl>
          </Card>

          {/* Academic History */}
          <Card title="Academic History">
            <dl className="grid grid-cols-2 gap-4">
              <InfoField label="GPA" value={app.academic_history?.gpa} />
              <InfoField label="Total Credits" value={app.academic_history?.credits_completed} />
              <InfoField label="Academic Standing" value={app.academic_history?.academic_standing} />
              <InfoField label="Transfer Date" value={app.academic_history?.transfer_date} />
            </dl>
            {app.applicant_comments && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Additional Information from the Student</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.applicant_comments}</p>
              </div>
            )}
            {app.personal_statement && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Personal Statement</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.personal_statement}</p>
              </div>
            )}
          </Card>

          {/* Documents */}
          <Card title={`Documents (${documents.length})`}>
            <DocumentList documents={documents} />
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3">Upload Additional Document</p>
              <DocumentUpload onUpload={handleUpload} uploading={uploading} />
            </div>
          </Card>

          {/* Per-course credit evaluation */}
          <Card title={`Transfer Credit Evaluation (${transcriptCourses.length} courses)`}>
            <CreditEvaluation courses={transcriptCourses} summary={evaluation?.credit_summary} />
          </Card>

          {/* Evaluation */}
          <Card title="Evaluation Report">
            <AIEvaluationReport
              evaluation={evaluation}
              onTrigger={handleTriggerEvaluation}
              triggering={triggering}
            />
          </Card>

          {/* Info Requests */}
          {infoRequests.length > 0 && (
            <Card title={`Information Requests (${infoRequests.length})`}>
              <div className="space-y-4">
                {infoRequests.map((req, i) => (
                  <div key={req.id || i} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={req.status === 'open' || req.status === 'pending' ? 'warning' : req.status === 'responded' ? 'success' : 'default'}>
                        {req.status}
                      </Badge>
                      <span className="text-xs text-gray-400">{formatDate(req.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{req.message_to_student || req.message}</p>
                    {(req.requested_items || req.items) && (
                      <ul className="text-xs text-gray-600 space-y-0.5 mb-2">
                        {(req.requested_items || req.items).map((item, j) => (
                          <li key={j}>• {typeof item === 'string' ? item : item.description}</li>
                        ))}
                      </ul>
                    )}
                    {req.student_response && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-800 mb-1">Student Response:</p>
                        <p className="text-sm text-green-700">{req.student_response}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Audit Log */}
          {auditLog.length > 0 && (
            <Card title="Audit Log">
              <div className="mt-2">
                {auditLog.map((entry, i) => (
                  <AuditEntry key={entry.id || i} entry={entry} />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
          {/* Current Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Application Status
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status={app.status} />
            </div>
            {isDecided && (
              <div className={`text-xs rounded-lg px-3 py-2 mt-2 ${
                app.final_decision === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {app.final_decision === 'approved' ? 'Approved' : 'Rejected'}
                {app.decision_date && ` on ${formatDate(app.decision_date)}`}
              </div>
            )}
          </div>

          {/* Assigned Evaluator */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Currently With
            </h3>
            {(app.ownership?.owners || []).length ? app.ownership.owners.map(o => (
              <p key={o.name} className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{o.name}</span>{o.department ? ` — ${o.department}` : ''}
                <span className="block text-xs text-gray-500">{o.courses.join(', ')}</span>
              </p>
            )) : <p className="text-sm text-gray-700">{app.ownership?.stage_label || 'No evaluator'}</p>}
          </div>

          {/* Applicant tracking: applicants open their application with its number and their email */}
          {statusLink && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Student Tracking
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                The student tracks this application at Track Application with <span className="font-mono">{app.reference_number}</span> and {app.student_email}. The link fills in the number; the email is always required.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={statusLink}
                  onFocus={e => e.target.select()}
                  aria-label="Student tracking link"
                  className="flex-1 min-w-0 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700"
                />
                <Button size="sm" variant="secondary" onClick={copyStatusLink}>Copy</Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>

            {canEvaluate && (
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleTriggerEvaluation}
                loading={triggering}
              >
                <ClipboardCheck className="w-4 h-4" />
                Run Evaluation
              </Button>
            )}

            <Button
              className="w-full"
              variant="secondary"
              onClick={() => setShowInfoRequest(true)}
            >
              <MessageSquare className="w-4 h-4" />
              Request More Information
            </Button>
            {/* Decisions are made per course (evaluators) and posted by the Credit Evaluation Office; there is no
                whole-application approve/reject here, since it bypassed the course decisions and postings */}
          </div>

          {/* Quick Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <StickyNote className="w-4 h-4" />
              Evaluator Notes
              <span className="text-xs text-gray-400 font-normal">(internal only)</span>
            </h3>
            {/* Previous notes */}
            {app.additional_info?.evaluator_notes?.length > 0 && (
              <div className="space-y-2 mb-3">
                {app.additional_info.evaluator_notes.map((n, i) => (
                  <div key={i} className="bg-yellow-50 border border-yellow-100 rounded-lg p-2">
                    <p className="text-xs text-gray-700">{n.note || n}</p>
                    {n.created_at && <p className="text-xs text-gray-400 mt-1">{formatDate(n.created_at)}</p>}
                  </div>
                ))}
              </div>
            )}
            <Textarea
              rows={3}
              placeholder="Add an internal note..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSaveNote}
              loading={savingNote}
              disabled={!note.trim()}
              className="mt-2 w-full"
            >
              Save Note
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <InfoRequestForm
        isOpen={showInfoRequest}
        applicationId={id}
        onClose={() => setShowInfoRequest(false)}
        onSuccess={() => load()}
      />
    </div>
  )
}
