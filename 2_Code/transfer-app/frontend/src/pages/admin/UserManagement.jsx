import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Power, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getEvaluators, createEvaluator, updateEvaluator } from '../../api/admin'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const INITIAL_FORM = {
  full_name: '',
  email: '',
  department: '',
  specializations: [],
  password: '',
  is_active: true
}

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
    setInput('')
  }

  const removeTag = (tag) => onChange(value.filter(t => t !== tag))

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-primary-500 hover:text-primary-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <button type="button" onClick={addTag} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
          Add
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add</p>
    </div>
  )
}

function EvaluatorModal({ isOpen, onClose, evaluator, onSave }) {
  const isEdit = Boolean(evaluator?.id)
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm(evaluator
        ? {
            full_name: evaluator.full_name || '',
            email: evaluator.email || '',
            department: evaluator.department || '',
            specializations: evaluator.specializations || [],
            password: '',
            is_active: evaluator.is_active ?? true
          }
        : INITIAL_FORM
      )
      setErrors({})
    }
  }, [isOpen, evaluator])

  const set = (key, value) => {
    setForm(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Valid email is required'
    }
    if (!isEdit && !form.password) errs.password = 'Password is required for new accounts'
    if (form.password && form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.password) delete payload.password
      if (isEdit) {
        await updateEvaluator(evaluator.id, payload)
        toast.success('Evaluator updated successfully')
      } else {
        await createEvaluator(payload)
        toast.success('Evaluator account created')
      }
      onSave()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save evaluator')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Evaluator' : 'Add New Evaluator'} size="md">
      <div className="space-y-4">
        <Input
          label="Full Name"
          required
          value={form.full_name}
          onChange={e => set('full_name', e.target.value)}
          error={errors.full_name}
          placeholder="Dr. Jane Smith"
        />

        <Input
          label="Email Address"
          required
          type="email"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          error={errors.email}
          placeholder="jsmith@bu.edu"
          disabled={isEdit}
          helperText={isEdit ? "Email cannot be changed after creation" : undefined}
        />

        <Input
          label={isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
          required={!isEdit}
          type="password"
          value={form.password}
          onChange={e => set('password', e.target.value)}
          error={errors.password}
          placeholder="••••••••"
        />

        <Input
          label="Department"
          value={form.department}
          onChange={e => set('department', e.target.value)}
          placeholder="e.g., Admissions"
        />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Specializations</label>
          <TagInput
            value={form.specializations}
            onChange={val => set('specializations', val)}
            placeholder="e.g., Computer Science"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
            className="accent-primary-600 w-4 h-4"
          />
          <span className="text-sm text-gray-700">Account Active</span>
        </label>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? 'Save Changes' : 'Create Evaluator'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function UserManagement() {
  const [evaluators, setEvaluators] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, evaluator: null })
  const [toggling, setToggling] = useState(null)

  const load = async () => {
    try {
      const data = await getEvaluators()
      setEvaluators(data.data || data.evaluators || [])
    } catch {
      toast.error('Failed to load evaluators')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (ev) => {
    setToggling(ev.id)
    try {
      await updateEvaluator(ev.id, { is_active: !ev.is_active })
      toast.success(`Evaluator ${!ev.is_active ? 'activated' : 'deactivated'}`)
      await load()
    } catch {
      toast.error('Failed to update evaluator status')
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="xl" className="text-primary-600" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Evaluator Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage evaluator accounts and assignments</p>
        </div>
        <Button onClick={() => setModal({ open: true, evaluator: null })}>
          <Plus className="w-4 h-4" />
          Add Evaluator
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {evaluators.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No evaluators yet"
            description="Add evaluator accounts to start assigning and reviewing transfer applications."
            action={() => setModal({ open: true, evaluator: null })}
            actionLabel="Add First Evaluator"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden sm:table-cell">Email</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden md:table-cell">Department</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden lg:table-cell">Specializations</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden md:table-cell">Open Cases</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {evaluators.map(ev => (
                  <tr key={ev.id} className={`hover:bg-gray-50 transition-colors ${!ev.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{ev.full_name}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-gray-600">{ev.email}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-gray-600">{ev.department || '—'}</td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      {ev.specializations?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {ev.specializations.slice(0, 3).map(s => (
                            <Badge key={s} variant="info">{s}</Badge>
                          ))}
                          {ev.specializations.length > 3 && (
                            <span className="text-xs text-gray-400">+{ev.specializations.length - 3}</span>
                          )}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell font-medium text-gray-700">
                      {ev.active_cases ?? ev.current_case_count ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      {ev.is_active
                        ? <Badge variant="approved">Active</Badge>
                        : <Badge variant="closed">Inactive</Badge>
                      }
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ open: true, evaluator: ev })}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggle(ev)}
                          disabled={toggling === ev.id}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                          title={ev.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EvaluatorModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, evaluator: null })}
        evaluator={modal.evaluator}
        onSave={load}
      />
    </div>
  )
}
