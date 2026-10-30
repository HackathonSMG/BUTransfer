import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, UserX, Gauge, MessageSquare, AlertTriangle, ArrowRightLeft, Clock, CheckCircle2, ArrowRight, BarChart3, GitCompare, Stamp, Copy, FileText, Files, Hourglass, BadgeCheck, Users, Flag, Activity } from 'lucide-react'
import notify from '../../lib/notify'
import { getOverview, assignPendingApplications, getAdminCounts } from '../../api/admin'
import PeriodCounts from '../../components/staff/PeriodCounts'
import { useAuth } from '../../hooks/useAuth'
import PageHeader, { BannerAction } from '../../components/staff/PageHeader'
import Metric, { MetricBadge } from '../../components/staff/Metric'
import { SectionTitle, AttentionList, ActivityTimeline } from '../../components/staff/Section'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { greeting } from '../../lib/staffFormat'

// Counted per course or per evaluation by the API; "now" cards are open work, the others follow the chosen period
const ADMIN_CARDS = [
  { key: 'transcripts', stage: 'received', label: 'Transcripts received', detail: c => `${c.evaluations_received} evaluation${c.evaluations_received === 1 ? '' : 's'}` },
  { key: 'courses', stage: 'received', label: 'Courses received' },
  { key: 'pending', stage: 'progress', label: 'Pending evaluations', now: true, detail: () => 'not started' },
  { key: 'in_progress', stage: 'progress', label: 'In progress', now: true },
  { key: 'completed', stage: 'done', label: 'Completed evaluations', detail: c => `${c.completed_by_department} by departments` },
  { key: 'reassigned', stage: 'progress', label: 'Reassigned' },
  { key: 'awaiting_credit_office', stage: 'progress', label: 'Awaiting Credit Office', now: true, detail: c => `${c.awaiting_credit_office_courses} courses`, to: '/office' },
  { key: 'credit_transfers_completed', stage: 'done', label: 'Credit transfers completed', detail: c => `${c.credits_posted} credits posted` }
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const res = await getOverview()
      setState({ loading: false, data: res.data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const assignNow = async () => {
    setAssigning(true)
    try {
      const res = await assignPendingApplications()
      notify.success(`${res.data.courses} course${res.data.courses === 1 ? '' : 's'} assigned across ${res.data.applications} evaluation${res.data.applications === 1 ? '' : 's'}`)
      load()
    } catch (err) {
      notify.error(err.response?.data?.message || 'Courses could not be assigned')
    } finally {
      setAssigning(false)
    }
  }

  const d = state.data
  const firstName = (user?.full_name || '').split(' ')[0]
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  if (state.loading && !d) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  if (state.error) return <div className="staff-card"><EmptyState title="The overview could not be loaded" description={state.error} action={load} actionLabel="Try Again" /></div>

  const n = (s) => d.by_status[s] || 0
  const a = d.attention || {}
  const highWorkload = a.high_workload || []

  // Only what an administrator should act on, each one click from where it's handled
  const items = [
    a.ready_for_posting > 0 && {
      icon: Stamp, tone: 'good',
      title: `${a.ready_for_posting} evaluation${a.ready_for_posting === 1 ? ' is' : 's are'} fully decided and ready to post`,
      detail: 'Post the transfer credit to the student record.',
      to: '/office', cta: 'Credit Office'
    },
    a.suspected_duplicates > 0 && {
      icon: Copy, tone: 'warn',
      title: `${a.suspected_duplicates} possible duplicate evaluation${a.suspected_duplicates === 1 ? '' : 's'}`,
      detail: 'Keep them separate or close the duplicate.',
      to: '/office', cta: 'Credit Office'
    },
    a.syllabi_pending > 0 && {
      icon: FileText, tone: 'neutral',
      title: `${a.syllabi_pending} syllabus request${a.syllabi_pending === 1 ? '' : 's'} waiting on students`,
      detail: 'The courses return to their evaluators when the syllabus arrives.'
    },
    a.conflicts > 0 && {
      icon: GitCompare, tone: 'warn',
      title: `${a.conflicts} transfer course${a.conflicts === 1 ? ' has' : 's have'} conflicting equivalency decisions`,
      detail: 'Compare the decisions and record a standard equivalency.',
      to: '/admin/conflicts', cta: 'Review'
    },
    a.unassigned_applications > 0 && {
      icon: Inbox, tone: 'warn',
      title: `${a.unassigned_applications} evaluation${a.unassigned_applications === 1 ? ' has' : 's have'} courses not yet assigned`,
      detail: 'Route them to evaluators by subject and workload.',
      action: <Button size="sm" onClick={assignNow} loading={assigning}>Assign now</Button>
    },
    a.courses_without_evaluator > 0 && {
      icon: UserX, tone: 'warn',
      title: `${a.courses_without_evaluator} course${a.courses_without_evaluator === 1 ? ' has' : 's have'} no matching evaluator`,
      detail: 'Add an evaluator with that subject expertise.',
      to: '/admin/users', cta: 'Evaluators'
    },
    highWorkload.length > 0 && {
      icon: Gauge, tone: 'warn',
      title: `${highWorkload.length} evaluator${highWorkload.length === 1 ? ' is' : 's are'} near capacity`,
      detail: highWorkload.slice(0, 3).map(e => `${e.full_name} (${e.open}/${e.capacity})`).join(', '),
      to: '/admin/users', cta: 'Evaluators'
    },
    n('information_required') > 0 && {
      icon: MessageSquare, tone: 'neutral',
      title: `${n('information_required')} evaluation${n('information_required') === 1 ? ' is' : 's are'} waiting on the student`,
      detail: 'Information has been requested.',
      to: '/admin/applications?status=information_required', cta: 'View'
    },
    n('validation_failed') > 0 && {
      icon: AlertTriangle, tone: 'bad',
      title: `${n('validation_failed')} evaluation${n('validation_failed') === 1 ? '' : 's'} failed validation`,
      detail: 'Check the institution or transcript details.',
      to: '/admin/applications?status=validation_failed', cta: 'View'
    },
    a.pending_transfers > 0 && {
      icon: ArrowRightLeft, tone: 'neutral',
      title: `${a.pending_transfers} transfer request${a.pending_transfers === 1 ? '' : 's'} not yet picked up`,
      detail: 'Handed over to the next evaluator.'
    },
    n('submitted') > 0 && {
      icon: Clock, tone: 'neutral',
      title: `${n('submitted')} submission${n('submitted') === 1 ? ' is' : 's are'} awaiting evaluation`,
      detail: 'Received, transcript not yet evaluated.',
      to: '/admin/applications?status=submitted', cta: 'View'
    }
  ].filter(Boolean)

  return (
    <div className="space-y-8">
      <PageHeader
        banner
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''} · ${today}`}
        title="Transfer Credit Overview"
        subtitle={`${d.applications} credit evaluations · ${d.students} students · ${d.evaluators} evaluators`}
        actions={<>
          {a.ready_for_posting > 0 && (
            <BannerAction as={Link} to="/office" solid>
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center"><Stamp className="w-3.5 h-3.5" /></span>
              <b>{a.ready_for_posting}</b> ready to post<ArrowRight className="w-3.5 h-3.5 text-staff-muted" />
            </BannerAction>
          )}
          {a.suspected_duplicates > 0 && (
            <BannerAction as={Link} to="/office">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 grid place-items-center"><Copy className="w-3.5 h-3.5" /></span>
              <b>{a.suspected_duplicates}</b> possible duplicate{a.suspected_duplicates === 1 ? '' : 's'}<ArrowRight className="w-3.5 h-3.5 text-white/70" />
            </BannerAction>
          )}
          <BannerAction as={Link} to="/admin/reports">
            <span className="w-6 h-6 rounded-full bg-white/20 grid place-items-center"><BarChart3 className="w-3.5 h-3.5" /></span>Reports
          </BannerAction>
        </>}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Credit evaluations" value={d.applications} detail={`${d.students} students`} to="/admin/applications" icon={Files} tone="sky"
          bar={[{ value: d.open_applications, tone: 'amber', label: 'in review' }, { value: d.completed_applications, tone: 'emerald', label: 'completed' }]} barOf={d.applications} />
        <Metric label="In review" value={d.open_applications} detail={`${d.reviews.open} courses with evaluators`} to="/admin/applications" icon={Hourglass} tone="amber"
          badge={d.applications > 0 && <MetricBadge tone="amber">{Math.round((d.open_applications / d.applications) * 100)}% of all</MetricBadge>}
          bar={{ value: d.open_applications, of: d.applications }} />
        <Metric label="Completed" value={d.completed_applications} detail={`${d.established_applied ?? 0} courses by established equivalency`} icon={BadgeCheck} tone="emerald"
          badge={<MetricBadge tone="emerald">{d.credits_posted ?? 0} credits posted</MetricBadge>}
          bar={{ value: d.completed_applications, of: d.applications }} />
        <Metric label="Evaluators" value={d.active_evaluators} detail={`${d.evaluators - d.active_evaluators} inactive`} to="/admin/users" icon={Users} tone="violet"
          bar={[{ value: d.active_evaluators, tone: 'violet', label: 'active' }, { value: d.evaluators - d.active_evaluators, tone: 'slate', label: 'inactive' }]} barOf={d.evaluators} />
      </div>

      <PeriodCounts title="Transfer credit by period" subtitle="From transcript received to credit posted" fetchCounts={getAdminCounts} cards={ADMIN_CARDS} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
        <section className="staff-card">
          <SectionTitle icon={Flag} title="Needs attention"
            right={items.length > 0 && <MetricBadge tone="red">{items.length} item{items.length === 1 ? '' : 's'}</MetricBadge>} />
          {items.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-6 text-[15px] text-staff-ink2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Nothing needs your attention right now.
            </div>
          ) : (
            <AttentionList items={items} />
          )}
        </section>

        <section className="staff-card">
          <SectionTitle icon={Activity} tone="sky" title="Recent activity"
            right={<Link to="/admin/audit" className="text-[13px] font-semibold text-primary-700 hover:text-primary-800">View all</Link>} />
          {d.recent_activity.length === 0 ? (
            <p className="px-6 py-6 text-sm text-staff-muted">No activity yet.</p>
          ) : (
            <ActivityTimeline rows={d.recent_activity.slice(0, 6)} context={r => [r.reference_number, r.student_name, r.actor].filter(Boolean).join(' · ')} />
          )}
        </section>
      </div>
    </div>
  )
}
