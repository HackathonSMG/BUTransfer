import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox, Loader, MessageSquare, CheckCircle2, ArrowRight, RefreshCw, ChevronRight, BookOpen, ClipboardList } from 'lucide-react'
import { getMyDashboard } from '../../api/my'
import { useAuth } from '../../hooks/useAuth'
import KpiCard from '../../components/staff/KpiCard'
import StatusPill from '../../components/staff/StatusPill'
import ScoreMeter from '../../components/staff/ScoreMeter'
import BUCrest from '../../components/layout/BUCrest'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { REVIEW_STATUS, matchBasisLabel, formatDate, initials, avatarTint } from '../../lib/reviews'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function MyDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const res = await getMyDashboard()
      setState({ loading: false, data: res.data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const d = state.data
  const c = d?.counts
  const profile = d?.profile
  const firstName = (user?.full_name || '').replace(/^(Dr|Prof)\.?\s+/i, '').split(' ')[0]
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const capacity = profile?.max_concurrent_cases || 20
  const loadPct = c ? Math.min(100, (c.open / capacity) * 100) : 0
  const goTo = (status) => navigate(`/evaluator/my-evaluations${status ? `?status=${status}` : ''}`)

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-[#dfe6f5] bg-gradient-to-br from-white via-[#f2f6fe] to-[#e9f0fd] px-5 sm:px-7 py-6">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-brand" aria-hidden="true" />
        <BUCrest className="absolute -right-6 -bottom-10 w-48 h-56 opacity-[0.06] pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-primary-800">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
            <h1 className="mt-1 mb-2 text-[26px] leading-tight text-staff-ink">
              {!c ? 'Your evaluations' : c.open > 0
                ? `${plural(c.open, 'course')} ${c.open === 1 ? 'is' : 'are'} waiting for your review.`
                : "You're all caught up."}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-staff-ink2">
              {profile && <span>{[profile.title, profile.department].filter(Boolean).join(' · ')}</span>}
              {profile?.evaluator_code && <span className="text-staff-muted">{profile.evaluator_code}</span>}
              <span className="text-staff-muted">{today}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={load} aria-label="Refresh" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => goTo()}>
              Open my evaluations
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {state.loading && !d ? (
        <div className="staff-card flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : state.error ? (
        <div className="staff-card"><EmptyState icon={ClipboardList} title="Your dashboard could not be loaded" description={state.error} action={load} actionLabel="Try Again" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard icon={Inbox} tone="info" label="New" value={c.new} sub="assigned, not yet opened" onClick={() => goTo('new')} />
            <KpiCard icon={Loader} tone="neutral" label="In progress" value={c.in_progress} sub="opened and under review" onClick={() => goTo('in_progress')} />
            <KpiCard icon={MessageSquare} tone="warn" label="Waiting on student" value={c.info_requested} sub="information requested" onClick={() => goTo('info_requested')} />
            <KpiCard icon={CheckCircle2} tone="ok" label="Completed" value={c.completed} sub={`${c.completed_this_month} this month`} onClick={() => goTo('completed')} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
            {/* Up next */}
            <section className="staff-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
                <h2 className="text-[15px] font-semibold text-staff-ink">Up next</h2>
                <Link to="/evaluator/my-evaluations" className="text-xs font-semibold text-primary-600 hover:text-primary-700">View all {c.open}</Link>
              </div>
              {d.up_next.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing waiting" description="New assignments appear here as applications are evaluated." />
              ) : (
                <ul className="divide-y divide-staff-line2 border-t border-staff-line2">
                  {d.up_next.map(r => <ReviewRow key={r.id} r={r} onOpen={() => navigate(`/evaluator/applications/${r.application_id}`)} />)}
                </ul>
              )}
            </section>

            <div className="space-y-4">
              {/* Workload */}
              <section className="staff-card p-5">
                <h2 className="text-[15px] font-semibold text-staff-ink mb-3">Current workload</h2>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[26px] font-bold text-staff-ink tabular-nums leading-none">{c.open}<span className="text-sm font-medium text-staff-muted"> / {capacity}</span></span>
                  <span className="text-xs text-staff-muted">open courses</span>
                </div>
                <div className="h-2.5 rounded-full bg-staff-line2 overflow-hidden" title={`${c.open} open of a ${capacity} course capacity`}>
                  <i className={`block h-full rounded-full ${loadPct >= 90 ? 'bg-red-600' : loadPct >= 70 ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${Math.max(c.open ? 3 : 0, loadPct)}%` }} />
                </div>
                <dl className="grid grid-cols-2 gap-2.5 mt-4">
                  <Stat label="Applications" value={c.open_applications} />
                  <Stat label="Upcoming" value={c.upcoming} hint="Queued behind another evaluator" />
                  <Stat label="Approved" value={c.approved} />
                  <Stat label="Rejected" value={c.rejected} />
                </dl>
              </section>

              {/* Expertise */}
              <section className="staff-card p-5">
                <h2 className="text-[15px] font-semibold text-staff-ink mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-staff-muted" />Your expertise</h2>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(profile?.expertise_subjects || []).map(s => (
                    <span key={s} className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-800 border border-primary-100">{s === 'GEN' ? 'General credit evaluation' : s}</span>
                  ))}
                  {(profile?.specializations || []).slice(0, 4).map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-staff-sunk text-staff-ink2">{s}</span>
                  ))}
                </div>
                {profile?.expertise_courses?.length > 0 ? (
                  <p className="text-xs text-staff-ink2 leading-relaxed">
                    <span className="text-staff-muted">BU courses: </span>
                    {profile.expertise_courses.map(code => code.replace(/^CAS /, '')).join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-staff-muted">Courses are routed to you by subject and department.</p>
                )}
              </section>
            </div>
          </div>

          {/* Recent decisions */}
          <section className="staff-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-semibold text-staff-ink">Recent decisions</h2>
              <Link to="/evaluator/my-evaluations?status=completed" className="text-xs font-semibold text-primary-600 hover:text-primary-700">All completed</Link>
            </div>
            {d.recent_decisions.length === 0 ? (
              <p className="text-sm text-staff-muted px-5 pb-6">Courses you approve or reject appear here.</p>
            ) : (
              <ul className="divide-y divide-staff-line2 border-t border-staff-line2">
                {d.recent_decisions.map(r => <ReviewRow key={r.id} r={r} decided onOpen={() => navigate(`/evaluator/applications/${r.application_id}`)} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-[9px] bg-staff-sunk px-3 py-2" title={hint}>
      <dt className="text-[11.5px] font-medium text-staff-muted">{label}</dt>
      <dd className="text-lg font-bold text-staff-ink tabular-nums">{value}</dd>
    </div>
  )
}

function ReviewRow({ r, onOpen, decided = false }) {
  const status = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-3 text-left hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg">
        <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold ${avatarTint(r.student_name)}`}>{initials(r.student_name)}</span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-staff-ink truncate">{r.student_name}</span>
          <span className="block text-xs text-staff-muted truncate">{r.reference_number} · {r.institution}</span>
        </span>
        <span className="hidden sm:block min-w-0 text-[13px]">
          <span className="font-mono text-[12.5px] text-staff-ink">{r.course_code}</span>
          <span className="text-staff-muted"> → </span>
          {r.target_bu_course
            ? <span className="font-mono text-[12.5px] font-semibold text-primary-800">{r.target_bu_course}</span>
            : <span className="text-xs italic text-staff-muted">target to be determined</span>}
          <span className="block text-xs text-staff-muted truncate">{matchBasisLabel(r)}</span>
        </span>
        <span className="hidden sm:block">{decided ? <span className="text-xs text-staff-muted whitespace-nowrap">{formatDate(r.completed_at)}</span> : <ScoreMeter score={r.match_score} />}</span>
        <span className="flex items-center gap-2">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <ChevronRight className="w-4 h-4 text-staff-muted" />
        </span>
      </button>
    </li>
  )
}
