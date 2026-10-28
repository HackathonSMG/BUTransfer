import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  CheckCircle, Clock, AlertCircle, Upload, Bell, ChevronDown, ChevronUp, RefreshCw, Send, CalendarClock, Info, Paperclip
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getApplicationStatus, uploadStudentDocument, getStudentNotifications, respondToInfoRequest, uploadInfoResponse } from '../../api/student'
import StatusBadge from '../../components/application/StatusBadge'
import DocumentList from '../../components/application/DocumentList'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import FileUpload from '../../components/ui/FileUpload'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'

// Where the application is in the process the student knows (MyBU Student posting is the last step)
const TIMELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'documents', label: 'Documents Processed' },
  { key: 'evaluation', label: 'Course Evaluation' },
  { key: 'review', label: 'Evaluator Review' },
  { key: 'final', label: 'Final Review' },
  { key: 'completed', label: 'Completed' }
]

// The stage being worked on for each application status (every earlier stage is done)
const STATUS_STAGE_MAP = {
  draft: 0,
  submitted: 1,
  under_evaluation: 1,
  evaluation_completed: 2,
  information_required: 3,
  under_evaluator_review: 3,
  ready_for_posting: 4,
  credit_posted: 6,
  approved: 6,
  rejected: 6,
  closed: 6
}

const DOC_TYPES = [
  { value: 'transcript', label: 'Official Transcript' },
  { value: 'identification', label: 'Government ID' },
  { value: 'syllabus', label: 'Course Syllabus' },
  { value: 'other', label: 'Other Document' }
]

// Course status colours; the wording comes from the API
const TONE_CLASSES = {
  done: 'bg-green-50 text-green-800 border-green-200',
  action: 'bg-amber-50 text-amber-900 border-amber-300',
  progress: 'bg-blue-50 text-blue-800 border-blue-200',
  waiting: 'bg-gray-50 text-gray-700 border-gray-200'
}

function formatDate(d, withTime = true) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(d))
}

function Timeline({ status }) {
  const currentStage = STATUS_STAGE_MAP[status] ?? 0
  const isFinal = currentStage >= TIMELINE_STAGES.length

  return (
    <div className="flex items-center gap-2">
      {TIMELINE_STAGES.map((stage, i) => {
        const done = currentStage > i
        const active = currentStage === i && !isFinal

        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                done
                  ? 'bg-green-500 text-white'
                  : active
                  ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-[11px] sm:text-xs mt-1 text-center leading-tight font-medium max-w-[4.5rem] sm:max-w-none ${
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

// Answer one request: a file (the syllabus) and/or a written reply
function RequestResponse({ token, request, onDone }) {
  const [file, setFile] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const syllabus = request.kind === 'syllabus'

  const send = async () => {
    if (!file && !reply.trim()) { toast.error(syllabus ? 'Choose the syllabus file' : 'Write your reply'); return }
    setSending(true)
    try {
      if (file) await uploadInfoResponse(token, request.id, file, reply.trim())
      else await respondToInfoRequest(token, request.id, { response: reply.trim() })
      toast.success(syllabus ? 'Syllabus received' : 'Reply sent')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Could not send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2">
      {syllabus && <FileUpload label="" onFileSelect={setFile} maxSizeMB={10} />}
      <Textarea
        placeholder={syllabus ? 'Note for the evaluator (optional)' : 'Your reply...'}
        rows={syllabus ? 2 : 3}
        value={reply}
        onChange={e => setReply(e.target.value)}
      />
      <Button size="sm" onClick={send} loading={sending}>
        {syllabus ? <Upload className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
        {syllabus ? 'Send syllabus' : 'Send reply'}
      </Button>
    </div>
  )
}

function SummaryTile({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function CourseResult({ c, token, onChanged }) {
  const [open, setOpen] = useState(c.status === 'information_requested')
  return (
    <li className="py-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="font-mono text-xs text-gray-900">{c.course_code}</span>
          <span className="text-sm text-gray-700 ml-2">{c.title}</span>
          <span className="block text-xs text-gray-400">
            {[c.term, c.source_credits != null ? `${c.source_credits} ${c.credit_system === 'Quarter' ? 'quarter ' : ''}credits` : null, c.grade && `grade ${c.grade}`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${TONE_CLASSES[c.tone] || TONE_CLASSES.waiting}`}>{c.status_label}</span>
          <span className="text-xs text-gray-600 tabular-nums">
            {c.units} BU unit{c.units === 1 ? '' : 's'}{c.transfer_grade ? ` · grade ${c.transfer_grade}` : ''}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-0.5 space-y-2">
          {c.decision && <p className="text-sm font-medium text-gray-900">{c.decision}</p>}
          <p className="text-sm text-gray-600">{c.explanation}</p>
          {c.information_request && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-amber-900">{c.information_request.message}</p>
              <RequestResponse token={token} request={c.information_request} onDone={onChanged} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export default function ApplicationStatus() {
  const { token } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [notifications, setNotifications] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadType, setUploadType] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getApplicationStatus(token)
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || 'Application not found or link is invalid.' })
    }
  }, [token])

  const loadNotifications = useCallback(() => {
    getStudentNotifications(token).then(d => setNotifications(d.data || d.notifications || [])).catch(() => {})
  }, [token])

  useEffect(() => {
    load()
    loadNotifications()
  }, [load, loadNotifications])

  // Auto-refresh while the courses are being read and evaluated
  useEffect(() => {
    const app = state.data?.data || state.data
    if (!app) return
    if (['under_evaluation', 'submitted', 'evaluation_completed'].includes(app.status)) {
      const timer = setInterval(load, 30000)
      return () => clearInterval(timer)
    }
  }, [state.data, load])

  const refreshAll = () => { load(); loadNotifications() }

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
  const results = app.results || { summary: null, courses: [] }
  const summary = results.summary
  const courseResults = results.courses || []
  // Requests not tied to a course (written replies); course requests are answered on the course itself
  const openGeneralRequests = (app.info_requests || []).filter(r => r.status === 'pending' && !r.transcript_course_id)
  const needsAction = courseResults.filter(c => c.status === 'information_requested')
  const evaluating = ['under_evaluation', 'submitted', 'evaluation_completed'].includes(app.status) && courseResults.every(c => c.status === 'processing')
  const byInstitution = courseResults.reduce((acc, c) => { (acc[c.institution] = acc[c.institution] || []).push(c); return acc }, {})

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        {user?.role === 'student' && <Link to="/student" className="text-sm text-gray-500 hover:text-gray-700">← My Applications</Link>}
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
            <button onClick={refreshAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Application Progress</h2>
        <Timeline status={app.status} />
        {needsAction.length > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {needsAction.length === 1 ? 'One course needs' : `${needsAction.length} courses need`} something from you. See below.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {app.status === 'draft' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <p className="font-semibold text-amber-900">This application has not been submitted</p>
            <p className="text-sm text-amber-800 mt-1">Upload your official transcript and submit it to start the evaluation.</p>
            <Link to={`/apply?resume=${token}`} className="inline-block mt-3 text-sm font-semibold text-primary-700 hover:text-primary-800">Finish your application →</Link>
          </div>
        )}
        {app.status !== 'draft' && !evaluating && courseResults.length === 0 && app.evaluation?.status === 'completed' && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-gray-900">We received your documents</p>
            <p className="text-sm text-gray-600 mt-1">We couldn't read the courses from your transcript automatically. The Credit Evaluation Office has been notified and will follow up with you.</p>
          </div>
        )}

        {/* Requests not tied to a course */}
        {openGeneralRequests.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Action Required: Additional Information Needed
            </h3>
            {openGeneralRequests.map(req => (
              <div key={req.id} className="bg-white rounded-lg border border-amber-200 p-3">
                <p className="text-sm text-gray-700 mb-2">{req.message}</p>
                {req.items?.length > 0 && (
                  <ul className="space-y-1 mb-3">
                    {req.items.map((item, i) => (
                      <li key={i} className="text-sm text-amber-800 flex items-center gap-2">
                        <span className="text-amber-500">•</span>{typeof item === 'string' ? item : item.description}
                      </li>
                    ))}
                  </ul>
                )}
                <RequestResponse token={token} request={req} onDone={refreshAll} />
              </div>
            ))}
          </div>
        )}

        {/* Courses still being read */}
        {evaluating && (
          <Section title="Course Evaluation">
            <div className="text-center py-6">
              <Spinner size="lg" className="text-primary-600 mx-auto mb-3" />
              <p className="font-medium text-gray-700">We're reviewing your academic documents</p>
              <p className="text-sm text-gray-500 mt-1">Your transcript is being processed and each course checked against BU's equivalency database.</p>
              <p className="text-sm text-gray-500 mt-1">This usually takes a few minutes. The page refreshes on its own.</p>
            </div>
          </Section>
        )}

        {/* Transfer credit results */}
        {courseResults.length > 0 && !evaluating && (
          <Section title="Your Transfer Credit">
            <div className="pt-4 space-y-4">
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <SummaryTile label="Courses submitted" value={summary.courses} />
                  <SummaryTile label="Evaluated" value={summary.decided} />
                  <SummaryTile label="Still pending" value={summary.pending} hint={summary.pending ? 'shown as 0 units' : null} />
                  <SummaryTile label="Credits posted" value={summary.credits_posted} hint={summary.credits_approved ? `+${summary.credits_approved} being posted` : null} />
                </div>
              )}
              {results.deadline?.deadline && (
                <p className={`text-xs flex items-start gap-1.5 ${results.deadline.status === 'passed' ? 'text-red-700' : results.deadline.status === 'approaching' ? 'text-amber-700' : 'text-gray-500'}`}>
                  <CalendarClock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{results.deadline.explanation}
                </p>
              )}
              {Object.entries(byInstitution).map(([institution, list]) => (
                <div key={institution}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{institution}</p>
                  <ul className="divide-y divide-gray-100">
                    {list.map(c => <CourseResult key={c.id} c={c} token={token} onChanged={refreshAll} />)}
                  </ul>
                </div>
              ))}
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 space-y-1">
                {(results.policy_notes || []).map((n, i) => (
                  <p key={i} className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{n}</p>
                ))}
                <p className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Academic departments make the final decision on every course.</p>
              </div>
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
              ['BU Start Term', app.expected_start_term],
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

        {/* Documents */}
        <Section title={`Documents (${documents.length})`} defaultOpen={false}>
          <div className="pt-4 space-y-4">
            <DocumentList documents={documents} token={token} />
            <p className="text-xs text-gray-500 flex gap-1.5"><Paperclip className="w-3.5 h-3.5 mt-0.5" />Send official final transcripts from every college you attended. Syllabi requested for a course are uploaded on that course above.</p>

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

        {app.status === 'credit_posted' && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">Your transfer credit evaluation is complete and every course has been posted to your record{app.decision_date ? ` (${formatDate(app.decision_date, false)})` : ''}.</p>
          </div>
        )}
        {app.status !== 'credit_posted' && summary?.pending > 0 && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5 justify-center"><Clock className="w-3.5 h-3.5" />Courses still pending show 0 units until they are evaluated.</p>
        )}
      </div>
    </div>
  )
}
