import React, { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Stamp, Copy, CalendarClock, ChevronDown, UserCog, FileSearch, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getOfficeApplication, postCredit, recordDeadlineException, resolveDuplicate, getEligibleEvaluators, assignReview } from '../../api/office'
import StatusPill from '../../components/staff/StatusPill'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { DECISION_LABELS, formatDate } from '../../lib/reviews'
import { activityLabel, timeAgo } from '../../lib/staffFormat'

// Course states as the office sees them (the API decides the state; this only names and colours it)
const STATE = {
  posted: { label: 'Posted', tone: 'ok' },
  decided: { label: 'Decided · ready to post', tone: 'info' },
  information_requested: { label: 'Waiting on student', tone: 'warn' },
  information_received: { label: 'Student answered', tone: 'info' },
  department_review: { label: 'Department review', tone: 'neutral' },
  waiting_for_review: { label: 'Queued for hand-off', tone: 'neutral' },
  credit_office_review: { label: 'Needs an evaluator', tone: 'warn' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'neutral' }
}
const VIA = { established_equivalency: 'Established equivalency', policy_rule: 'Transfer credit policy', evaluator: null }
const FIELD = 'w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function OfficeApplication() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [busy, setBusy] = useState(null)
  const [exception, setException] = useState('')
  const [assigning, setAssigning] = useState(null) // course being assigned

  const load = useCallback(async () => {
    try {
      const res = await getOfficeApplication(id)
      setState({ loading: false, data: res.data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const run = async (key, fn, ok) => {
    setBusy(key)
    try {
      const res = await fn()
      toast.success(typeof ok === 'function' ? ok(res) : ok)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'That did not work')
    } finally {
      setBusy(null)
    }
  }

  if (state.loading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) return <div className="max-w-3xl mx-auto space-y-4"><BackLink /><div className="staff-card"><EmptyState title="Application unavailable" description={state.error} /></div></div>

  const d = state.data
  const app = d.application
  const s = d.summary
  const toPost = d.courses.filter(c => c.state === 'decided').length
  const canPost = d.blockers.length === 0
  const byInstitution = d.courses.reduce((acc, c) => { (acc[c.institution] = acc[c.institution] || []).push(c); return acc }, {})

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackLink />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-staff-muted">
            <span className="font-mono">{app.reference_number}</span><StatusPill status={app.status} />
          </p>
          <h1 className="text-[30px] leading-tight text-staff-ink mt-1">{app.student_name}</h1>
          <p className="text-[15px] text-staff-ink2 mt-1">
            {app.transfer_to_program} · starts {app.expected_start_term || 'term not given'} · {d.institutions.length > 1 ? `${d.institutions.length} institutions` : d.institutions[0] || app.transfer_from_institution}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/evaluator/applications/${app.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-staff-line text-[14px] font-medium text-staff-ink2 hover:bg-staff-sunk">
            <FileSearch className="w-4 h-4" />Evaluation report
          </Link>
          <Button
            onClick={() => run('post', () => postCredit(app.id), r => `${r.data.posted} course${r.data.posted === 1 ? '' : 's'} posted (${r.data.units} BU credits)`)}
            loading={busy === 'post'}
            disabled={!canPost || !toPost}
            title={d.blockers.map(b => b.message).join(' ') || undefined}
          >
            <Stamp className="w-4 h-4" />Post {toPost || ''} decided course{toPost === 1 ? '' : 's'}
          </Button>
        </div>
      </header>

      {/* Duplicate */}
      {d.duplicate?.status === 'suspected' && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/70 px-5 py-4">
          <p className="flex items-center gap-2 font-semibold text-staff-ink"><Copy className="w-4 h-4 text-amber-700" />Potential duplicate application</p>
          <p className="text-[14px] text-staff-ink2 mt-1">{d.duplicate.reason}</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-[13.5px]">
            <Compare title="This application" rows={[[app.reference_number, app.transfer_from_institution], ['Start term', app.expected_start_term], ['Courses', d.courses.length]]} />
            <Compare title="Earlier application" to={`/office/applications/${d.duplicate.other.id}`} rows={[[d.duplicate.other.reference_number, d.duplicate.other.transfer_from_institution], ['Start term', d.duplicate.other.expected_start_term], ['Courses', d.duplicate.other.courses]]} />
          </div>
          <p className="text-[13px] text-staff-ink2 mt-2">
            {d.duplicate.shared_courses.length ? `Courses on both: ${d.duplicate.shared_courses.map(c => c.course_code).join(', ')}.` : 'No course appears on both applications.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="secondary" loading={busy === 'keep'} onClick={() => run('keep', () => resolveDuplicate(app.id, 'keep_separate', 'Separate transcript'), 'Kept as a separate application')}>Keep separate</Button>
            <Button size="sm" variant="danger" loading={busy === 'close'} onClick={() => run('close', () => resolveDuplicate(app.id, 'close_duplicate', 'Duplicate of an earlier application'), 'Closed as a duplicate')}>Close as duplicate</Button>
          </div>
        </section>
      )}

      {/* Deadline */}
      {['passed', 'approaching', 'unknown'].includes(d.deadline.status) && (
        <section className={`rounded-xl border px-5 py-4 ${d.deadline.status === 'passed' && !d.deadline.exception ? 'border-red-200 bg-red-50/70' : 'border-staff-line bg-white'}`}>
          <p className="flex items-center gap-2 font-semibold text-staff-ink">
            <CalendarClock className="w-4 h-4" />
            {d.deadline.status === 'passed' ? 'One-year transfer deadline has passed' : d.deadline.status === 'approaching' ? `Transfer deadline in ${d.deadline.days_left} days` : 'Transfer deadline unknown'}
          </p>
          <p className="text-[14px] text-staff-ink2 mt-1">{d.deadline.explanation}</p>
          {d.deadline.exception ? (
            <p className="text-[13px] text-staff-ink2 mt-2"><CheckCircle2 className="inline w-4 h-4 text-emerald-600 mr-1" />Exception recorded{app.deadline_exception_by ? ` by ${app.deadline_exception_by}` : ''}: {d.deadline.exception}</p>
          ) : d.deadline.status === 'passed' && (
            <div className="flex flex-wrap gap-2 mt-3">
              <input value={exception} onChange={e => setException(e.target.value)} className={`${FIELD} flex-1 min-w-[16rem]`} placeholder="Reason for the exception, e.g. transcript delayed by the sending college" />
              <Button size="sm" variant="secondary" disabled={exception.trim().length < 5} loading={busy === 'exc'} onClick={() => run('exc', () => recordDeadlineException(app.id, exception.trim()), 'Exception recorded')}>Record exception</Button>
            </div>
          )}
        </section>
      )}

      {d.blockers.filter(b => !['deadline', 'duplicate', 'nothing'].includes(b.type)).map(b => (
        <p key={b.type} className="flex items-center gap-2 text-[14px] text-amber-900"><AlertTriangle className="w-4 h-4" />{b.message}</p>
      ))}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Courses" value={s.courses} />
        <Tile label="Decided" value={s.decided} />
        <Tile label="Pending" value={s.pending} detail={s.needs_student_action ? `${s.needs_student_action} waiting on the student` : null} />
        <Tile label="Posted" value={s.posted} />
        <Tile label="Credits posted" value={s.credits_posted} detail={s.credits_approved ? `${s.credits_approved} credits decided, not yet posted` : null} />
      </div>

      {/* Courses */}
      <section className="staff-card">
        <h2 className="px-6 pt-5 pb-3 text-[17px] font-semibold text-staff-ink">Courses</h2>
        {Object.entries(byInstitution).map(([institution, list]) => (
          <div key={institution} className="border-t border-staff-line2">
            <p className="px-6 pt-3 pb-1 staff-eyebrow">{institution}</p>
            <ul className="divide-y divide-staff-line2">
              {list.map(c => <CourseRow key={c.id} c={c} onAssign={() => setAssigning(c)} />)}
            </ul>
          </div>
        ))}
        <p className="px-6 py-3 border-t border-staff-line2 text-[12.5px] text-staff-muted">
          Posted courses carry a grade of {d.policy.transfer_grade}, do not count toward the BU GPA and earn no BU Hub units. Pending courses show 0 units to the student.
        </p>
      </section>

      <section className="staff-card divide-y divide-staff-line2">
        <Fold title={`Requests to the student (${d.information_requests.length})`}>
          {d.information_requests.length === 0 ? <p className="text-[14px] text-staff-muted">None.</p> : (
            <ul className="space-y-2 text-[14px]">
              {d.information_requests.map(q => (
                <li key={q.id}>
                  <span className="text-staff-ink">{q.kind === 'syllabus' ? 'Syllabus' : 'Information'}{q.course_code ? ` for ${q.course_code}` : ''}</span>
                  <span className="text-staff-muted"> · {q.requested_by} · {formatDate(q.created_at)} · {q.status === 'pending' ? 'waiting' : q.status === 'responded' ? `answered ${formatDate(q.responded_at)}` : 'closed'}</span>
                  {q.student_response && <span className="block text-[13px] text-staff-ink2">Reply: {q.student_response}</span>}
                </li>
              ))}
            </ul>
          )}
        </Fold>
        <Fold title={`Documents (${d.documents.length})`}>
          <ul className="space-y-1 text-[14px]">
            {d.documents.map(doc => (
              <li key={doc.id}><span className="text-staff-ink">{doc.file_name}</span><span className="text-staff-muted"> · {doc.document_type}{doc.for_course ? ` for ${doc.for_course}` : ''} · {formatDate(doc.created_at)}</span></li>
            ))}
            {!d.documents.length && <li className="text-staff-muted">No documents.</li>}
          </ul>
        </Fold>
        <Fold title="History">
          <ul className="space-y-2 text-[14px]">
            {d.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3"><span className="text-staff-ink">{activityLabel(h.action)}<span className="text-staff-muted"> · {h.actor}</span></span><span className="text-staff-muted whitespace-nowrap">{timeAgo(h.created_at)}</span></li>
            ))}
          </ul>
        </Fold>
      </section>

      <AssignDialog course={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); load() }} />
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/office" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-staff-ink2 hover:text-staff-ink">
      <ArrowLeft className="w-4 h-4" />Credit Evaluation Office
    </Link>
  )
}

function Tile({ label, value, detail }) {
  return (
    <div className="bg-white rounded-xl border border-staff-line px-4 py-3.5">
      <p className="text-[13px] text-staff-ink2">{label}</p>
      <p className="text-[26px] font-semibold text-staff-ink tabular-nums leading-tight mt-1">{value}</p>
      {detail && <p className="text-[12px] text-staff-muted mt-0.5">{detail}</p>}
    </div>
  )
}

function Compare({ title, rows, to }) {
  return (
    <div className="rounded-lg bg-white border border-amber-200 px-3 py-2">
      <p className="text-[12px] font-medium text-staff-muted">{title}{to && <Link to={to} className="ml-2 text-primary-700 font-semibold">Open</Link>}</p>
      {rows.map(([k, v]) => <p key={k} className="text-staff-ink"><span className="text-staff-muted">{k}:</span> {v ?? '—'}</p>)}
    </div>
  )
}

function Fold({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-staff-bg">
        <span className="text-[15px] font-semibold text-staff-ink">{title}</span>
        <ChevronDown className={`w-5 h-5 text-staff-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-6 pb-5">{children}</div>}
    </div>
  )
}

function CourseRow({ c, onAssign }) {
  const [open, setOpen] = useState(false)
  const st = STATE[c.state] || STATE.processing
  const who = VIA[c.decided_via] || (c.decided_by ? c.decided_by : c.evaluator_name || (c.queue === 'credit_office' ? 'Credit Evaluation Office' : null))
  const reviewOpen = ['new', 'in_progress', 'info_requested', 'queued'].includes(c.review_status)
  return (
    <li>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_10rem_auto] gap-x-4 gap-y-1 items-center px-6 py-3.5">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 text-left">
          <span className="block text-[14.5px] text-staff-ink"><span className="font-mono font-medium">{c.course_code}</span> {c.title}</span>
          <span className="block text-[12.5px] text-staff-muted">
            {[c.term, c.source_credits != null ? `${c.source_credits} ${c.credit_system === 'Quarter' ? 'qtr ' : ''}cr` : 'credits missing', c.grade ? `grade ${c.grade}` : 'no grade'].join(' · ')}
          </span>
        </button>
        <span className="min-w-0 order-3 md:order-none col-span-2 md:col-span-1">
          <span className="block text-[14px] text-staff-ink truncate">{c.decision || (c.target_bu_course ? `Proposed ${c.target_bu_course}` : '—')}</span>
          <span className="block text-[12.5px] text-staff-muted truncate">{[who, c.units_status !== 'pending' ? `${c.units} units${c.transfer_grade ? ` · ${c.transfer_grade}` : ''}` : '0 units while pending'].filter(Boolean).join(' · ')}</span>
        </span>
        <span><StatusPill tone={st.tone}>{st.label}</StatusPill></span>
        <span className="text-right">
          {reviewOpen && c.review_id && <Button size="sm" variant="secondary" onClick={onAssign}><UserCog className="w-3.5 h-3.5" />{c.evaluator_name ? 'Reassign' : 'Assign'}</Button>}
        </span>
      </div>
      {open && (
        <div className="px-6 pb-4 -mt-1 text-[13.5px] text-staff-ink2 space-y-1">
          {c.decision_type && <p><span className="text-staff-muted">Decision:</span> {DECISION_LABELS[c.decision_type] || c.decision_type}{c.decided_at ? ` · ${formatDate(c.decided_at)}` : ''}</p>}
          {c.decision_reason && <p><span className="text-staff-muted">Reason:</span> {c.decision_reason}</p>}
          {c.repeat_of_course && <p><span className="text-staff-muted">Repeat:</span> credit counted once, for the other {c.repeat_of_course} attempt.</p>}
          {c.catalog_code && <p><span className="text-staff-muted">Read as:</span> {c.catalog_code}</p>}
          {c.missing_information?.length > 0 && <p className="text-amber-800">Missing on the transcript: {c.missing_information.join(', ')}</p>}
          {c.combined_with?.length > 0 && <p><span className="text-staff-muted">Evaluated with:</span> {c.combined_with.join(', ')}</p>}
          {c.assignment_reason && <p><span className="text-staff-muted">Assignment:</span> {c.assignment_reason}</p>}
          {c.syllabus_received_at && <p><span className="text-staff-muted">Syllabus received:</span> {formatDate(c.syllabus_received_at)}</p>}
        </div>
      )}
    </li>
  )
}

// Choose an evaluator for an open course: best match first, or the best automatically, or back to the office queue
function AssignDialog({ course, onClose, onDone }) {
  const [state, setState] = useState({ loading: false, data: null })
  const [pick, setPick] = useState('auto')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!course) return
    setPick('auto')
    setState({ loading: true, data: null })
    getEligibleEvaluators(course.review_id)
      .then(res => setState({ loading: false, data: res.data }))
      .catch(() => setState({ loading: false, data: { evaluators: [] } }))
  }, [course])

  const save = async () => {
    setSaving(true)
    try {
      const res = await assignReview(course.review_id, pick === 'office' ? null : pick)
      toast.success(res.data.evaluator ? `Assigned to ${res.data.evaluator}` : 'Moved to the Credit Evaluation Office queue')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'The course could not be assigned')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!course} onClose={() => !saving && onClose()} title={course ? `Assign ${course.course_code}` : ''} size="md">
      {state.loading || !state.data ? <div className="py-8 flex justify-center"><Spinner /></div> : (
        <div className="space-y-3">
          <p className="text-[13px] text-staff-muted">{state.data.course}{state.data.target ? ` · proposed ${state.data.target}` : ''}</p>
          <ul className="max-h-72 overflow-y-auto space-y-1.5">
            {[{ id: 'auto', full_name: 'Best eligible evaluator', reason: 'Chosen by expertise, availability and workload' },
              ...state.data.evaluators,
              { id: 'office', full_name: 'Credit Evaluation Office queue', reason: 'Hold the course for manual placement' }].map(e => (
              <li key={e.id}>
                <label className={`flex gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${pick === e.id ? 'border-primary-500 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'}`}>
                  <input type="radio" name="evaluator" className="mt-1" checked={pick === e.id} onChange={() => setPick(e.id)} disabled={e.id === course?.evaluator_id} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-staff-ink">{e.full_name}{e.department ? <span className="text-staff-muted font-normal"> · {e.department}</span> : null}</span>
                    <span className="block text-[12.5px] text-staff-muted">{e.reason}{e.open_reviews != null ? ` · ${e.open_reviews} open of ${e.capacity}` : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving}>Assign</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
