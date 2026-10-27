import React, { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, BadgeCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { getConflicts, recordStandardEquivalency } from '../../api/admin'
import PageHeader from '../../components/staff/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { formatDate } from '../../lib/reviews'

const TITLES = {
  different_bu_course: 'Different BU courses awarded',
  different_outcome: 'Different outcomes',
  match_divergence: 'Very different course-match scores'
}

// Transfer courses whose earlier decisions disagree, side by side, with a way to record the standard
export default function Conflicts() {
  const [state, setState] = useState({ loading: true, rows: [], error: null })
  const [resolving, setResolving] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await getConflicts()
      setState({ loading: false, rows: res.data, error: null })
    } catch (err) {
      setState({ loading: false, rows: [], error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equivalency Conflicts"
        subtitle="Transfer courses where earlier decisions disagree. Recording a standard applies to future transcripts; existing decisions are not changed."
      />

      {state.loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : state.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : state.rows.length === 0 ? (
        <div className="staff-card flex items-center gap-3 px-6 py-6 text-[15px] text-staff-ink2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          No conflicts. Decisions for every transfer course agree with each other and with the established equivalencies.
        </div>
      ) : (
        <div className="space-y-4">
          {state.rows.map(c => (
            <section key={`${c.institution}|${c.course_code}`} className="staff-card">
              <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4">
                <div className="min-w-0">
                  <p className="text-[13px] text-staff-muted">{c.institution}</p>
                  <h2 className="text-[18px] font-semibold text-staff-ink">
                    <span className="font-mono">{c.course_code}</span>
                    {c.title && <span className="font-normal text-staff-ink2"> · {c.title}</span>}
                  </h2>
                  <ul className="mt-2 space-y-1">
                    {c.conflicts.map(x => (
                      <li key={x.type} className="flex gap-2 text-[14px] text-staff-ink2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span><span className="font-medium text-staff-ink">{TITLES[x.type] || x.type}.</span> {x.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button onClick={() => setResolving(c)}>Record standard</Button>
              </div>

              <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-staff-line2 border-t border-staff-line2">
                {c.previous.outcomes.map(o => (
                  <div key={o.award} className="flex-1 min-w-0 px-6 py-4">
                    <p className="text-[13px] text-staff-muted">{o.count} decision{o.count === 1 ? '' : 's'}</p>
                    <p className="font-mono text-[15px] font-semibold text-staff-ink">{o.award}</p>
                    <ul className="mt-2 space-y-1.5 text-[13px]">
                      {c.previous.decisions.filter(d => o.decision_ids.includes(d.decision_id)).map(d => (
                        <li key={d.decision_id}>
                          <span className="text-staff-ink2">{d.source === 'evaluator' ? d.evaluator || 'Evaluator' : 'Reference record'}</span>
                          <span className="text-staff-muted"> · {formatDate(d.decided_on)}</span>
                          {d.reason && <span className="block text-staff-muted">{d.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-3 border-t border-staff-line2 text-[13px] text-staff-muted">
                {c.established ? (
                  <span className="inline-flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-emerald-600" />Established: {c.established.bu_course || c.established.outcome} (since {formatDate(c.established.approved_on)})</span>
                ) : <span>No established equivalency</span>}
                <span>{c.open_reviews} open review{c.open_reviews === 1 ? '' : 's'} of this course</span>
                {c.escalations.length > 0 && <span className="text-amber-800">Raised by {c.escalations[0].actor}{c.escalations[0].note ? `: “${c.escalations[0].note}”` : ''}</span>}
              </div>
            </section>
          ))}
        </div>
      )}

      <StandardModal conflict={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); load() }} />
    </div>
  )
}

function StandardModal({ conflict, onClose, onDone }) {
  const [choice, setChoice] = useState('')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setChoice(''); setCustom(''); setNote('') }, [conflict])
  if (!conflict) return null

  const options = [
    ...conflict.previous.outcomes.filter(o => o.grants_bu_course).map(o => ({ value: `bu:${o.award}`, label: o.award, detail: `${o.count} earlier decision${o.count === 1 ? '' : 's'}` })),
    { value: 'custom', label: 'Another BU course', detail: 'Enter the course code' },
    { value: 'elective', label: 'Elective credit only', detail: 'No specific BU course' },
    { value: 'none', label: 'No credit', detail: 'The course does not transfer' }
  ]

  const save = async () => {
    const body = { institution: conflict.institution, course_code: conflict.course_code, note }
    if (choice.startsWith('bu:')) Object.assign(body, { outcome: 'BU equivalent', bu_course: choice.slice(3) })
    else if (choice === 'custom') Object.assign(body, { outcome: 'BU equivalent', bu_course: custom.trim().toUpperCase() })
    else if (choice === 'elective') Object.assign(body, { outcome: 'Elective credit', bu_course: null })
    else Object.assign(body, { outcome: 'No credit', bu_course: null })
    setSaving(true)
    try {
      await recordStandardEquivalency(body)
      toast.success('Standard equivalency recorded')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'The standard could not be recorded')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Record standard equivalency" size="md">
      <div className="space-y-4">
        <p className="text-[14px] text-staff-ink2">
          <span className="font-mono font-semibold text-staff-ink">{conflict.course_code}</span> at {conflict.institution}.
          The standard applies to future transcripts; decisions already made are not changed.
        </p>
        <div className="space-y-2" role="radiogroup">
          {options.map(o => (
            <label key={o.value} className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${choice === o.value ? 'border-primary-600 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'}`}>
              <input type="radio" name="standard" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="accent-primary-600" />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-staff-ink">{o.label}</span>
                <span className="block text-[12.5px] text-staff-muted">{o.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {choice === 'custom' && (
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. CAS CS 112" aria-label="BU course code"
            className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        )}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (optional): why this is the standard"
          className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!choice || (choice === 'custom' && !custom.trim())}>Record standard</Button>
        </div>
      </div>
    </Modal>
  )
}
