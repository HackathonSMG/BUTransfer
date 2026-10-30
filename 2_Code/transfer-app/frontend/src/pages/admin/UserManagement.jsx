import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus, Edit2, Power, Users, X, Upload, Search, AlertTriangle, ChevronRight, LayoutGrid, List, GraduationCap, Landmark, Check
} from 'lucide-react'
import notify from '../../lib/notify'
import {
  getEvaluators, createEvaluator, updateEvaluator, importStaffRoster, getEvaluatorProfile,
  createStaffMember, getCreditOfficeStaff, updateCreditOfficeStaff
} from '../../api/admin'
import { setEvaluatorAvailability } from '../../api/office'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/staff/PageHeader'
import StatusPill from '../../components/staff/StatusPill'
import { MetricBadge } from '../../components/staff/Metric'
import { initials, avatarTint, REVIEW_STATUS } from '../../lib/reviews'

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

// Staff roles an administrator can add here (administrators and students are never created on this page)
const STAFF_ROLES = [
  { value: 'evaluator', label: 'Evaluator', icon: GraduationCap, description: 'Reviews transfer courses for a department and decides BU equivalencies.' },
  { value: 'credit_office', label: 'Credit Office', icon: Landmark, description: 'Places courses with evaluators, finalizes evaluations and posts transfer credit.' }
]
const roleLabel = (role) => STAFF_ROLES.find(r => r.value === role)?.label || 'Staff'

// Two option cards; the choice decides which fields the form asks for
function RoleChoice({ value, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700 mb-2">Role <span className="text-red-500">*</span></legend>
      <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Role">
        {STAFF_ROLES.map(({ value: v, label, icon: Icon, description }) => {
          const on = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(v)}
              className={`relative text-left rounded-xl border p-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${on ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-staff-line bg-white hover:border-slate-300'}`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${on ? 'bg-primary-600 text-white' : 'bg-staff-sunk text-staff-ink2'}`}><Icon className="w-4 h-4" aria-hidden="true" /></span>
                <span className="font-semibold text-staff-ink">{label}</span>
                {on && <Check className="w-4 h-4 text-primary-600 ml-auto" aria-hidden="true" />}
              </span>
              <span className="block text-[12.5px] text-staff-muted mt-2 leading-snug">{description}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

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

function EvaluatorModal({ isOpen, onClose, evaluator, onSave, defaultRole = 'evaluator' }) {
  const isEdit = Boolean(evaluator?.id)
  const [role, setRole] = useState(defaultRole)
  const isEvaluator = isEdit || role === 'evaluator'
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
      setRole(evaluator ? 'evaluator' : defaultRole)
    }
  }, [isOpen, evaluator, defaultRole])

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
    if (!isEvaluator) return errs
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
        notify.success('Evaluator updated successfully')
      } else if (role === 'evaluator') {
        await createEvaluator(payload)
        notify.success(`Evaluator account created for ${form.full_name.trim()}`)
      } else {
        await createStaffMember({ role, full_name: form.full_name.trim(), email: form.email.trim(), password: form.password })
        notify.success(`Credit Office account created for ${form.full_name.trim()}`)
      }
      onSave(isEdit ? 'evaluator' : role)
      onClose()
    } catch (err) {
      notify.error(err.response?.data?.message || (isEvaluator ? 'Failed to save evaluator' : 'Failed to create the Credit Office account'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Evaluator' : 'Add staff member'} size="md">
      <div className="space-y-4">
        {!isEdit && <RoleChoice value={role} onChange={setRole} />}

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

        {isEvaluator ? (<>
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
        </>) : (
          <p className="text-[12.5px] text-staff-muted rounded-lg bg-staff-sunk px-3 py-2.5">
            Credit Office staff sign in to the Credit Office workspace. They need no department or expertise; they place courses, finalize evaluations and post credit for all applications.
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? 'Save Changes' : `Create ${roleLabel(role)} account`}
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
      notify.error(err.response?.data?.message || 'The roster could not be imported')
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
                  <StatusPill tone={a.role === 'admin' ? 'bad' : 'info'}>{a.role === 'admin' ? 'Admin' : a.role === 'credit_office' ? 'Credit Office' : 'Evaluator'}</StatusPill>
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

// Workload bar: open reviews against capacity (the percentage comes from the API)
function WorkloadBar({ pct, className = '' }) {
  const value = Math.min(100, pct || 0)
  const color = value >= 80 ? 'bg-amber-500' : 'bg-primary-600'
  return (
    <span className={`block h-1.5 rounded-full bg-staff-line2 overflow-hidden ${className}`} aria-hidden="true">
      <i className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(value ? 3 : 0, value)}%` }} />
    </span>
  )
}

// One row: who, where, how much work, and whether anything needs attention
function EvaluatorRow({ ev, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ev)}
        className={`w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_6rem_6rem_minmax(0,1fr)_1rem] gap-x-5 gap-y-1 items-center px-6 py-4 text-left hover:bg-staff-bg focus:outline-none focus-visible:bg-staff-bg ${ev.is_active ? '' : 'opacity-60'}`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold flex-shrink-0 ${avatarTint(ev.full_name)}`}>{initials(ev.full_name)}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-staff-ink truncate">
              {ev.full_name}
              {!ev.is_active && <span className="ml-2 text-[12px] font-medium text-staff-muted">Inactive</span>}
            </span>
            <span className="block text-[13px] text-staff-muted truncate">{ev.department || '—'}</span>
          </span>
        </span>
        <span className="hidden md:block">
          <span className="block text-[15px] font-semibold text-staff-ink tabular-nums">{ev.open_reviews}</span>
        </span>
        <span className="hidden md:block">
          <span className="block text-[15px] font-semibold text-staff-ink tabular-nums">{ev.completed_reviews}</span>
        </span>
        <span className="min-w-0 col-span-2 md:col-span-1 order-3 md:order-none">
          {ev.attention.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{ev.attention[0]}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <WorkloadBar pct={ev.workload_pct} className="flex-1 max-w-[10rem]" />
              <span className="text-[12px] text-staff-muted tabular-nums">{ev.workload_pct ?? 0}%</span>
            </span>
          )}
        </span>
        <ChevronRight className="hidden md:block w-4 h-4 text-staff-muted" />
      </button>
    </li>
  )
}

const NEAR_CAPACITY = 'Near capacity'
const isNearCapacity = (ev) => ev.attention.includes(NEAR_CAPACITY)

// Open reviews split by stage: blue new, amber in progress, light amber waiting for the student
const STAGES = [
  ['new_reviews', 'new', 'bg-sky-500'],
  ['in_progress_reviews', 'in progress', 'bg-amber-400'],
  ['waiting_reviews', 'waiting for students', 'bg-amber-200']
]

function StageBar({ counts, className = 'h-2 rounded-full' }) {
  return (
    <span className={`flex overflow-hidden bg-staff-line2 ${className}`} aria-hidden="true">
      {STAGES.map(([k, , bar]) => counts[k] > 0 && <span key={k} className={bar} style={{ flexGrow: counts[k] }} />)}
    </span>
  )
}

// Open reviews against capacity as a ring (the percentage comes from the API)
function CapacityRing({ pct }) {
  const c = 2 * Math.PI * 15.5
  const value = Math.min(100, pct || 0)
  const warn = value >= 80
  return (
    <span className="relative w-16 h-16 flex-shrink-0" role="img" aria-label={pct == null ? 'No capacity set' : `${pct}% of capacity`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={warn ? '#fef3c7' : '#e0f2fe'} strokeWidth="4" />
        {value > 0 && <circle cx="18" cy="18" r="15.5" fill="none" stroke={warn ? '#d97706' : '#0284c7'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />}
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display tabular-nums text-[13px] font-semibold text-staff-ink">{pct == null ? '—' : `${pct}%`}</span>
    </span>
  )
}

function AvailabilityPill({ ev }) {
  if (isNearCapacity(ev)) return <MetricBadge tone="amber" icon={AlertTriangle}>Near capacity</MetricBadge>
  if (!ev.is_active) return <StatusPill tone="neutral">Inactive</StatusPill>
  if (ev.availability === 'unavailable') {
    return <StatusPill tone="warn">Unavailable{ev.unavailable_until ? ` until ${ev.unavailable_until.slice(0, 10)}` : ''}</StatusPill>
  }
  return <StatusPill tone="ok">Available</StatusPill>
}

// One evaluator as a card: capacity, open work by stage, recent output and expertise. Opens the profile.
function EvaluatorCard({ ev, onOpen }) {
  const near = isNearCapacity(ev)
  const stale = ev.attention.some(a => a.startsWith('Oldest open'))
  const otherFlags = ev.attention.filter(a => a !== NEAR_CAPACITY)
  const stages = STAGES.filter(([k]) => ev[k] > 0).map(([k, label]) => `${ev[k]} ${label}`)
  const courses = ev.expertise_courses || []
  const subjects = ev.expertise_subjects || []
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ev)}
        className={`staff-card w-full h-full p-5 text-left transition hover:shadow-lift hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${near ? 'ring-1 ring-amber-300 !border-amber-200' : ''} ${ev.is_active ? '' : 'opacity-60'}`}
      >
        <span className="flex items-start gap-3">
          <span className={`w-11 h-11 rounded-full grid place-items-center text-[13px] font-semibold flex-shrink-0 ${avatarTint(ev.full_name)}`}>{initials(ev.full_name)}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-staff-ink truncate">{ev.full_name}</span>
            <span className="block text-[12.5px] text-staff-muted truncate">{[ev.title, ev.department].filter(Boolean).join(' · ') || '—'}</span>
          </span>
          <AvailabilityPill ev={ev} />
        </span>

        {ev.open_reviews > 0 ? (
          <>
            <span className="mt-4 flex items-center gap-4">
              <CapacityRing pct={ev.workload_pct} />
              <span className="flex-1 min-w-0">
                <StageBar counts={ev} />
                <span className="block text-[12px] text-staff-muted mt-1.5">
                  <b className="text-staff-ink">{ev.open_reviews} open</b>
                  {ev.max_concurrent_cases ? ` of ${ev.max_concurrent_cases}` : ''} · {stages.join(' · ')}
                  {ev.queued_reviews > 0 && ` · ${ev.queued_reviews} upcoming`}
                </span>
              </span>
            </span>
            <span className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]">
              <span className={`rounded-lg py-2 ${ev.completed_7d > 0 ? 'bg-emerald-50' : 'bg-staff-sunk'}`}>
                <b className={`block font-display tabular-nums text-[15px] font-semibold ${ev.completed_7d > 0 ? 'text-emerald-700' : 'text-staff-ink'}`}>{ev.completed_7d ?? 0}</b>
                <span className="text-staff-muted">done 7 days</span>
              </span>
              <span className="rounded-lg bg-staff-sunk py-2">
                <b className="block font-display tabular-nums text-[15px] font-semibold text-staff-ink">{ev.completed_month ?? 0}</b>
                <span className="text-staff-muted">this month</span>
              </span>
              <span className={`rounded-lg py-2 ${stale ? 'bg-amber-50' : 'bg-staff-sunk'}`}>
                <b className={`block font-display tabular-nums text-[15px] font-semibold ${stale ? 'text-amber-800' : 'text-staff-ink'}`}>{ev.oldest_open_days != null ? `${ev.oldest_open_days}d` : '—'}</b>
                <span className="text-staff-muted">oldest open</span>
              </span>
            </span>
          </>
        ) : (
          <span className="mt-4 block rounded-lg border border-dashed border-staff-line px-4 py-5 text-center text-[12.5px] text-staff-muted">
            No open reviews{ev.is_active && ev.availability !== 'unavailable' && ev.department ? ` · ready for ${ev.department} courses` : ''}
            {ev.queued_reviews > 0 && ` · ${ev.queued_reviews} upcoming`}
            {ev.completed_month > 0 && <span className="block mt-1">{ev.completed_month} completed this month</span>}
          </span>
        )}

        {otherFlags.length > 0 && (
          <span className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{otherFlags[0]}</span>
          </span>
        )}

        <span className="mt-4 flex flex-wrap gap-1.5">
          {courses.length > 0 ? (
            <>
              {courses.slice(0, 2).map(c => <span key={c} className="rounded-full px-2 py-0.5 bg-staff-sunk text-staff-ink2 font-mono text-[11px]">{c}</span>)}
              {courses.length > 2 && <span className="rounded-full px-2 py-0.5 bg-staff-sunk text-staff-ink2 text-[11px]">+{courses.length - 2}</span>}
            </>
          ) : subjects.includes('GEN') ? (
            <span className="text-[12px] text-staff-muted">General credit · all subjects</span>
          ) : subjects.length > 0 ? (
            subjects.map(s => <span key={s} className="rounded-full px-2 py-0.5 bg-staff-sunk text-staff-ink2 font-mono text-[11px]">{s}</span>)
          ) : (
            <span className="text-[12px] text-staff-muted">Routed by department</span>
          )}
        </span>
      </button>
    </li>
  )
}

// The team in four numbers: who is active, open work against capacity, recent output, who is near capacity
function TeamSummary({ summary, evaluators }) {
  const active = evaluators.filter(e => e.is_active)
  const capacity = active.reduce((n, e) => n + (e.max_concurrent_cases || 0), 0)
  const month = evaluators.reduce((n, e) => n + (e.completed_month || 0), 0)
  const week = evaluators.reduce((n, e) => n + (e.completed_7d || 0), 0)
  const near = evaluators.filter(isNearCapacity)
  const stat = (value, label, detail, color = 'text-staff-ink') => (
    <div>
      <p className={`font-display tabular-nums text-[34px] font-semibold leading-none ${color}`}>{value}</p>
      <p className="text-[13px] text-staff-ink2 mt-1.5">{label}</p>
      <p className="text-[12px] text-staff-muted">{detail}</p>
    </div>
  )
  return (
    <div className="staff-card p-5 grid grid-cols-2 gap-4">
      {stat(summary.active, `active evaluator${summary.active === 1 ? '' : 's'}`, `${summary.departments} departments · ${summary.courses_covered} BU courses`)}
      {stat(summary.open_reviews, 'open course reviews', capacity > 0 ? `${Math.round((100 * summary.open_reviews) / capacity)}% of team capacity` : 'No capacity set', 'text-sky-800')}
      {stat(month, 'completed this month', `${week} in the last 7 days`, 'text-emerald-700')}
      {near.length > 0 ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="font-display tabular-nums text-[34px] font-semibold leading-none text-amber-700">{near.length}</p>
          <p className="text-[13px] text-amber-900 mt-1.5">near capacity</p>
          <p className="text-[12px] text-amber-800 truncate">
            {near.length === 1 ? `${near[0].full_name} · ${near[0].open_reviews} open` : near.map(e => e.full_name).join(', ')}
          </p>
        </div>
      ) : stat(0, 'near capacity', 'Everyone has room for new courses')}
    </div>
  )
}

// Open reviews per department, stacked by stage, longest first
function DepartmentLoad({ evaluators }) {
  const rows = useMemo(() => {
    const by = new Map()
    for (const e of evaluators.filter(x => x.is_active)) {
      const d = e.department || 'Other'
      const r = by.get(d) || { department: d, new_reviews: 0, in_progress_reviews: 0, waiting_reviews: 0, open: 0 }
      for (const [k] of STAGES) r[k] += e[k] || 0
      r.open = r.new_reviews + r.in_progress_reviews + r.waiting_reviews
      by.set(d, r)
    }
    return [...by.values()].filter(r => r.open > 0).sort((a, b) => b.open - a.open)
  }, [evaluators])
  const max = rows[0]?.open || 0
  return (
    <div className="staff-card p-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-[14px] font-semibold text-staff-ink">Open reviews by department</h2>
        <p className="flex flex-wrap gap-3 text-[11.5px] text-staff-muted">
          {[['New', 'bg-sky-500'], ['In progress', 'bg-amber-400'], ['Waiting for student', 'bg-amber-200']].map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${c}`} aria-hidden="true" />{l}</span>
          ))}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-staff-muted py-6 text-center">No open course reviews.</p>
      ) : (
        <ul className="space-y-2 text-[12.5px] max-h-[220px] overflow-y-auto">
          {rows.map(r => (
            <li key={r.department} className="grid grid-cols-[minmax(0,150px)_1fr_28px] items-center gap-3">
              <span className="text-staff-ink2 truncate" title={r.department}>{r.department}</span>
              <span className="sr-only">{r.new_reviews} new, {r.in_progress_reviews} in progress, {r.waiting_reviews} waiting for student</span>
              <span className="block" title={`${r.new_reviews} new · ${r.in_progress_reviews} in progress · ${r.waiting_reviews} waiting for student`} style={{ width: `${Math.max(4, (r.open / max) * 100)}%` }}><StageBar counts={r} className="h-3 rounded-sm" /></span>
              <span className="text-right font-semibold text-staff-ink tabular-nums">{r.open}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Side panel with one evaluator's profile, loaded from the API
// Available or on leave. Going on leave moves the evaluator's open courses to the best eligible evaluators
// (the API does the reassignment and keeps the history); returning lets queued office work be placed again.
function AvailabilityControl({ p, onChange }) {
  const [until, setUntil] = useState(p.unavailable_until?.slice(0, 10) || '')
  const [saving, setSaving] = useState(false)
  const away = p.availability === 'unavailable'
  const save = async (availability) => {
    setSaving(true)
    try { await onChange(p, availability, until) } finally { setSaving(false) }
  }
  return (
    <section className={`rounded-lg border px-4 py-3 ${away ? 'border-amber-200 bg-amber-50/70' : 'border-staff-line2 bg-staff-bg'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-staff-ink">
          <span className="font-semibold">{away ? 'Unavailable' : 'Available for new courses'}</span>
          {away && p.unavailable_until && <span className="text-staff-ink2"> until {p.unavailable_until.slice(0, 10)}</span>}
        </p>
        {away ? (
          <Button size="sm" variant="secondary" loading={saving} onClick={() => save('available')}>Mark available</Button>
        ) : (
          <span className="flex items-center gap-2">
            <input type="date" value={until} onChange={e => setUntil(e.target.value)} className="px-2 py-1.5 text-[13px] border border-staff-line rounded-lg" aria-label="Unavailable until" />
            <Button size="sm" variant="secondary" loading={saving} onClick={() => save('unavailable')}>Mark unavailable</Button>
          </span>
        )}
      </div>
      {!away && <p className="text-[12.5px] text-staff-muted mt-1">Marking unavailable moves open courses to other qualified evaluators.</p>}
    </section>
  )
}

function EvaluatorDrawer({ evaluatorId, onClose, onEdit, onToggle, toggling, onAvailability }) {
  const [p, setP] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!evaluatorId) return
    setP(null); setError(null)
    getEvaluatorProfile(evaluatorId).then(res => setP(res.data)).catch(err => setError(err.response?.data?.message || err.message))
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [evaluatorId, onClose])

  if (!evaluatorId) return null
  const workload = p ? [
    ['New', p.new_reviews], ['In progress', p.in_progress_reviews], ['Waiting on student', p.waiting_reviews], ['Upcoming', p.queued_reviews]
  ] : []

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Evaluator profile">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[min(520px,92vw)] bg-white shadow-pop flex flex-col">
        {!p ? (
          <div className="flex-1 grid place-items-center">{error ? <p className="text-sm text-rose-700 px-6">{error}</p> : <Spinner size="lg" className="text-primary-600" />}</div>
        ) : (
          <>
            <div className="flex items-start gap-4 px-6 py-5 border-b border-staff-line">
              <span className={`w-12 h-12 rounded-full grid place-items-center text-[15px] font-bold flex-shrink-0 ${avatarTint(p.full_name)}`}>{initials(p.full_name)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[22px] font-semibold text-staff-ink leading-tight">{p.full_name}</h2>
                <p className="text-[14px] text-staff-ink2">{[p.title, p.department].filter(Boolean).join(' · ')}</p>
                <p className="text-[13px] text-staff-muted mt-0.5">{p.email}{p.evaluator_code ? ` · ${p.evaluator_code}` : ''}</p>
              </div>
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-staff-muted hover:bg-staff-sunk" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
              {p.is_active && <AvailabilityControl p={p} onChange={onAvailability} />}

              {p.attention.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-[14px] text-amber-900 space-y-1">
                  {p.attention.map(a => <p key={a} className="flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{a}</p>)}
                </div>
              )}

              <section>
                <h3 className="staff-eyebrow mb-3">Workload</h3>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[24px] font-semibold text-staff-ink tabular-nums">{p.open_reviews}<span className="text-[14px] font-medium text-staff-muted"> / {p.max_concurrent_cases} open</span></span>
                  <span className="text-[13px] text-staff-muted">{p.workload_pct}% of capacity</span>
                </div>
                <WorkloadBar pct={p.workload_pct} />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-[14px]">
                  {workload.map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt className="text-staff-ink2">{k}</dt><dd className="font-semibold text-staff-ink tabular-nums">{v}</dd></div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="staff-eyebrow mb-3">Completed</h3>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[['Last 7 days', p.completed_7d], ['This month', p.completed_month], ['All time', p.completed_reviews]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-staff-bg border border-staff-line2 py-3">
                      <dd className="text-[20px] font-semibold text-staff-ink tabular-nums">{v}</dd>
                      <dt className="text-[12px] text-staff-muted">{k}</dt>
                    </div>
                  ))}
                </dl>
                {p.avg_days_to_decide != null && <p className="text-[13px] text-staff-muted mt-2">On average {p.avg_days_to_decide} days from assignment to decision.</p>}
              </section>

              <section>
                <h3 className="staff-eyebrow mb-3">Expertise</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(p.expertise_subjects || []).map(s => (
                    <span key={s} className="text-[12.5px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-800 border border-primary-100">{s === 'GEN' ? 'General' : s}</span>
                  ))}
                  {(p.specializations || []).map(s => (
                    <span key={s} className="text-[12.5px] px-2 py-0.5 rounded-md bg-staff-sunk text-staff-ink2">{s}</span>
                  ))}
                </div>
                {p.expertise_courses?.length > 0 ? (
                  <p className="text-[13px] text-staff-ink2 mt-3 leading-relaxed"><span className="text-staff-muted">BU courses: </span>{p.expertise_courses.join(', ')}</p>
                ) : <p className="text-[13px] text-staff-muted mt-3">Courses are routed by subject and department.</p>}
              </section>

              <section>
                <h3 className="staff-eyebrow mb-3">Recent course reviews</h3>
                {p.recent_reviews.length === 0 ? <p className="text-[14px] text-staff-muted">No course reviews yet.</p> : (
                  <ul className="divide-y divide-staff-line2 border-y border-staff-line2">
                    {p.recent_reviews.map(r => {
                      const st = REVIEW_STATUS[r.status] || { label: r.status, tone: 'neutral' }
                      return (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                          <span className="min-w-0">
                            <span className="block text-staff-ink truncate"><span className="font-mono">{r.course_code}</span> → <span className="font-mono">{r.target_bu_course || '—'}</span></span>
                            <span className="block text-[12.5px] text-staff-muted truncate">{r.student_name} · {r.reference_number}</span>
                          </span>
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-staff-line">
              <Button variant="secondary" onClick={() => onEdit(p)}><Edit2 className="w-4 h-4" />Edit</Button>
              <Button variant="ghost" className="ml-auto" loading={toggling} onClick={() => onToggle(p)}>
                <Power className="w-4 h-4" />{p.is_active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

// Credit Office staff: who they are, whether they can sign in, and a way to deactivate or reactivate them
function lastSeen(at) {
  if (!at) return 'Never signed in'
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? 'Never signed in' : `Last signed in ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function CreditOfficeCard({ member, onToggle }) {
  return (
    <li className={`staff-card p-5 flex flex-col ${member.is_active ? '' : 'opacity-70'}`}>
      <span className="flex items-start gap-3">
        <span className={`w-11 h-11 rounded-full grid place-items-center text-[13px] font-semibold flex-shrink-0 ${avatarTint(member.full_name)}`}>{initials(member.full_name)}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-staff-ink truncate">{member.full_name}</span>
          <span className="block text-[12.5px] text-staff-muted truncate" title={member.email}>{member.email}</span>
        </span>
        <StatusPill tone={member.is_active ? 'ok' : 'neutral'}>{member.is_active ? 'Active' : 'Inactive'}</StatusPill>
      </span>
      <span className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-staff-line2">
        <span className="text-[12px] text-staff-muted truncate">{lastSeen(member.last_sign_in_at)}</span>
        <Button size="sm" variant="ghost" onClick={() => onToggle(member)}>
          <Power className="w-4 h-4" />{member.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </span>
    </li>
  )
}

function ConfirmToggleModal({ member, onClose, onConfirm, saving }) {
  const deactivate = member?.is_active
  return (
    <Modal isOpen={Boolean(member)} onClose={onClose} title={deactivate ? 'Deactivate Credit Office account?' : 'Reactivate Credit Office account?'} size="sm">
      {member && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {deactivate
              ? <><b className="text-staff-ink">{member.full_name}</b> will no longer be able to sign in. Their past actions and history stay as they are. You can reactivate the account later.</>
              : <><b className="text-staff-ink">{member.full_name}</b> will be able to sign in to the Credit Office workspace again.</>}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant={deactivate ? 'danger' : 'primary'} loading={saving} onClick={() => onConfirm(member)}>
              <Power className="w-4 h-4" />{deactivate ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CreditOfficeList({ staff, error, onAdd, onToggle }) {
  if (error) {
    return <div className="staff-card"><EmptyState icon={AlertTriangle} title="Credit Office staff could not be loaded" description={error} /></div>
  }
  if (staff.length === 0) {
    return (
      <div className="staff-card">
        <EmptyState icon={Landmark} title="No Credit Office staff yet" description="Credit Office staff place courses with evaluators, finalize evaluations and post transfer credit. Add the first account to give someone access." action={onAdd} actionLabel="Add Credit Office member" />
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {staff.map(m => <CreditOfficeCard key={m.id} member={m} onToggle={onToggle} />)}
    </ul>
  )
}

function StaffTabs({ tab, onChange, counts }) {
  const tabs = [['evaluators', 'Evaluators', counts.evaluators], ['credit_office', 'Credit Office', counts.credit_office]]
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0]
    onChange(next)
    document.getElementById(`staff-tab-${next}`)?.focus()
  }
  return (
    <div role="tablist" aria-label="Staff" className="border-b border-staff-line2 flex flex-wrap gap-x-1 text-[14px]">
      {tabs.map(([key, label, count], i) => {
        const on = tab === key
        return (
          <button key={key} id={`staff-tab-${key}`} type="button" role="tab" aria-selected={on} aria-controls={`staff-panel-${key}`} tabIndex={on ? 0 : -1}
            onClick={() => onChange(key)} onKeyDown={e => onKey(e, i)}
            className={`px-3 py-2.5 -mb-px border-b-2 whitespace-nowrap ${on ? 'border-brand font-semibold text-staff-ink' : 'border-transparent text-staff-muted hover:text-staff-ink'}`}>
            {label} <span className="ml-0.5 text-[12.5px] tabular-nums">({count ?? '–'})</span>
          </button>
        )
      })}
    </div>
  )
}

export default function UserManagement() {
  const [evaluators, setEvaluators] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, evaluator: null })
  const [importOpen, setImportOpen] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [drawerKey, setDrawerKey] = useState(0)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('active')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [view, setView] = useState('cards')
  const [tab, setTab] = useState('evaluators')
  const [office, setOffice] = useState({ staff: [], loaded: false, error: null })
  const [confirmMember, setConfirmMember] = useState(null)
  const [officeSaving, setOfficeSaving] = useState(false)

  const load = async () => {
    try {
      const data = await getEvaluators()
      setEvaluators(data.data || [])
      setSummary(data.meta?.summary || null)
    } catch {
      notify.error('Failed to load evaluators')
    } finally {
      setLoading(false)
    }
  }

  // Loaded separately so a problem here never hides the evaluators
  const loadOffice = async () => {
    try {
      const res = await getCreditOfficeStaff()
      setOffice({ staff: res.data || [], loaded: true, error: null })
    } catch (err) {
      setOffice(o => ({ ...o, loaded: true, error: err.response?.data?.message || 'Please try again.' }))
    }
  }

  useEffect(() => { load(); loadOffice() }, [])

  const handleOfficeToggle = async (member) => {
    setOfficeSaving(true)
    try {
      await updateCreditOfficeStaff(member.id, { is_active: !member.is_active })
      notify.success(`${member.full_name} ${member.is_active ? 'deactivated' : 'reactivated'}`)
      setConfirmMember(null)
      await loadOffice()
    } catch (err) {
      notify.error(err.response?.data?.message || 'The account could not be updated')
    } finally {
      setOfficeSaving(false)
    }
  }

  const handleAvailability = async (ev, availability, until) => {
    try {
      const res = await setEvaluatorAvailability(ev.id, availability, until)
      const d = res.data
      notify.success(availability === 'unavailable'
        ? `Marked unavailable${d.reassigned ? `; ${d.reassigned} open course${d.reassigned === 1 ? '' : 's'} reassigned` : ''}`
        : `Marked available${d.placed ? `; ${d.placed} queued course${d.placed === 1 ? '' : 's'} assigned` : ''}`)
      await load()
      setDrawerKey(k => k + 1)
    } catch (err) {
      notify.error(err.response?.data?.message || 'Availability could not be changed')
    }
  }

  const handleToggle = async (ev) => {
    setToggling(ev.id)
    try {
      const res = await updateEvaluator(ev.id, { is_active: !ev.is_active })
      const moved = res.data?.reassigned || 0
      notify.success(`Evaluator ${!ev.is_active ? 'reactivated' : 'deactivated'}${moved ? `; ${moved} open course${moved === 1 ? '' : 's'} reassigned` : ''}`)
      await load()
      setDrawerKey(k => k + 1)
    } catch {
      notify.error('Failed to update evaluator status')
    } finally {
      setToggling(null)
    }
  }

  const departments = useMemo(() => [...new Set(evaluators.map(e => e.department || 'Other'))].sort(), [evaluators])
  const q = search.trim().toLowerCase()
  const visible = evaluators.filter(e =>
    (!department || (e.department || 'Other') === department) &&
    (status === 'all' || (status === 'active') === Boolean(e.is_active)) &&
    (!attentionOnly || e.attention.length > 0) &&
    (!q || [e.full_name, e.email, e.department, e.evaluator_code, ...(e.expertise_subjects || []), ...(e.expertise_courses || [])]
      .some(f => f && String(f).toLowerCase().includes(q)))
  )

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="xl" className="text-primary-600" /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle="Evaluators who review courses for their departments, and the Credit Office staff who place courses, finalize evaluations and post credit."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" />Import staff roster</Button>
            <Button onClick={() => setModal({ open: true, evaluator: null })}><Plus className="w-4 h-4" />Add staff member</Button>
          </>
        }
      />

      <StaffTabs tab={tab} onChange={setTab} counts={{ evaluators: evaluators.length, credit_office: office.loaded && !office.error ? office.staff.length : null }} />

      {tab === 'credit_office' ? (
        <div role="tabpanel" id="staff-panel-credit_office" aria-labelledby="staff-tab-credit_office">
          {!office.loaded
            ? <div className="flex justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
            : <CreditOfficeList staff={office.staff} error={office.error} onAdd={() => setModal({ open: true, evaluator: null })} onToggle={setConfirmMember} />}
        </div>
      ) : (
      <div role="tabpanel" id="staff-panel-evaluators" aria-labelledby="staff-tab-evaluators" className="space-y-6">
      {summary && evaluators.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-5" aria-label="Team capacity">
          <TeamSummary summary={summary} evaluators={evaluators} />
          <DepartmentLoad evaluators={evaluators} />
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, subject or course..." aria-label="Search evaluators"
              className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg bg-white placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <Select className="w-full sm:w-48" aria-label="Department" placeholder="All departments" options={departments.map(d => ({ value: d, label: d }))} value={department} onChange={e => setDepartment(e.target.value)} />
          <Select className="w-full sm:w-44" aria-label="Status" placeholder="Active and inactive" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            value={status === 'all' ? '' : status} onChange={e => setStatus(e.target.value || 'all')} />
          {summary?.need_attention > 0 && (
            <button
              type="button"
              onClick={() => setAttentionOnly(v => !v)}
              aria-pressed={attentionOnly}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${attentionOnly ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300'}`}
            >
              <AlertTriangle className="w-4 h-4" />{summary.need_attention} need{summary.need_attention === 1 ? 's' : ''} attention
            </button>
          )}
          <div className="ml-auto rounded-lg bg-staff-sunk p-1 flex text-[12.5px] text-staff-muted" role="group" aria-label="View">
            {[['cards', 'Cards', LayoutGrid], ['table', 'Table', List]].map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${view === key ? 'bg-white text-staff-ink font-medium shadow-sm' : 'hover:text-staff-ink'}`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </div>

        {evaluators.length === 0 ? (
          <div className="staff-card">
            <EmptyState icon={Users} title="No evaluators yet" description="Import the staff roster to create the evaluator accounts for each department, or add evaluators one at a time." action={() => setImportOpen(true)} actionLabel="Import staff roster" />
          </div>
        ) : visible.length === 0 ? (
          <div className="staff-card">
            <EmptyState icon={Search} title="No evaluators match" description="Try another name, subject or department." />
          </div>
        ) : view === 'cards' ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(ev => <EvaluatorCard key={ev.id} ev={ev} onOpen={e => setOpenId(e.id)} />)}
          </ul>
        ) : (
          <div className="staff-card overflow-hidden">
            <ul className="divide-y divide-staff-line2">
              <li className="hidden md:grid grid-cols-[minmax(0,1.6fr)_6rem_6rem_minmax(0,1fr)_1rem] gap-x-5 px-6 py-2.5 bg-staff-bg/60 staff-eyebrow">
                <span>Evaluator</span><span>Pending</span><span>Completed</span><span>Workload</span><span />
              </li>
              {visible.map(ev => <EvaluatorRow key={ev.id} ev={ev} onOpen={e => setOpenId(e.id)} />)}
            </ul>
          </div>
        )}
      </section>
      </div>
      )}

      <EvaluatorDrawer
        key={drawerKey}
        evaluatorId={openId}
        onClose={() => setOpenId(null)}
        onEdit={e => setModal({ open: true, evaluator: e })}
        onToggle={handleToggle}
        onAvailability={handleAvailability}
        toggling={toggling === openId}
      />
      <EvaluatorModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, evaluator: null })}
        evaluator={modal.evaluator}
        defaultRole={tab === 'credit_office' ? 'credit_office' : 'evaluator'}
        onSave={(role) => {
          if (role === 'credit_office') { loadOffice(); setTab('credit_office'); return }
          load(); setDrawerKey(k => k + 1)
          if (!modal.evaluator) setTab('evaluators')
        }}
      />
      <ConfirmToggleModal member={confirmMember} onClose={() => !officeSaving && setConfirmMember(null)} onConfirm={handleOfficeToggle} saving={officeSaving} />
      <ImportRosterModal isOpen={importOpen} onClose={() => setImportOpen(false)} onDone={() => { load(); loadOffice() }} />
    </div>
  )
}
