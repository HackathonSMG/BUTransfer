import React, { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Circle, AlertCircle, Upload, Send, RefreshCw, CalendarClock, Info, ChevronDown, FileText, Bell, Copy, Check
} from 'lucide-react'
import notify from '../../lib/notify'
import { getApplicationStatus, uploadStudentDocument, getStudentNotifications, respondToInfoRequest, uploadInfoResponse } from '../../api/student'
import DocumentList from '../application/DocumentList'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import FileUpload from '../ui/FileUpload'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'

// The applicant's view of one application. Every status, stage, label and course result comes from the API
// (backend applicant-status.js and lifecycle.studentView); this component only lays it out.
const TONE = {
  done: 'bg-green-50 text-green-800 border-green-200',
  action: 'bg-amber-50 text-amber-900 border-amber-300',
  progress: 'bg-blue-50 text-blue-800 border-blue-200',
  waiting: 'bg-gray-50 text-gray-700 border-gray-200'
}
const PROCESSING = ['submitted', 'under_evaluation', 'evaluation_completed']
const DOC_TYPES = [
  { value: 'transcript', label: 'Academic transcript' },
  { value: 'syllabus', label: 'Course syllabus' },
  { value: 'supporting', label: 'Supporting document' }
]

const fmt = (d, time = false) => d ? new Intl.DateTimeFormat('en-US', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(d)) : '—'
const errMessage = (err, fallback) => err.response?.data?.message || err.response?.data?.error?.message || fallback

function Badge({ tone, children, className = '' }) {
  return <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${TONE[tone] || TONE.waiting} ${className}`}>{children}</span>
}

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </section>
  )
}

function Progress({ stages }) {
  return (
    <>
      {/* Desktop: horizontal */}
      <ol className="hidden md:flex items-start">
        {stages.map((s, i) => (
          <li key={s.key} className="flex-1 flex flex-col items-center relative text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 ${s.state === 'upcoming' || (s.state === 'skipped' && stages[i + 1]?.state === 'upcoming') ? 'bg-gray-200' : 'bg-green-500'}`} aria-hidden="true" />}
            <StageDot state={s.state} n={i + 1} />
            <span className={`mt-2 text-xs font-medium leading-tight px-1 ${['upcoming', 'skipped'].includes(s.state) ? 'text-gray-400' : 'text-gray-900'}`}>{s.label}</span>
            <span className="text-[11px] text-gray-500 mt-0.5 h-4">{stageNote(s)}</span>
          </li>
        ))}
      </ol>
      {/* Mobile: vertical */}
      <ol className="md:hidden space-y-0">
        {stages.map((s, i) => (
          <li key={s.key} className="flex gap-3" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="flex flex-col items-center">
              <StageDot state={s.state} n={i + 1} />
              {i < stages.length - 1 && <span className={`w-0.5 flex-1 min-h-[18px] ${stages[i + 1].state === 'upcoming' ? 'bg-gray-200' : 'bg-green-500'}`} />}
            </span>
            <span className="pb-4">
              <span className={`block text-sm font-medium ${['upcoming', 'skipped'].includes(s.state) ? 'text-gray-400' : 'text-gray-900'}`}>{s.label}</span>
              <span className="block text-xs text-gray-500">{stageNote(s)}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}

const stageNote = (s) => (s.state === 'current' ? 'In progress' : s.state === 'skipped' ? (s.note || 'Not needed') : s.at ? fmt(s.at) : '')

function StageDot({ state, n }) {
  if (state === 'skipped') return <span className="relative z-10 w-8 h-8 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 text-gray-400 grid place-items-center text-xs font-semibold ring-4 ring-white">—</span>
  if (state === 'done') return <span className="relative z-10 w-8 h-8 rounded-full bg-green-600 text-white grid place-items-center ring-4 ring-white"><Check className="w-4 h-4" /></span>
  if (state === 'current') return <span className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-brand text-brand grid place-items-center text-sm font-bold ring-4 ring-red-50">{n}</span>
  return <span className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-gray-200 text-gray-400 grid place-items-center text-sm font-semibold ring-4 ring-white">{n}</span>
}

// Answer one request: a file (the syllabus) and/or a written reply
function RequestResponse({ token, request, onDone }) {
  const [file, setFile] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const syllabus = request.kind === 'syllabus'
  const send = async () => {
    if (!file && !reply.trim()) { notify.error(syllabus ? 'Choose the syllabus file' : 'Write your reply'); return }
    setSending(true)
    try {
      if (file) await uploadInfoResponse(token, request.id, file, reply.trim())
      else await respondToInfoRequest(token, request.id, { response: reply.trim() })
      notify.success(syllabus ? 'Syllabus received' : 'Reply sent')
      onDone()
    } catch (err) {
      notify.error(errMessage(err, 'Could not send. Please try again.'))
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="space-y-2">
      {syllabus && <FileUpload label="" onFileSelect={setFile} maxSizeMB={10} />}
      <Textarea placeholder={syllabus ? 'Note for the reviewer (optional)' : 'Your reply'} rows={syllabus ? 2 : 3} value={reply} onChange={e => setReply(e.target.value)} />
      <Button size="sm" onClick={send} loading={sending}>
        {syllabus ? <Upload className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}{syllabus ? 'Send syllabus' : 'Send reply'}
      </Button>
    </div>
  )
}

// The result of one course, in the applicant's terms (the outcome comes from the API)
const RESULT = {
  transfer: { label: 'Equivalent', tone: 'done' },
  elective: { label: 'Elective Credit', tone: 'done' },
  no_credit: { label: 'Not Accepted', tone: 'waiting' }
}
function resultOf(c) {
  if (c.outcome) return RESULT[c.outcome]
  if (c.status === 'information_requested') return { label: 'Action Needed', tone: 'action' }
  return { label: 'Pending', tone: 'progress' }
}

function CourseRow({ c, token, onChanged }) {
  const [open, setOpen] = useState(c.status === 'information_requested')
  const result = resultOf(c)
  const credits = c.source_credits != null
    ? `${c.source_credits}${c.credit_system === 'Quarter' ? ' qtr' : ''}`
    : '—'
  const awarded = c.outcome ? c.units : 0
  return (
    <li className={c.status === 'information_requested' ? 'bg-amber-50/50' : ''}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full text-left px-5 sm:px-6 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_4.5rem_minmax(0,1.4fr)_8.5rem_5rem_1.25rem] gap-x-4 gap-y-1.5 items-center hover:bg-gray-50/80 transition-colors">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900"><span className="font-mono">{c.course_code}</span> <span className="font-normal text-gray-700">{c.title}</span></span>
          <span className="block text-xs text-gray-500 mt-0.5">{[c.term, c.grade && `Grade ${c.grade}`].filter(Boolean).join(' · ')}<span className="md:hidden">{c.source_credits != null ? ` · ${credits} credits` : ''}</span></span>
        </span>
        <span className="hidden md:block text-sm text-gray-700 tabular-nums text-right">{credits}</span>
        <span className="col-span-2 md:col-span-1 min-w-0 text-sm order-3 md:order-none">
          {c.outcome === 'transfer' ? <span className="font-semibold text-gray-900">{c.bu_course}</span>
            : c.outcome === 'elective' ? <span className="font-medium text-gray-900">{c.result_label}</span>
              : <span className="text-gray-400">—</span>}
        </span>
        <span className="justify-self-end md:justify-self-start row-start-1 col-start-2 md:row-auto md:col-auto"><Badge tone={result.tone}>{result.label}</Badge></span>
        <span className="hidden md:block text-sm font-semibold text-gray-900 tabular-nums text-right">{awarded}</span>
        <ChevronDown className={`hidden md:block w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span className="md:hidden col-span-2 order-4 text-xs text-gray-600">BU units: <span className="font-semibold text-gray-900 tabular-nums">{awarded}</span></span>
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-4 -mt-1 space-y-2">
          <p className="text-xs font-medium text-gray-500">{c.status_label}</p>
          <p className="text-sm text-gray-700">{c.explanation}</p>
          {c.transfer_grade && <p className="text-xs text-gray-500">Posted with a grade of {c.transfer_grade}; not counted in the BU GPA; no BU Hub units.</p>}
          {c.information_request && (
            <div className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2.5">
              <p className="text-sm font-medium text-amber-900">{c.information_request.message}</p>
              <RequestResponse token={token} request={c.information_request} onDone={onChanged} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// Transfer Credit Summary: every figure is from the API's course summary (lifecycle.summarizeCourses)
function CreditSummary({ summary, complete }) {
  if (!summary) return null
  const tiles = [
    { label: 'Credits Accepted', value: summary.credits_accepted, hint: 'BU units from accepted courses' },
    { label: 'Credits Awarded', value: summary.credits_posted, hint: 'Posted to your record, grade T' },
    { label: 'Credits Pending', value: summary.credits_pending, hint: summary.pending_without_credits ? `+ ${summary.pending_without_credits} course${summary.pending_without_credits === 1 ? '' : 's'} awaiting credit details` : 'Under evaluation; 0 units until decided' }
  ]
  const counts = [
    ['Courses Evaluated', `${summary.decided} of ${summary.courses}`],
    ['With Department Review', summary.courses_in_department_review],
    ['Waiting for Your Syllabus', summary.courses_awaiting_syllabus],
    ['Courses Pending', summary.pending]
  ]
  const outcomes = `${summary.courses_accepted} accepted (${summary.courses_equivalent} equivalent, ${summary.courses_elective} elective) · ${summary.courses_not_accepted} not accepted`
  // What the student needs to do next, from the same summary
  const next = complete ? 'Your evaluation is complete. No further action is needed.'
    : summary.needs_student_action ? `Action needed: upload the ${summary.courses_awaiting_syllabus ? 'syllabus' : 'information'} requested on the course${summary.needs_student_action === 1 ? '' : 's'} marked "Action Needed" below.`
      : 'Nothing is needed from you right now. We will email you when your courses are decided.'
  return (
    <section className={`rounded-2xl border ${complete ? 'border-green-200 bg-gradient-to-b from-green-50 to-white' : 'border-gray-200 bg-white'}`} aria-labelledby="credit-summary">
      <div className="px-5 sm:px-6 pt-5 pb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="credit-summary" className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {complete && <CheckCircle2 className="w-5 h-5 text-green-600" />}Transfer Credit Summary
        </h2>
        {complete && <span className="text-xs font-medium text-green-800">Evaluation complete</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 sm:px-6 py-4">
        {tiles.map(t => (
          <div key={t.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium text-gray-500">{t.label}</p>
            <p className="text-[28px] font-bold text-gray-900 tabular-nums leading-tight mt-0.5">{t.value}</p>
            <p className="text-[11.5px] text-gray-500 mt-0.5">{t.hint}</p>
          </div>
        ))}
      </div>
      <p className={`mx-5 sm:mx-6 mb-4 rounded-lg px-3.5 py-2.5 text-sm ${summary.needs_student_action && !complete ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-gray-50 text-gray-700'}`}>{next}</p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 border-t border-gray-100">
        {counts.map(([k, v]) => (
          <div key={k} className="px-5 sm:px-6 py-3 border-gray-100 [&:not(:last-child)]:sm:border-r">
            <dt className="text-[11.5px] text-gray-500">{k}</dt>
            <dd className="text-base font-semibold text-gray-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="px-5 sm:px-6 py-3 border-t border-gray-100 text-xs text-gray-600">Decided so far: {outcomes}</p>
    </section>
  )
}

export default function ApplicationTracker({ token, headerAction = null }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [notifications, setNotifications] = useState([])
  const [copied, setCopied] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadType, setUploadType] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getApplicationStatus(token)
      setState({ loading: false, data: res.data || res, error: null })
    } catch (err) {
      setState(s => ({ loading: false, data: s.data, error: s.data ? null : errMessage(err, 'We could not open this transfer credit evaluation.') }))
    }
    getStudentNotifications(token).then(d => setNotifications(d.data || [])).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])

  // Refresh on its own while the documents are being processed
  const app = state.data
  useEffect(() => {
    if (!app || !PROCESSING.includes(app.status)) return
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [app, load])

  const upload = async (e) => {
    e.preventDefault()
    if (!uploadFile || !uploadType) { notify.error('Choose the document type and a file'); return }
    setUploading(true)
    try {
      await uploadStudentDocument(token, uploadFile, uploadType)
      notify.success('Document received')
      setShowUpload(false); setUploadFile(null); setUploadType('')
      load()
    } catch (err) {
      notify.error(errMessage(err, 'The document could not be uploaded'))
    } finally {
      setUploading(false)
    }
  }

  if (state.loading) {
    return <div className="py-24 text-center"><Spinner size="lg" className="text-brand mx-auto" /><p className="text-sm text-gray-500 mt-3">Loading your transfer credit status…</p></div>
  }
  if (state.error) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <span className="w-14 h-14 rounded-full bg-red-50 grid place-items-center mx-auto"><AlertCircle className="w-7 h-7 text-red-600" /></span>
        <h1 className="text-xl font-semibold text-gray-900 mt-4">Transfer credit status not available</h1>
        <p className="text-gray-500 mt-2">{state.error}</p>
      </div>
    )
  }

  const info = app.status_info || {}
  const results = app.results || { courses: [] }
  const courses = results.courses || []
  const summary = results.summary
  const needsAction = courses.filter(c => c.status === 'information_requested')
  const generalRequests = (app.info_requests || []).filter(r => r.status === 'pending' && !r.transcript_course_id)
  const processing = PROCESSING.includes(app.status) && courses.every(c => c.status === 'processing')
  const complete = app.status === 'credit_posted'
  const byInstitution = courses.reduce((acc, c) => { (acc[c.institution] = acc[c.institution] || []).push(c); return acc }, {})
  const transcriptsRead = courses.length > 0

  const copy = async () => { try { await navigator.clipboard.writeText(app.reference_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* blocked */ } }

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="bg-white rounded-2xl border border-gray-200 px-5 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Transfer Credit ID</p>
            <div className="flex items-center gap-1.5 mt-1">
              <h1 className="font-mono text-2xl font-bold text-gray-900">{app.reference_number}</h1>
              <button type="button" onClick={copy} className="p-1.5 rounded-md text-gray-400 hover:text-gray-800 hover:bg-gray-100" aria-label="Copy Transfer Credit ID">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1">{app.student_name} · Submitted {fmt(app.submitted_at || app.created_at)}</p>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end gap-3">
            <Badge tone={info.tone} className="text-sm px-3 py-1">{info.label}</Badge>
            <div className="flex items-center gap-3">
              <button type="button" onClick={load} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
              {headerAction}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-700 mt-4 rounded-lg bg-gray-50 px-3.5 py-2.5">{info.description}</p>
      </section>

      {/* Progress */}
      {app.progress?.stages && (
        <Card title="Transfer Credit Progress">
          <Progress stages={app.progress.stages} />
        </Card>
      )}

      {/* Action required */}
      {(needsAction.length > 0 || generalRequests.length > 0) && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-5 sm:px-6 py-4">
          <p className="font-semibold text-amber-900 flex items-center gap-2"><AlertCircle className="w-5 h-5" />Action required</p>
          <p className="text-sm text-amber-900 mt-1">
            {needsAction.length > 0 && `${needsAction.length === 1 ? 'One course needs' : `${needsAction.length} courses need`} something from you. Open the course marked "Action needed" below. `}
            Courses waiting on information show 0 BU units until they are reviewed.
          </p>
          {generalRequests.map(req => (
            <div key={req.id} className="mt-3 bg-white rounded-xl border border-amber-200 p-3.5">
              <p className="text-sm text-gray-800 mb-2">{req.message}</p>
              {req.items?.length > 0 && (
                <ul className="mb-3 space-y-1">{req.items.map((it, i) => <li key={i} className="text-sm text-amber-900">• {typeof it === 'string' ? it : it.description}</li>)}</ul>
              )}
              <RequestResponse token={token} request={req} onDone={load} />
            </div>
          ))}
        </section>
      )}

      {/* Transfer Credit Summary */}
      {courses.length > 0 && !processing && <CreditSummary summary={summary} complete={complete} />}
      {complete && (
        <p className="text-xs text-gray-500 -mt-2 px-1">Credit was posted{app.decision_date ? ` on ${fmt(app.decision_date)}` : ''} with a grade of T. Transfer grades do not count toward your BU GPA.</p>
      )}

      {/* Course evaluation */}
      <Card title="Course Evaluation" action={courses.length > 0 && !complete && summary ? <span className="text-xs text-gray-500">{summary.decided} of {summary.courses} evaluated</span> : null}>
        {processing ? (
          <div className="text-center py-8">
            <Spinner size="lg" className="text-brand mx-auto" />
            <p className="font-medium text-gray-800 mt-3">We're processing your documents</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Your transcript is being read and each course checked against BU's transfer equivalency records. This page refreshes on its own.</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="font-medium text-gray-800 mt-3">We received your documents</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Your courses will appear here once your transcript has been reviewed. If we need anything from you, we will email you.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {results.deadline?.deadline && (
              <p className={`text-xs flex items-start gap-1.5 ${results.deadline.status === 'passed' ? 'text-red-700' : results.deadline.status === 'approaching' ? 'text-amber-700' : 'text-gray-500'}`}>
                <CalendarClock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{results.deadline.explanation}
              </p>
            )}
            {Object.entries(byInstitution).map(([institution, list]) => (
              <div key={institution}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{institution}</p>
                <div className="-mx-5 sm:-mx-6 mt-2 border-y border-gray-100">
                <div className="hidden md:grid grid-cols-[minmax(0,2fr)_4.5rem_minmax(0,1.4fr)_8.5rem_5rem_1.25rem] gap-x-4 px-6 py-2 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <span>Previous course</span><span className="text-right">Credits</span><span>BU equivalent</span><span>Result</span><span className="text-right">BU units</span><span />
                </div>
                <ul className="divide-y divide-gray-100">
                  {list.map(c => <CourseRow key={c.id} c={c} token={token} onChanged={load} />)}
                </ul>
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-1">
              {(results.policy_notes || []).map((n, i) => <p key={i} className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{n}</p>)}
              <p className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Academic departments make the final decision on every course.</p>
            </div>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Application information */}
        <Card title="Credit Transfer Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {[
              ['Transfer Credit ID', <span className="font-mono">{app.reference_number}</span>],
              ['Submitted', fmt(app.submitted_at || app.created_at)],
              ['Student', app.student_name],
              ['Email', app.student_email],
              ['Previous institution', app.transfer_from_institution],
              ['Intended program', app.transfer_to_program],
              ['Start term', app.expected_start_term],
              ['Current status', <Badge tone={info.tone}>{info.label}</Badge>]
            ].map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-medium text-gray-500">{k}</dt><dd className="text-sm text-gray-900 mt-0.5 break-words">{v || '—'}</dd></div>
            ))}
          </dl>
          {app.applicant_comments && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500">Your additional information</p>
              <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{app.applicant_comments}</p>
            </div>
          )}
        </Card>

        {/* Documents */}
        <Card title={`Documents (${(app.documents || []).length})`}>
          <DocumentList documents={app.documents || []} token={token} />
          <p className="text-xs text-gray-500 mt-3">
            {transcriptsRead ? 'Your transcript has been processed.' : PROCESSING.includes(app.status) ? 'Your documents are being processed.' : 'Your documents have been received.'}
            {' '}A syllabus requested for a course is uploaded on that course above.
          </p>
          {!['credit_posted', 'closed'].includes(app.status) && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowUpload(!showUpload)} className="w-full mt-4"><Upload className="w-4 h-4" />Add a document</Button>
              {showUpload && (
                <form onSubmit={upload} className="mt-3 border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                  <Select label="Document type" options={DOC_TYPES} value={uploadType} onChange={e => setUploadType(e.target.value)} required placeholder="Select a type" />
                  <FileUpload label="" onFileSelect={setUploadFile} maxSizeMB={10} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={uploading}>Upload</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowUpload(false)}>Cancel</Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Updates */}
      {(notifications.length > 0 || (app.status_history || []).length > 0) && (
        <Card title="Updates">
          <ul className="space-y-3">
            {notifications.map(n => (
              <li key={n.id} className="flex gap-3">
                <Bell className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{n.title}</span>
                  <span className="block text-sm text-gray-600">{n.message}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{fmt(n.created_at, true)}</span>
                </span>
              </li>
            ))}
            {notifications.length === 0 && (app.status_history || []).slice().reverse().map((h, i) => (
              <li key={i} className="flex gap-3"><Circle className="w-3 h-3 text-gray-300 mt-1 flex-shrink-0" /><span className="text-sm text-gray-800">{h.label}<span className="text-xs text-gray-400 ml-2">{fmt(h.at, true)}</span></span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
