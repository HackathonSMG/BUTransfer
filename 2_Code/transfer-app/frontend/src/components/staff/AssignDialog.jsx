import React, { useState, useEffect } from 'react'
import notify from '../../lib/notify'
import { getEligibleEvaluators, assignReview } from '../../api/office'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

// Assign or reassign one course review (Credit Evaluation Office and administrators): the best eligible
// evaluator, a chosen one (ranked with reasons and workload) or the office queue. The API keeps every earlier
// holder in the assignment history. course: { review_id, course_code, evaluator_id }
export default function AssignDialog({ course, onClose, onDone }) {
  const [state, setState] = useState({ loading: false, data: null })
  const [pick, setPick] = useState('auto')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!course) return
    setPick('auto')
    setState({ loading: true, data: null })
    getEligibleEvaluators(course.review_id)
      .then(res => setState({ loading: false, data: res.data }))
      .catch(() => setState({ loading: false, data: { evaluators: [] } }))
  }, [course])

  const save = async () => {
    setSaving(true)
    try {
      const res = await assignReview(course.review_id, pick === 'office' ? null : pick)
      notify.success(res.data.evaluator ? `Assigned to ${res.data.evaluator}` : 'Moved to the Credit Evaluation Office queue')
      onDone()
    } catch (err) {
      notify.error(err.response?.data?.message || 'The course could not be assigned')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!course} onClose={() => !saving && onClose()} title={course ? `Assign ${course.course_code}` : ''} size="md">
      {state.loading || !state.data ? <div className="py-8 flex justify-center"><Spinner /></div> : (
        <div className="space-y-3">
          <p className="text-[13px] text-staff-muted">{state.data.course}{state.data.target ? ` · proposed ${state.data.target}` : ''}</p>
          <ul className="max-h-72 overflow-y-auto space-y-1.5">
            {[{ id: 'auto', full_name: 'Best eligible evaluator', reason: 'Chosen by expertise, availability and workload' },
              ...state.data.evaluators,
              { id: 'office', full_name: 'Credit Evaluation Office queue', reason: 'Hold the course for manual placement' }].map(e => (
              <li key={e.id}>
                <label className={`flex gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${pick === e.id ? 'border-primary-500 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'}`}>
                  <input type="radio" name="evaluator" className="mt-1" checked={pick === e.id} onChange={() => setPick(e.id)} disabled={e.id === course?.evaluator_id} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-staff-ink">{e.full_name}{e.department ? <span className="text-staff-muted font-normal"> · {e.department}</span> : null}</span>
                    <span className="block text-[12.5px] text-staff-muted">{e.reason}{e.open_reviews != null ? ` · ${e.open_reviews} open of ${e.capacity}` : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving}>Assign</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
