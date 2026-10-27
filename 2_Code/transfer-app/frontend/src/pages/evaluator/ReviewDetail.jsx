import React, { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowDown, FileText, ChevronDown, Check, X, MessageSquare, CheckCircle2, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { getReview, startReview, decideReview, requestReviewInfo } from '../../api/my'
import StatusPill from '../../components/staff/StatusPill'
import TranscriptDrawer from '../../components/evaluator/TranscriptDrawer'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, matchLabel, formatDate } from '../../lib/reviews'
import { activityLabel } from '../../lib/staffFormat'

const OPEN = ['new', 'in_progress', 'info_requested']
const INFO_SUGGESTIONS = ['Course syllabus', 'Detailed course description', 'Learning outcomes', 'Official transcript']

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
  const [dialog, setDialog] = useState(null) // 'accept' | 'reject' | 'info'
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)

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

  const openDialog = (kind) => { setText(''); setDialog(kind) }

  const submit = async () => {
    setSubmitting(true)
    try {
      if (dialog === 'info') {
        await requestReviewInfo(id, text)
        toast.success('Information requested from the student')
      } else {
        const res = await decideReview(id, dialog, text)
        toast.success(dialog === 'accept' ? 'Equivalency approved' : 'Course rejected')
        if (res.data.transfer) toast(`Application handed to the next evaluator (${res.data.transfer.request_number})`)
      }
      setDialog(null)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'The decision could not be saved')
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
  const { review: r, application: app, source_course: src, target_course: bu, proposed, evidence } = d
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  const isOpen = OPEN.includes(r.status)
  const pct = r.match_score != null ? Math.round(r.match_score * 100) : null
  const mapping = `${src?.course_code} → ${proposed?.award || r.target_bu_course || 'no BU course'}`

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
        </div>
        <Button variant="secondary" onClick={() => setTranscriptOpen(true)}>
          <FileText className="w-4 h-4" />
          View transcript
        </Button>
      </header>

      <StatusBanner d={d} />

      {/* The evaluation */}
      <section className="staff-card p-6 sm:p-8">
        <h2 className="text-[17px] font-semibold text-staff-ink mb-5">Course evaluation</h2>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3 md:gap-5">
          <CourseBox
            label="Transfer course"
            code={src?.course_code}
            title={src?.title}
            meta={[src?.institution, src?.source_credits != null && `${Number(src.source_credits)} credits`, src?.term, src?.grade && `Grade ${src.grade}`]}
          />
          <span className="grid place-items-center text-staff-muted">
            <ArrowRight className="hidden md:block w-6 h-6" />
            <ArrowDown className="md:hidden w-6 h-6" />
          </span>
          {r.target_bu_course ? (
            <CourseBox
              label="Boston University course"
              code={r.target_bu_course}
              title={bu?.title}
              meta={['Boston University', bu?.credits != null && `${Number(bu.credits)} credits`, bu?.program]}
              emphasis
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-staff-line p-5 grid place-items-center text-center">
              <span className="text-[14px] text-staff-muted">No BU course proposed.<br />Review the details and decide.</span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-staff-line2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-4 items-center">
          <div className="text-center sm:text-left">
            <p className="text-[13px] font-medium text-staff-ink2">Course match</p>
            {pct != null ? (
              <>
                <p className="text-[44px] leading-none font-semibold text-staff-ink tabular-nums mt-1">{pct}%</p>
                <p className={`text-[14px] font-semibold mt-1 ${r.match_score >= 0.85 ? 'text-emerald-700' : r.match_score >= 0.65 ? 'text-amber-700' : 'text-red-700'}`}>{matchLabel(r.match_score)}</p>
              </>
            ) : (
              <p className="text-[20px] font-semibold text-staff-muted mt-2">Not scored</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-staff-ink2">Recommendation</p>
            <p className="text-[18px] font-semibold text-staff-ink mt-1">{proposed?.label || 'Evaluator to decide'}</p>
            <p className="text-[14px] text-staff-ink2 mt-1">{basisSentence(r)}</p>
            <button
              type="button"
              onClick={() => { setEvidenceOpen(true); document.getElementById('matching-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className="mt-2 text-[13px] font-semibold text-primary-700 hover:text-primary-800"
            >
              View matching details
            </button>
          </div>
        </div>
      </section>

      {/* Details on demand */}
      <section className="staff-card mt-6 divide-y divide-staff-line2">
        <Disclosure title="Transfer course details">
          <CourseDetails c={src} institution={src?.institution} />
        </Disclosure>
        <Disclosure title="BU course details">
          {bu ? <CourseDetails c={bu} institution="Boston University" /> : <p className="text-[14px] text-staff-muted">No BU course has been proposed for this course.</p>}
        </Disclosure>
        <Disclosure id="matching-details" title="Matching details" open={evidenceOpen} onToggle={setEvidenceOpen}>
          <Evidence evidence={evidence} src={src} bu={bu} />
        </Disclosure>
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
                <p className="text-[13px] font-medium text-staff-muted">Decision</p>
                <p className="text-[15px] font-semibold text-staff-ink truncate font-mono">{mapping}</p>
              </div>
              <span className="sm:hidden flex-1" />
              <Button variant="secondary" onClick={() => openDialog('info')}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Request information</span><span className="sm:hidden">Request info</span>
              </Button>
              <Button variant="secondary" onClick={() => openDialog('reject')} className="!text-red-700 !border-red-200 hover:!bg-red-50">
                <X className="w-4 h-4" />Reject
              </Button>
              <Button onClick={() => openDialog('accept')} disabled={!proposed} title={proposed ? undefined : 'No BU course has been proposed'}>
                <Check className="w-4 h-4" />Accept equivalency
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 text-[15px] text-staff-ink2">This course has been decided.</p>
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
        title={dialog === 'accept' ? 'Approve course equivalency?' : dialog === 'reject' ? 'Reject equivalency' : 'Additional information required'}
        size="sm"
      >
        <div className="space-y-4">
          {dialog === 'accept' && (
            <div className="rounded-lg bg-staff-sunk px-4 py-3">
              <p className="font-mono text-[15px] font-semibold text-staff-ink">{mapping}</p>
              <p className="text-[13px] text-staff-ink2 mt-0.5">{proposed?.label}</p>
            </div>
          )}
          {dialog === 'reject' && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-red-500">*</span></span>
              <textarea
                value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
                placeholder="e.g. Content does not cover the data structures required for CAS CS 112."
                className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </label>
          )}
          {dialog === 'info' && (
            <>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">What information is needed? <span className="text-red-500">*</span></span>
                <textarea
                  value={text} onChange={e => setText(e.target.value)} rows={4} autoFocus
                  placeholder="e.g. Please upload the course syllabus with weekly topics."
                  className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INFO_SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => setText(t => (t ? `${t}${t.endsWith('.') ? '' : ';'} ${s}` : s))}
                    className="text-[12.5px] px-2.5 py-1 rounded-full border border-staff-line text-staff-ink2 hover:bg-staff-sunk">
                    + {s}
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] text-staff-muted">The student is notified and can reply from their status page.</p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submit}
              loading={submitting}
              disabled={dialog !== 'accept' && !text.trim()}
              variant={dialog === 'reject' ? 'danger' : 'primary'}
            >
              {dialog === 'accept' ? 'Confirm approval' : dialog === 'reject' ? 'Reject' : 'Send request'}
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
  const { review: r, decision, info_request: info } = d
  if (decision && ['approved', 'rejected'].includes(r.status)) {
    const approved = r.status === 'approved'
    return (
      <div className={`flex gap-3 rounded-xl px-5 py-4 mb-6 border ${approved ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        {approved ? <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />}
        <div className="text-[14px]">
          <p className="font-semibold text-staff-ink">
            {approved ? `Approved${decision.bu_award ? `: ${decision.bu_award}` : ''}` : 'Rejected: no credit'}
          </p>
          <p className="text-staff-ink2">{[decision.decided_by, formatDate(decision.decided_at)].filter(Boolean).join(' · ')}</p>
          {decision.reason && <p className="text-staff-ink2 mt-1">{decision.reason}</p>}
        </div>
      </div>
    )
  }
  if (r.status === 'info_requested' && info) {
    return (
      <div className="flex gap-3 rounded-xl px-5 py-4 mb-6 border bg-amber-50 border-amber-200">
        <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="text-[14px]">
          <p className="font-semibold text-staff-ink">{info.status === 'responded' ? 'The student has replied' : 'Waiting on the student'}</p>
          <p className="text-staff-ink2">Requested {formatDate(info.created_at)}: {info.message}</p>
          {info.student_response && <p className="text-staff-ink mt-1"><span className="font-medium">Reply:</span> {info.student_response}</p>}
        </div>
      </div>
    )
  }
  return null
}

// Collapsible section; open state can be controlled (Matching details opens from the summary link)
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

function CourseDetails({ c, institution }) {
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
function Evidence({ evidence: e, src, bu }) {
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
  if (src && bu) {
    const s = Number(src.source_credits ?? src.catalog_credits)
    const b = Number(bu.credits)
    if (s && b) items.push({ title: 'Credits', body: `${s} ${src.credit_system ? src.credit_system.toLowerCase() + ' ' : ''}credits at ${src.institution}; ${b} credits at BU.` })
  }
  return (
    <div className="space-y-5 text-[14px]">
      {items.length === 0 && e.reasons.length === 0 && <p className="text-staff-muted">No matching evidence on file for this course.</p>}
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

function History({ d }) {
  const r = d.review
  const rows = [
    ...d.history.map(h => ({ when: h.created_at, label: activityLabel(h.action), who: h.actor, note: h.details?.reason })),
    ...(r.assigned_at ? [{ when: r.assigned_at, label: 'Assigned to you', who: null, note: r.assignment_reason }] : [])
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
