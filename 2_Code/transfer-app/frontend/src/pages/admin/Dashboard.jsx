import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users, GraduationCap, FileText, ClipboardList, RefreshCw, ArrowRight, Activity, UserPlus
} from 'lucide-react'
import { getOverview } from '../../api/admin'
import { useAuth } from '../../hooks/useAuth'
import KpiCard from '../../components/staff/KpiCard'
import BarList, { SERIES_1, SERIES_2 } from '../../components/staff/BarList'
import BUCrest from '../../components/layout/BUCrest'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { STATUS_LABELS } from '../../components/application/StatusBadge'
import { initials, avatarTint } from '../../lib/reviews'

// Workflow order for the status chart
const STATUS_ORDER = ['submitted', 'under_evaluation', 'validation_failed', 'information_required', 'evaluation_completed',
  'under_evaluator_review', 'approved', 'rejected', 'closed', 'draft']

const ACTIVITY_LABELS = {
  application_created: 'Application received',
  evaluation_triggered: 'Evaluation started',
  evaluation_failed: 'Evaluation could not complete',
  validation_failed: 'Application failed validation',
  reviews_assigned: 'Courses assigned to evaluators',
  staff_roster_imported: 'Staff roster imported',
  status_changed: 'Status updated',
  decision_made: 'Decision recorded',
  info_request_created: 'Information requested from student',
  course_decision: 'Course decision recorded',
  note_added: 'Note added'
}

const activityLabel = (action) => ACTIVITY_LABELS[action] || action.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

function timeAgo(d) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d))
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })

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

  const d = state.data
  const firstName = (user?.full_name || '').split(' ')[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[#dfe6f5] bg-gradient-to-br from-white via-[#f2f6fe] to-[#e9f0fd] px-5 sm:px-7 py-6">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-brand" aria-hidden="true" />
        <BUCrest className="absolute -right-6 -bottom-10 w-48 h-56 opacity-[0.06] pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-primary-800">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
            <h1 className="mt-1 text-[26px] leading-tight text-staff-ink">Transfer credit administration</h1>
            <p className="mt-2 text-[13px] text-staff-ink2">
              {d ? `${d.open_applications} open applications · ${d.reviews.open} courses with evaluators · ${d.active_evaluators} active evaluators` : 'Loading the latest figures…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={load} aria-label="Refresh" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="secondary" onClick={() => navigate('/admin/users')}>
              <Users className="w-4 h-4" />
              Manage evaluators
            </Button>
            <Button onClick={() => navigate('/admin/applications')}>
              View applications
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {state.loading && !d ? (
        <div className="staff-card flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : state.error ? (
        <div className="staff-card"><EmptyState icon={Activity} title="The overview could not be loaded" description={state.error} action={load} actionLabel="Try Again" /></div>
      ) : (
        <>
          {/* Headline figures */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard icon={Users} tone="info" label="Active evaluators" value={d.active_evaluators}
              sub={`${d.evaluators} in the evaluator roster`} onClick={() => navigate('/admin/users')} />
            <KpiCard icon={GraduationCap} tone="neutral" label="Students" value={d.students} sub="with a transfer application" />
            <KpiCard icon={FileText} tone="ok" label="Applications" value={d.applications}
              sub={`${d.open_applications} open`} onClick={() => navigate('/admin/applications')} />
            <KpiCard icon={ClipboardList} tone="warn" label="Courses awaiting review" value={d.reviews.open}
              sub={`${d.reviews.queued} upcoming · ${d.reviews.completed} completed`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="staff-card p-5">
              <CardHead title="Applications by status" hint="Select a status to open the list" />
              <BarList
                rows={STATUS_ORDER.filter(s => d.by_status[s]).map(s => ({
                  key: s, label: STATUS_LABELS[s] || s, value: d.by_status[s],
                  onClick: () => navigate(`/admin/applications?status=${s}`)
                }))}
                unit="applications"
                emptyText="No applications yet"
              />
            </section>
            <section className="staff-card p-5">
              <CardHead title="Applications by BU program" hint="Top programs" />
              <BarList rows={d.by_program.map(p => ({ key: p.program, label: p.program, value: p.count }))} unit="applications" emptyText="No applications yet" />
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
            <section className="staff-card p-5">
              <CardHead
                title="Evaluator workload"
                hint={
                  <span className="flex items-center gap-3">
                    <Legend color={SERIES_1} label="Open" />
                    <Legend color={SERIES_2} label="Completed" />
                  </span>
                }
              />
              <Workload rows={d.evaluator_workload} onEmpty={() => navigate('/admin/users')} />
            </section>
            <section className="staff-card p-5">
              <CardHead title="Recent activity" hint={<Link to="/admin/audit" className="font-semibold text-primary-600 hover:text-primary-700">Audit log</Link>} />
              {d.recent_activity.length === 0 ? (
                <p className="text-sm text-staff-muted py-6 text-center">No activity yet</p>
              ) : (
                <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-staff-line">
                  {d.recent_activity.map((a, i) => (
                    <li key={i} className="relative pl-6 text-[13px]">
                      <span className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-white border-2 border-primary-500" aria-hidden="true" />
                      <p className="font-medium text-staff-ink">{activityLabel(a.action)}</p>
                      <p className="text-xs text-staff-muted">
                        {[a.reference_number && `${a.reference_number}${a.student_name ? ` · ${a.student_name}` : ''}`, a.actor, timeAgo(a.created_at)].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function CardHead({ title, hint }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="text-[15px] font-semibold text-staff-ink">{title}</h2>
      {hint && <span className="text-xs text-staff-muted">{hint}</span>}
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-staff-ink2">
      <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  )
}

// Stacked bar per evaluator: open (series 1) then completed (series 2), with a 2px gap between segments
function Workload({ rows, onEmpty }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-staff-muted mb-3">No active evaluators yet.</p>
        <Button size="sm" onClick={onEmpty}><UserPlus className="w-4 h-4" />Add evaluators</Button>
      </div>
    )
  }
  const max = Math.max(1, ...rows.map(r => r.open + r.completed))
  return (
    <ul className="space-y-2.5">
      {rows.map(r => (
        <li
          key={r.full_name}
          className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]"
          title={`${r.full_name}: ${r.open} open, ${r.completed} completed, ${r.queued} upcoming`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${avatarTint(r.full_name)}`}>{initials(r.full_name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-staff-ink">{r.full_name}</span>
              <span className="block truncate text-[11.5px] text-staff-muted">{r.department}</span>
            </span>
          </span>
          <span className="flex h-2.5 gap-[2px]" aria-hidden="true">
            {r.open > 0 && <i className="block h-full rounded-l" style={{ width: `${(r.open / max) * 100}%`, background: SERIES_1, borderTopRightRadius: r.completed ? 0 : 4, borderBottomRightRadius: r.completed ? 0 : 4 }} />}
            {r.completed > 0 && <i className="block h-full rounded-r" style={{ width: `${(r.completed / max) * 100}%`, background: SERIES_2, borderTopLeftRadius: r.open ? 0 : 4, borderBottomLeftRadius: r.open ? 0 : 4 }} />}
            {r.open + r.completed === 0 && <i className="block h-full w-full rounded bg-staff-sunk" />}
          </span>
          <span className="text-xs text-staff-ink2 tabular-nums whitespace-nowrap">
            <b className="text-staff-ink">{r.open}</b> open · {r.completed} done{r.queued ? ` · ${r.queued} upcoming` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
