import React, { useState } from 'react'
import { UserRound, Clock, AlertTriangle, ChevronDown, History } from 'lucide-react'
import StatusPill from './StatusPill'
import { pendingFor, formatDateTime } from '../../lib/staffFormat'

// Current Review Assignment: where the application is, who holds it, which course is blocking completion, every
// course's evaluator, and the assignment history. All of it comes from the API (ownership.service); staff only.
export default function ReviewAssignment({ ownership }) {
  const [showCourses, setShowCourses] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  if (!ownership) return null
  const { stage_label: stageLabel, tone, summary, owners = [], blocking = [], courses = [], history = [] } = ownership
  const primary = blocking.find(b => b.state !== 'queued') || blocking[0]

  return (
    <section className="staff-card overflow-hidden" aria-labelledby="current-assignment">
      <div className="px-6 pt-5 pb-4 border-b border-staff-line2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="current-assignment" className="text-[17px] font-semibold text-staff-ink">Current Review Assignment</h2>
          <p className="text-[13.5px] text-staff-muted mt-0.5">{summary}</p>
        </div>
        <StatusPill tone={tone}>{stageLabel}</StatusPill>
      </div>

      {/* Where / who / what is blocking */}
      <dl className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-staff-line2">
        <div className="px-6 py-4">
          <dt className="staff-eyebrow">Where is it</dt>
          <dd className="mt-1.5 text-[16px] font-semibold text-staff-ink">{stageLabel}</dd>
          {primary?.pending_since && (
            <dd className="mt-1 text-[13px] text-staff-ink2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Pending for {pendingFor(primary.pending_since)}</dd>
          )}
        </div>
        <div className="px-6 py-4">
          <dt className="staff-eyebrow">Currently with</dt>
          {owners.length === 0 ? (
            <dd className="mt-1.5 text-[15px] text-staff-ink2">{ownership.stage === 'credit_office_review' ? 'Credit Evaluation Office' : 'No evaluator'}</dd>
          ) : owners.map(o => (
            <dd key={o.name} className="mt-1.5">
              <span className={`flex items-center gap-1.5 text-[15.5px] font-semibold ${o.unassigned ? 'text-rose-800' : 'text-staff-ink'}`}>
                {o.unassigned ? <AlertTriangle className="w-4 h-4" /> : <UserRound className="w-4 h-4 text-staff-muted" />}{o.name}
              </span>
              {o.department && <span className="block text-[13px] text-staff-ink2 ml-[22px]">{o.department}</span>}
            </dd>
          ))}
        </div>
        <div className="px-6 py-4">
          <dt className="staff-eyebrow">Blocking completion</dt>
          {blocking.length === 0 ? (
            <dd className="mt-1.5 text-[15px] text-staff-ink2">No course is pending review</dd>
          ) : blocking.map(b => (
            <dd key={b.transcript_course_id} className="mt-1.5 text-[14.5px] text-staff-ink">
              <span className="font-mono font-semibold">{b.course_code}</span> <span className="text-staff-ink2">— {b.state_label}</span>
            </dd>
          ))}
        </div>
      </dl>

      {/* Assignment detail for the course being worked on now */}
      {primary && (
        <div className="px-6 py-4 border-t border-staff-line2 bg-staff-bg/50 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-[14px]">
          <Detail label="Assigned evaluator" value={primary.evaluator ? primary.evaluator.name : `Unassigned — ${primary.unassigned_reason}`} />
          <Detail label="Department" value={primary.evaluator?.department} />
          <Detail label="Assigned" value={formatDateTime(primary.assigned_at)} />
          <Detail label="Review status" value={primary.state_label} />
          {(primary.assignment_context?.length > 0 || primary.assignment_reason) && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-[12.5px] text-staff-muted">Assignment context</p>
              <p className="text-staff-ink2 mt-0.5">{primary.assignment_context?.length ? primary.assignment_context.join(' · ') : primary.assignment_reason}</p>
            </div>
          )}
          {primary.returned_reason && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-[12.5px] text-staff-muted">Returned by the Credit Evaluation Office</p>
              <p className="text-staff-ink2 mt-0.5">{primary.returned_reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Every course and its evaluator */}
      <Fold title={`Courses and evaluators (${courses.length})`} open={showCourses} onToggle={() => setShowCourses(v => !v)}>
        {courses.length === 0 ? <p className="px-6 pb-5 text-[14px] text-staff-muted">No courses have been read from the transcript yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="staff-eyebrow text-left bg-staff-bg/60">
                  <th className="px-6 py-2 font-semibold">Course</th><th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Evaluator</th><th className="px-3 py-2 font-semibold">Department</th>
                  <th className="px-3 py-2 font-semibold">Assigned</th><th className="px-6 py-2 font-semibold text-right">Waiting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-staff-line2">
                {courses.map(c => (
                  <tr key={c.transcript_course_id} className={c.pending_since && c.state !== 'queued' ? 'bg-amber-50/30' : ''}>
                    <td className="px-6 py-2.5"><span className="font-mono font-medium text-staff-ink">{c.course_code}</span><span className="block text-[12.5px] text-staff-muted truncate max-w-[16rem]">{c.title}</span></td>
                    <td className="px-3 py-2.5"><StatusPill tone={c.tone}>{c.state_label}</StatusPill></td>
                    <td className="px-3 py-2.5 text-staff-ink">{c.evaluator?.name || (c.unassigned_reason ? <span className="text-rose-800">{c.unassigned_reason}</span> : '—')}</td>
                    <td className="px-3 py-2.5 text-staff-ink2">{c.evaluator?.department || '—'}</td>
                    <td className="px-3 py-2.5 text-staff-ink2 whitespace-nowrap">{c.assigned_at ? formatDateTime(c.assigned_at) : '—'}</td>
                    <td className="px-6 py-2.5 text-right tabular-nums text-staff-ink2 whitespace-nowrap">{c.pending_since ? pendingFor(c.pending_since) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>

      {/* Assignment history, oldest first; nothing is overwritten */}
      <Fold title={<span className="inline-flex items-center gap-2"><History className="w-4 h-4 text-staff-muted" />Assignment history ({history.length})</span>} open={showHistory} onToggle={() => setShowHistory(v => !v)}>
        {history.length === 0 ? <p className="px-6 pb-5 text-[14px] text-staff-muted">No assignments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="staff-eyebrow text-left bg-staff-bg/60">
                  <th className="px-6 py-2 font-semibold">Date / time</th><th className="px-3 py-2 font-semibold">Course</th>
                  <th className="px-3 py-2 font-semibold">Evaluator</th><th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-6 py-2 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-staff-line2">
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="px-6 py-2.5 text-staff-ink2 whitespace-nowrap">{formatDateTime(h.at)}</td>
                    <td className="px-3 py-2.5 font-mono text-staff-ink">{h.course_code}</td>
                    <td className="px-3 py-2.5 text-staff-ink">{h.evaluator || '—'}{h.department && <span className="block text-[12.5px] text-staff-muted">{h.department}</span>}</td>
                    <td className="px-3 py-2.5 text-staff-ink whitespace-nowrap">{h.action}{h.by && h.action !== 'Review completed' && <span className="block text-[12.5px] text-staff-muted">by {h.by}</span>}</td>
                    <td className="px-6 py-2.5 text-staff-ink2 text-[13px]">{h.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>
    </section>
  )
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-staff-muted">{label}</p>
      <p className="text-staff-ink font-medium mt-0.5 break-words">{value || '—'}</p>
    </div>
  )
}

function Fold({ title, open, onToggle, children }) {
  return (
    <div className="border-t border-staff-line2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-staff-bg">
        <span className="text-[14.5px] font-semibold text-staff-ink">{title}</span>
        <ChevronDown className={`w-5 h-5 text-staff-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}
