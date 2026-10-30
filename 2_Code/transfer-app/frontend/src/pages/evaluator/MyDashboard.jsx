import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2, ArrowRight, Inbox, Timer, CircleCheckBig, GitCompare, ListChecks, Activity, ClipboardCheck, FileSearch, Flame } from 'lucide-react'
import { getMyDashboard, getMyCounts } from '../../api/my'
import PeriodCounts from '../../components/staff/PeriodCounts'
import { useAuth } from '../../hooks/useAuth'
import PageHeader, { BannerAction } from '../../components/staff/PageHeader'
import Metric, { MetricBadge } from '../../components/staff/Metric'
import { SectionTitle, ActivityTimeline } from '../../components/staff/Section'
import StatusPill from '../../components/staff/StatusPill'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS } from '../../lib/reviews'
import { greeting } from '../../lib/staffFormat'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Counted per course by the API; "now" cards are current work, the others follow the chosen period
const EVALUATOR_CARDS = [
  { key: 'assigned', stage: 'received', label: 'Assigned' },
  { key: 'not_started', stage: 'progress', label: 'Not started', now: true, to: '/evaluator/my-evaluations?status=new' },
  { key: 'in_progress', stage: 'progress', label: 'In progress', now: true, to: '/evaluator/my-evaluations?status=in_progress' },
  { key: 'needs_review', stage: 'progress', label: 'Needs review', now: true, detail: () => 'student replied or returned' },
  { key: 'completed', stage: 'done', label: 'Completed', to: '/evaluator/my-evaluations?status=completed' }
]

export default function MyDashboard() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })

  const load = useCallback(async () => {
    try {
      const res = await getMyDashboard()
      setState({ loading: false, data: res.data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (state.loading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) return <div className="staff-card"><EmptyState title="Your dashboard could not be loaded" description={state.error} action={load} actionLabel="Try Again" /></div>

  const { counts: c, up_next: attention, recent_activity: activity } = state.data
  const d = state.data
  const firstName = (user?.full_name || '').replace(/^(Dr|Prof)\.?\s+/i, '').split(' ')[0]
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const highPriority = attention.filter(r => r.priority === 'high').length
  const capacity = d.profile?.max_concurrent_cases

  return (
    <div className="space-y-8">
      <PageHeader
        banner
        eyebrow={today}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={c.open > 0 ? `${plural(c.open, 'course')} ${c.open === 1 ? 'needs' : 'need'} your review.${highPriority ? ` ${highPriority} high priority.` : ''}` : "You're all caught up."}
        actions={<>
          <BannerAction as={Link} to="/evaluator/my-evaluations" solid>
            <span className="w-6 h-6 rounded-full bg-red-50 text-brand grid place-items-center"><ClipboardCheck className="w-3.5 h-3.5" /></span>My evaluations
          </BannerAction>
          <BannerAction as={Link} to="/evaluator/lookup">
            <span className="w-6 h-6 rounded-full bg-white/20 grid place-items-center"><FileSearch className="w-3.5 h-3.5" /></span>Evaluation lookup
          </BannerAction>
        </>}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="New" value={c.new} detail={c.upcoming ? `${c.upcoming} more coming after other reviews` : 'Assigned, not yet opened'} to="/evaluator/my-evaluations?status=new" icon={Inbox} tone="sky" edge />
        <Metric label="In progress" value={c.in_progress + c.info_requested} detail={c.info_requested ? `${c.info_requested} waiting on the student` : 'Opened and under review'} to="/evaluator/my-evaluations?status=in_progress" icon={Timer} tone="amber" edge />
        <Metric label="Completed" value={c.completed} detail={`${c.completed_this_month} this month`} to="/evaluator/my-evaluations?status=completed" icon={CircleCheckBig} tone="emerald" edge />
        <Metric
          label="Workload" tone="violet" edge
          value={capacity ? `${c.open} / ${capacity}` : c.open}
          ring={capacity ? { value: c.open, max: capacity } : null}
          detail={capacity ? `${Math.round((c.open / capacity) * 100)}% of capacity` : (c.conflicts ? `${plural(c.conflicts, 'course')} with a potential equivalency conflict` : 'No potential equivalency conflicts')}
          badge={capacity && (c.conflicts
            ? <MetricBadge tone="red" icon={GitCompare}>{plural(c.conflicts, 'possible conflict')}</MetricBadge>
            : <MetricBadge tone="emerald">No conflicts</MetricBadge>)}
        />
      </div>

      <PeriodCounts title="My courses by period" subtitle="Assigned to you, by where each course is now" fetchCounts={getMyCounts} cards={EVALUATOR_CARDS}
        bar={[{ key: 'not_started', tone: 'sky' }, { key: 'in_progress', tone: 'amber' }, { key: 'needs_review', tone: 'slate' }, { key: 'completed', tone: 'emerald' }]} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        <section className="staff-card">
          <SectionTitle icon={ListChecks} title="Needs your attention"
            right={c.open > attention.length && (
              <Link to="/evaluator/my-evaluations" className="text-[13px] font-semibold text-primary-700 hover:text-primary-800">View all {c.open}</Link>
            )} />
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-6 text-[15px] text-staff-ink2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Nothing is waiting for you. New assignments appear here.
            </div>
          ) : (
            <ul className="divide-y divide-staff-line2">
              {attention.map(r => <AttentionRow key={r.id} r={r} />)}
            </ul>
          )}
          {attention.length > 0 && (
            <div className="px-6 py-4 border-t border-staff-line2">
              <Link to={`/evaluator/reviews/${attention[0].id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
                Start with the first one<ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </section>

        <section className="staff-card">
          <SectionTitle icon={Activity} tone="sky" title="Recent activity" />
          {activity.length === 0 ? (
            <p className="px-6 py-6 text-sm text-staff-muted">Your assignments and decisions will appear here.</p>
          ) : (
            <ActivityTimeline rows={activity.map(a => ({ ...a, action: a.kind }))} context={a => a.reference_number || ''} />
          )}
        </section>
      </div>
    </div>
  )
}

const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

// One piece of work: who, which course mapping, and why it's here
function AttentionRow({ r }) {
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  const tag = r.info_status === 'responded' ? 'Student replied'
    : r.transferred_from ? `Handed over by ${r.transferred_from}`
    : r.priority === 'high' ? 'High priority' : null
  return (
    <li>
      <Link to={`/evaluator/reviews/${r.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg">
        <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${r.priority === 'high' ? 'bg-red-500' : 'bg-transparent'}`} aria-hidden="true" />
        <span className={`w-10 h-10 rounded-full grid place-items-center text-[13px] font-semibold flex-shrink-0 ${r.priority === 'high' ? 'bg-red-50 text-brand' : 'bg-sky-50 text-sky-700'}`} aria-hidden="true">{initials(r.student_name)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-medium text-staff-ink">
            <span className="truncate">{r.student_name}</span>
            {tag && <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-full px-2 py-0.5 ${r.priority === 'high' && tag === 'High priority' ? 'text-red-700 bg-red-50' : 'text-amber-800 bg-amber-50'}`}>{tag === 'High priority' && <Flame className="w-3 h-3" />}{tag}</span>}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-staff-muted min-w-0">
            <span className="font-mono rounded bg-staff-sunk px-1.5 py-0.5 text-staff-ink2">{r.course_code}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" /><span className="sr-only">to</span>
            <span className={`font-mono rounded px-1.5 py-0.5 truncate ${r.target_bu_course ? 'bg-red-50 text-brand' : 'bg-staff-sunk text-staff-muted'}`}>{r.target_bu_course || 'to be determined'}</span>
            <span className="hidden sm:inline ml-1">{r.reference_number}</span>
          </span>
        </span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <ChevronRight className="w-4 h-4 text-staff-muted flex-shrink-0" />
      </Link>
    </li>
  )
}
