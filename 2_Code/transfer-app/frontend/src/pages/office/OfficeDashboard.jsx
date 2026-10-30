import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Stamp, Inbox, Copy, CalendarClock, ArrowRight, CheckCircle2, GitCompare, Flag, Building2, Sparkles, BadgeCheck, FileText, Activity } from 'lucide-react'
import notify from '../../lib/notify'
import { getOfficeOverview, placeOfficeQueue, processExistingApplications } from '../../api/office'
import { useAuth } from '../../hooks/useAuth'
import PageHeader, { BannerAction } from '../../components/staff/PageHeader'
import Metric, { MetricBadge } from '../../components/staff/Metric'
import { SectionTitle, ActivityTimeline } from '../../components/staff/Section'
import StatusPill from '../../components/staff/StatusPill'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { greeting } from '../../lib/staffFormat'
import { initials } from '../../lib/reviews'
import ImpactPanel from '../../components/staff/ImpactPanel'

// The Credit Evaluation Office's working view: what to post, what to place, what to resolve. Every number comes
// from /api/office/overview.
export default function OfficeDashboard() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [placing, setPlacing] = useState(false)
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const res = await getOfficeOverview()
      setState({ loading: false, data: res.data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const place = async () => {
    setPlacing(true)
    try {
      const res = await placeOfficeQueue()
      notify.success(res.data.placed ? `${res.data.placed} course${res.data.placed === 1 ? '' : 's'} assigned to evaluators` : 'No queued course has a qualified evaluator yet')
      load()
    } catch (err) {
      notify.error(err.response?.data?.message || 'Courses could not be placed')
    } finally {
      setPlacing(false)
    }
  }

  const processExisting = async () => {
    setProcessing(true)
    try {
      const res = await processExistingApplications()
      const r = res.data
      notify.success(`${r.applications} evaluations checked: ${r.established_applied} courses settled by established equivalencies, ${r.reviews_created} assigned, ${r.duplicates_flagged} possible duplicates`)
      load()
    } catch (err) {
      notify.error(err.response?.data?.message || 'Existing evaluations could not be processed')
    } finally {
      setProcessing(false)
    }
  }

  const d = state.data
  if (state.loading && !d) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) return <div className="staff-card"><EmptyState title="The Credit Office overview could not be loaded" description={state.error} action={load} actionLabel="Try Again" /></div>

  const c = d.counts
  const firstName = (user?.full_name || '').split(' ')[0]

  return (
    <div className="space-y-8">
      <PageHeader
        banner
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        title="Credit Evaluation Office"
        subtitle="Process each evaluation's courses, place the ones without a specialist, and post decided transfer credit."
        actions={<>
          <Button size="sm" variant="secondary" onClick={processExisting} loading={processing} title="Apply established equivalencies, duplicate checks and assignment to evaluations processed earlier">Process existing evaluations</Button>
          <BannerAction as={Link} to="/admin/applications"><span className="w-6 h-6 rounded-full bg-white/20 grid place-items-center"><ArrowRight className="w-3.5 h-3.5" /></span>All applications</BannerAction>
        </>}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Awaiting final review" value={c.ready_for_posting} detail={`fully decided · ${c.applications_with_unposted} evaluations have decided courses`} icon={Stamp} tone="emerald" badge={c.ready_for_posting > 0 && <MetricBadge tone="emerald">Ready to post</MetricBadge>} />
        <Metric label="With departments" value={c.in_department_review} detail={`${c.queued_reviews} queued for a hand-off`} icon={Building2} tone="amber" />
        <Metric label="Settled without department work" value={c.established_applied + c.policy_applied} detail={`${c.established_applied} established equivalencies · ${c.policy_applied} policy outcomes`} icon={Sparkles} tone="violet"
          bar={[{ value: c.established_applied, tone: 'violet', label: 'established' }, { value: c.policy_applied, tone: 'sky', label: 'policy' }]} />
        <Metric label="Credits posted" value={c.credits_posted} detail={`${c.courses_posted} courses · ${c.completed_applications} evaluations complete`} icon={BadgeCheck} tone="sky" />
      </div>

      <ImpactPanel impact={d.impact} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-6">
          <FinalReview rows={d.ready_to_post} total={c.applications_with_unposted} />

          <section className="staff-card">
            <SectionTitle
              icon={Inbox}
              title={<>Unassigned reviews <span className="text-staff-muted font-normal">({d.office_queue.length})</span></>}
              right={d.office_queue.length > 0 && <Button size="sm" variant="secondary" onClick={place} loading={placing}>Assign where possible</Button>}
            />
            {d.office_queue.length === 0 ? (
              <p className="flex items-center gap-2 px-6 py-5 text-[14px] text-staff-ink2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />Every course has an evaluator.</p>
            ) : (
              <ul className="divide-y divide-staff-line2">
                {d.office_queue.map((r, i) => (
                  <li key={r.id || i}>
                    <Link to={`/office/applications/${r.application_id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-staff-bg">
                      <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${r.needs_reassignment ? 'bg-amber-400' : 'bg-red-500'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-staff-ink truncate"><span className="font-mono font-medium">{r.course_code}</span> {r.title}</span>
                        <span className="block text-[12.5px] text-staff-muted truncate">{r.institution} · <span className="font-mono">{r.reference_number}</span> · {r.student_name}</span>
                        <span className={`block text-[12.5px] font-medium truncate ${r.needs_reassignment ? 'text-amber-800' : 'text-rose-800'}`} title={r.assignment_reason || ''}>
                          {r.needs_reassignment ? `Reassignment required: ${r.evaluator_name} is unavailable` : r.reason_category}
                        </span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-staff-muted flex-shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <NeedsDecision d={d} c={c} />

          <section className="staff-card">
            <SectionTitle icon={Activity} tone="sky" title="Recent activity" />
            {d.recent_activity.length === 0 ? (
              <p className="px-6 py-6 text-sm text-staff-muted">No activity yet.</p>
            ) : (
              <ActivityTimeline rows={d.recent_activity.slice(0, 6)} context={r => [r.reference_number, r.actor].filter(Boolean).join(' · ')} />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// Final review groups, from each row's application status (only the rows already loaded are filtered)
const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'evaluators', label: 'With evaluators' },
  { key: 'info', label: 'Info' }
]
const groupOf = a => (a.status === 'ready_for_posting' ? 'ready' : a.status === 'information_required' ? 'info' : 'evaluators')

// Evaluations with decided courses not yet posted: how far each is to posting, and where to take it next.
// Posting itself happens on the application page.
function FinalReview({ rows, total }) {
  const [group, setGroup] = useState('all')
  const counts = rows.reduce((acc, a) => { acc[groupOf(a)] += 1; return acc }, { all: rows.length, ready: 0, evaluators: 0, info: 0 })
  const shown = group === 'all' ? rows : rows.filter(a => groupOf(a) === group)
  const groups = GROUPS.filter(g => g.key === 'all' || counts[g.key] > 0)

  return (
    <section className="staff-card">
      <SectionTitle
        icon={Stamp}
        title={<>Final review <span className="text-staff-muted font-normal">({total ?? rows.length})</span></>}
        right={groups.length > 2 && (
          <span className="hidden sm:flex rounded-lg bg-staff-sunk p-1 text-[12.5px]" role="group" aria-label="Show evaluations">
            {groups.map(g => (
              <button key={g.key} type="button" onClick={() => setGroup(g.key)} aria-pressed={group === g.key}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap ${group === g.key ? 'bg-white text-staff-ink font-medium shadow-sm' : 'text-staff-muted hover:text-staff-ink'}`}>
                {g.label} <span className="tabular-nums">{counts[g.key]}</span>
              </button>
            ))}
          </span>
        )}
      />
      {shown.length === 0 ? (
        <p className="flex items-center gap-2 px-6 py-5 text-[14px] text-staff-ink2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />No decided courses are waiting to be posted.</p>
      ) : (
        <ul className="divide-y divide-staff-line2">
          {shown.map((a, i) => <li key={a.id || i}><FinalReviewRow a={a} /></li>)}
        </ul>
      )}
    </section>
  )
}

function FinalReviewRow({ a }) {
  const duplicate = a.duplicate_status === 'suspected'
  const ready = groupOf(a) === 'ready'
  const pending = Math.max(0, a.courses - a.decided_unposted - a.posted)
  const tint = duplicate ? 'bg-amber-50 text-amber-800' : ready ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
  const share = n => `${a.courses > 0 ? Math.min(100, (n / a.courses) * 100) : 0}%`
  return (
    <Link to={`/office/applications/${a.id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-6 py-3 hover:bg-staff-bg">
      <span className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-semibold flex-shrink-0 ${tint}`} aria-hidden="true">{initials(a.student_name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-staff-ink">{a.student_name}</span>
        <span className="block text-[12.5px] text-staff-muted truncate"><span className="font-mono">{a.reference_number}</span> · {a.transfer_from_institution}</span>
        {duplicate && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 whitespace-nowrap"><Copy className="w-3 h-3" aria-hidden="true" />Possible duplicate</span>}
      </span>
      <span className="w-full sm:w-44 flex-shrink-0" title={`${a.decided_unposted} ready to post, ${a.posted} posted, ${pending} still pending, of ${a.courses} courses`}>
        <span className="flex h-1.5 rounded-full bg-staff-line2 overflow-hidden" aria-hidden="true">
          <span className="bg-slate-400" style={{ width: share(a.posted) }} />
          <span className="bg-emerald-500" style={{ width: share(a.decided_unposted) }} />
          <span className="bg-amber-400" style={{ width: share(pending) }} />
        </span>
        {/* What the bar shows, by colour: ready to post, already posted, still with departments */}
        <span className="mt-1 flex flex-wrap gap-x-2.5 text-[11.5px] tabular-nums leading-snug">
          <span className="inline-flex items-center gap-1 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />{a.decided_unposted} to post</span>
          {a.posted > 0 && <span className="inline-flex items-center gap-1 text-staff-muted"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />{a.posted} posted</span>}
          {pending > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />{pending} pending</span>}
          <span className="text-staff-muted">of {a.courses}</span>
        </span>
      </span>
      <span className="flex-shrink-0 sm:w-[172px] flex sm:justify-end">
        {duplicate ? (
          <span className="inline-flex items-center rounded-lg border border-staff-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-staff-ink">Resolve first</span>
        ) : ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap"><Stamp className="w-3.5 h-3.5" aria-hidden="true" />Review &amp; post</span>
        ) : (
          <StatusPill status={a.status} />
        )}
      </span>
    </Link>
  )
}

// Escalations, possible duplicates and deadline issues, then the syllabus counts
function NeedsDecision({ d, c }) {
  const open = d.escalations.length + d.duplicates.length + d.deadlines.length
  return (
    <section className="staff-card">
      <SectionTitle icon={GitCompare} tone="amber" title="Needs a decision"
        right={open > 0 && <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-700 tabular-nums" aria-label={`${open} open`}>{open}</span>} />
      <ul className="divide-y divide-staff-line2 text-[13.5px]">
        {d.escalations.map((e, i) => (
          <DecisionRow key={`esc-${i}`} to="/admin/conflicts" stripe="bg-amber-400" title={<span className="inline-flex items-center gap-1.5"><Flag className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />Escalation · {e.institution} {e.course_code}</span>} detail={`${e.raised_by}${e.note ? `: ${e.note}` : ''}`} />
        ))}
        {d.duplicates.map(a => (
          <DecisionRow key={a.id} to={`/office/applications/${a.id}`} stripe="bg-amber-400" title={<span className="inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />Possible duplicate · {a.reference_number}</span>} detail={a.duplicate_reason} />
        ))}
        {d.deadlines.map(a => (
          <DecisionRow key={a.id} to={`/office/applications/${a.id}`} stripe={a.status === 'passed' ? 'bg-red-500' : 'bg-amber-400'}
            title={<span className="inline-flex items-center gap-1.5"><CalendarClock className={`w-3.5 h-3.5 ${a.status === 'passed' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />{a.status === 'passed' ? 'Transfer deadline passed' : 'Transfer deadline approaching'} · {a.reference_number}</span>}
            detail={`${a.student_name} · started ${a.start_term} · deadline ${a.deadline}${a.status === 'passed' ? (a.exception ? ' · exception recorded' : ' · needs an exception to post') : ` · ${a.days_left} days left`}`} />
        ))}
        <DecisionRow to="/admin/conflicts" stripe="bg-staff-line" title="Equivalency conflicts" detail="Review earlier decisions that disagree and set the standard." />
        {!open && (
          <li className="flex items-center gap-2 px-6 py-3.5 text-staff-ink2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />No escalations, duplicates or deadline issues.</li>
        )}
      </ul>
      <div className="px-6 py-4 border-t border-staff-line2">
        <p className="staff-eyebrow flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" aria-hidden="true" />Syllabi</p>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-amber-50/60 px-3 py-2.5"><p className="font-display tabular-nums text-[22px] font-semibold text-amber-700 leading-none">{c.syllabi_pending}</p><p className="text-[12px] text-staff-ink2 mt-1">waiting on students</p></div>
          <div className="rounded-lg bg-emerald-50/60 px-3 py-2.5"><p className="font-display tabular-nums text-[22px] font-semibold text-emerald-700 leading-none">{c.syllabi_received}</p><p className="text-[12px] text-staff-ink2 mt-1">received, in review</p></div>
        </div>
      </div>
    </section>
  )
}

function DecisionRow({ to, stripe, title, detail }) {
  return (
    <li>
      <Link to={to} className="flex gap-3 px-6 py-3.5 hover:bg-staff-bg">
        <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${stripe}`} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block font-medium text-staff-ink">{title}</span>
          <span className="block text-[12.5px] text-staff-muted">{detail}</span>
        </span>
      </Link>
    </li>
  )
}
