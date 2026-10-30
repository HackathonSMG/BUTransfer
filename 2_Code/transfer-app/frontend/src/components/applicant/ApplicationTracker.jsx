import React, { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Circle, AlertCircle, Upload, Send, RefreshCw, CalendarClock, Info, ChevronDown, FileText, Copy, Check,
  Hourglass, XCircle, ArrowRight, ArrowDown, Lock
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
// The status pill and its dot on the red header
const PILL = {
  done: ['bg-green-50 text-green-900', 'bg-green-600'],
  action: ['bg-amber-50 text-amber-900', 'bg-amber-500'],
  progress: ['bg-white text-gray-900', 'bg-blue-600'],
  waiting: ['bg-white text-gray-900', 'bg-gray-400']
}
const PROCESSING = ['submitted', 'under_evaluation', 'evaluation_completed']
const DOC_TYPES = [
  { value: 'transcript', label: 'Academic transcript' },
  { value: 'syllabus', label: 'Course syllabus' },
  { value: 'supporting', label: 'Supporting document' }
]

const fmt = (d, time = false) => d ? new Intl.DateTimeFormat('en-US', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(d)) : '—'
const errMessage = (err, fallback) => err.response?.data?.message || err.response?.data?.error?.message || fallback
const units = (n) => Math.round((Number(n) || 0) * 100) / 100

function Badge({ tone, children, className = '' }) {
  return <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${TONE[tone] || TONE.waiting} ${className}`}>{children}</span>
}

function Card({ title, action, children, className = '', bodyClassName = 'px-5 sm:px-6 py-5' }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200 shadow-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

// Progress stages on the red header
function Progress({ stages }) {
  const muted = (s) => ['upcoming', 'skipped'].includes(s.state)
  return (
    <>
      {/* Desktop: horizontal */}
      <ol className="hidden md:flex items-start mt-8">
        {stages.map((s, i) => (
          <li key={s.key} className="flex-1 flex flex-col items-center relative text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className={`absolute top-[17px] right-1/2 w-full h-[3px] ${s.state === 'upcoming' || (s.state === 'skipped' && stages[i + 1]?.state === 'upcoming') ? 'bg-white/30' : 'bg-white'}`} aria-hidden="true" />}
            <StageDot state={s.state} n={i + 1} />
            <span className={`mt-2.5 text-[13px] leading-tight px-1 ${muted(s) ? 'text-white/70 font-medium' : 'text-white font-semibold'}`}>{s.label}</span>
            <span className={`text-xs mt-0.5 h-4 ${s.state === 'current' ? 'text-white font-semibold' : 'text-white/75'}`}>{stageNote(s)}</span>
          </li>
        ))}
      </ol>
      {/* Mobile: vertical */}
      <ol className="md:hidden mt-6">
        {stages.map((s, i) => (
          <li key={s.key} className="flex gap-3" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="flex flex-col items-center">
              <StageDot state={s.state} n={i + 1} />
              {i < stages.length - 1 && <span className={`w-[3px] flex-1 min-h-[16px] ${stages[i + 1].state === 'upcoming' ? 'bg-white/30' : 'bg-white'}`} />}
            </span>
            <span className="pb-3.5 pt-1.5">
              <span className={`block text-sm ${muted(s) ? 'text-white/70 font-medium' : 'text-white font-semibold'}`}>{s.label}</span>
              <span className="block text-xs text-white/75">{stageNote(s)}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}

const stageNote = (s) => (s.state === 'current' ? 'In progress' : s.state === 'skipped' ? (s.note || 'Not needed') : s.at ? fmt(s.at) : '')

function StageDot({ state, n }) {
  const base = 'relative z-10 w-9 h-9 rounded-full grid place-items-center text-sm flex-shrink-0'
  if (state === 'skipped') return <span className={`${base} border-2 border-dashed border-white/60 text-white/80 font-semibold`}>—</span>
  if (state === 'done') return <span className={`${base} bg-white text-brand`}><Check className="w-4 h-4" strokeWidth={3} /></span>
  if (state === 'current') return <span className={`${base} bg-brand border-[3px] border-white text-white font-bold ring-[6px] ring-white/25`}>{n}</span>
  return <span className={`${base} border-2 border-white/50 text-white/80 font-semibold`}>{n}</span>
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

function ResultIcon({ c }) {
  const base = 'w-9 h-9 rounded-full grid place-items-center flex-shrink-0'
  if (c.outcome === 'no_credit') return <span className={`${base} bg-gray-100 text-gray-500`}><XCircle className="w-[18px] h-[18px]" /></span>
  if (c.outcome) return <span className={`${base} bg-green-50 text-green-700`}><Check className="w-[18px] h-[18px]" strokeWidth={3} /></span>
  if (c.status === 'information_requested') return <span className={`${base} bg-amber-100 text-amber-700`}><AlertCircle className="w-[18px] h-[18px]" /></span>
  return <span className={`${base} bg-blue-50 text-blue-700`}><Hourglass className="w-4 h-4" /></span>
}

function CourseRow({ c, token, onChanged }) {
  const [open, setOpen] = useState(c.status === 'information_requested')
  const result = resultOf(c)
  const action = c.status === 'information_requested'
  const credits = c.source_credits != null
    ? `${c.source_credits}${c.credit_system === 'Quarter' ? ' qtr' : ''}`
    : '—'
  const awarded = c.outcome ? c.units : 0
  const target = c.outcome === 'transfer' ? <span className="font-semibold text-gray-900">{c.bu_course}</span>
    : c.outcome === 'elective' ? <span className="font-semibold text-gray-900">{c.result_label}</span>
      : c.outcome === 'no_credit' ? <span className="text-gray-500">No BU credit</span>
        : action ? <span className="font-semibold text-amber-900">{c.information_request?.kind === 'syllabus' ? 'Syllabus needed' : 'Information needed'}</span>
          : <span className="font-medium text-gray-600">Being reviewed</span>
  return (
    <li id={`course-${c.id}`} className={`scroll-mt-24 ${action ? 'bg-amber-50/60 border-l-4 border-amber-400' : 'border-l-4 border-transparent'}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full text-left pl-4 pr-5 sm:pl-5 sm:pr-6 py-4 grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1.6fr)_1.25rem_minmax(0,1.2fr)_4.5rem_1rem] gap-x-4 gap-y-2 items-center hover:bg-gray-50/70 transition-colors">
        <ResultIcon c={c} />
        <span className="min-w-0">
          <span className="block text-[15px] text-gray-900"><span className="font-mono font-semibold">{c.course_code}</span> <span className="text-gray-700">{c.title}</span></span>
          <span className="block text-xs text-gray-500 mt-0.5">{[c.term, c.grade && `Grade ${c.grade}`, c.source_credits != null && `${credits} credits`].filter(Boolean).join(' · ')}</span>
        </span>
        <ArrowRight className="hidden md:block w-4 h-4 text-gray-300" aria-hidden="true" />
        <span className="col-start-2 col-span-2 md:col-start-auto md:col-span-1 min-w-0 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          {target}
          <Badge tone={result.tone}>{result.label}</Badge>
        </span>
        <span className="row-start-1 col-start-3 md:row-auto md:col-start-auto text-right leading-tight">
          <span className={`block font-display text-2xl font-bold tabular-nums ${c.outcome ? 'text-gray-900' : 'text-gray-300'}`}>{awarded}</span>
          <span className="block text-[11px] text-gray-500">{c.outcome ? 'BU units' : 'until decided'}</span>
        </span>
        <ChevronDown className={`hidden md:block w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pl-4 pr-5 sm:pl-[4.75rem] sm:pr-6 pb-5 -mt-1 space-y-2">
          <p className="text-xs font-medium text-gray-500">{c.status_label}</p>
          <p className="text-sm text-gray-700">{c.explanation}</p>
          {c.transfer_grade && <p className="text-xs text-gray-500">Posted with a grade of {c.transfer_grade}; not counted in the BU GPA; no BU Hub units.</p>}
          {c.information_request && (
            <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
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
    { label: 'Credits Accepted', value: summary.credits_accepted, hint: 'BU units from accepted courses', swatch: 'bg-green-300' },
    { label: 'Credits Awarded', value: summary.credits_posted, hint: 'Posted to your record, grade T', swatch: 'bg-green-700' },
    { label: 'Credits Pending', value: summary.credits_pending, hint: summary.pending_without_credits ? `+ ${summary.pending_without_credits} course${summary.pending_without_credits === 1 ? '' : 's'} awaiting credit details` : 'Under evaluation; 0 units until decided', swatch: 'bg-blue-200' }
  ]
  const counts = [
    ['Courses Evaluated', `${summary.decided} of ${summary.courses}`],
    ['With Department Review', summary.courses_in_department_review],
    ['Waiting for Your Syllabus', summary.courses_awaiting_syllabus],
    ['Courses Pending', summary.pending]
  ]
  const outcomes = `${summary.courses_accepted} accepted (${summary.courses_equivalent} equivalent, ${summary.courses_elective} elective) · ${summary.courses_not_accepted} not accepted`
  // How much of the credit is secured: posted, accepted but not yet posted, and still pending (BU units)
  const posted = units(summary.credits_posted)
  const accepted = Math.max(units(summary.credits_accepted), posted)
  const pending = units(summary.credits_pending)
  const total = units(accepted + pending)
  const pct = (n) => `${total ? (100 * n) / total : 0}%`
  return (
    <section className={`rounded-2xl border shadow-card ${complete ? 'border-green-200 bg-gradient-to-b from-green-50 to-white' : 'border-gray-200 bg-white'}`} aria-labelledby="credit-summary">
      <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
        <h2 id="credit-summary" className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {complete && <CheckCircle2 className="w-5 h-5 text-green-600" />}Transfer Credit Summary
        </h2>
        {complete ? <span className="text-xs font-medium text-green-800">Evaluation complete</span>
          : <span className="text-xs text-gray-500">{summary.courses} course{summary.courses === 1 ? '' : 's'}</span>}
      </div>
      <div className="px-5 sm:px-6 pt-5 pb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {tiles.map(t => (
            <div key={t.label}>
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm ${t.swatch}`} aria-hidden="true" />{t.label}</p>
              <p className="font-display text-[34px] font-bold text-gray-900 tabular-nums leading-tight mt-1">{t.value}<span className="font-sans text-sm font-medium text-gray-500 ml-1.5">BU units</span></p>
              <p className="text-[12px] text-gray-500">{t.hint}</p>
            </div>
          ))}
        </div>
        {total > 0 && (
          <>
            <div className="flex h-3.5 rounded-full overflow-hidden bg-gray-100 mt-5" role="img" aria-label={`${accepted} of up to ${total} BU units accepted`}>
              <span className="bg-green-700" style={{ width: pct(posted) }} />
              <span className="bg-green-300" style={{ width: pct(accepted - posted) }} />
              <span style={{ width: pct(pending), backgroundImage: 'repeating-linear-gradient(45deg, #c7d7f2 0 6px, #e2eaf8 6px 12px)' }} />
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
              <span>{accepted} of up to {total} BU units accepted{summary.pending_without_credits ? `, + ${summary.pending_without_credits} course${summary.pending_without_credits === 1 ? '' : 's'} awaiting credit details` : ''}</span>
              <span>Transfer grades don&rsquo;t count toward your BU GPA</span>
            </div>
          </>
        )}
        <dl className="flex flex-wrap gap-2 mt-5">
          {counts.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5 flex items-baseline gap-2">
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-sm font-semibold text-gray-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-gray-600 mt-3">Decided so far: {outcomes}</p>
      </div>
    </section>
  )
}

// What the student needs to know or do next, at the top of the page
function NextStep({ info, summary, complete, needsAction, generalRequests, showSummary }) {
  const action = needsAction.length > 0 || generalRequests.length > 0
  const first = needsAction[0]
  const title = complete ? 'Your transfer credit evaluation is complete'
    : needsAction.length === 1 ? `We need one thing from you: ${first.information_request?.kind === 'syllabus' ? 'the syllabus' : 'more information'} for ${first.course_code}`
      : needsAction.length > 1 ? `${needsAction.length} courses need something from you`
        : generalRequests.length > 0 ? 'We need some information from you'
          : info.label
  // The same next-step wording the summary has always given, from the course summary
  const next = !showSummary || !summary ? null
    : complete ? 'Your evaluation is complete. No further action is needed.'
      : summary.needs_student_action ? `Action needed: upload the ${summary.courses_awaiting_syllabus ? 'syllabus' : 'information'} requested on the course${summary.needs_student_action === 1 ? '' : 's'} marked "Action Needed" below.`
        : 'Nothing is needed from you right now. We will email you when your courses are decided.'
  const accent = action ? 'border-amber-400' : complete ? 'border-green-500' : 'border-brand'
  const Icon = action ? AlertCircle : complete ? CheckCircle2 : Info
  const iconTone = action ? 'bg-amber-50 text-amber-700' : complete ? 'bg-green-50 text-green-700' : 'bg-red-50 text-brand'
  const goTo = () => {
    const el = first ? document.getElementById(`course-${first.id}`) : document.getElementById('information-requests')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <section className={`relative z-10 -mt-12 mx-2 sm:mx-6 bg-white rounded-2xl shadow-raised border-l-[6px] ${accent} px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5`}>
      <span className={`hidden sm:grid w-12 h-12 rounded-xl place-items-center flex-shrink-0 ${iconTone}`}><Icon className="w-6 h-6" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-700 mt-1">{info.description}</p>
        {next && <p className={`text-sm mt-1 ${action ? 'text-amber-900' : 'text-gray-600'}`}>{next}</p>}
        {needsAction.length > 0 && <p className="text-xs text-gray-500 mt-1">Courses waiting on information show 0 BU units until they are reviewed.</p>}
      </div>
      {action && (
        <Button size="sm" onClick={goTo} className="flex-shrink-0 self-start sm:self-center">
          {first?.information_request?.kind === 'syllabus' ? 'Upload syllabus' : 'Respond'}<ArrowDown className="w-4 h-4" />
        </Button>
      )}
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
  const showSummary = courses.length > 0 && !processing
  const [pillTone, dotTone] = PILL[info.tone] || PILL.waiting

  const copy = async () => { try { await navigator.clipboard.writeText(app.reference_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* blocked */ } }

  return (
    <div className="space-y-6">
      <div>
        {/* Header: Transfer Credit ID, status and progress on BU red */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-dark via-brand to-[#d92b2b] text-white px-5 sm:px-8 pt-7 pb-20">
          <span className="pointer-events-none absolute -right-28 -top-36 w-[28rem] h-[28rem] rounded-full bg-white/[0.06]" aria-hidden="true" />
          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Transfer Credit Status</p>
              <div className="flex items-center gap-2 mt-1.5">
                <h1 className="font-mono text-[28px] sm:text-[32px] font-bold tracking-wide">{app.reference_number}</h1>
                <button type="button" onClick={copy} className="p-1.5 rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20" aria-label="Copy Transfer Credit ID">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-sm sm:text-[15px] text-white/90 mt-1">
                <span className="font-semibold text-white">{app.student_name}</span>
                {[app.transfer_to_program && [app.transfer_to_program, app.expected_start_term].filter(Boolean).join(', '), `Submitted ${fmt(app.submitted_at || app.created_at)}`].filter(Boolean).map(t => <span key={t}> · {t}</span>)}
              </p>
            </div>
            <div className="flex sm:flex-col items-center sm:items-end gap-3 flex-shrink-0">
              <span className={`inline-flex items-center gap-2 text-sm font-bold px-4 py-1.5 rounded-full ${pillTone}`}><span className={`w-2 h-2 rounded-full ${dotTone}`} aria-hidden="true" />{info.label}</span>
              <div className="flex items-center gap-3 text-white/85 [&_button]:text-white/85 [&_button:hover]:text-white">
                <button type="button" onClick={load} className="inline-flex items-center gap-1 text-xs"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
                {headerAction}
              </div>
            </div>
          </div>
          {app.progress?.stages && <div className="relative"><Progress stages={app.progress.stages} /></div>}
        </section>

        <NextStep info={info} summary={summary} complete={complete} needsAction={needsAction} generalRequests={generalRequests} showSummary={showSummary} />
      </div>

      {/* Requests that are not about one course */}
      {generalRequests.length > 0 && (
        <section id="information-requests" className="scroll-mt-24 rounded-2xl border border-amber-300 bg-amber-50 px-5 sm:px-6 py-4">
          <p className="font-semibold text-amber-900 flex items-center gap-2"><AlertCircle className="w-5 h-5" />Action required</p>
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

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* Transfer Credit Summary */}
          {showSummary && <CreditSummary summary={summary} complete={complete} />}
          {complete && (
            <p className="text-xs text-gray-500 -mt-3 px-1">Credit was posted{app.decision_date ? ` on ${fmt(app.decision_date)}` : ''} with a grade of T. Transfer grades do not count toward your BU GPA.</p>
          )}

          {/* Course evaluation */}
          <Card title="Course Evaluation" bodyClassName={processing || courses.length === 0 ? 'px-5 sm:px-6 py-5' : 'py-1'}
            action={courses.length > 0 && !complete && summary ? <span className="text-xs text-gray-500">{summary.decided} of {summary.courses} evaluated</span> : null}>
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
              <div>
                {results.deadline?.deadline && (
                  <p className={`px-5 sm:px-6 pt-4 text-xs flex items-start gap-1.5 ${results.deadline.status === 'passed' ? 'text-red-700' : results.deadline.status === 'approaching' ? 'text-amber-700' : 'text-gray-500'}`}>
                    <CalendarClock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{results.deadline.explanation}
                  </p>
                )}
                {Object.entries(byInstitution).map(([institution, list]) => (
                  <div key={institution} className="mt-4">
                    <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-2.5 bg-stone-50 border-y border-gray-100">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-600">{institution}</p>
                      {list.some(c => c.credit_system === 'Quarter')
                        ? <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800">Quarter system · credits × 2/3</span>
                        : list.some(c => c.credit_system) && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Semester</span>}
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {list.map(c => <CourseRow key={c.id} c={c} token={token} onChanged={load} />)}
                    </ul>
                  </div>
                ))}
                <div className="mx-5 sm:mx-6 my-5 rounded-xl bg-gray-50 px-4 py-3 space-y-1">
                  {(results.policy_notes || []).map((n, i) => <p key={i} className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{n}</p>)}
                  <p className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Academic departments make the final decision on every course.</p>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          {/* Updates */}
          {(notifications.length > 0 || (app.status_history || []).length > 0) && (
            <Card title="Updates">
              <ul className="relative pl-6 space-y-4 before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-gray-200">
                {notifications.map((n, i) => (
                  <li key={n.id} className="relative">
                    <span className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 ${i === 0 ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`} aria-hidden="true" />
                    <span className="block text-sm font-medium text-gray-900">{n.title}</span>
                    <span className="block text-sm text-gray-600">{n.message}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{fmt(n.created_at, true)}</span>
                  </li>
                ))}
                {notifications.length === 0 && (app.status_history || []).slice().reverse().map((h, i) => (
                  <li key={i} className="relative">
                    <Circle className="absolute -left-6 top-1 w-4 h-4 text-gray-300 fill-white" aria-hidden="true" />
                    <span className="block text-sm text-gray-800">{h.label}</span>
                    <span className="block text-xs text-gray-400">{fmt(h.at, true)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Documents */}
          <Card title={`Documents (${(app.documents || []).length})`}>
            <DocumentList documents={app.documents || []} token={token} />
            <p className="text-xs text-gray-500 mt-3">
              {transcriptsRead ? 'Your transcript has been processed.' : PROCESSING.includes(app.status) ? 'Your documents are being processed.' : 'Your documents have been received.'}
              {' '}A syllabus requested for a course is uploaded on that course.
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

          {/* Application information */}
          <Card title="Credit Transfer Details">
            <dl className="divide-y divide-dashed divide-gray-200">
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
                <div key={k} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-sm text-gray-500 flex-shrink-0">{k}</dt>
                  <dd className="text-sm font-medium text-gray-900 text-right min-w-0 break-words">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {app.applicant_comments && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500">Your additional information</p>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{app.applicant_comments}</p>
              </div>
            )}
          </Card>

          <p className="flex items-start gap-2.5 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-xs text-gray-600">
            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />Only you can open this page. It needs your Transfer Credit ID and email every time.
          </p>
        </div>
      </div>
    </div>
  )
}
