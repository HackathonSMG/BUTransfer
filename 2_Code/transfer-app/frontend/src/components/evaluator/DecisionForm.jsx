import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import { submitDecision } from '../../api/applications'

export default function DecisionForm({ applicationId, onSuccess, onClose, isOpen }) {
  const [decision, setDecision] = useState('')
  const [comments, setComments] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const errs = {}
    if (!decision) errs.decision = 'Please select a decision'
    if (!comments.trim()) errs.comments = 'Comments are required'
    if (comments.trim().length < 20) errs.comments = 'Please provide more detailed comments (at least 20 characters)'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setLoading(true)
    try {
      await submitDecision(applicationId, { decision, comments })
      toast.success(`Evaluation ${decision === 'approved' ? 'approved' : 'rejected'}`)
      onSuccess && onSuccess({ decision, comments })
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit decision')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setDecision('')
    setComments('')
    setErrors({})
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Submit Decision" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Warning Banner */}
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>This decision is final</strong> and will immediately notify the student via email.
            Please review the evaluation thoroughly before proceeding.
          </p>
        </div>

        {/* Decision Options */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Decision <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                decision === 'approved'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="approved"
                checked={decision === 'approved'}
                onChange={(e) => { setDecision(e.target.value); setErrors(p => ({ ...p, decision: '' })) }}
                className="sr-only"
              />
              <CheckCircle className={`w-6 h-6 ${decision === 'approved' ? 'text-green-600' : 'text-gray-400'}`} />
              <div>
                <p className={`font-semibold text-sm ${decision === 'approved' ? 'text-green-800' : 'text-gray-700'}`}>
                  Approve
                </p>
                <p className="text-xs text-gray-500">Student is accepted</p>
              </div>
            </label>

            <label
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                decision === 'rejected'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="rejected"
                checked={decision === 'rejected'}
                onChange={(e) => { setDecision(e.target.value); setErrors(p => ({ ...p, decision: '' })) }}
                className="sr-only"
              />
              <XCircle className={`w-6 h-6 ${decision === 'rejected' ? 'text-red-600' : 'text-gray-400'}`} />
              <div>
                <p className={`font-semibold text-sm ${decision === 'rejected' ? 'text-red-800' : 'text-gray-700'}`}>
                  Reject
                </p>
                <p className="text-xs text-gray-500">No transfer credit is awarded</p>
              </div>
            </label>
          </div>
          {errors.decision && <p className="text-xs text-red-600 mt-1">{errors.decision}</p>}
        </div>

        {/* Comments */}
        <Textarea
          label="Decision Comments"
          required
          rows={5}
          value={comments}
          onChange={(e) => { setComments(e.target.value); setErrors(p => ({ ...p, comments: '' })) }}
          error={errors.comments}
          placeholder="Provide detailed reasoning for this decision. This will be shared with the student..."
          helperText="These comments will be visible to the student."
        />

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={decision === 'rejected' ? 'danger' : 'primary'}
            loading={loading}
          >
            {decision === 'approved' ? 'Confirm Approval' : decision === 'rejected' ? 'Confirm Rejection' : 'Submit Decision'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
