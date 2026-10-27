import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus, Edit2, Power, Users, X, Upload, Mail, Search
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getEvaluators, createEvaluator, updateEvaluator, importStaffRoster } from '../../api/admin'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/staff/PageHeader'
import StatusPill from '../../components/staff/StatusPill'
import { initials, avatarTint } from '../../lib/reviews'

const INITIAL_FORM = {
  full_name: '',
  email: '',
  title: '',
  department: '',
  specializations: [],
  expertise_subjects: [],
  expertise_courses: [],
  password: '',
  is_active: true
}

const toCode = (s) => s.toUpperCase().replace(/\s+/g, ' ')

function TagInput({ value, onChange, placeholder, format = (s) => s }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = format(input.trim())
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
            title: evaluator.title || '',
            department: evaluator.department || '',
            specializations: evaluator.specializations || [],
            expertise_subjects: evaluator.expertise_subjects || [],
            expertise_courses: evaluator.expertise_courses || [],
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
    const badSubject = form.expertise_subjects.find(s => !/^[A-Z]{2,4}$/.test(s))
    if (badSubject) errs.expertise_subjects = `"${badSubject}" is not a subject code (use codes such as CS or MA)`
    const badCourse = form.expertise_courses.find(c => !/^[A-Z]{2,4} [A-Z]{2} \d{3}$/.test(c))
    if (badCourse) errs.expertise_courses = `"${badCourse}" is not a BU course code (use codes such as CAS CS 111)`
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

        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g., Associate Professor"
          />
          <Input
            label="Department"
            value={form.department}
            onChange={e => set('department', e.target.value)}
            placeholder="e.g., Computer Science"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Specializations</label>
          <TagInput
            value={form.specializations}
            onChange={val => set('specializations', val)}
            placeholder="e.g., Computer Science"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Subject expertise</label>
          <p className="text-xs text-gray-500 mb-2">BU subject codes this evaluator reviews. Use GEN for a general credit evaluator.</p>
          <TagInput
            value={form.expertise_subjects}
            onChange={val => set('expertise_subjects', val)}
            placeholder="e.g., CS"
            format={toCode}
          />
          {errors.expertise_subjects && <p className="text-xs text-red-600 mt-1">{errors.expertise_subjects}</p>}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Course expertise</label>
          <p className="text-xs text-gray-500 mb-2">BU courses this evaluator is qualified to judge. These are matched first when courses are assigned.</p>
          <TagInput
            value={form.expertise_courses}
            onChange={val => set('expertise_courses', val)}
            placeholder="e.g., CAS CS 111"
            format={toCode}
          />
          {errors.expertise_courses && <p className="text-xs text-red-600 mt-1">{errors.expertise_courses}</p>}
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

function ImportRosterModal({ isOpen, onClose, onDone }) {
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) { setSecret(''); setError(''); setResult(null) }
  }, [isOpen])

  const run = async () => {
    if (secret.length < 8) { setError('Use at least 8 characters'); return }
    setRunning(true)
    try {
      const res = await importStaffRoster(secret)
      setResult(res.data)
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'The roster could not be imported')
    } finally {
      setRunning(false)
    }
  }

  const created = result?.accounts.filter(a => a.created) || []
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import staff roster" size="md">
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Creates or updates the administrator and evaluator accounts in the staff roster, with each evaluator's department,
            subjects and courses. Existing accounts keep their password. Unassigned courses are then routed to the right evaluators.
          </p>
          <Input
            label="Initial password for new accounts"
            type="password"
            required
            value={secret}
            onChange={e => { setSecret(e.target.value); setError('') }}
            error={error}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" onClick={onClose} disabled={running}>Cancel</Button>
            <Button onClick={run} loading={running}><Upload className="w-4 h-4" />Import roster</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="Accounts created" value={created.length} />
            <MiniStat label="Accounts updated" value={result.accounts.length - created.length} />
            <MiniStat label="Courses assigned" value={result.assigned} />
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-staff-line2 border border-staff-line2 rounded-lg">
            {result.accounts.map(a => (
              <li key={a.email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-staff-ink truncate">{a.full_name}</span>
                  <span className="block text-xs text-staff-muted truncate">{a.email}</span>
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <StatusPill tone={a.role === 'admin' ? 'bad' : 'info'}>{a.role === 'admin' ? 'Admin' : 'Evaluator'}</StatusPill>
                  <StatusPill tone={a.created ? 'ok' : 'neutral'}>{a.created ? 'Created' : 'Updated'}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      )}
    </Modal>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-[9px] bg-staff-sunk px-3 py-2.5">
      <span className="block text-[11.5px] font-medium text-staff-muted">{label}</span>
      <b className="block text-lg font-bold text-staff-ink tabular-nums">{value}</b>
    </div>
  )
}

// One evaluator: identity, expertise, workload against capacity, actions
function EvaluatorCard({ ev, onEdit, onToggle, toggling }) {
  const capacity = ev.max_concurrent_cases || 20
  const open = ev.open_reviews || 0
  const load = Math.min(100, (open / capacity) * 100)
  const subjects = ev.expertise_subjects?.length ? ev.expertise_subjects : (ev.specializations || [])
  return (
    <div className={`staff-card p-5 flex flex-col gap-4 ${ev.is_active ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-full grid place-items-center text-sm font-bold flex-shrink-0 ${avatarTint(ev.full_name)}`}>{initials(ev.full_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-staff-ink truncate">{ev.full_name}</p>
          <p className="text-xs text-staff-muted truncate">{[ev.title, ev.department].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-staff-ink2 flex items-center gap-1 mt-0.5 min-w-0"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{ev.email}</span></p>
        </div>
        <StatusPill tone={ev.is_active ? 'ok' : 'neutral'}>{ev.is_active ? 'Active' : 'Inactive'}</StatusPill>
      </div>

      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {subjects.slice(0, 4).map(s => (
          <span key={s} className="text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-800 border border-primary-100">{s === 'GEN' ? 'General' : s}</span>
        ))}
        {ev.expertise_courses?.length > 0 && (
          <span className="text-[11.5px] px-2 py-0.5 rounded-md bg-staff-sunk text-staff-ink2" title={ev.expertise_courses.join(', ')}>
            {ev.expertise_courses.length} BU courses
          </span>
        )}
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-staff-muted">Workload</span>
          <span className="text-staff-ink2 tabular-nums"><b className="text-staff-ink">{open}</b> open of {capacity} · {ev.completed_reviews || 0} done</span>
        </div>
        <div className="h-2 rounded-full bg-staff-line2 overflow-hidden" title={`${open} open reviews, capacity ${capacity}`}>
          <i className={`block h-full rounded-full ${load >= 90 ? 'bg-red-600' : load >= 70 ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${Math.max(open ? 3 : 0, load)}%` }} />
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t border-staff-line2">
        <Button size="sm" variant="ghost" onClick={() => onEdit(ev)}><Edit2 className="w-3.5 h-3.5" />Edit</Button>
        {ev.evaluator_code && <span className="self-center font-mono text-[11.5px] text-staff-muted">{ev.evaluator_code}</span>}
        <Button size="sm" variant="ghost" onClick={() => onToggle(ev)} loading={toggling} className="ml-auto">
          <Power className="w-3.5 h-3.5" />{ev.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>
    </div>
  )
}

export default function UserManagement() {
  const [evaluators, setEvaluators] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, evaluator: null })
  const [importOpen, setImportOpen] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('active')

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
      toast.success(`Evaluator ${!ev.is_active ? 'reactivated' : 'deactivated'}`)
      await load()
    } catch {
      toast.error('Failed to update evaluator status')
    } finally {
      setToggling(null)
    }
  }

  const departments = useMemo(() => [...new Set(evaluators.map(e => e.department || 'Other'))].sort(), [evaluators])
  const q = search.trim().toLowerCase()
  const visible = evaluators.filter(e =>
    (!department || (e.department || 'Other') === department) &&
    (status === 'all' || (status === 'active') === Boolean(e.is_active)) &&
    (!q || [e.full_name, e.email, e.department, e.evaluator_code, ...(e.expertise_subjects || []), ...(e.expertise_courses || [])]
      .some(f => f && String(f).toLowerCase().includes(q)))
  )

  const active = evaluators.filter(e => e.is_active)
  const coveredCourses = new Set(active.flatMap(e => e.expertise_courses || [])).size
  const openTotal = active.reduce((s, e) => s + (e.open_reviews || 0), 0)

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="xl" className="text-primary-600" /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluators"
        subtitle={`${active.length} active across ${new Set(active.map(e => e.department || 'Other')).size} departments · ${coveredCourses} BU courses covered · ${openTotal} open reviews`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              Import staff roster
            </Button>
            <Button onClick={() => setModal({ open: true, evaluator: null })}>
              <Plus className="w-4 h-4" />
              Add Evaluator
            </Button>
          </>
        }
      />

      <div className="staff-card p-4 space-y-3">
       <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_14rem] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, subject or course..."
            aria-label="Search evaluators"
            className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <Select aria-label="Status" placeholder="Active and inactive" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          value={status === 'all' ? '' : status} onChange={e => setStatus(e.target.value || 'all')} />
       </div>
       <div className="flex flex-wrap gap-1.5" role="group" aria-label="Department">
          {[['', 'All departments', evaluators.length], ...departments.map(dep => [dep, dep, evaluators.filter(e => (e.department || 'Other') === dep).length])].map(([value, label, n]) => (
            <button
              key={label}
              type="button"
              onClick={() => setDepartment(value)}
              aria-pressed={department === value}
              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                department === value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-staff-line text-staff-ink2 hover:bg-staff-sunk'
              }`}
            >
              {label} <span className={department === value ? 'text-white/80' : 'text-staff-muted'}>{n}</span>
            </button>
          ))}
       </div>
      </div>

      {evaluators.length === 0 ? (
        <div className="staff-card">
          <EmptyState
            icon={Users}
            title="No evaluators yet"
            description="Import the staff roster to create the evaluator accounts for each department, or add evaluators one at a time."
            action={() => setImportOpen(true)}
            actionLabel="Import staff roster"
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="staff-card"><EmptyState icon={Search} title="No evaluators match" description="Try another name, subject or department." /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(ev => (
            <EvaluatorCard key={ev.id} ev={ev} onEdit={e => setModal({ open: true, evaluator: e })} onToggle={handleToggle} toggling={toggling === ev.id} />
          ))}
        </div>
      )}

      <EvaluatorModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, evaluator: null })}
        evaluator={modal.evaluator}
        onSave={load}
      />
      <ImportRosterModal isOpen={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </div>
  )
}
