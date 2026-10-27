import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import Input from '../ui/Input'
import { createInfoRequest } from '../../api/applications'

export default function InfoRequestForm({ applicationId, onSuccess, onClose, isOpen }) {
  const [items, setItems] = useState([''])
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const addItem = () => setItems(prev => [...prev, ''])

  const removeItem = (index) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateItem = (index, value) => {
    setItems(prev => prev.map((item, i) => i === index ? value : item))
  }

  const validate = () => {
    const errs = {}
    const validItems = items.filter(i => i.trim())
    if (validItems.length === 0) errs.items = 'Add at least one item to request'
    if (!message.trim()) errs.message = 'A message to the student is required'
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
      const validItems = items.filter(i => i.trim())
      await createInfoRequest(applicationId, {
        items: validItems.map(description => ({ type: 'other', description })),
        message
      })
      toast.success('Information request sent to student')
      onSuccess && onSuccess()
      handleClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send information request')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setItems([''])
    setMessage('')
    setErrors({})
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Request Additional Information" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-gray-600">
          The student will be notified via email and can respond through their application portal.
        </p>

        {/* Requested Items */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Items to Request <span className="text-red-500">*</span>
          </p>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Item ${i + 1} (e.g., Official transcript from Spring 2025)`}
                  value={item}
                  onChange={(e) => updateItem(i, e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {errors.items && <p className="text-xs text-red-600 mt-1">{errors.items}</p>}

          <button
            type="button"
            onClick={addItem}
            className="mt-2 flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Another Item
          </button>
        </div>

        {/* Message */}
        <Textarea
          label="Message to Student"
          required
          rows={4}
          value={message}
          onChange={(e) => { setMessage(e.target.value); setErrors(p => ({ ...p, message: '' })) }}
          error={errors.message}
          placeholder="Explain why this information is needed and any specific instructions..."
        />

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Send Request
          </Button>
        </div>
      </form>
    </Modal>
  )
}
