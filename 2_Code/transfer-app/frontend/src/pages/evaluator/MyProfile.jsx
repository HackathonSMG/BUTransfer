import React, { useState, useEffect } from 'react'
import { Mail, Building2, BadgeCheck, BookOpen, Gauge } from 'lucide-react'
import { getMyDashboard } from '../../api/my'
import { useAuth } from '../../hooks/useAuth'
import Spinner from '../../components/ui/Spinner'
import { initials, avatarTint } from '../../lib/reviews'

// The evaluator's own master record (read only; administrators maintain it on the Evaluators page)
export default function MyProfile() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMyDashboard().then(res => setData(res.data)).catch(err => setError(err.response?.data?.message || err.message))
  }, [])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!data) return <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>

  const p = data.profile || {}
  const c = data.counts
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-[26px] leading-tight text-staff-ink">My Profile</h1>

      <section className="staff-card p-6 flex flex-wrap items-center gap-5">
        <span className={`w-16 h-16 rounded-full grid place-items-center text-xl font-bold ${avatarTint(user?.full_name)}`}>{initials(user?.full_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold text-staff-ink">{user?.full_name}</p>
          <p className="text-sm text-staff-ink2">{[p.title, p.department].filter(Boolean).join(' · ')}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-staff-muted">
            <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{user?.email}</span>
            {p.evaluator_code && <span className="flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" />{p.evaluator_code}</span>}
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />Evaluator</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 text-center">
          {[['Open', c.open], ['Completed', c.completed], ['Upcoming', c.upcoming]].map(([label, v]) => (
            <div key={label} className="rounded-[9px] bg-staff-sunk px-4 py-2">
              <p className="text-[11.5px] font-medium text-staff-muted">{label}</p>
              <p className="text-lg font-bold text-staff-ink tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="staff-card p-5">
          <h2 className="text-[15px] font-semibold text-staff-ink mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-staff-muted" />Areas of expertise</h2>
          <div className="flex flex-wrap gap-1.5">
            {(p.expertise_subjects || []).map(s => (
              <span key={s} className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-800 border border-primary-100">{s === 'GEN' ? 'General credit evaluation' : `Subject ${s}`}</span>
            ))}
            {(p.specializations || []).map(s => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-staff-sunk text-staff-ink2">{s}</span>
            ))}
          </div>
        </section>
        <section className="staff-card p-5">
          <h2 className="text-[15px] font-semibold text-staff-ink mb-3 flex items-center gap-2"><Gauge className="w-4 h-4 text-staff-muted" />BU courses you review</h2>
          {p.expertise_courses?.length ? (
            <ul className="grid grid-cols-2 gap-1.5">
              {p.expertise_courses.map(code => (
                <li key={code} className="font-mono text-[12.5px] px-2 py-1 rounded-md bg-staff-sunk text-staff-ink">{code}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-staff-muted">No specific courses. Courses are routed to you by subject and department.</p>
          )}
          <p className="text-xs text-staff-muted mt-3">Capacity: {p.max_concurrent_cases || 20} open courses. Contact the Credit Evaluation office to change your expertise.</p>
        </section>
      </div>
    </div>
  )
}
