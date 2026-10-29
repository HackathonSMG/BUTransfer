import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react'
import { getMyDashboard, getMyCounts } from '../../api/my'
import PeriodCounts from '../../components/staff/PeriodCounts'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/staff/PageHeader'
import Metric from '../../components/staff/Metric'
import StatusPill from '../../components/staff/StatusPill'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS } from '../../lib/reviews'
import { greeting, timeAgo, activityLabel } from '../../lib/staffFormat'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Counted per course by the API; "now" cards are current work, the others follow the chosen period
const EVALUATOR_CARDS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'not_started', label: 'Not started', now: true, to: '/evaluator/my-evaluations?status=new' },
  { key: 'in_progress', label: 'In progress', now: true, to: '/evaluator/my-evaluations?status=in_progress' },
  { key: 'needs_review', label: 'Needs review', now: true, detail: () => 'student replied or returned' },
  { key: 'completed', label: 'Completed', to: '/evaluator/my-evaluations?status=completed' }
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

  return (
    <div className="space-y-8">
      <PageHeader
        banner
        eyebrow={today}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={c.open > 0 ? `${plural(c.open, 'course')} ${c.open === 1 ? 'needs' : 'need'} your review.` : "You're all caught up."}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="New" value={c.new} detail={c.upcoming ? `${c.upcoming} more coming after other reviews` : 'Assigned, not yet opened'} to="/evaluator/my-evaluations?status=new" accent={c.new > 0} />
        <Metric label="In progress" value={c.in_progress + c.info_requested} detail={c.info_requested ? `${c.info_requested} waiting on the student` : 'Opened and under review'} to="/evaluator/my-evaluations?status=in_progress" />
        <Metric label="Completed" value={c.completed} detail={`${c.completed_this_month} this month`} to="/evaluator/my-evaluations?status=completed" />
        <Metric
          label="Workload"
          value={d.profile?.max_concurrent_cases ? `${c.open} / ${d.profile.max_concurrent_cases}` : c.open}
          detail={c.conflicts ? `${plural(c.conflicts, 'course')} with a potential equivalency conflict` : 'No potential equivalency conflicts'}
        />
      </div>

      <PeriodCounts title="My courses by period" fetchCounts={getMyCounts} cards={EVALUATOR_CARDS} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        <section className="staff-card">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-[17px] font-semibold text-staff-ink">Needs your attention</h2>
            {c.open > attention.length && (
              <Link to="/evaluator/my-evaluations" className="text-[13px] font-semibold text-primary-700 hover:text-primary-800">View all {c.open}</Link>
            )}
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-6 pb-6 text-[15px] text-staff-ink2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Nothing is waiting for you. New assignments appear here.
            </div>
          ) : (
            <ul className="divide-y divide-staff-line2 border-t border-staff-line2">
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
          <h2 className="px-6 pt-5 pb-3 text-[17px] font-semibold text-staff-ink">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-staff-muted">Your assignments and decisions will appear here.</p>
          ) : (
            <ul className="border-t border-staff-line2">
              {activity.map((a, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-6 py-3 text-[14px]">
                  <span className="min-w-0">
                    <span className="block text-staff-ink truncate">{activityLabel(a.kind)}</span>
                    {a.reference_number && <span className="block text-[12.5px] text-staff-muted">{a.reference_number}</span>}
                  </span>
                  <span className="text-[12.5px] text-staff-muted whitespace-nowrap">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// One piece of work: who, which course mapping, and why it's here
function AttentionRow({ r }) {
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  const tag = r.info_status === 'responded' ? 'Student replied'
    : r.transferred_from ? `Handed over by ${r.transferred_from}`
    : r.priority === 'high' ? 'High priority' : null
  return (
    <li>
      <Link to={`/evaluator/reviews/${r.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-medium text-staff-ink">
            <span className="truncate">{r.student_name}</span>
            {tag && <span className="flex-shrink-0 text-[11.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{tag}</span>}
          </span>
          <span className="block text-[13px] text-staff-muted mt-0.5">
            <span className="font-mono">{r.course_code}</span>
            <span> → </span>
            <span className="font-mono text-staff-ink2">{r.target_bu_course || 'to be determined'}</span>
            <span className="hidden sm:inline"> · {r.reference_number}</span>
          </span>
        </span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <ChevronRight className="w-4 h-4 text-staff-muted flex-shrink-0" />
      </Link>
    </li>
  )
}
