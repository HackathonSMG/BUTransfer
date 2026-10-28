import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Stamp, Inbox, Copy, CalendarClock, ArrowRight, CheckCircle2, GitCompare, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import { getOfficeOverview, placeOfficeQueue, processExistingApplications } from '../../api/office'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/staff/PageHeader'
import Metric from '../../components/staff/Metric'
import StatusPill from '../../components/staff/StatusPill'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { greeting, timeAgo, activityLabel } from '../../lib/staffFormat'

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
      toast.success(res.data.placed ? `${res.data.placed} course${res.data.placed === 1 ? '' : 's'} assigned to evaluators` : 'No queued course has a qualified evaluator yet')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Courses could not be placed')
    } finally {
      setPlacing(false)
    }
  }

  const processExisting = async () => {
    setProcessing(true)
    try {
      const res = await processExistingApplications()
      const r = res.data
      toast.success(`${r.applications} applications checked: ${r.established_applied} courses settled by established equivalencies, ${r.reviews_created} assigned, ${r.duplicates_flagged} possible duplicates`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Existing applications could not be processed')
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
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        title="Credit Evaluation Office"
        subtitle="Process each application's courses, place the ones without a specialist, and post decided transfer credit."
        actions={<>
          <Button size="sm" variant="secondary" onClick={processExisting} loading={processing} title="Apply established equivalencies, duplicate checks and assignment to applications evaluated earlier">Process existing applications</Button>
          <Link to="/admin/applications" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">All applications<ArrowRight className="w-4 h-4" /></Link>
        </>}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Awaiting final review" value={c.ready_for_posting} detail={`fully decided · ${c.applications_with_unposted} applications have decided courses`} accent={c.ready_for_posting > 0} />
        <Metric label="With departments" value={c.in_department_review} detail={`${c.queued_reviews} queued for a hand-off`} />
        <Metric label="Settled without department work" value={c.established_applied + c.policy_applied} detail={`${c.established_applied} established equivalencies · ${c.policy_applied} policy outcomes`} />
        <Metric label="Credits posted" value={c.credits_posted} detail={`${c.courses_posted} courses · ${c.completed_applications} applications complete`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-6">
          <Queue
            icon={Stamp}
            title="Final review"
            total={c.applications_with_unposted}
            empty="No decided courses are waiting to be posted."
            rows={d.ready_to_post}
            render={a => (
              <Link to={`/office/applications/${a.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-staff-bg">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-staff-ink truncate">{a.student_name}</span>
                  <span className="block text-[12.5px] text-staff-muted truncate"><span className="font-mono">{a.reference_number}</span> · {a.transfer_from_institution}</span>
                </span>
                <span className="text-[13px] text-staff-ink2 whitespace-nowrap">{a.decided_unposted} to post{a.posted ? ` · ${a.posted} posted` : ''} of {a.courses}</span>
                {a.duplicate_status === 'suspected' ? <StatusPill tone="warn">Possible duplicate</StatusPill> : <StatusPill status={a.status} />}
              </Link>
            )}
          />

          <Queue
            icon={Inbox}
            title="Unassigned reviews"
            empty="Every course has an evaluator."
            rows={d.office_queue}
            action={d.office_queue.length > 0 && <Button size="sm" variant="secondary" onClick={place} loading={placing}>Assign where possible</Button>}
            render={r => (
              <Link to={`/office/applications/${r.application_id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-staff-bg">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-staff-ink truncate"><span className="font-mono font-medium">{r.course_code}</span> {r.title}</span>
                  <span className="block text-[12.5px] text-staff-muted truncate">{r.institution} · {r.reference_number} · {r.student_name}</span>
                  <span className={`block text-[12.5px] font-medium truncate ${r.needs_reassignment ? 'text-amber-800' : 'text-rose-800'}`} title={r.assignment_reason || ''}>
                    {r.needs_reassignment ? `Reassignment required: ${r.evaluator_name} is unavailable` : r.reason_category}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-staff-muted" />
              </Link>
            )}
          />
        </div>

        <div className="space-y-6">
          <section className="staff-card">
            <h2 className="px-6 pt-5 pb-3 text-[17px] font-semibold text-staff-ink">Needs a decision</h2>
            <ul className="divide-y divide-staff-line2 border-t border-staff-line2 text-[14px]">
              {d.escalations.map((e, i) => (
                <li key={`esc-${i}`}>
                  <Link to="/admin/conflicts" className="flex gap-3 px-6 py-3.5 hover:bg-staff-bg">
                    <Flag className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block font-medium text-staff-ink">Escalation: {e.institution} {e.course_code}</span>
                      <span className="block text-[12.5px] text-staff-muted">{e.raised_by}{e.note ? `: ${e.note}` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {d.duplicates.map(a => (
                <li key={a.id}>
                  <Link to={`/office/applications/${a.id}`} className="flex gap-3 px-6 py-3.5 hover:bg-staff-bg">
                    <Copy className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block font-medium text-staff-ink">Potential duplicate: {a.reference_number}</span>
                      <span className="block text-[12.5px] text-staff-muted">{a.duplicate_reason}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {d.deadlines.map(a => (
                <li key={a.id}>
                  <Link to={`/office/applications/${a.id}`} className="flex gap-3 px-6 py-3.5 hover:bg-staff-bg">
                    <CalendarClock className={`w-4 h-4 flex-shrink-0 mt-0.5 ${a.status === 'passed' ? 'text-red-600' : 'text-amber-600'}`} />
                    <span className="min-w-0">
                      <span className="block font-medium text-staff-ink">{a.status === 'passed' ? 'Transfer deadline passed' : 'Transfer deadline approaching'}: {a.reference_number}</span>
                      <span className="block text-[12.5px] text-staff-muted">
                        {a.student_name} · started {a.start_term} · deadline {a.deadline}{a.status === 'passed' ? (a.exception ? ' · exception recorded' : ' · needs an exception to post') : ` · ${a.days_left} days left`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/admin/conflicts" className="flex gap-3 px-6 py-3.5 hover:bg-staff-bg">
                  <GitCompare className="w-4 h-4 text-staff-ink2 flex-shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block font-medium text-staff-ink">Equivalency conflicts</span>
                    <span className="block text-[12.5px] text-staff-muted">Review earlier decisions that disagree and set the standard.</span>
                  </span>
                </Link>
              </li>
              {!d.duplicates.length && !d.deadlines.length && !d.escalations.length && (
                <li className="flex items-center gap-2 px-6 py-3.5 text-staff-ink2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />No escalations, duplicates or deadline issues.</li>
              )}
            </ul>
          </section>

          <section className="staff-card">
            <h2 className="px-6 pt-5 pb-3 text-[17px] font-semibold text-staff-ink">Syllabi</h2>
            <div className="grid grid-cols-2 border-t border-staff-line2 divide-x divide-staff-line2">
              <div className="px-6 py-4"><p className="text-[13px] text-staff-ink2">Waiting on applicants</p><p className="text-[26px] font-semibold text-staff-ink tabular-nums">{c.syllabi_pending}</p></div>
              <div className="px-6 py-4"><p className="text-[13px] text-staff-ink2">Received, in review</p><p className="text-[26px] font-semibold text-staff-ink tabular-nums">{c.syllabi_received}</p></div>
            </div>
          </section>

          <section className="staff-card">
            <h2 className="px-6 pt-5 pb-3 text-[17px] font-semibold text-staff-ink">Recent activity</h2>
            {d.recent_activity.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-staff-muted">No activity yet.</p>
            ) : (
              <ul className="border-t border-staff-line2">
                {d.recent_activity.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-6 py-3 text-[14px]">
                    <span className="min-w-0">
                      <span className="block text-staff-ink truncate">{activityLabel(r.action)}</span>
                      <span className="block text-[12.5px] text-staff-muted truncate">{[r.reference_number, r.actor].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-[12.5px] text-staff-muted whitespace-nowrap">{timeAgo(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Queue({ icon: Icon, title, rows, render, empty, action, total }) {
  return (
    <section className="staff-card">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-staff-ink"><Icon className="w-[18px] h-[18px] text-staff-ink2" />{title}<span className="text-staff-muted font-normal">({total ?? rows.length})</span></h2>
        {action}
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-6 pb-5 text-[14px] text-staff-ink2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />{empty}</p>
      ) : (
        <ul className="divide-y divide-staff-line2 border-t border-staff-line2">{rows.map((r, i) => <li key={r.id || i}>{render(r)}</li>)}</ul>
      )}
    </section>
  )
}
