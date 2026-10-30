import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Stamp, Copy, CalendarClock, UserCog, FileSearch, AlertTriangle, CheckCircle2, CircleDashed, XCircle, Undo2, Info,
  Check, BadgeCheck, Hourglass, BookOpen, Workflow, Flag, GraduationCap, CalendarDays, Landmark, Clock
} from 'lucide-react'
import notify from '../../lib/notify'
import { getOfficeApplication, postCredit, recordDeadlineException, resolveDuplicate, returnToEvaluator } from '../../api/office'
import StatusPill from '../../components/staff/StatusPill'
import { TONES } from '../../components/staff/Metric'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { DECISION_LABELS, formatDate, initials, avatarTint } from '../../lib/reviews'
import { activityLabel, timeAgo, correctionsOf, pendingFor } from '../../lib/staffFormat'
import ReviewAssignment from '../../components/staff/ReviewAssignment'
import ImpactPanel from '../../components/staff/ImpactPanel'
import AssignDialog from '../../components/staff/AssignDialog'
import PreparationTrace from '../../components/staff/PreparationTrace'

// Delivery state of an applicant email (notifications.email_status)
const EMAIL_STATUS = { pending: 'queued', sending: 'sending', retry: 'will retry', sent: 'sent', logged: 'logged (email not configured)', failed: 'failed', suppressed: 'not sent (test address)' }

// Course states as the office sees them (the API decides the state; this only names and colours it)
const STATE = {
  posted: { label: 'Posted', tone: 'ok' },
  decided: { label: 'Awaiting final review', tone: 'info' },
  information_requested: { label: 'Waiting for student', tone: 'warn' },
  information_received: { label: 'Student answered', tone: 'info' },
  department_review: { label: 'Department review', tone: 'neutral' },
  waiting_for_review: { label: 'Queued for hand-off', tone: 'neutral' },
  credit_office_review: { label: 'Needs an evaluator', tone: 'warn' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'neutral' }
}
const VIA = { established_equivalency: 'Established equivalency', policy_rule: 'Transfer credit policy', evaluator: null }
const FIELD = 'w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

// Course filter groups, from each course's state (client-side, over the courses already loaded)
const courseGroup = c => (c.state === 'decided' ? 'decided' : c.state === 'posted' ? 'posted' : c.state === 'withdrawn' ? 'withdrawn' : 'pending')
const COURSE_GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'decided', label: 'Awaiting final review' },
  { key: 'pending', label: 'Pending' },
  { key: 'posted', label: 'Posted' }
]

export default function OfficeApplication() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [busy, setBusy] = useState(null)
  const [exception, setException] = useState('')
  const [assigning, setAssigning] = useState(null) // course being assigned
  const [returning, setReturning] = useState(null) // course whose decision goes back to the evaluator
  const [filter, setFilter] = useState('all') // course list filter
  const [tab, setTab] = useState('transcript') // lower section shown
  const [showSteps, setShowSteps] = useState(false) // full preparation trace
  const tabsRef = useRef(null)

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
      notify.success(typeof ok === 'function' ? ok(res) : ok)
      await load()
    } catch (err) {
      notify.error(err.response?.data?.message || err.response?.data?.error?.message || 'That did not work')
    } finally {
      setBusy(null)
    }
  }

  if (state.loading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) return <div className="max-w-3xl mx-auto space-y-4"><BackLink /><div className="staff-card"><EmptyState title="Evaluation unavailable" description={state.error} /></div></div>

  const d = state.data
  const app = d.application
  const s = d.summary
  const toPost = d.courses.filter(c => c.state === 'decided').length
  const canPost = d.blockers.length === 0
  // Colleges whose name the student corrected on submission: [name used, name on the transcript]
  const renamed = [...new Map(d.courses.filter(c => c.corrected_fields?.includes('institution')).map(c => [c.institution, c.extracted?.institution])).entries()]
  // Who holds each course now, keyed by transcript course (ownership.courses)
  const owned = new Map((d.ownership?.courses || []).map(o => [o.transcript_course_id, o]))
  const groupCounts = d.courses.reduce((acc, c) => { acc[courseGroup(c)] = (acc[courseGroup(c)] || 0) + 1; return acc }, { all: d.courses.length })
  const shownCourses = filter === 'all' ? d.courses : d.courses.filter(c => courseGroup(c) === filter)
  const byInstitution = shownCourses.reduce((acc, c) => { (acc[c.institution] = acc[c.institution] || []).push(c); return acc }, {})
  const flagged = (d.quality || []).reduce((n, q) => n + q.findings.filter(f => f.severity === 'attention').length, 0)

  const openAssignment = () => {
    setTab('assignment')
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <BackLink />

      {/* Who and what: the case header, with where the evaluation is */}
      <section className="staff-card overflow-hidden">
        <div className="px-6 sm:px-7 pt-6 pb-5 flex flex-wrap items-start gap-5">
          <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white grid place-items-center text-[18px] font-semibold shadow-sm flex-shrink-0" aria-hidden="true">{initials(app.student_name)}</span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-staff-muted">
              <span className="font-mono">{app.reference_number}</span><StatusPill status={app.status} />
            </p>
            <h1 className="text-[30px] leading-tight text-staff-ink mt-1">{app.student_name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-staff-ink2">
              {app.transfer_to_program && <span className="inline-flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-staff-muted" aria-hidden="true" />{app.transfer_to_program}</span>}
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-staff-muted" aria-hidden="true" />{app.expected_start_term ? `Starts ${app.expected_start_term}` : 'Start term not given'}</span>
              <span className="inline-flex items-center gap-1.5"><Landmark className="w-4 h-4 text-staff-muted" aria-hidden="true" />{d.institutions.length > 1 ? `${d.institutions.length} institutions` : d.institutions[0] || app.transfer_from_institution}</span>
            </p>
            {app.details_corrected?.length > 0 && (
              <p className="text-[13px] text-amber-800 mt-1.5">
                Edited by the student: {app.details_corrected.map(c => `${DETAIL_LABELS[c.field] || c.field} (transcript: ${c.transcript || 'not shown'})`).join('; ')}
              </p>
            )}
            {renamed.length > 0 && (
              <p className="text-[13px] text-amber-800 mt-1.5">College name edited by the student: {renamed.map(([now, was]) => `${now} (transcript: ${was || 'not shown'})`).join('; ')}</p>
            )}
            {app.details_to_confirm?.length > 0 && (
              <p className="text-[13px] text-amber-800 mt-1.5">Received by email. To confirm with the student: {app.details_to_confirm.join(', ')}</p>
            )}
          </div>
          <Link to={`/evaluator/applications/${app.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-staff-line text-[14px] font-medium text-staff-ink2 hover:bg-staff-sunk">
            <FileSearch className="w-4 h-4" />Evaluation report
          </Link>
        </div>
        <ProgressTrack app={app} summary={s} trace={d.trace} toPost={toPost} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {app.applicant_comments && (
            <section className="staff-card px-6 py-4">
              <p className="text-[13px] font-medium text-staff-muted">Additional information from the student</p>
              <p className="text-[15px] text-staff-ink mt-1 whitespace-pre-wrap">{app.applicant_comments}</p>
            </section>
          )}

          {/* Duplicate */}
          {d.duplicate?.status === 'suspected' && (
            <section className="rounded-xl border border-amber-300 bg-amber-50/70 px-5 py-4">
              <p className="flex items-center gap-2 font-semibold text-staff-ink"><Copy className="w-4 h-4 text-amber-700" />Potential duplicate evaluation</p>
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
                  <input value={exception} onChange={e => setException(e.target.value)} aria-label="Reason for the deadline exception" className={`${FIELD} flex-1 min-w-[16rem]`} placeholder="Reason for the exception, e.g. transcript delayed by the sending college" />
                  <Button size="sm" variant="secondary" disabled={exception.trim().length < 5} loading={busy === 'exc'} onClick={() => run('exc', () => recordDeadlineException(app.id, exception.trim()), 'Exception recorded')}>Record exception</Button>
                </div>
              )}
            </section>
          )}

          {/* Courses: transfer course, then the decision or what is proposed */}
          <section className="staff-card overflow-hidden">
            <div className="px-6 py-4 border-b border-staff-line2 flex flex-wrap items-center gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-red-50 text-brand"><BookOpen className="w-[18px] h-[18px]" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold text-staff-ink">Courses</h2>
                <p className="text-[12.5px] text-staff-muted truncate">{d.institutions.length > 1 ? `${d.institutions.length} institutions` : d.institutions[0] || app.transfer_from_institution} · {s.courses} course{s.courses === 1 ? '' : 's'}</p>
              </span>
              <Segmented
                label="Show courses"
                value={filter}
                onChange={setFilter}
                options={COURSE_GROUPS.filter(g => g.key === 'all' || groupCounts[g.key] > 0).map(g => ({ ...g, count: groupCounts[g.key] || 0 }))}
              />
            </div>
            {Object.entries(byInstitution).map(([institution, list], i) => (
              <div key={institution} className={i > 0 || d.institutions.length > 1 ? 'border-t border-staff-line2' : ''}>
                {d.institutions.length > 1 && <p className="px-6 pt-3 pb-1 staff-eyebrow">{institution}</p>}
                <ul className="divide-y divide-staff-line2">
                  {list.map(c => <CourseRow key={c.id} c={c} owner={owned.get(c.id)} onAssign={() => setAssigning(c)} onReturn={() => setReturning(c)} />)}
                </ul>
              </div>
            ))}
            {shownCourses.length === 0 && <p className="px-6 py-5 text-[14px] text-staff-muted">No courses in this group.</p>}
            <p className="px-6 py-3 border-t border-staff-line2 bg-staff-sunk/50 text-[12.5px] text-staff-muted flex gap-2">
              <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Final review: check each decision awaiting review, return any that need another look, then finalize and post. Posted courses carry a grade of {d.policy.transfer_grade}, do not count toward the BU GPA and earn no BU Hub units. Pending courses show 0 units to the student.</span>
            </p>
          </section>

          <PreparedSummary trace={d.trace} impact={d.impact} open={showSteps} onToggle={() => setShowSteps(v => !v)} />
          {showSteps && <PreparationTrace trace={d.trace} />}

          {/* Everything else, one tab at a time */}
          <section ref={tabsRef} className="staff-card overflow-hidden scroll-mt-6">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'transcript', label: 'Transcript check', badge: flagged, warn: true, content: <div className="p-5"><TranscriptCheck quality={d.quality || []} /></div> },
                {
                  key: 'requests', label: 'Requests to the student', count: d.information_requests.length,
                  content: (
                    <div className="p-5">
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
                    </div>
                  )
                },
                {
                  key: 'documents', label: 'Documents', count: d.documents.length,
                  content: (
                    <ul className="p-5 space-y-1 text-[14px]">
                      {d.documents.map(doc => (
                        <li key={doc.id}><span className="text-staff-ink">{doc.file_name}</span><span className="text-staff-muted"> · {doc.document_type}{doc.for_course ? ` for ${doc.for_course}` : ''} · {formatDate(doc.created_at)}</span></li>
                      ))}
                      {!d.documents.length && <li className="text-staff-muted">No documents.</li>}
                    </ul>
                  )
                },
                {
                  key: 'updates', label: 'Student updates', count: (d.applicant_updates || []).length,
                  content: (
                    <div className="p-5">
                      {!(d.applicant_updates || []).length ? <p className="text-[14px] text-staff-muted">No updates sent yet.</p> : (
                        <ul className="space-y-2 text-[14px]">
                          {d.applicant_updates.map((u, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="text-staff-ink">{u.title}<span className="text-staff-muted"> · email {EMAIL_STATUS[u.email_status] || u.email_status}{u.email_status === 'retry' || u.email_status === 'failed' ? ` after ${u.email_attempts} attempt${u.email_attempts === 1 ? '' : 's'}` : ''}</span></span>
                              <span className="text-staff-muted whitespace-nowrap">{formatDate(u.created_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                },
                {
                  key: 'history', label: 'History',
                  content: (
                    <ul className="p-5 space-y-2 text-[14px]">
                      {d.history.map((h, i) => (
                        <li key={i} className="flex justify-between gap-3"><span className="text-staff-ink">{activityLabel(h.action)}<span className="text-staff-muted"> · {h.actor}</span></span><span className="text-staff-muted whitespace-nowrap">{timeAgo(h.created_at)}</span></li>
                      ))}
                    </ul>
                  )
                },
                // Where the application is, who holds each course, and the assignment history
                d.ownership && { key: 'assignment', label: 'Review assignment', content: <div className="p-4 sm:p-5"><ReviewAssignment ownership={d.ownership} /></div> },
                d.impact?.courses > 0 && { key: 'impact', label: 'Impact', content: <div className="p-4 sm:p-5"><ImpactPanel impact={d.impact} compact /></div> }
              ].filter(Boolean)}
            />
          </section>
        </div>

        {/* Posting rail: is it ready, what is in the way, who has it */}
        <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Posting">
          <section className="staff-card p-5">
            <h2 className="staff-eyebrow">Ready to post?</h2>
            <div className="mt-3 flex items-center gap-4">
              <Ring value={s.decided} max={s.courses} />
              <div className="text-[13px] min-w-0">
                <p className="font-semibold text-staff-ink">{s.decided} of {s.courses} course{s.courses === 1 ? '' : 's'} decided</p>
                {s.credits_approved > 0 && <p className="text-staff-muted">{s.credits_approved} credits decided, not yet posted</p>}
                {s.posted > 0 && <p className="text-staff-muted">{s.posted} posted · {s.credits_posted} credits</p>}
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-[13px]">
              <CheckItem {...deadlineCheck(d.deadline)} />
              <CheckItem state={d.duplicate?.status === 'suspected' ? 'bad' : 'ok'} text={d.duplicate?.status === 'suspected' ? 'Possible duplicate: resolve it first' : 'No possible duplicate'} />
              {s.pending > 0
                ? <CheckItem state="wait" text={`${s.pending} course${s.pending === 1 ? '' : 's'} still pending${s.needs_student_action ? `, ${s.needs_student_action} waiting on the student` : ''}`} />
                : s.courses > 0 && <CheckItem state="ok" text="Every course decided" />}
              {d.blockers.filter(b => !['deadline', 'duplicate', 'nothing'].includes(b.type)).map(b => <CheckItem key={b.type} state="bad" text={b.message} />)}
            </ul>
            <Button
              className="mt-4 w-full justify-center"
              onClick={() => run('post', () => postCredit(app.id), r => `${r.data.posted} course${r.data.posted === 1 ? '' : 's'} posted (${r.data.units} BU credits)`)}
              loading={busy === 'post'}
              disabled={!canPost || !toPost}
              title={d.blockers.map(b => b.message).join(' ') || undefined}
            >
              <Stamp className="w-4 h-4" />Finalize and post {toPost || ''} course{toPost === 1 ? '' : 's'}
            </Button>
            {(!canPost || s.pending > 0) && (
              <p className="mt-2 text-[11.5px] text-staff-muted text-center">
                {!canPost ? d.blockers.map(b => b.message).join(' ') : `The other ${s.pending === 1 ? 'course posts' : `${s.pending} courses post`} once decided`}
              </p>
            )}
          </section>

          {d.ownership && <CurrentlyWith ownership={d.ownership} onDetails={openAssignment} />}

          {(d.impact?.automation_rate != null || s.courses > 0) && (
            <section className="staff-card p-5 grid grid-cols-2 gap-3 text-center">
              {d.impact?.automation_rate != null && (
                <div className="rounded-lg bg-violet-50/60 py-3"><p className="font-display tabular-nums text-[24px] font-semibold text-violet-800 leading-none">{d.impact.automation_rate}%</p><p className="text-[11.5px] text-staff-muted mt-1">settled automatically</p></div>
              )}
              <div className={`rounded-lg bg-staff-sunk py-3 ${d.impact?.automation_rate != null ? '' : 'col-span-2'}`}><p className="font-display tabular-nums text-[24px] font-semibold text-staff-ink leading-none">{s.credits_posted}</p><p className="text-[11.5px] text-staff-muted mt-1">credits posted</p></div>
            </section>
          )}
        </aside>
      </div>

      <AssignDialog course={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); load() }} />
      <ReturnDialog course={returning} onClose={() => setReturning(null)} onDone={() => { setReturning(null); load() }} />
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

const duration = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

// Where the evaluation is: received, prepared, with departments, final review, posted (from the course summary)
const TRACK = ['Received', 'Prepared', 'Departments', 'Final review', 'Posted']
function ProgressTrack({ app, summary: s, trace, toPost }) {
  if (app.status === 'closed') return null
  const allPosted = s.courses > 0 && s.posted === s.courses
  const current = s.courses === 0 ? 1 : s.pending > 0 ? 2 : toPost > 0 ? 3 : allPosted ? TRACK.length : 3
  const detail = {
    Prepared: trace?.total_ms != null ? duration(trace.total_ms) : null,
    Departments: s.pending > 0 ? `${s.pending} course${s.pending === 1 ? '' : 's'}` : null,
    'Final review': toPost > 0 ? `${toPost} to post` : null
  }
  return (
    <ol className="px-6 sm:px-7 py-3.5 bg-staff-sunk/70 border-t border-staff-line2 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 text-[13px]" aria-label="Progress">
      {TRACK.map((step, i) => {
        const done = i < current
        const now = i === current
        return (
          <React.Fragment key={step}>
            {i > 0 && <li aria-hidden="true" className={`hidden md:block flex-1 h-px ${done ? 'bg-emerald-300' : now ? 'bg-amber-300' : 'bg-staff-line'}`} />}
            <li className={`inline-flex items-center gap-2 whitespace-nowrap ${done ? 'text-emerald-700 font-medium' : now ? 'text-amber-800 font-semibold' : 'text-staff-muted'}`} aria-current={now ? 'step' : undefined}>
              {done ? <span className="w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center"><Check className="w-3 h-3" strokeWidth={3} /></span>
                : now ? <span className="w-5 h-5 rounded-full bg-amber-400 ring-4 ring-amber-100" />
                : <span className="w-5 h-5 rounded-full border-2 border-staff-line bg-white" />}
              {step}{detail[step] && (done || now) ? ` · ${detail[step]}` : ''}
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

// A small segmented control (filters only what is already on the page)
function Segmented({ label, value, onChange, options }) {
  if (options.length < 3) return null
  return (
    <span className="flex flex-wrap rounded-lg bg-staff-sunk p-1 text-[12.5px]" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${value === o.key ? 'bg-white text-staff-ink font-medium shadow-sm' : 'text-staff-muted hover:text-staff-ink'}`}>
          {o.label} <span className="tabular-nums">{o.count}</span>
        </button>
      ))}
    </span>
  )
}

// Tabs with keyboard support (arrow keys move between tabs)
function Tabs({ tabs, value, onChange }) {
  const active = tabs.find(t => t.key === value) || tabs[0]
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.key)
    document.getElementById(`office-tab-${next.key}`)?.focus()
  }
  return (
    <>
      <div role="tablist" aria-label="Evaluation details" className="px-4 pt-2 border-b border-staff-line2 flex flex-wrap gap-x-1 text-[13.5px]">
        {tabs.map((t, i) => {
          const on = t.key === active.key
          return (
            <button key={t.key} id={`office-tab-${t.key}`} type="button" role="tab" aria-selected={on} aria-controls={`office-panel-${t.key}`} tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)}
              className={`px-3 py-2.5 -mb-px border-b-2 whitespace-nowrap ${on ? 'border-brand font-semibold text-staff-ink' : 'border-transparent text-staff-muted hover:text-staff-ink'}`}>
              {t.label}
              {t.badge > 0 && <span className={`ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium ${t.warn ? 'bg-amber-50 text-amber-800' : 'bg-staff-sunk text-staff-ink2'}`}>{t.badge}</span>}
              {t.count != null && <span className="ml-1 text-[12px] tabular-nums">{t.count}</span>}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`office-panel-${active.key}`} aria-labelledby={`office-tab-${active.key}`}>{active.content}</div>
    </>
  )
}

// Share of courses decided, as a ring
function Ring({ value, max }) {
  const c = 2 * Math.PI * 15.5
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <span className="relative w-[76px] h-[76px] flex-shrink-0" role="img" aria-label={`${value} of ${max} decided`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={TONES.slate.track} strokeWidth="4" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={TONES.emerald.edge} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display tabular-nums text-[18px] font-semibold text-staff-ink">{value}/{max}</span>
    </span>
  )
}

// One line of the posting checklist: ok, waiting or blocking
function CheckItem({ state, text }) {
  const Icon = state === 'ok' ? CheckCircle2 : state === 'bad' ? XCircle : CircleDashed
  const color = state === 'ok' ? 'text-emerald-600' : state === 'bad' ? 'text-red-600' : 'text-amber-600'
  return (
    <li className="flex items-start gap-2 text-staff-ink">
      <Icon className={`w-4 h-4 flex-shrink-0 mt-px ${color}`} aria-hidden="true" />
      <span><span className="sr-only">{state === 'ok' ? 'Done: ' : state === 'bad' ? 'Blocking: ' : 'Waiting: '}</span>{text}</span>
    </li>
  )
}

function deadlineCheck(deadline) {
  if (deadline.status === 'passed') return deadline.exception ? { state: 'ok', text: 'Deadline passed; exception recorded' } : { state: 'bad', text: 'Deadline passed: record an exception to post' }
  if (deadline.status === 'approaching') return { state: 'wait', text: `Transfer deadline in ${deadline.days_left} days` }
  if (deadline.status === 'unknown') return { state: 'wait', text: 'Transfer deadline unknown' }
  return { state: 'ok', text: 'Within the one-year deadline' }
}

// Who holds the open courses now, the course waiting longest, and why it went to them (ownership.service)
function CurrentlyWith({ ownership, onDetails }) {
  const { owners = [], blocking = [] } = ownership
  const primary = blocking.find(b => b.state !== 'queued') || blocking[0]
  const why = primary?.assignment_context?.length ? primary.assignment_context.join(' · ') : primary?.assignment_reason
  return (
    <section className="staff-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="staff-eyebrow">Currently with</h2>
        <StatusPill tone={ownership.tone}>{ownership.stage_label}</StatusPill>
      </div>
      {owners.length === 0 ? (
        <p className="mt-3 text-[14px] text-staff-ink2">{ownership.stage === 'credit_office_review' ? 'Credit Evaluation Office' : 'No evaluator'}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {owners.map(o => (
            <li key={o.name} className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-full grid place-items-center text-[13px] font-semibold flex-shrink-0 ${o.unassigned ? 'bg-rose-50 text-rose-700' : avatarTint(o.name)}`} aria-hidden="true">
                {o.unassigned ? <AlertTriangle className="w-4 h-4" /> : initials(o.name)}
              </span>
              <span className="min-w-0">
                <span className={`block text-[14px] font-medium truncate ${o.unassigned ? 'text-rose-800' : 'text-staff-ink'}`}>{o.name}</span>
                <span className="block text-[12.5px] text-staff-muted truncate">{[o.department, o.courses?.length ? o.courses.join(', ') : null].filter(Boolean).join(' · ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {primary && (
        <div className="mt-3 rounded-lg bg-staff-sunk px-3 py-2 text-[12.5px] text-staff-ink2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">Waiting on <span className="font-mono">{primary.course_code}</span></span>
          {primary.pending_since && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-800 whitespace-nowrap tabular-nums"><Clock className="w-3 h-3" aria-hidden="true" />{pendingFor(primary.pending_since)}</span>}
        </div>
      )}
      {why && <p className="mt-3 text-[12px] text-staff-muted">Why: {why}</p>}
      {primary?.returned_reason && <p className="mt-2 text-[12px] text-amber-800">Returned by the Credit Evaluation Office: {primary.returned_reason}</p>}
      <button type="button" onClick={onDetails} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 hover:text-primary-800">
        Assignment details and history<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </section>
  )
}

const STEP_CHIP = {
  done: 'bg-emerald-50 text-emerald-800',
  skipped: 'bg-staff-sunk text-staff-muted',
  failed: 'bg-amber-50 text-amber-800'
}

// How the evaluation was prepared, as one line of steps; the full trace opens below on request
function PreparedSummary({ trace, impact, open, onToggle }) {
  if (!trace?.stages?.length) return null
  const settled = impact?.courses > 0 ? `${impact.automatic} of ${impact.courses} course${impact.courses === 1 ? '' : 's'} settled automatically${impact.automation_rate != null ? ` (${impact.automation_rate}%)` : ''}` : null
  return (
    <section className="staff-card px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-violet-50 text-violet-700"><Workflow className="w-[18px] h-[18px]" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-staff-ink">How this evaluation was prepared</h2>
          <p className="text-[12.5px] text-staff-muted">{[formatDate(trace.started_at), `${trace.stages.length} steps`, duration(trace.total_ms), settled].filter(Boolean).join(' · ')}</p>
        </span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="text-[13px] font-semibold text-brand hover:text-brand-dark">{open ? 'Hide steps' : 'Show steps'}</button>
      </div>
      <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[11.5px]" aria-label="Steps">
        {trace.stages.map((st, i) => (
          <React.Fragment key={st.key}>
            {i > 0 && <li aria-hidden="true" className="w-3 h-px bg-staff-line" />}
            <li className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium whitespace-nowrap ${STEP_CHIP[st.status] || STEP_CHIP.done}`}>
              {st.status === 'failed' ? <Flag className="w-3 h-3" aria-hidden="true" /> : st.status !== 'skipped' && <Check className="w-3 h-3" aria-hidden="true" />}
              {st.label}{st.status === 'skipped' ? ' · not run' : st.status === 'failed' ? ' · needs attention' : ''}
            </li>
          </React.Fragment>
        ))}
      </ol>
    </section>
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

// What the transcript check found on each transcript (advisory; nothing was blocked or changed)
function TranscriptCheck({ quality }) {
  if (!quality.length) return <p className="text-[14px] text-staff-muted">No transcript courses have been read.</p>
  return (
    <div className="space-y-4 text-[14px]">
      {quality.map((q, i) => (
        <div key={i}>
          <p className="font-medium text-staff-ink">
            {q.institution || 'Institution not shown'}
            <span className="font-normal text-staff-muted"> · {q.courses} course{q.courses === 1 ? '' : 's'} · {q.credit_system || 'calendar not shown'}</span>
          </p>
          {q.findings.length === 0 ? (
            <p className="flex items-center gap-2 text-staff-ink2 mt-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" />Every course has a code, credits and a readable grade.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {q.findings.map((f, j) => (
                <li key={j} className={`flex gap-2.5 rounded-lg px-3.5 py-2.5 ${f.severity === 'attention' ? 'bg-amber-50/60 border border-amber-200 text-staff-ink' : 'bg-staff-sunk text-staff-ink2'}`}>
                  {f.severity === 'attention' ? <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-staff-muted flex-shrink-0 mt-0.5" />}
                  {f.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

const DETAIL_LABELS = { name: 'name', program: 'BU program', term: 'BU start term' }

// The row's left edge, by where the course is
function edgeOf(c) {
  if (c.state === 'decided' || c.state === 'posted') return c.decision_type === 'no_credit' ? TONES.red.edge : TONES.emerald.edge
  if (c.state === 'credit_office_review') return TONES.red.edge
  if (c.state === 'withdrawn' || c.state === 'processing') return TONES.slate.edge
  return TONES.amber.edge
}

function CourseRow({ c, owner, onAssign, onReturn }) {
  const [open, setOpen] = useState(false)
  const st = STATE[c.state] || STATE.processing
  const who = VIA[c.decided_via] || (c.decided_by ? c.decided_by : c.evaluator_name || (c.queue === 'credit_office' ? 'Credit Evaluation Office' : null))
  const reviewOpen = ['new', 'in_progress', 'info_requested', 'queued'].includes(c.review_status)
  const decided = c.state === 'decided' || c.state === 'posted'
  const noCredit = c.decision_type === 'no_credit'
  const units = c.units_status !== 'pending' ? `${c.units} units${c.transfer_grade ? ` · ${c.transfer_grade}` : ''}` : '0 units while pending'
  const corrections = correctionsOf(c)

  return (
    <li style={{ borderLeft: `4px solid ${edgeOf(c)}` }}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_auto] items-center gap-3 md:gap-4 px-6 py-4">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <span className="block font-mono font-semibold text-[14.5px] text-staff-ink">{c.course_code}</span>
          <span className="block text-[13px] text-staff-ink2">{c.title}</span>
          <span className="block text-[12px] text-staff-muted mt-0.5">
            {c.term && <>{c.term} · </>}
            {c.source_credits != null ? `${c.source_credits} ${c.credit_system === 'Quarter' ? 'qtr ' : ''}cr` : <span className="text-amber-700">credits missing</span>}
            {' · '}{c.grade ? `grade ${c.grade}` : 'no grade'}
          </span>
          {corrections.length > 0 && (
            <span className="block text-[12.5px] text-amber-800" title="The transcript file is unchanged; the student's value is used for evaluation">
              Edited by the student: {corrections.join('; ')}
            </span>
          )}
        </button>
        <ArrowRight className={`hidden md:block w-5 h-5 ${decided ? (noCredit ? 'text-red-400' : 'text-emerald-500') : 'text-amber-400'}`} aria-hidden="true" />
        {decided ? (
          <div className={`min-w-0 rounded-lg border px-3 py-2 ${noCredit ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
            <p className={`text-[12px] font-semibold flex items-center gap-1 ${noCredit ? 'text-rose-800' : 'text-emerald-800'}`}>
              {noCredit ? <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> : <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />}
              {[DECISION_LABELS[c.decision_type] || c.decision_type, units].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[14px] font-semibold text-staff-ink mt-0.5 truncate">{c.decision || '—'}</p>
            {who && <p className="text-[11.5px] text-staff-muted truncate">{who}</p>}
          </div>
        ) : (
          <div className={`min-w-0 rounded-lg border border-dashed px-3 py-2 ${c.state === 'withdrawn' ? 'border-staff-line bg-staff-bg' : 'border-amber-300 bg-amber-50/40'}`}>
            <p className={`text-[12px] font-semibold flex items-center gap-1 ${c.state === 'withdrawn' ? 'text-staff-ink2' : 'text-amber-800'}`}>
              <Hourglass className="w-3.5 h-3.5" aria-hidden="true" />{c.target_bu_course ? 'Proposed' : 'Pending'} · {units}
            </p>
            <p className={`text-[14px] font-semibold mt-0.5 truncate ${c.target_bu_course ? 'text-staff-ink' : 'text-staff-muted'}`}>{c.target_bu_course || 'No BU course proposed yet'}</p>
            <p className="text-[11.5px] text-staff-muted truncate">
              {[who, owner?.evaluator?.department, owner?.pending_since ? `waiting ${pendingFor(owner.pending_since)}` : null].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        )}
        <div className="flex md:flex-col items-center md:items-end flex-wrap gap-2">
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
          {reviewOpen && c.review_id && <Button size="sm" variant="secondary" onClick={onAssign}><UserCog className="w-3.5 h-3.5" />{c.evaluator_name ? 'Reassign' : 'Assign'}</Button>}
          {c.can_return && <Button size="sm" variant="secondary" onClick={onReturn}><Undo2 className="w-3.5 h-3.5" />Return</Button>}
        </div>
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
          {c.returned_reason && <p className="text-amber-800">Returned by the Credit Evaluation Office: {c.returned_reason}</p>}
        </div>
      )}
    </li>
  )
}

// Final review: the decision goes back to the evaluator (or, for a course settled automatically, to an evaluator)
function ReturnDialog({ course, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setReason('') }, [course])
  if (!course) return null
  const save = async () => {
    setSaving(true)
    try {
      const res = await returnToEvaluator(course.id, reason.trim())
      notify.success(res.data.evaluator ? `Returned to ${res.data.evaluator}` : 'Returned for evaluation')
      onDone()
    } catch (err) {
      notify.error(err.response?.data?.message || 'The decision could not be returned')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={`Return ${course.course_code} to the evaluator`} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-staff-sunk px-4 py-3 text-[14px]">
          <p className="font-medium text-staff-ink">{course.decision}</p>
          <p className="text-staff-ink2">{[DECISION_LABELS[course.decision_type] || course.decision_type, course.decided_by, `${course.units} units`].filter(Boolean).join(' · ')}</p>
          {course.decision_reason && <p className="text-staff-muted mt-1">{course.decision_reason}</p>}
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus className={FIELD}
          placeholder="What should the evaluator look at again? e.g. The awarded credits exceed the BU course's credits." />
        <p className="text-[12.5px] text-staff-muted">The decision is removed from final review and the course reopens for evaluation with your note. Academic departments still make the decision.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={reason.trim().length < 5}>Return decision</Button>
        </div>
      </div>
    </Modal>
  )
}
