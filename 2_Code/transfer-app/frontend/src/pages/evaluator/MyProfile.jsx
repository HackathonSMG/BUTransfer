import React, { useState, useEffect } from 'react'
import { Mail, BadgeCheck, Building2, Network, Activity } from 'lucide-react'
import { getMyDashboard, getMyReviews } from '../../api/my'
import { useAuth } from '../../hooks/useAuth'
import Spinner from '../../components/ui/Spinner'
import Metric from '../../components/staff/Metric'
import { SectionTitle, ActivityTimeline } from '../../components/staff/Section'
import { initials } from '../../lib/reviews'
import campus from '../../assets/campus-hero.jpg'

// The evaluator's own master record (read only; administrators maintain it on the Evaluators page)
export default function MyProfile() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Open courses per BU course, from the evaluator's open list; the counts are left out if it can't be read
  const [openByCourse, setOpenByCourse] = useState(null)

  useEffect(() => {
    getMyDashboard().then(res => setData(res.data)).catch(err => setError(err.response?.data?.message || err.message))
    getMyReviews({ status: 'open' }).then(res => {
      const counts = {}
      for (const r of res.data || []) if (r.target_bu_course) counts[r.target_bu_course] = (counts[r.target_bu_course] || 0) + 1
      setOpenByCourse(counts)
    }).catch(() => setOpenByCourse(null))
  }, [])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!data) return <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>

  const p = data.profile || {}
  const c = data.counts
  const capacity = p.max_concurrent_cases || 20
  const activity = data.recent_activity || []
  const subjects = [
    ...(p.expertise_subjects || []).map(s => ({ key: `s-${s}`, label: s === 'GEN' ? 'General credit evaluation' : `Subject ${s}`, main: true })),
    ...(p.specializations || []).map(s => ({ key: `p-${s}`, label: s, main: false }))
  ]
  const courses = p.expertise_courses || []

  return (
    <div className="space-y-5">
      {/* Identity band: the same campus photo and red as the dashboard banner */}
      <header className="relative overflow-hidden rounded-2xl bg-[#7a0000] text-white shadow-card">
        <img src={campus} alt="" aria-hidden="true" className="absolute right-0 top-0 h-full w-full sm:w-[62%] object-cover object-[center_45%] opacity-40 sm:opacity-100" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#990000] via-[#990000]/95 via-45% to-[#990000]/10" aria-hidden="true" />
        <div className="relative px-6 sm:px-8 py-6 sm:py-7 flex flex-wrap items-center gap-5 sm:gap-6">
          <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white text-brand grid place-items-center text-[22px] sm:text-[26px] font-semibold shadow flex-shrink-0" aria-hidden="true">
            {initials(user?.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] sm:text-[30px] leading-tight">{user?.full_name}</h1>
            {(p.title || p.department) && <p className="text-[15px] text-white/90">{[p.title, p.department].filter(Boolean).join(' · ')}</p>}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/80">
              <span className="inline-flex items-center gap-1.5 min-w-0"><Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{user?.email}</span></span>
              {p.evaluator_code && <span className="inline-flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />{p.evaluator_code}</span>}
              <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" aria-hidden="true" />Evaluator</span>
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="Workload" tone="violet" edge
          value={`${c.open} / ${capacity}`}
          ring={{ value: c.open, max: capacity }}
          detail={`${Math.round((c.open / capacity) * 100)}% of capacity`}
        />
        <Metric
          label="Open" value={c.open} tone="sky" edge to="/evaluator/my-evaluations"
          detail={[`${c.new} new`, `${c.in_progress} in progress`, c.info_requested ? `${c.info_requested} waiting` : null].filter(Boolean).join(' · ')}
        />
        <Metric label="Completed" value={c.completed} tone="emerald" edge to="/evaluator/my-evaluations?status=completed" detail={`${c.completed_this_month} this month`} />
        <Metric label="Upcoming" value={c.upcoming} tone="slate" edge detail="Waiting on other reviews" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5 items-start">
        <section className="staff-card">
          <SectionTitle icon={Network} title="What you evaluate" subtitle="Courses are routed to you by these subjects and BU courses" />
          <div className="p-6">
            {subjects.length === 0 && courses.length === 0 ? (
              <p className="text-sm text-staff-muted">No expertise recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_2.5rem_minmax(0,1fr)] items-center gap-y-3">
                <ul className="space-y-2" aria-label="Subjects and specializations">
                  {subjects.map(s => (
                    <li key={s.key} className={`rounded-full px-3 py-1.5 text-[12px] font-medium text-center ${s.main ? 'bg-red-50 text-brand ring-1 ring-brand/20' : 'bg-staff-sunk text-staff-ink2'}`}>
                      {s.label}
                    </li>
                  ))}
                </ul>
                <Connector count={courses.length || 1} />
                {courses.length ? (
                  <ul className="space-y-2" aria-label="BU courses you review">
                    {courses.map(code => {
                      const n = openByCourse?.[code]
                      return (
                        <li key={code} className="rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-white px-3 py-1.5 flex items-center justify-between gap-3">
                          <span className="font-mono font-semibold text-brand text-[13px]">{code}</span>
                          {openByCourse && <span className="text-[12px] text-staff-muted whitespace-nowrap">{n ? `${n} open` : '—'}</span>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-staff-muted">No specific courses. Courses are routed to you by subject and department.</p>
                )}
              </div>
            )}
          </div>
          <p className="px-6 py-3 border-t border-staff-line2 bg-staff-sunk/50 text-[12.5px] text-staff-muted rounded-b-xl">
            Capacity: {capacity} open courses. Contact the Credit Evaluation office to change your expertise.
          </p>
        </section>

        <section className="staff-card">
          <SectionTitle icon={Activity} tone="sky" title="Your recent work" />
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

// Lines fanning out from the subjects to each BU course (decorative; hidden on narrow screens)
function Connector({ count }) {
  const ys = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100)
  return (
    <svg viewBox="0 0 40 100" preserveAspectRatio="none" className="hidden sm:block w-10 h-full self-stretch" aria-hidden="true">
      {ys.map(y => <path key={y} d={`M0 50 C 20 50, 20 ${y}, 40 ${y}`} fill="none" stroke="#e4e7ec" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    </svg>
  )
}
