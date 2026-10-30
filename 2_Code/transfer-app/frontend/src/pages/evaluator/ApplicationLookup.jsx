import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, FileSearch, ChevronRight, Info, History, ArrowRight, Copy, Check, AlertTriangle } from 'lucide-react'
import { listApplications } from '../../api/applications'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/staff/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { pendingFor, formatDateTime } from '../../lib/staffFormat'

// Stage tones match ownership.service STAGES (labels come from there too, via the row's stage)
const STAGE = {
  draft: ['Draft', 'neutral'], processing: ['Processing', 'neutral'], needs_attention: ['Needs Attention', 'bad'],
  unassigned: ['Unassigned', 'bad'], reassignment_required: ['Reassignment Required', 'bad'],
  pending_review: ['Pending Evaluator Review', 'info'], in_review: ['In Review', 'info'],
  waiting_for_applicant: ['Waiting for Student', 'warn'], credit_office_review: ['Credit Office Review', 'info'],
  completed: ['Completed', 'ok'], closed: ['Closed', 'neutral']
}
export const stageOf = (key) => STAGE[key] || [key || 'Unknown', 'neutral']

// One colour per stage, the same on the stage bar, the row stripes and the pills: red needs the office, sky with
// evaluators, amber in review or waiting, violet with the Credit Office, green done, grey not started or closed
const STAGE_COLOR = {
  needs_attention: { bar: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
  unassigned: { bar: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
  reassignment_required: { bar: 'bg-rose-400', pill: 'bg-rose-50 text-rose-800' },
  processing: { bar: 'bg-slate-400', pill: 'bg-staff-sunk text-staff-ink2' },
  pending_review: { bar: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800' },
  in_review: { bar: 'bg-amber-400', pill: 'bg-amber-50 text-amber-800' },
  waiting_for_applicant: { bar: 'bg-amber-200', pill: 'bg-amber-50/60 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-200 ring-1 ring-amber-400' },
  credit_office_review: { bar: 'bg-violet-500', pill: 'bg-violet-50 text-violet-800' },
  completed: { bar: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800' },
  closed: { bar: 'bg-slate-300', pill: 'bg-staff-sunk text-staff-muted' },
  draft: { bar: 'bg-slate-300', pill: 'bg-staff-sunk text-staff-ink2' }
}
export const stageColor = (key) => STAGE_COLOR[key] || STAGE_COLOR.draft
export const ATTENTION_STAGES = ['needs_attention', 'unassigned', 'reassignment_required']

/** The stage as a pill with its colour dot; the label carries the meaning, the colour only repeats it. */
export function StagePill({ stage, className = '' }) {
  const [label] = stageOf(stage)
  const c = stageColor(stage)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${c.pill} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot || c.bar}`} aria-hidden="true" />{label}
    </span>
  )
}

export function DuplicatePill({ short = false }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap bg-amber-50 text-amber-800">
      <Copy className="w-3 h-3" aria-hidden="true" />{short ? 'Duplicate?' : 'Possible duplicate'}
    </span>
  )
}

export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()

// Recently opened evaluations, kept in this browser only; the page works the same without storage
const RECENT_KEY = 'staff.lookup.recent'
function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 5) : [] } catch { return [] }
}
function saveRecent(row) {
  try {
    const next = [{ id: row.id, ref: row.reference_number, name: row.student_name }, ...readRecent().filter(r => r.id !== row.id)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    return next
  } catch { return readRecent() }
}

// What the search box seems to hold, shown beside it (the server searches every field either way)
const kindOf = (q) => (q.includes('@') ? 'Email' : /^[a-z]{2,4}-?\d/i.test(q) ? 'Transfer Credit ID' : 'Name')

// "Where is this application, and who has it?" Searches by application number, applicant name or email on the
// server. Evaluators find the applications they have (or had) a course on, the same scope as the details page.
export default function ApplicationLookup() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') || '')
  const [state, setState] = useState({ loading: false, rows: null, total: 0, error: null })
  const [selectedId, setSelectedId] = useState(null)
  const [recent, setRecent] = useState(readRecent)
  const q = text.trim()

  useEffect(() => {
    if (q.length < 2) { setState({ loading: false, rows: null, total: 0, error: null }); return }
    setState(s => ({ ...s, loading: true }))
    const t = setTimeout(async () => {
      setParams(q ? { q } : {}, { replace: true })
      try {
        const res = await listApplications({ search: q, limit: 25, sort: 'pending_since', order: 'asc' })
        setState({ loading: false, rows: res.data || [], total: res.meta?.total || 0, error: null })
      } catch (err) {
        setState({ loading: false, rows: null, total: 0, error: err.response?.data?.message || 'The search could not be completed.' })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const detailsPath = (id) => (user?.role === 'evaluator' ? `/evaluator/applications/${id}` : `/office/applications/${id}`)
  const rows = state.rows || []
  const selected = rows.find(r => r.id === selectedId) || rows[0]
  const students = new Set(rows.map(r => (r.student_email || r.student_name || '').toLowerCase())).size
  const remember = (row) => setRecent(saveRecent(row))

  return (
    <div className="space-y-5">
      <PageHeader title="Evaluation Lookup" subtitle="Find where a transfer credit evaluation is and who has it now" />

      {/* One large search: Transfer Credit IDs, names and email addresses */}
      <section className="rounded-2xl bg-white border border-staff-line shadow-card p-2">
        <label htmlFor="lookup" className="sr-only">Transfer Credit ID, student name or email</label>
        <div className="flex items-center gap-3 px-3 sm:px-4 h-14">
          <Search className="w-5 h-5 text-brand flex-shrink-0" aria-hidden="true" />
          <input
            id="lookup"
            type="search"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Transfer Credit ID, student name or email"
            className="flex-1 min-w-0 h-full bg-transparent text-[17px] text-staff-ink placeholder:text-staff-muted focus:outline-none"
          />
          {q.length >= 2 && <span className="hidden sm:inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium bg-staff-sunk text-staff-ink2 whitespace-nowrap">{kindOf(q)}</span>}
          {state.loading && <Spinner size="sm" className="text-primary-600" />}
        </div>
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-staff-muted">
          {recent.length > 0 && (
            <>
              <span>Recent</span>
              {recent.map(r => (
                <button key={r.id} type="button" onClick={() => setText(r.ref || r.name || '')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-staff-line bg-white px-2 py-0.5 text-[12px] font-medium text-staff-ink2 hover:border-slate-300 hover:text-staff-ink">
                  <History className="w-3 h-3" aria-hidden="true" /><span className="font-mono">{r.ref}</span>{r.name && <span className="max-w-[10rem] truncate">{r.name}</span>}
                </button>
              ))}
            </>
          )}
          {user?.role === 'evaluator'
            ? <span className="sm:ml-auto flex items-center gap-1.5"><Info className="w-3.5 h-3.5" aria-hidden="true" />Shows evaluations with a course assigned to you, now or earlier.</span>
            : <span className="sm:ml-auto">Try a Transfer Credit ID, a name or an email</span>}
        </div>
      </section>

      {q.length < 2 ? (
        <section className="staff-card">
          <EmptyState icon={FileSearch} title="Search for an evaluation" description="Enter at least two characters of a Transfer Credit ID (e.g. APP-2026-0012), student name or email address." />
        </section>
      ) : state.loading && !state.rows ? (
        <section className="staff-card flex justify-center py-16"><Spinner size="lg" className="text-primary-600" /></section>
      ) : state.error ? (
        <section className="staff-card"><EmptyState icon={FileSearch} title="Search failed" description={state.error} /></section>
      ) : !rows.length ? (
        <section className="staff-card">
          <EmptyState icon={FileSearch} title="No evaluations found" description={`Nothing matches "${q}". Check the spelling, or try the student's email or the full Transfer Credit ID.`} />
        </section>
      ) : (
        // Results and, on wide screens, a preview of the selected one beside them
        <section className="grid lg:grid-cols-[1fr_1.15fr] gap-5 items-start">
          <div className="staff-card overflow-hidden">
            <p className="px-5 py-3 border-b border-staff-line2 text-[13px] text-staff-muted">
              <b className="text-staff-ink">{state.total} evaluation{state.total === 1 ? '' : 's'}</b> match "{q}"
              {state.total > rows.length ? ` · showing ${rows.length}` : ` · ${students} student${students === 1 ? '' : 's'}`}
            </p>
            <ul className="divide-y divide-staff-line2">
              {rows.map(a => (
                <li key={a.id}>
                  {/* Small screens open the report directly; wide screens select the row for the preview */}
                  <Link to={detailsPath(a.id)} onClick={() => remember(a)} className="lg:hidden flex items-center gap-3 px-5 py-3.5 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg">
                    <ResultRow a={a} />
                    <ChevronRight className="w-4 h-4 text-staff-muted flex-shrink-0" aria-hidden="true" />
                  </Link>
                  <button type="button" onClick={() => setSelectedId(a.id)} aria-pressed={selected?.id === a.id}
                    className={`hidden lg:flex w-full text-left items-center gap-3 px-5 py-3.5 focus:outline-none focus-visible:bg-staff-bg ${selected?.id === a.id ? 'bg-red-50/50 ring-1 ring-inset ring-brand/20' : 'hover:bg-staff-bg'}`}>
                    <ResultRow a={a} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selected && <Preview a={selected} to={detailsPath(selected.id)} onOpen={() => remember(selected)} />}
        </section>
      )}
    </div>
  )
}

function ResultRow({ a }) {
  const sub = a.stage === 'draft' ? 'Not submitted' : a.submitted_at ? `Submitted ${formatDateTime(a.submitted_at)}` : null
  return (
    <>
      <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${stageColor(a.stage).bar}`} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-staff-ink truncate">{a.student_name} <span className="font-mono text-[12px] font-normal text-staff-muted">{a.reference_number}</span></span>
        <span className="block text-[12.5px] text-staff-muted truncate">{[sub, a.transfer_from_institution].filter(Boolean).join(' · ') || a.student_email}</span>
      </span>
      <span className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0">
        {a.duplicate_status === 'suspected' && <DuplicatePill short />}
        <StagePill stage={a.stage} />
      </span>
    </>
  )
}

// Received, with the departments, with the Credit Office, posted: where the stage puts the evaluation
const STEPS = ['Received', 'Departments', 'Credit Office', 'Posted']
const stepOf = (stage) => ({
  draft: 0, processing: 0, needs_attention: 0,
  unassigned: 1, reassignment_required: 1, pending_review: 1, in_review: 1, waiting_for_applicant: 1,
  credit_office_review: 2, completed: 4
}[stage])

function Progress({ stage }) {
  const at = stepOf(stage)
  if (at == null) return null
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < at
        const now = i === at
        return (
          <React.Fragment key={s}>
            {i > 0 && <li aria-hidden="true" className={`flex-1 min-w-[1rem] h-px ${done || now ? 'bg-emerald-300' : 'bg-staff-line'}`} />}
            <li className={`inline-flex items-center gap-1.5 ${done ? 'text-emerald-700 font-medium' : now ? 'text-staff-ink font-semibold' : 'text-staff-muted'}`} aria-current={now ? 'step' : undefined}>
              {done
                ? <span className="w-4 h-4 rounded-full bg-emerald-500 text-white grid place-items-center"><Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" /></span>
                : now ? <span className={`w-4 h-4 rounded-full ring-4 ring-staff-sunk ${stageColor(stage).bar}`} aria-hidden="true" />
                  : <span className="w-4 h-4 rounded-full border-2 border-staff-line bg-white" aria-hidden="true" />}
              {s}
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

/** The selected result: who, where it is, who has it, how long it has waited. Only what the search returned. */
function Preview({ a, to, onOpen }) {
  const attention = ATTENTION_STAGES.includes(a.stage)
  const more = (a.owners_count || 0) > 1 ? ` +${a.owners_count - 1} more` : ''
  const withWhom = a.current_owner_name ? `${a.current_owner_name}${more}`
    : a.unassigned_reviews > 0 ? 'Unassigned'
      : a.stage === 'credit_office_review' ? 'Credit Evaluation Office' : '—'
  const courses = a.open_reviews > 0
    ? `${a.open_reviews} open${a.unassigned_reviews > 0 ? ` · ${a.unassigned_reviews} unassigned` : ''}`
    : 'No open courses'
  const about = [a.transfer_to_program, a.expected_start_term && `starts ${a.expected_start_term}`, a.student_email].filter(Boolean)

  return (
    <div className="staff-card overflow-hidden lg:sticky lg:top-4 hidden lg:block">
      <div className="px-6 pt-5 pb-4 flex items-start gap-4">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white grid place-items-center font-semibold flex-shrink-0" aria-hidden="true">{initials(a.student_name)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] text-staff-muted font-mono">{a.reference_number}</p>
          <p className="font-display text-[22px] font-semibold leading-tight text-staff-ink truncate">{a.student_name}</p>
          {about.length > 0 && <p className="text-[13px] text-staff-ink2 truncate">{about.join(' · ')}</p>}
        </div>
        <Link to={to} onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-staff-ink text-white px-3 py-1.5 text-[13px] font-semibold hover:bg-staff-ink2 flex-shrink-0">
          Open report<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mx-6 mb-5 flex flex-wrap items-center gap-2">
        <StagePill stage={a.stage} />
        {a.transfer_from_institution && <span className="text-[12.5px] text-staff-muted">from {a.transfer_from_institution}</span>}
      </div>
      {a.stage !== 'closed' && <div className="mx-6 mb-5"><Progress stage={a.stage} /></div>}

      <div className="mx-6 mb-5 grid grid-cols-3 gap-3">
        <Fact label="With" value={withWhom} detail={a.current_owner_department} tone={attention && !a.current_owner_name ? 'red' : null} />
        <Fact label="Courses" value={courses} detail={a.pending_course ? <>Pending <span className="font-mono">{a.pending_course}</span></> : null} />
        <Fact label="Waiting" value={a.pending_since ? pendingFor(a.pending_since) : '—'} detail={a.pending_since ? `since ${formatDateTime(a.pending_since)}` : null} />
      </div>

      {(a.duplicate_status === 'suspected' || attention) && (
        <div className="mx-6 mb-5 space-y-2">
          {attention && (
            <p className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-[13px] text-red-800 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>Needs the office: {stageOf(a.stage)[0].toLowerCase()}.</span>
            </p>
          )}
          {a.duplicate_status === 'suspected' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-[13px] text-amber-900 flex gap-2.5">
              <Copy className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>Flagged as a possible duplicate of another evaluation. Open the report to see the match.</span>
            </p>
          )}
        </div>
      )}

      <div className="px-6 py-3 border-t border-staff-line2 bg-staff-sunk/50 text-[12.5px] text-staff-muted flex flex-wrap justify-between gap-2">
        <span>{a.submitted_at ? `Submitted ${formatDateTime(a.submitted_at)}` : 'Not submitted yet'}</span>
        {a.evaluator_name && <span>Assigned evaluator: <span className="text-staff-ink2">{a.evaluator_name}</span></span>}
      </div>
    </div>
  )
}

function Fact({ label, value, detail, tone }) {
  return (
    <div className={`rounded-xl p-3 min-w-0 ${tone === 'red' ? 'bg-red-50' : 'bg-staff-sunk'}`}>
      <p className={`staff-eyebrow ${tone === 'red' ? '!text-red-700' : ''}`}>{label}</p>
      <p className={`text-[14px] font-medium mt-1 break-words ${tone === 'red' ? 'text-red-800' : 'text-staff-ink'}`}>{value}</p>
      {detail && <p className="text-[12px] text-staff-muted mt-0.5 break-words">{detail}</p>}
    </div>
  )
}
