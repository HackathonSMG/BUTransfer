import React, { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowDown, FileText, ChevronDown, Check, MessageSquare, CheckCircle2, XCircle, Clock, AlertTriangle, BadgeCheck, History as HistoryIcon, Flag, Search, X, Paperclip, Link2, Info, Minus, ShieldCheck, UserCog } from 'lucide-react'
import notify from '../../lib/notify'
import { getReview, startReview, decideReview, checkReviewDecision, requestReviewInfo, escalateReview, requestReassignment, searchBuCourses, getDocumentLink } from '../../api/my'
import StatusPill from '../../components/staff/StatusPill'
import TranscriptDrawer from '../../components/evaluator/TranscriptDrawer'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, DECISION_LABELS, matchLabelClass, formatDate } from '../../lib/reviews'
import { activityLabel, correctionsOf } from '../../lib/staffFormat'
import CourseComparison from '../../components/evaluator/CourseComparison'

const OPEN = ['new', 'in_progress', 'info_requested']
// Why an evaluator hands a course back (the API decides where it goes: another evaluator or the office queue)
const REASSIGN_REASONS = [
  { key: 'different_department', label: 'Belongs to a different department', hint: 'It goes to the best-matched evaluator in that subject, or the Credit Evaluation Office.' },
  { key: 'outside_expertise', label: 'Outside my area of expertise', hint: 'It goes to an evaluator with the right expertise, or the Credit Evaluation Office.' },
  { key: 'additional_review', label: 'Needs additional review', hint: 'The Credit Evaluation Office decides who reviews it.', noteRequired: true },
  { key: 'correction', label: 'Needs correction', hint: 'The Credit Evaluation Office follows up and reassigns it.', noteRequired: true }
]
const INFO_SUGGESTIONS = ['Detailed course description', 'Learning outcomes', 'Contact hours', 'Lab component']
const FIELD = 'w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

// The evaluator's outcomes for a course (Problem 1, step 6); fields appear only for the chosen one
const OUTCOMES = [
  { key: 'equivalent', label: 'Equivalent BU course', hint: 'Award the proposed BU course.' },
  { key: 'different_course', label: 'Different BU course', hint: 'Award another course from the BU catalog.' },
  { key: 'elective', label: 'Elective credit', hint: 'Counts as units without a specific BU course.' },
  { key: 'no_credit', label: 'No credit', hint: '0 units. A reason is required.' },
  { key: 'request_info', label: 'Request more information', hint: 'Ask the student for the syllabus or other details before deciding.' }
]

// The decision as the API takes it (also sent to the consistency check before it is recorded)
function decisionPayload(form, text) {
  return {
    decision: form.outcome,
    reason: text || null,
    bu_course: form.outcome === 'different_course' ? form.courses.join(' + ') : null,
    elective_label: form.outcome === 'elective' ? form.elective || null : null,
    units: form.units !== '' ? Number(form.units) : null,
    conflict_action: form.conflictAction
  }
}

// One sentence on where the proposed BU course came from
function basisSentence(review) {
  switch (review.match_basis) {
    case 'equivalency': return 'Matches an approved equivalency on file.'
    case 'sponsor_match':
      return review.sponsor_match_level === 'Partial - syllabus review'
        ? 'Listed as a partial match in the BU course-match catalog; a syllabus review is recommended.'
        : 'Listed as a likely equivalent in the BU course-match catalog.'
    case 'precedent': return 'Based on past evaluator decisions for this course.'
    case 'similarity': return 'Based on comparing the course content with BU courses.'
    case 'rule': return 'Decided by BU transfer credit policy.'
    default: return 'No match on file. Your judgement is needed.'
  }
}

export default function ReviewDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [dialog, setDialog] = useState(null) // 'decide' | 'info' | 'escalate' | 'reassign'
  const [reassignReason, setReassignReason] = useState('different_department')
  const [text, setText] = useState('')
  const [infoKind, setInfoKind] = useState('syllabus')
  const [form, setForm] = useState({ outcome: 'equivalent', courses: [], elective: '', units: '', conflictAction: null })
  const [submitting, setSubmitting] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [openSections, setOpenSections] = useState({})
  const openSection = (key) => {
    setOpenSections(o => ({ ...o, [key]: true }))
    setTimeout(() => document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const sectionProps = (key) => ({ id: `section-${key}`, open: !!openSections[key], onToggle: (v) => setOpenSections(o => ({ ...o, [key]: v })) })

  const load = useCallback(async () => {
    try {
      const res = await getReview(id)
      setState({ loading: false, data: res.data, error: null })
      return res.data
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.status === 404 ? 'This evaluation is not assigned to you.' : (err.response?.data?.message || err.message) })
      return null
    }
  }, [id])

  // Opening a new evaluation marks it In Progress
  useEffect(() => {
    setState({ loading: true, data: null, error: null })
    load().then(d => {
      if (d?.review.status === 'new') startReview(id).then(() => load()).catch(() => {})
    })
  }, [id, load])

  const openDecision = (preset = {}) => {
    const d = state.data
    setText('')
    setForm({ outcome: d?.proposed ? 'equivalent' : 'different_course', courses: [], elective: '', units: '', conflictAction: null, infoKind: 'syllabus', ...preset })
    setDialog('decide')
  }
  // A request starts from the one drafted from the comparison's gaps; the evaluator edits it before sending
  const openDialog = (kind) => {
    const suggested = kind === 'info' ? state.data?.suggested_request : null
    setText(suggested?.message || '')
    setInfoKind(suggested?.kind || 'syllabus')
    setReassignReason('different_department')
    setDialog(kind)
  }

  const submit = async () => {
    const d0 = state.data
    setSubmitting(true)
    try {
      if (dialog === 'info') {
        await requestReviewInfo(id, text, infoKind)
        notify.success(infoKind === 'syllabus' ? 'Syllabus requested from the student' : 'Information requested from the student')
      } else if (dialog === 'escalate') {
        await escalateReview(id, text)
        notify.success('Sent to the Credit Evaluation Office')
      } else if (dialog === 'reassign') {
        // The course leaves this evaluator, so the confirmation is shown on My Evaluations
        const res = await requestReassignment(id, reassignReason, text.trim() || null)
        notify.success(`${d0.source_course?.course_code || 'The course'} was handed back${res.data.to ? ` and reassigned to ${res.data.to}` : ' to the Credit Evaluation Office for reassignment'}.`, { keepOnNavigate: true })
        setDialog(null)
        navigate('/evaluator/my-evaluations')
        return
      } else if (form.outcome === 'request_info') {
        await requestReviewInfo(id, text, form.infoKind)
        notify.success(form.infoKind === 'syllabus' ? 'Syllabus requested from the student' : 'Information requested from the student')
      } else {
        const res = await decideReview(id, decisionPayload(form, text))
        // One confirmation for everything the decision caused; the decision banner below shows the outcome itself
        notify.success([
          form.outcome === 'no_credit' ? 'Recorded: no credit.' : 'Decision recorded.',
          res.data.transfer && `The remaining courses were handed to the next evaluator (${res.data.transfer.request_number}).`,
          res.data.application_status === 'ready_for_posting' && 'Every course on this application is decided; it is ready for the Credit Evaluation Office.'
        ].filter(Boolean).join(' '))
      }
      setDialog(null)
      await load()
    } catch (err) {
      notify.error(err.response?.data?.message || err.response?.data?.error?.message || 'The decision could not be saved')
    } finally {
      setSubmitting(false)
    }
  }

  if (state.loading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackLink />
        <div className="staff-card"><EmptyState title="Evaluation unavailable" description={state.error} /></div>
      </div>
    )
  }

  const d = state.data
  const { review: r, application: app, source_course: src, target_courses: buCourses = [], proposed, evidence, knowledge: k, units } = d
  const bu = buCourses[0] || null
  const conflicts = k?.conflicts || []
  const previous = k?.previous
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  const isOpen = OPEN.includes(r.status)
  const mapping = `${src?.course_code} → ${proposed?.award || r.target_bu_course || 'no BU course'}`
  const canSubmit = (() => {
    if (dialog === 'escalate') return true
    if (dialog === 'reassign') return !REASSIGN_REASONS.find(o => o.key === reassignReason)?.noteRequired || text.trim()
    if (dialog === 'info') return infoKind === 'syllabus' || text.trim()
    if (form.outcome === 'request_info') return form.infoKind === 'syllabus' || text.trim()
    if (units?.required && form.outcome !== 'no_credit' && !(Number(form.units) > 0)) return false
    if (form.outcome === 'different_course') return form.courses.length > 0 && text.trim()
    if (form.outcome === 'no_credit') return text.trim()
    return true
  })()

  return (
    <div className="max-w-5xl mx-auto pb-32">
      <BackLink />

      {/* Who and what */}
      <header className="flex flex-wrap items-end justify-between gap-4 mt-4 mb-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-staff-muted">
            <span className="font-mono">{app.reference_number}</span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {r.priority === 'high' && <span className="text-[12px] font-semibold text-red-700">High priority</span>}
          </p>
          <h1 className="text-[30px] leading-tight text-staff-ink mt-1">{app.student_name}</h1>
          <p className="text-[15px] text-staff-ink2 mt-1">{app.transfer_to_program} · transferring from {app.transfer_from_institution}</p>
          {r.assignment_context?.length > 0 && (
            <p className="text-[13px] text-staff-muted mt-2">
              <span className="font-medium text-staff-ink2">Assignment context:</span> {r.assignment_context.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {d.syllabus && <DocumentButton id={d.syllabus.document_id} label="View syllabus" icon={Paperclip} />}
          <Button variant="secondary" onClick={() => setTranscriptOpen(true)}>
            <FileText className="w-4 h-4" />
            View transcript
          </Button>
        </div>
      </header>

      <StatusBanner d={d} />
      <AttentionNotes d={d} />

      {/* The evaluation */}
      <section className="staff-card p-6 sm:p-8">
        <h2 className="text-[17px] font-semibold text-staff-ink mb-5">Course evaluation</h2>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3 md:gap-5">
          <CourseBox
            label="Transfer course"
            code={src?.course_code}
            title={src?.title}
            meta={[src?.institution, src?.source_credits != null ? `${Number(src.source_credits)} ${src.credit_system === 'Quarter' ? 'quarter ' : ''}credits` : 'Credits not on transcript', src?.term, src?.grade && `Grade ${src.grade}`]}
          />
          <span className="grid place-items-center text-staff-muted">
            <ArrowRight className="hidden md:block w-6 h-6" />
            <ArrowDown className="md:hidden w-6 h-6" />
          </span>
          {r.target_bu_course ? (
            <CourseBox
              label="Boston University course"
              code={r.target_bu_course}
              title={buCourses.map(c => c.title).join(' + ') || null}
              meta={['Boston University', buCourses.length ? `${buCourses.reduce((n, c) => n + Number(c.credits || 0), 0)} credits` : null, bu?.program]}
              emphasis
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-staff-line p-5 grid place-items-center text-center">
              <span className="text-[14px] text-staff-muted">No BU course proposed.<br />Review the details and decide.</span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-staff-line2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-4 items-center">
          <MatchSummary r={r} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-staff-ink2">
              System recommendation
              <span className="text-[11px] font-semibold uppercase tracking-wide text-staff-muted border border-staff-line rounded px-1.5 py-px">Advisory</span>
            </p>
            <p className="text-[18px] font-semibold text-staff-ink mt-1">{proposed?.label || 'Evaluator to decide'}</p>
            <p className="text-[14px] text-staff-ink2 mt-1">{basisSentence(r)}</p>
            <KnowledgeCues k={k} onConflicts={() => openSection('conflicts')} onPrevious={() => openSection('previous')} />
            <button
              type="button"
              onClick={() => { setEvidenceOpen(true); document.getElementById('matching-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className="mt-2 text-[13px] font-semibold text-primary-700 hover:text-primary-800"
            >
              View supporting evidence
            </button>
            <p className="mt-3 text-[12.5px] text-staff-muted">The recommendation explains the evidence; the department evaluator makes the final academic decision.</p>
          </div>
        </div>
      </section>

      {/* The evidence below in one place: what supports the proposal, where it differs, what needs attention */}
      <EvaluationContext
        brief={d.brief}
        onRequestSyllabus={isOpen ? () => openDialog('info') : null}
        onConflicts={() => openSection('conflicts')}
        onPrevious={() => openSection('previous')}
      />

      {/* Why the recommendation fits: BU outcomes and topics against the transfer course's description and syllabus */}
      <CourseComparison comparison={d.comparison} src={src} buCourses={buCourses} />

      {/* Details on demand */}
      <section className="staff-card mt-6 divide-y divide-staff-line2">
        <Disclosure title="Transfer course details">
          <CourseDetails c={src} institution={src?.institution} />
        </Disclosure>
        <Disclosure title={buCourses.length > 1 ? 'BU course details (combined award)' : 'BU course details'}>
          {buCourses.length ? (
            <div className="space-y-6">{buCourses.map(c => <CourseDetails key={c.course_code} c={c} institution="Boston University" heading={buCourses.length > 1 ? c.course_code : null} />)}</div>
          ) : <p className="text-[14px] text-staff-muted">No BU course has been proposed for this course.</p>}
        </Disclosure>
        <Disclosure id="matching-details" title="Supporting evidence" open={evidenceOpen} onToggle={setEvidenceOpen}>
          <Evidence evidence={evidence} src={src} buCourses={buCourses} syllabus={d.syllabus} />
        </Disclosure>
        {previous && (
          <Disclosure {...sectionProps('previous')} title={`Similar past decisions (${previous.total + (k.similar?.length || 0) + (d.similar_elsewhere?.courses.length || 0)})`}>
            <PreviousDecisions k={k} src={src} target={r.target_bu_course} elsewhere={d.similar_elsewhere} />
          </Disclosure>
        )}
        {conflicts.length > 0 && (
          <Disclosure {...sectionProps('conflicts')} title={<span className="flex items-center gap-2">Potential equivalency conflict<span className="w-2 h-2 rounded-full bg-amber-500" /></span>}>
            <Conflicts
              k={k}
              src={src}
              canAct={isOpen}
              onUseEstablished={() => openDecision(proposed?.award === k.established?.bu_course
                ? { outcome: 'equivalent', conflictAction: 'use_established' }
                : { outcome: 'different_course', courses: (k.established?.bu_course || '').match(/CAS [A-Z]{2} \d{3}/g) || [], conflictAction: 'use_established' })}
              onOverride={() => openDecision({ conflictAction: 'override' })}
              onEscalate={() => openDialog('escalate')}
            />
          </Disclosure>
        )}
        {d.info_requests?.length > 0 && (
          <Disclosure title={`Requests to the student (${d.info_requests.length})`}>
            <InfoRequests requests={d.info_requests} />
          </Disclosure>
        )}
        <Disclosure title="Evaluation history">
          <History d={d} />
        </Disclosure>
      </section>

      {/* Decision */}
      <div className="fixed bottom-0 inset-x-0 lg:left-[248px] z-20 bg-white/95 backdrop-blur border-t border-staff-line shadow-[0_-4px_16px_rgba(16,24,40,0.06)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
          {isOpen ? (
            <>
              <div className="hidden sm:block min-w-0 flex-1">
                <p className="text-[13px] font-medium text-staff-muted">System recommendation · the decision is yours</p>
                <p className="text-[15px] font-semibold text-staff-ink truncate font-mono">{mapping}</p>
              </div>
              <span className="sm:hidden flex-1" />
              <Button variant="secondary" onClick={() => openDialog('reassign')} title="Hand this course back for another evaluator">
                <UserCog className="w-4 h-4" />
                <span className="hidden sm:inline">Request reassignment</span><span className="sm:hidden">Reassign</span>
              </Button>
              <Button variant="secondary" onClick={() => openDialog('info')}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Request information</span><span className="sm:hidden">Request info</span>
              </Button>
              <Button variant="success" onClick={() => openDecision()}>
                <Check className="w-4 h-4" />Record department decision
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 text-[15px] text-staff-ink2">
                {r.status === 'queued'
                  ? 'This course opens for your decision shortly.'
                  : r.status === 'withdrawn' ? 'This course no longer needs a decision.' : 'This course has been decided.'}
              </p>
              {d.next_review_id ? (
                <Button onClick={() => navigate(`/evaluator/reviews/${d.next_review_id}`)}>Next evaluation<ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate('/evaluator/my-evaluations')}>Back to My Evaluations</Button>
              )}
            </>
          )}
        </div>
      </div>

      <TranscriptDrawer
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        student={app.student_name}
        courses={d.transcript.courses}
        documents={d.transcript.documents}
        highlightCode={src?.course_code}
        highlightInstitution={src?.institution}
      />

      <Modal
        isOpen={dialog !== null}
        onClose={() => !submitting && setDialog(null)}
        title={dialog === 'decide' ? 'Department decision' : dialog === 'escalate' ? 'Request additional review' : dialog === 'reassign' ? 'Request reassignment' : 'Request information from the student'}
        size={dialog === 'decide' ? 'md' : 'sm'}
      >
        <div className="space-y-4">
          {dialog === 'decide' && (
            <DecisionForm d={d} form={form} setForm={setForm} text={text} setText={setText} />
          )}
          {dialog === 'decide' && form.outcome !== 'request_info' && <ConsistencyCheck reviewId={id} form={form} />}
          {dialog === 'escalate' && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1.5">Note for the Credit Evaluation Office</span>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus className={FIELD}
                placeholder="e.g. Earlier decisions award different BU courses. Which should be the standard?" />
              <span className="block text-[12.5px] text-staff-muted mt-1.5">The office can record a standard equivalency for future transcripts. Your decision on this course stays yours.</span>
            </label>
          )}
          {dialog === 'reassign' && (
            <>
              <fieldset className="space-y-2">
                <legend className="block text-sm font-medium text-gray-700 mb-1.5">Why should {d.source_course?.course_code} go to someone else?</legend>
                {REASSIGN_REASONS.map(o => (
                  <label key={o.key} className={`flex gap-3 rounded-lg border px-3.5 py-2.5 cursor-pointer ${reassignReason === o.key ? 'border-primary-500 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'}`}>
                    <input type="radio" name="reassign-reason" className="mt-1" checked={reassignReason === o.key} onChange={() => setReassignReason(o.key)} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-staff-ink">{o.label}</span>
                      <span className="block text-[12.5px] text-staff-muted">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Note {REASSIGN_REASONS.find(o => o.key === reassignReason)?.noteRequired ? <span className="text-red-500">*</span> : <span className="text-staff-muted font-normal">(optional)</span>}
                </span>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className={FIELD}
                  placeholder="e.g. This is a statistics course; the Mathematics department should evaluate it." />
              </label>
              <p className="text-[12.5px] text-staff-muted">The course leaves your queue. Its evaluation history keeps you as an earlier evaluator with this reason; nothing about the course is decided.</p>
            </>
          )}
          {dialog === 'info' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[['syllabus', 'Course syllabus'], ['information', 'Other information']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setInfoKind(k)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-[14px] ${infoKind === k ? 'border-primary-500 bg-primary-50/60 text-primary-800 font-semibold' : 'border-staff-line text-staff-ink2 hover:bg-staff-sunk'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  {infoKind === 'syllabus' ? 'Note to the student (optional)' : <>What information is needed? <span className="text-red-500">*</span></>}
                </span>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus className={FIELD}
                  placeholder={infoKind === 'syllabus' ? 'e.g. Please include the weekly topics and lab hours.' : 'e.g. Please confirm the number of contact hours.'} />
              </label>
              {infoKind === 'information' && (
                <div className="flex flex-wrap gap-1.5">
                  {INFO_SUGGESTIONS.map(s => (
                    <button key={s} type="button" onClick={() => setText(t => (t ? `${t}${t.endsWith('.') ? '' : ';'} ${s}` : s))}
                      className="text-[12.5px] px-2.5 py-1 rounded-full border border-staff-line text-staff-ink2 hover:bg-staff-sunk">
                      + {s}
                    </button>
                  ))}
                </div>
              )}
              {d.suggested_request && <p className="text-[12.5px] text-staff-muted">Drafted from what the course comparison could not find. Edit it before sending.</p>}
              <p className="text-[12.5px] text-staff-muted">The student is notified and answers from their status page. The course returns to you when they do.</p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submit}
              loading={submitting}
              disabled={!canSubmit}
              variant={dialog === 'decide' ? (form.outcome === 'no_credit' ? 'danger' : 'success') : 'primary'}
            >
              {dialog === 'decide' ? (form.outcome === 'request_info' ? 'Send request' : 'Confirm decision') : dialog === 'escalate' ? 'Send to the office' : dialog === 'reassign' ? 'Hand back for reassignment' : 'Send request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/evaluator/my-evaluations" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-staff-ink2 hover:text-staff-ink">
      <ArrowLeft className="w-4 h-4" />My Evaluations
    </Link>
  )
}

// Opens an uploaded document (syllabus) in a new tab through a short-lived link
function DocumentButton({ id, label, icon: Icon = FileText }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      const res = await getDocumentLink(id)
      window.open(res.data.download_url, '_blank', 'noopener')
    } catch (err) {
      notify.error(err.response?.data?.message || 'The document could not be opened')
    } finally {
      setBusy(false)
    }
  }
  return <Button variant="secondary" onClick={open} loading={busy}><Icon className="w-4 h-4" />{label}</Button>
}

// The match as the API describes it: a percentage only for a computed content similarity
function MatchSummary({ r }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-[13px] font-medium text-staff-ink2">Course match</p>
      {r.match_kind === 'score' ? (
        <>
          <p className="text-[44px] leading-none font-semibold text-staff-ink tabular-nums mt-1">{r.match_percent}%</p>
          <p className={`text-[14px] font-semibold mt-1 ${matchLabelClass(r.match_label)}`}>{r.match_label}</p>
          <p className="text-[12px] text-staff-muted mt-0.5">Content similarity</p>
        </>
      ) : r.match_kind === 'level' ? (
        <>
          <p className={`text-[22px] leading-tight font-semibold mt-1 ${matchLabelClass(r.match_label)}`}>{r.match_label}</p>
          <p className="text-[12px] text-staff-muted mt-1">{r.match_basis === 'equivalency' ? 'Established equivalency' : 'Match level in the BU course-match catalog'}</p>
        </>
      ) : (
        <p className="text-[20px] font-semibold text-staff-muted mt-2">Not scored</p>
      )}
    </div>
  )
}

function DecisionForm({ d, form, setForm, text, setText }) {
  const { proposed, units, source_course: src } = d
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const needsReason = form.outcome === 'different_course' || form.outcome === 'no_credit'
  const defaultUnits = units?.default
  return (
    <>
      {form.conflictAction && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900">
          {form.conflictAction === 'use_established'
            ? 'Recorded as following the established equivalency.'
            : 'Recorded as overriding earlier decisions. The Credit Evaluation Office is told so it can review the standard.'}
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="sr-only">Outcome</legend>
        {OUTCOMES.map(o => {
          const disabled = o.key === 'equivalent' && !proposed
          const active = form.outcome === o.key
          return (
            <label key={o.key} className={`flex gap-3 rounded-lg border px-3.5 py-3 cursor-pointer ${active ? 'border-primary-500 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input type="radio" name="outcome" className="mt-1 accent-current text-primary-600" checked={active} disabled={disabled} onChange={() => {
                const suggested = o.key === 'request_info' ? d.suggested_request : null
                set({ outcome: o.key, ...(suggested ? { infoKind: suggested.kind } : {}) })
                if (suggested && !text.trim()) setText(suggested.message)
              }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-staff-ink">{o.label}</span>
                <span className="block text-[12.5px] text-staff-muted">
                  {o.key === 'equivalent' && proposed ? proposed.label : o.hint}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {form.outcome === 'request_info' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[['syllabus', 'Course syllabus'], ['information', 'Other information']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => set({ infoKind: k })}
                className={`rounded-lg border px-3 py-2.5 text-left text-[14px] ${form.infoKind === k ? 'border-primary-500 bg-primary-50/60 text-primary-800 font-semibold' : 'border-staff-line text-staff-ink2 hover:bg-staff-sunk'}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              {form.infoKind === 'syllabus' ? 'Note to the student (optional)' : <>What is needed? <span className="text-red-500">*</span></>}
            </span>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className={FIELD}
              placeholder={form.infoKind === 'syllabus' ? 'e.g. Please include the weekly topics and lab hours.' : 'e.g. Please confirm the number of contact hours.'} />
          </label>
          {d.suggested_request && <p className="text-[12.5px] text-staff-muted">Drafted from what the course comparison could not find. Edit it before sending.</p>}
          <p className="text-[12.5px] text-staff-muted">The student sees the request on this course in their portal. The course returns to you when they answer.</p>
        </>
      ) : (
        <>
          {form.outcome === 'different_course' && <BuCoursePicker selected={form.courses} onChange={(courses) => set({ courses })} />}
          {form.outcome === 'elective' && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1.5">Elective category <span className="text-staff-muted font-normal">(optional)</span></span>
              <input value={form.elective} onChange={e => set({ elective: e.target.value })} className={FIELD} placeholder="e.g. Biology elective, CS elective (CAS CS 1XX)" maxLength={120} />
            </label>
          )}

          {form.outcome !== 'no_credit' && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1.5">Credits (BU units) {units?.required && <span className="text-red-500">*</span>}</span>
              <input type="number" min="0.5" max="24" step="0.01" value={form.units} onChange={e => set({ units: e.target.value })}
                placeholder={defaultUnits != null ? String(defaultUnits) : ''} className={`${FIELD} max-w-[10rem]`} />
              <span className={`block text-[12.5px] mt-1 ${units?.required ? 'text-amber-800' : 'text-staff-muted'}`}>
                {units?.required
                  ? `The transcript does not show credits for ${src?.course_code}. Confirm them before awarding units.`
                  : `${defaultUnits} by default${units?.quarter ? ` (${Number(src?.source_credits)} quarter credits × 2/3)` : ' from the transcript'}; posted with a grade of ${d.policy?.transfer_grade || 'T'}.`}
              </span>
            </label>
          )}

          <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1.5">Reason {needsReason ? <span className="text-red-500">*</span> : <span className="text-staff-muted font-normal">(optional)</span>}</span>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className={FIELD}
          placeholder={form.outcome === 'no_credit' ? 'e.g. Content does not cover the data structures required for CAS CS 112.' : form.outcome === 'different_course' ? 'e.g. The syllabus covers discrete mathematics, not programming.' : 'Anything the next evaluator should know.'} />
          </label>
        </>
      )}
    </>
  )
}

// Search the BU catalog and pick one or more courses (several for a combined award, e.g. lecture + lab)
function BuCoursePicker({ selected, onChange }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  useEffect(() => {
    const t = setTimeout(() => {
      searchBuCourses(q).then(res => setRows(res.data || [])).catch(() => setRows([]))
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  const toggle = (code) => onChange(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code].slice(0, 3))
  return (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-1.5">BU course <span className="text-red-500">*</span></span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(c => (
            <button key={c} type="button" onClick={() => toggle(c)} className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 text-primary-800 text-[12.5px] font-mono font-semibold px-2.5 py-1">
              {c}<X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 text-staff-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} className={`${FIELD} pl-9`} placeholder="Search by code or title, e.g. CS 112 or data structures" />
      </div>
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-staff-line divide-y divide-staff-line2">
        {rows.map(c => (
          <li key={c.course_code}>
            <button type="button" onClick={() => toggle(c.course_code)} className={`w-full text-left px-3 py-2 text-[13.5px] hover:bg-staff-bg flex gap-2 ${selected.includes(c.course_code) ? 'bg-primary-50/60' : ''}`}>
              <span className="font-mono font-semibold text-staff-ink w-[6.5rem] flex-shrink-0">{c.course_code}</span>
              <span className="text-staff-ink2 truncate">{c.title}</span>
              {c.credits != null && <span className="ml-auto text-staff-muted">{Number(c.credits)} cr</span>}
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-2 text-[13px] text-staff-muted">No BU courses match.</li>}
      </ul>
      <span className="block text-[12px] text-staff-muted mt-1">Choose two for a combined award, e.g. a lecture and its lab.</span>
    </div>
  )
}

function CourseBox({ label, code, title, meta, emphasis = false }) {
  return (
    <div className={`rounded-xl p-5 ${emphasis ? 'bg-primary-50/60 border border-primary-100' : 'bg-staff-bg border border-staff-line2'}`}>
      <p className="text-[12.5px] font-medium text-staff-muted">{label}</p>
      <p className={`font-mono text-[22px] font-semibold mt-1 ${emphasis ? 'text-primary-800' : 'text-staff-ink'}`}>{code || '—'}</p>
      <p className="text-[16px] text-staff-ink mt-0.5">{title || 'Title not on file'}</p>
      <p className="text-[13px] text-staff-muted mt-2">{meta.filter(Boolean).join(' · ')}</p>
    </div>
  )
}

function StatusBanner({ d }) {
  const { review: r, decision, info_request: info, syllabus } = d
  if (r.returned_reason && OPEN.includes(r.status)) {
    return (
      <div className="flex gap-3 rounded-xl px-5 py-4 mb-6 border bg-amber-50 border-amber-300">
        <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="text-[14px]">
          <p className="font-semibold text-staff-ink">Returned by the Credit Evaluation Office {formatDate(r.returned_at)}</p>
          <p className="text-staff-ink2">{r.returned_reason}</p>
          <p className="text-staff-muted mt-1">Review the course again and record your decision.</p>
        </div>
      </div>
    )
  }
  if (decision && ['approved', 'rejected'].includes(r.status)) {
    const approved = decision.outcome !== 'no_credit'
    return (
      <div className={`flex gap-3 rounded-xl px-5 py-4 mb-6 border ${approved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        {approved ? <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />}
        <div className="text-[14px]">
          <p className="font-semibold text-staff-ink">
            {DECISION_LABELS[decision.decision_type] || (approved ? 'Approved' : 'No credit')}
            {decision.bu_award ? `: ${decision.bu_award}` : ''}
            {decision.bu_units != null && approved ? ` · ${Number(decision.bu_units)} BU units` : ''}
          </p>
          <p className="text-staff-ink2">Department decision · {[decision.decided_by, formatDate(decision.decided_at)].filter(Boolean).join(' · ')}</p>
          {decision.reason && <p className="text-staff-ink2 mt-1">{decision.reason}</p>}
        </div>
      </div>
    )
  }
  if (info && (r.status === 'info_requested' || info.status === 'responded')) {
    const replied = info.status === 'responded'
    return (
      <div className={`flex gap-3 rounded-xl px-5 py-4 mb-6 border ${replied ? 'bg-sky-50 border-sky-200' : 'bg-amber-50 border-amber-200'}`}>
        <Clock className={`w-5 h-5 flex-shrink-0 mt-0.5 ${replied ? 'text-sky-700' : 'text-amber-700'}`} />
        <div className="text-[14px]">
          <p className="font-semibold text-staff-ink">
            {replied
              ? `${info.kind === 'syllabus' ? 'Syllabus received' : 'The student replied'} ${formatDate(info.responded_at)}`
              : `Waiting on the student for the ${info.kind === 'syllabus' ? 'syllabus' : 'requested information'}`}
          </p>
          <p className="text-staff-ink2">Requested {formatDate(info.created_at)}{info.message ? `: ${info.message}` : ''}</p>
          {info.student_response && <p className="text-staff-ink mt-1"><span className="font-medium">Reply:</span> {info.student_response}</p>}
          {replied && syllabus?.compared && <p className="text-staff-ink2 mt-1">The syllabus was compared with the BU catalog; the course comparison below reflects it.</p>}
        </div>
      </div>
    )
  }
  return null
}

// Things the evaluator must not miss: missing credits, a held grade, a course evaluated with another
function AttentionNotes({ d }) {
  const notes = []
  const src = d.source_course
  if (d.units?.required) notes.push(`Credits are not shown on the transcript for ${src?.course_code}. Record the BU units with your decision.`)
  const rules = d.evidence?.rules || []
  if (rules.includes('PASS')) notes.push(`Graded Pass. Confirm it meets the ${d.policy?.minimum_grade || 'C'} minimum before awarding credit.`)
  if (rules.includes('GRADE')) notes.push('The final grade is missing or unreadable. Credit needs a confirmed grade.')
  const corrections = correctionsOf(src)
  if (corrections.length) notes.push(`Corrected by the student on submission: ${corrections.join('; ')}. Check against the transcript.`)
  if (d.combined_with?.length) notes.push(`Evaluated together with ${d.combined_with.map(c => `${c.course_code} ${c.title || ''}`.trim()).join(', ')} from the same transcript.`)
  if (!notes.length) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-3.5 mb-6 space-y-1.5">
      {notes.map((n, i) => (
        <p key={i} className="flex gap-2 text-[14px] text-amber-900">
          {n.startsWith('Evaluated together') ? <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}{n}
        </p>
      ))}
    </div>
  )
}

// Collapsible section; open state can be controlled (Matching evidence opens from the summary link)
function Disclosure({ id, title, open, onToggle, children }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const toggle = () => (onToggle ? onToggle(!isOpen) : setInner(!isOpen))
  return (
    <div id={id} className="scroll-mt-24">
      <button type="button" onClick={toggle} aria-expanded={isOpen} className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-staff-bg">
        <span className="text-[15px] font-semibold text-staff-ink">{title}</span>
        <ChevronDown className={`w-5 h-5 text-staff-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  )
}

function CourseDetails({ c, institution, heading = null }) {
  if (!c) return <p className="text-[14px] text-staff-muted">No catalog entry on file.</p>
  const rows = [
    ['Institution', institution],
    ['Program', c.program],
    ['Level', c.level],
    ['Requirement', c.requirement_type],
    ['Credits', c.credits ?? c.catalog_credits ?? c.source_credits],
    ['Notes', c.notes]
  ].filter(([, v]) => v != null && v !== '')
  return (
    <div className="space-y-4 text-[14px]">
      {heading && <p className="font-mono font-semibold text-staff-ink">{heading}</p>}
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-1.5">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}><dt className="text-staff-muted">{k}</dt><dd className="text-staff-ink">{String(v)}</dd></React.Fragment>
        ))}
      </dl>
      <div>
        <p className="text-staff-muted mb-1">Description</p>
        <p className="text-staff-ink leading-relaxed">{c.description || 'No description on file.'}</p>
      </div>
      {c.learning_outcomes && (
        <div>
          <p className="text-staff-muted mb-1">Learning outcomes</p>
          <p className="text-staff-ink leading-relaxed">{c.learning_outcomes}</p>
        </div>
      )}
    </div>
  )
}

// Only evidence the system actually holds: catalog matches, equivalencies, past decisions, policy notes, alternatives
function Evidence({ evidence: e, src, buCourses, syllabus }) {
  const items = []
  for (const m of e.sponsor_matches) {
    items.push({ title: `BU course-match catalog: ${m.match_level}`, body: `${src?.course_code} is listed against ${m.bu_course}.${m.notes ? ` ${m.notes}` : ''}` })
  }
  if (e.equivalency) {
    items.push({ title: `Approved equivalency ${e.equivalency.eq_id}`, body: `Maps this course to ${e.equivalency.bu_course || e.equivalency.outcome}${e.equivalency.approved_on ? `, approved ${formatDate(e.equivalency.approved_on)}` : ''}.` })
  }
  for (const p of e.precedents) {
    items.push({ title: `Past decision ${p.decision_id}: ${p.decision}`, body: `${p.bu_awarded ? `Awarded ${p.bu_awarded}. ` : ''}${p.reason || ''}${p.decided_on ? ` (${formatDate(p.decided_on)})` : ''}` })
  }
  if (syllabus) items.push({ title: 'Syllabus from the student', body: `${syllabus.file_name}, received ${formatDate(syllabus.received_at)}${syllabus.compared ? '; compared with the BU catalog.' : '; the file has no readable text, so open it to review.'}` })
  if (src && buCourses.length) {
    const s = Number(src.source_credits ?? src.catalog_credits)
    const b = buCourses.reduce((n, c) => n + Number(c.credits || 0), 0)
    if (s && b) items.push({ title: 'Credits', body: `${s} ${src.credit_system ? src.credit_system.toLowerCase() + ' ' : ''}credits at ${src.institution}${src.bu_credits != null && src.bu_credits !== s ? ` (${src.bu_credits} BU units)` : ''}; ${b} credits at BU.` })
  }
  return (
    <div className="space-y-5 text-[14px]">
      {items.length === 0 && e.reasons.length === 0 && !e.review_notes && <p className="text-staff-muted">No matching evidence on file for this course.</p>}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span><span className="font-medium text-staff-ink">{it.title}</span><span className="block text-staff-ink2">{it.body}</span></span>
            </li>
          ))}
        </ul>
      )}
      {e.review_notes && (
        <div>
          <p className="text-staff-muted mb-1.5">Review notes</p>
          <p className="text-staff-ink2 leading-relaxed">{e.review_notes}</p>
        </div>
      )}
      {e.missing_information && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
          <span className="font-medium">Missing information:</span> {e.missing_information}
        </div>
      )}
      {e.rule_sources?.length > 0 && (
        <div>
          <p className="text-staff-muted mb-1.5">Rules applied</p>
          <ul className="space-y-1">
            {e.rule_sources.map(rule => (
              <li key={rule.code} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[12.5px] text-staff-ink">{rule.code}</span>
                <span className="text-staff-ink">{rule.name}</span>
                <span className={`text-[11.5px] font-medium px-1.5 rounded border ${rule.source === 'Problem statement' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-staff-line bg-staff-sunk text-staff-ink2'}`}>{rule.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.reasons.length > 0 && (
        <div>
          <p className="text-staff-muted mb-1.5">Evaluation notes</p>
          <ul className="list-disc pl-5 space-y-1 text-staff-ink2">{e.reasons.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {e.candidates.length > 0 && (
        <div>
          <p className="text-staff-muted mb-1.5">Closest BU courses by content</p>
          <ol className="space-y-1">
            {e.candidates.map((c, i) => (
              <li key={c.code} className="flex gap-2"><span className="text-staff-muted w-4">{i + 1}.</span><span className="font-mono text-staff-ink">{c.code}</span><span className="text-staff-ink2">{c.title}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// One-line cues next to the recommendation: established equivalency, earlier decisions, conflicts
function KnowledgeCues({ k, onConflicts, onPrevious }) {
  if (!k) return null
  const cues = []
  if (k.established?.bu_course) {
    cues.push(
      <span key="est" className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
        <BadgeCheck className="w-3.5 h-3.5" />Established equivalency: {k.established.bu_course}
        {k.established.times_applied > 0 && <span className="font-normal"> · applied {k.established.times_applied}×</span>}
      </span>
    )
  }
  if (k.previous.total > 0) {
    const mc = k.previous.most_common
    cues.push(
      <button key="prev" type="button" onClick={onPrevious} className="inline-flex items-center gap-1.5 text-staff-ink2 bg-staff-sunk border border-staff-line rounded-full px-2.5 py-0.5 hover:border-slate-300">
        <HistoryIcon className="w-3.5 h-3.5" />Previously evaluated {k.previous.total} time{k.previous.total === 1 ? '' : 's'}{mc ? ` · most often ${mc.award}` : ''}
      </button>
    )
  }
  if (k.conflicts.length) {
    cues.push(
      <button key="conf" type="button" onClick={onConflicts} className="inline-flex items-center gap-1.5 text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 hover:border-amber-300">
        <AlertTriangle className="w-3.5 h-3.5" />Potential equivalency conflict
      </button>
    )
  }
  return cues.length ? <div className="flex flex-wrap gap-2 mt-3 text-[12.5px] font-medium">{cues}</div> : null
}

const CONTEXT_COLUMNS = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }

// The evidence on this page in one place, so the evaluator starts from a summary rather than from zero.
// Every line is a fact the API derived from the records; the next step is a suggestion, never a decision.
function EvaluationContext({ brief, onRequestSyllabus, onConflicts, onPrevious }) {
  if (!brief) return null
  const groups = [
    { key: 'supporting', title: 'Supporting evidence', items: brief.supporting, icon: Check, tone: 'text-emerald-600' },
    { key: 'differences', title: 'Differences', items: brief.differences, icon: Minus, tone: 'text-amber-600' },
    { key: 'attention', title: 'Needs attention', items: brief.attention, icon: AlertTriangle, tone: 'text-red-600' }
  ].filter(g => g.items.length)
  const p = brief.precedent
  const precedent = [
    p.established && `Established equivalency ${p.established.bu_course || ''}`.trim(),
    p.same_course.total > 0
      ? `This course: ${p.same_course.total} earlier decision${p.same_course.total === 1 ? '' : 's'} (${p.same_course.outcomes.map(o => `${o.award} ×${o.count}`).join(', ')})`
      : 'This course: not evaluated before',
    p.similar_elsewhere.courses > 0 &&
      `Similar courses elsewhere: ${p.similar_elsewhere.courses} (${p.similar_elsewhere.tally.map(t => `${t.award} ×${t.count}`).join(', ')})`
  ].filter(Boolean)
  const step = brief.next_step
  return (
    <section className="staff-card p-6 sm:p-8 mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5">
        <h2 className="text-[17px] font-semibold text-staff-ink">Evaluation context</h2>
        <p className="text-[12.5px] text-staff-muted">From the course records, the comparison below and earlier decisions</p>
      </div>
      {groups.length === 0 ? (
        <p className="text-[14px] text-staff-muted">No evidence on file for this course yet.</p>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${CONTEXT_COLUMNS[groups.length]}`}>
          {groups.map(g => (
            <div key={g.key} className="min-w-0">
              <p className="text-[13px] font-semibold text-staff-ink2 mb-2">{g.title}</p>
              <ul className="space-y-2">
                {g.items.map((t, i) => (
                  <li key={i} className="flex gap-2 text-[14px] text-staff-ink leading-snug">
                    <g.icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${g.tone}`} />{t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onPrevious} className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-left text-[13px] text-staff-ink2 hover:text-staff-ink">
        <HistoryIcon className="w-4 h-4 text-staff-muted flex-shrink-0 mt-px" />
        {precedent.map((t, i) => <span key={i}>{i > 0 && <span className="text-staff-muted mr-3">·</span>}{t}</span>)}
      </button>
      {step && (
        <div className="mt-5 pt-5 border-t border-staff-line2 flex flex-wrap items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-staff-muted">Suggested next step · the decision is yours</p>
            <p className="text-[14.5px] font-medium text-staff-ink">{step.text}</p>
          </div>
          {step.action === 'request_syllabus' && onRequestSyllabus && (
            <Button size="sm" variant="secondary" onClick={onRequestSyllabus}><MessageSquare className="w-3.5 h-3.5" />Request syllabus</Button>
          )}
          {step.action === 'review_conflict' && (
            <Button size="sm" variant="secondary" onClick={onConflicts}><AlertTriangle className="w-3.5 h-3.5" />Review the conflict</Button>
          )}
        </div>
      )}
    </section>
  )
}

const CHECK_TONES = {
  ok: { icon: Check, cls: 'text-emerald-600' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600' },
  info: { icon: Info, cls: 'text-staff-muted' }
}

// The decision being prepared, checked against the institution's record before it is saved. A guardrail only:
// the evaluator can always confirm.
function ConsistencyCheck({ reviewId, form }) {
  const [state, setState] = useState({ loading: true, data: null })
  const payload = JSON.stringify(decisionPayload(form, ''))
  useEffect(() => {
    let live = true
    setState(s => ({ ...s, loading: true }))
    const t = setTimeout(() => {
      checkReviewDecision(reviewId, JSON.parse(payload))
        .then(res => live && setState({ loading: false, data: res.data }))
        .catch(() => live && setState({ loading: false, data: null }))
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [reviewId, payload])

  if (!state.data) return state.loading ? <p className="text-[12.5px] text-staff-muted">Checking against earlier decisions…</p> : null
  const { status, headline, checks } = state.data
  const box = status === 'review' ? 'border-amber-200 bg-amber-50/60' : status === 'incomplete' ? 'border-staff-line bg-staff-bg' : 'border-emerald-200 bg-emerald-50/50'
  return (
    <div className={`rounded-lg border px-3.5 py-3 ${box} ${state.loading ? 'opacity-70' : ''}`} aria-live="polite">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-staff-ink">
        <ShieldCheck className="w-4 h-4 text-staff-ink2" />Consistency check<span className="font-normal text-staff-ink2">· {headline}</span>
      </p>
      {checks.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {checks.map((c, i) => {
            const tone = CHECK_TONES[c.tone] || CHECK_TONES.info
            return (
              <li key={i} className="flex gap-2 text-[13px] text-staff-ink">
                <tone.icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${tone.cls}`} />
                <span>{c.title}{c.detail && <span className="block text-staff-ink2">{c.detail}</span>}</span>
              </li>
            )
          })}
        </ul>
      )}
      {status === 'review' && <p className="text-[12px] text-staff-muted mt-2">A guardrail, not a rule: you can still confirm this decision.</p>}
    </div>
  )
}

function PreviousDecisions({ k, src, target, elsewhere }) {
  const p = k.previous
  return (
    <div className="space-y-5 text-[14px]">
      {k.established && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <p className="font-medium text-staff-ink">Established equivalency: {k.established.bu_course || k.established.outcome}</p>
          <p className="text-[13px] text-staff-ink2 mt-0.5">
            {[k.established.approved_on && `Since ${formatDate(k.established.approved_on)}`,
              k.established.from_decisions > 0 && `from ${k.established.from_decisions} decisions`,
              k.established.times_applied > 0 && `applied to ${k.established.times_applied} transcript course${k.established.times_applied === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
      {p.total === 0 ? (
        <p className="text-staff-muted">{src?.course_code} has not been evaluated before.</p>
      ) : (
        <div>
          <p className="text-staff-muted mb-2">{src?.course_code} at {src?.institution}: {p.total} earlier decision{p.total === 1 ? '' : 's'}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {p.outcomes.map(o => (
              <span key={o.award} className={`rounded-lg border px-3 py-1.5 ${o.grants_bu_course ? 'border-emerald-200 bg-emerald-50/60' : 'border-staff-line bg-staff-sunk'}`}>
                <span className="font-mono font-semibold text-staff-ink">{o.award}</span>
                <span className="text-staff-muted"> · {o.count}×</span>
              </span>
            ))}
          </div>
          <DecisionList decisions={p.decisions} />
        </div>
      )}
      {k.similar?.length > 0 && (
        <div>
          <p className="text-staff-muted mb-2">Other courses evaluated as {target}</p>
          <ul className="space-y-1">
            {k.similar.map((s, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-staff-ink">{s.course_code}</span>
                <span className="text-staff-muted">{s.institution}</span>
                <span className="text-staff-ink2">→ {s.bu_awarded}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {elsewhere?.courses?.length > 0 && (
        <div>
          <p className="text-staff-muted mb-2">Courses with similar content at other institutions, already decided</p>
          <ul className="divide-y divide-staff-line2 border-y border-staff-line2">
            {elsewhere.courses.map(c => (
              <li key={`${c.institution}|${c.course_code}`} className="py-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <span className="min-w-0">
                  <span className="font-mono text-staff-ink">{c.course_code}</span> <span className="text-staff-ink2">{c.title}</span>
                  <span className="block text-[13px] text-staff-muted">
                    {c.institution} · {c.outcomes.map(o => `${o.award}${o.count > 1 ? ` ×${o.count}` : ''}`).join(', ')}
                  </span>
                </span>
                <span className="text-[12.5px] text-staff-muted tabular-nums whitespace-nowrap">{Math.round(c.similarity * 100)}% content similarity</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DecisionList({ decisions }) {
  return (
    <ul className="divide-y divide-staff-line2 border-y border-staff-line2">
      {decisions.map(d => (
        <li key={d.decision_id} className="py-2.5 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
          <span className="text-staff-muted tabular-nums">{formatDate(d.decided_on)}</span>
          <span>
            <span className="text-staff-ink">{d.decision}{d.bu_awarded && d.bu_awarded !== '—' ? `: ${d.bu_awarded}` : ''}</span>
            <span className="text-staff-muted"> · {d.evaluator || 'Reference record'}</span>
            {d.reason && <span className="block text-[13px] text-staff-ink2">{d.reason}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

const CONFLICT_TITLES = {
  different_bu_course: 'Different BU courses awarded',
  different_outcome: 'Different outcomes',
  match_divergence: 'Very different course-match scores'
}

function Conflicts({ k, src, canAct, onUseEstablished, onOverride, onEscalate }) {
  return (
    <div className="space-y-4 text-[14px]">
      <p className="text-staff-ink2">
        <span className="font-medium text-staff-ink">{src?.institution} · {src?.course_code}</span>
        {k.established?.bu_course && <> · established equivalency <span className="font-mono">{k.established.bu_course}</span></>}
        {' · '}{k.previous.total} earlier decision{k.previous.total === 1 ? '' : 's'}
      </p>
      <ul className="space-y-3">
        {k.conflicts.map(c => (
          <li key={c.type} className="flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span><span className="font-medium text-staff-ink">{CONFLICT_TITLES[c.type] || c.type}</span><span className="block text-staff-ink2">{c.summary}</span></span>
          </li>
        ))}
      </ul>
      {k.previous.decisions.length > 0 && <DecisionList decisions={k.previous.decisions} />}
      {k.escalations?.length > 0 && (
        <p className="text-[13px] text-staff-ink2">Additional review requested by {k.escalations[0].actor} on {formatDate(k.escalations[0].created_at)}.</p>
      )}
      {canAct && (
        <div className="flex flex-wrap gap-2">
          {k.established?.bu_course && (
            <Button size="sm" variant="secondary" onClick={onUseEstablished}><BadgeCheck className="w-3.5 h-3.5" />Use established equivalency</Button>
          )}
          <Button size="sm" variant="secondary" onClick={onOverride}>Override earlier decisions</Button>
          <Button size="sm" variant="secondary" onClick={onEscalate}><Flag className="w-3.5 h-3.5" />Request additional review</Button>
        </div>
      )}
      <p className="text-[12.5px] text-staff-muted">You decide this course. The Credit Evaluation Office marks the conflict resolved or records a standard equivalency for future transcripts.</p>
    </div>
  )
}

function InfoRequests({ requests }) {
  return (
    <ul className="space-y-3 text-[14px]">
      {requests.map(q => (
        <li key={q.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
          <span className="text-staff-muted tabular-nums">{formatDate(q.created_at)}</span>
          <span>
            <span className="text-staff-ink">{q.kind === 'syllabus' ? 'Syllabus requested' : 'Information requested'}</span>
            <span className="text-staff-muted"> · {q.status === 'pending' ? 'waiting on the student' : q.status === 'responded' ? `answered ${formatDate(q.responded_at)}` : 'closed'}</span>
            {q.message && <span className="block text-[13px] text-staff-ink2">{q.message}</span>}
            {q.student_response && <span className="block text-[13px] text-staff-ink"><span className="font-medium">Reply:</span> {q.student_response}</span>}
            {q.document_id && <span className="inline-block mt-1"><DocumentButton id={q.document_id} label={q.document_name || 'Open file'} icon={Paperclip} /></span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function History({ d }) {
  const r = d.review
  const reassigned = (d.assignments || []).length > 1
  const rows = [
    ...d.history.map(h => ({ when: h.created_at, label: activityLabel(h.action), who: h.actor, note: h.details?.reason })),
    ...(reassigned
      // Each holder in turn; an earlier holder's end reason says why it moved on (e.g. handed back: different department)
      ? d.assignments.map(a => ({ when: a.assigned_at, label: `Assigned to ${a.evaluator}`, who: null,
          note: [a.reason, a.ended_at && a.end_reason ? `Ended ${formatDate(a.ended_at)}: ${a.end_reason}` : null].filter(Boolean).join(' · ') }))
      : r.assigned_at ? [{ when: r.assigned_at, label: 'Assigned to you', who: null, note: r.assignment_context?.join(' · ') }] : [])
  ].sort((a, b) => new Date(a.when) - new Date(b.when))
  if (rows.length === 0) return <p className="text-[14px] text-staff-muted">No history yet.</p>
  return (
    <ol className="space-y-3 text-[14px]">
      {rows.map((h, i) => (
        <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
          <span className="text-staff-muted tabular-nums">{formatDate(h.when)}</span>
          <span>
            <span className="text-staff-ink">{h.label}</span>
            {h.who && h.who !== 'System' && <span className="text-staff-muted"> · {h.who}</span>}
            {h.note && <span className="block text-[13px] text-staff-ink2">{h.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
