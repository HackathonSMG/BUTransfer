import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Power, Trash2, Settings } from 'lucide-react'
import notify from '../../lib/notify'
import { getCriteria, createCriterion, updateCriterion, deleteCriterion } from '../../api/admin'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const RULE_TYPES = [
  { value: 'gpa', label: 'GPA Requirement' },
  { value: 'credits', label: 'Credit Hours' },
  { value: 'document', label: 'Document Required' },
  { value: 'accreditation', label: 'Institution Accreditation' },
  { value: 'deadline', label: 'Application Deadline' },
  { value: 'custom', label: 'Custom Rule' }
]

const INITIAL_FORM = {
  criterion_name: '',
  description: '',
  rule_type: '',
  is_required: true,
  is_active: true,
  rule_config: '{}'
}

function CriterionModal({ isOpen, onClose, criterion, onSave }) {
  const isEdit = Boolean(criterion?.id)
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [jsonError, setJsonError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setForm(criterion
        ? {
            criterion_name: criterion.criterion_name || '',
            description: criterion.description || '',
            rule_type: criterion.rule_type || '',
            is_required: criterion.is_required ?? true,
            is_active: criterion.is_active ?? true,
            rule_config: criterion.rule_config ? JSON.stringify(criterion.rule_config, null, 2) : '{}'
          }
        : INITIAL_FORM
      )
      setErrors({})
      setJsonError('')
    }
  }, [isOpen, criterion])

  const set = (key, value) => {
    setForm(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.criterion_name.trim()) errs.criterion_name = 'Criterion name is required'
    if (!form.rule_type) errs.rule_type = 'Rule type is required'
    try {
      JSON.parse(form.rule_config)
    } catch {
      errs.rule_config = 'Must be valid JSON'
    }
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        rule_config: JSON.parse(form.rule_config)
      }
      if (isEdit) {
        await updateCriterion(criterion.id, payload)
        notify.success('Criterion updated')
      } else {
        await createCriterion(payload)
        notify.success('Criterion created')
      }
      onSave()
      onClose()
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save criterion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Criterion' : 'Add Criterion'} size="lg">
      <div className="space-y-4">
        <Input
          label="Criterion Name"
          required
          value={form.criterion_name}
          onChange={e => set('criterion_name', e.target.value)}
          error={errors.criterion_name}
          placeholder="e.g., Minimum GPA 2.5"
        />

        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe what this criterion checks..."
        />

        <Select
          label="Rule Type"
          required
          options={RULE_TYPES}
          value={form.rule_type}
          onChange={e => set('rule_type', e.target.value)}
          error={errors.rule_type}
          placeholder="Select rule type..."
        />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={e => set('is_required', e.target.checked)}
              className="accent-primary-600 w-4 h-4"
            />
            <span className="text-sm text-gray-700">Required</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="accent-primary-600 w-4 h-4"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>

        <Textarea
          label="Rule Configuration (JSON)"
          rows={5}
          value={form.rule_config}
          onChange={e => {
            set('rule_config', e.target.value)
            try { JSON.parse(e.target.value); setJsonError('') }
            catch { setJsonError('Invalid JSON') }
          }}
          error={errors.rule_config || jsonError}
          placeholder='{"min_value": 2.5}'
          helperText="Configure the rule parameters as JSON"
        />

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{isEdit ? 'Save Changes' : 'Create Criterion'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function EligibilityCriteria() {
  const [criteria, setCriteria] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, criterion: null })
  const [deleting, setDeleting] = useState(null)
  const [toggling, setToggling] = useState(null)

  const load = async () => {
    try {
      const data = await getCriteria()
      setCriteria(data.data || data.criteria || [])
    } catch {
      notify.error('Failed to load criteria')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (c) => {
    setToggling(c.id)
    try {
      await updateCriterion(c.id, { ...c, is_active: !c.is_active })
      notify.success(`Criterion ${!c.is_active ? 'activated' : 'deactivated'}`)
      await load()
    } catch {
      notify.error('Failed to update criterion')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this criterion? This cannot be undone.')) return
    setDeleting(id)
    try {
      await deleteCriterion(id)
      notify.success('Criterion deleted')
      setCriteria(prev => prev.filter(c => c.id !== id))
    } catch {
      notify.error('Failed to delete criterion')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="xl" className="text-primary-600" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Eligibility Criteria</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage the transfer eligibility rules used to evaluate applications</p>
        </div>
        <Button onClick={() => setModal({ open: true, criterion: null })}>
          <Plus className="w-4 h-4" />
          Add Criterion
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {criteria.length === 0 ? (
          <EmptyState
            icon={Settings}
            title="No criteria configured"
            description="Add eligibility criteria that will be used to evaluate transfer applications."
            action={() => setModal({ open: true, criterion: null })}
            actionLabel="Add First Criterion"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Criterion</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden sm:table-cell">Type</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden md:table-cell">Version</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Required</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {criteria.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{c.criterion_name}</p>
                      {c.description && <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{c.description}</p>}
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <Badge variant="info">{c.rule_type}</Badge>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-gray-500">
                      v{c.version || 1}
                    </td>
                    <td className="px-5 py-3">
                      {c.is_required
                        ? <Badge variant="default">Required</Badge>
                        : <span className="text-xs text-gray-400">Optional</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      {c.is_active
                        ? <Badge variant="approved">Active</Badge>
                        : <Badge variant="closed">Inactive</Badge>
                      }
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ open: true, criterion: c })}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggle(c)}
                          disabled={toggling === c.id}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                          title={c.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={deleting === c.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      <CriterionModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, criterion: null })}
        criterion={modal.criterion}
        onSave={load}
      />
    </div>
  )
}
