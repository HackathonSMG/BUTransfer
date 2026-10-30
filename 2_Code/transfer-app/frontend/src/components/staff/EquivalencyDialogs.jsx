import React, { useState, useEffect, useRef } from 'react'
import { Search, X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import StatusPill from './StatusPill'
import notify from '../../lib/notify'
import {
  searchMemoryBuCourses, proposeEquivalency, addEquivalency, previewEquivalencyImport, commitEquivalencyImport
} from '../../api/memory'

// Dialogs for managing course equivalencies: add / propose, CSV import, and a plain confirmation.

const FIELD = 'w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
const FIELD_ERROR = 'w-full px-3 py-2 text-sm border border-red-400 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'
export const OUTCOME_CHOICES = ['BU equivalent', 'Elective credit', 'No credit']

const apiMessage = (err, fallback) => err.response?.data?.message || err.response?.data?.error?.message || fallback
export const awardOf = (e) => (e?.outcome === 'BU equivalent' ? e.bu_course : e?.outcome) || '—'

function Field({ label, required, optional, error, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
        {optional && <span className="text-staff-muted font-normal">(optional)</span>}
      </span>
      {children}
      {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : hint && <span className="block text-[12px] text-staff-muted mt-1">{hint}</span>}
    </label>
  )
}

// Search the BU catalog and pick one or more courses (several for a combined award)
function BuCoursePicker({ selected, onChange, error }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  useEffect(() => {
    const t = setTimeout(() => {
      searchMemoryBuCourses(q).then(res => setRows(res.data || [])).catch(() => setRows([]))
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  const toggle = (code) => onChange(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code].slice(0, 3))
  return (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-1.5">BU course <span className="text-red-500">*</span></span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(c => (
            <button key={c} type="button" onClick={() => toggle(c)} aria-label={`Remove ${c}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 text-primary-800 text-[12.5px] font-mono font-semibold px-2.5 py-1">
              {c}<X className="w-3 h-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 text-staff-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input value={q} onChange={e => setQ(e.target.value)} className={`${error ? FIELD_ERROR : FIELD} pl-9`} aria-label="Search the BU catalog"
          placeholder="Search by code or title, e.g. CS 112 or data structures" />
      </div>
      <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-staff-line divide-y divide-staff-line2">
        {rows.map(c => (
          <li key={c.course_code}>
            <button type="button" onClick={() => toggle(c.course_code)} aria-pressed={selected.includes(c.course_code)}
              className={`w-full text-left px-3 py-2 text-[13.5px] hover:bg-staff-bg flex gap-2 ${selected.includes(c.course_code) ? 'bg-primary-50/60' : ''}`}>
              <span className="font-mono font-semibold text-staff-ink w-[6.5rem] flex-shrink-0">{c.course_code}</span>
              <span className="text-staff-ink2 truncate">{c.title}</span>
              {c.credits != null && <span className="ml-auto text-staff-muted">{Number(c.credits)} cr</span>}
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-2 text-[13px] text-staff-muted">No BU courses match.</li>}
      </ul>
      {error
        ? <span className="block text-xs text-red-600 mt-1">{error}</span>
        : <span className="block text-[12px] text-staff-muted mt-1">Choose two for a combined award, e.g. a lecture and its lab.</span>}
    </div>
  )
}

const EMPTY = { institution: '', course_code: '', title: '', outcome: 'BU equivalent', courses: [], note: '' }

/**
 * Add (Credit Evaluation Office, administrators) or propose (evaluators) an equivalency.
 * mode: 'add' | 'propose'. onDone(result) after it is saved.
 */
export function EquivalencyDialog({ isOpen, mode, institutions = [], onClose, onDone }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState(null) // an active equivalency this would replace (add only)
  useEffect(() => { if (isOpen) { setForm(EMPTY); setErrors({}); setExisting(null) } }, [isOpen])
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setExisting(null) }
  const adding = mode === 'add'

  const validate = () => {
    const e = {}
    if (!form.institution.trim()) e.institution = 'Enter the institution the course is from.'
    else if (/^boston university$/i.test(form.institution.trim())) e.institution = 'The source course must be at another institution.'
    if (!form.course_code.trim()) e.course_code = 'Enter the course code, e.g. CS 2000.'
    if (form.outcome === 'BU equivalent' && !form.courses.length) e.bu_course = 'Choose the BU course this course is equivalent to.'
    setErrors(e)
    return !Object.keys(e).length
  }

  const save = async (replace = false) => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      institution: form.institution.trim(), course_code: form.course_code.trim(), title: form.title.trim() || null,
      outcome: form.outcome, bu_course: form.outcome === 'BU equivalent' ? form.courses.join(' + ') : null, note: form.note.trim() || null,
      ...(adding && replace ? { replace: true } : {})
    }
    try {
      const res = adding ? await addEquivalency(payload) : await proposeEquivalency(payload)
      onDone?.(res.data)
    } catch (err) {
      const details = err.response?.data?.error?.details
      // A different active equivalency exists: show it and let the office confirm the replacement
      if (adding && err.response?.status === 409 && details?.existing && details.existing.status === 'active' && !replace
        && (details.existing.outcome !== payload.outcome || (details.existing.bu_course || '') !== (payload.bu_course || ''))) {
        setExisting(details.existing)
      } else {
        notify.error(apiMessage(err, adding ? 'The equivalency could not be added' : 'The proposal could not be sent'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={adding ? 'Add equivalency' : 'Propose equivalency'} size="lg">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(false) }} noValidate>
        <p className="text-[13px] text-staff-muted">
          {adding
            ? 'The equivalency applies to future transcripts straight away. Decisions already made stay as they were.'
            : 'The Credit Evaluation Office reviews your proposal. Once approved it applies to future transcripts.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Institution" required error={errors.institution}>
            <input list="eq-institutions" value={form.institution} onChange={e => set({ institution: e.target.value })}
              className={errors.institution ? FIELD_ERROR : FIELD} placeholder="e.g. Northeastern University" maxLength={200} />
            <datalist id="eq-institutions">{institutions.map(i => <option key={i} value={i} />)}</datalist>
          </Field>
          <Field label="Course code" required error={errors.course_code}>
            <input value={form.course_code} onChange={e => set({ course_code: e.target.value })}
              className={`${errors.course_code ? FIELD_ERROR : FIELD} font-mono`} placeholder="e.g. CS 2000" maxLength={60} />
          </Field>
        </div>
        <Field label="Course title" optional hint="Taken from the institution's catalog when left blank and the course is on file.">
          <input value={form.title} onChange={e => set({ title: e.target.value })} className={FIELD} maxLength={200} />
        </Field>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-1.5">Outcome <span className="text-red-500">*</span></legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OUTCOME_CHOICES.map(o => (
              <label key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer text-[14px] ${form.outcome === o ? 'border-primary-500 bg-primary-50/50 font-semibold text-staff-ink' : 'border-staff-line text-staff-ink2 hover:bg-staff-bg'}`}>
                <input type="radio" name="eq-outcome" checked={form.outcome === o} onChange={() => set({ outcome: o })} className="accent-current text-primary-600" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
        {form.outcome === 'BU equivalent'
          ? <BuCoursePicker selected={form.courses} onChange={courses => set({ courses })} error={errors.bu_course} />
          : <p className="text-[12.5px] text-staff-muted">{form.outcome === 'No credit' ? 'The course earns no BU credit.' : 'The course counts as units without a specific BU course.'} No BU course is recorded.</p>}
        <Field label="Note" optional>
          <textarea value={form.note} onChange={e => set({ note: e.target.value })} rows={2} className={FIELD} maxLength={2000}
            placeholder={adding ? 'e.g. Confirmed with the CS department, fall 2026.' : 'Why this should be the standard, e.g. same topics and lab hours as CAS CS 111.'} />
        </Field>

        {existing && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-900 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p>{form.course_code.trim().toUpperCase()} already has an active equivalency, <span className="font-mono">{existing.eq_id}</span>: <strong>{awardOf(existing)}</strong>.</p>
              <p className="mt-1">Replacing it applies the new award to future transcripts.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {existing
            ? <Button variant="danger" loading={saving} onClick={() => save(true)}>Replace {existing.eq_id}</Button>
            : <Button type="submit" loading={saving}>{adding ? 'Add equivalency' : 'Send proposal'}</Button>}
        </div>
      </form>
    </Modal>
  )
}

/** A confirmation with an optional or required note. onConfirm(note) returns a promise. */
export function ConfirmDialog({ isOpen, title, children, confirmLabel, variant = 'primary', note, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (isOpen) { setText(''); setError('') } }, [isOpen])
  const confirm = async () => {
    if (note?.required && !text.trim()) { setError(note.requiredMessage || 'This is required.'); return }
    setBusy(true)
    try { await onConfirm(text.trim()) } finally { setBusy(false) }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="text-[14px] text-staff-ink2 space-y-2">{children}</div>
        {note && (
          <Field label={note.label} required={note.required} optional={!note.required} error={error}>
            <textarea value={text} onChange={e => { setText(e.target.value); setError('') }} rows={3} className={error ? FIELD_ERROR : FIELD} maxLength={2000} placeholder={note.placeholder} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={variant} loading={busy} onClick={confirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------------
// CSV import (administrators)
// ---------------------------------------------------------------------------------------------

const TEMPLATE = [
  ['institution', 'course', 'title', 'outcome', 'bu_course', 'note'],
  ['Northeastern University', 'CS 2000', 'Introduction to Program Design and Implementation', 'BU equivalent', 'CAS CS 111', ''],
  ['Riverside Community College', 'ENG 101', 'English Composition I', 'Elective credit', '', 'Counts toward writing electives'],
  ['Example College', 'ART 100', 'Studio Basics', 'No credit', '', '']
]
const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)

function downloadTemplate() {
  const csv = TEMPLATE.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'equivalency-import-template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const ROW_TONES = { new: 'ok', update: 'warn', duplicate: 'neutral', invalid: 'bad' }
const ROW_LABELS = { new: 'New', update: 'Update', duplicate: 'Duplicate', invalid: 'Invalid' }

export function ImportDialog({ isOpen, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState(null)
  const [filter, setFilter] = useState('')
  const inputRef = useRef(null)
  useEffect(() => {
    if (isOpen) { setFile(null); setPreview(null); setUpdateExisting(false); setSummary(null); setFilter('') }
  }, [isOpen])

  const runPreview = async () => {
    if (!file) { notify.error('Choose a CSV file first.'); return }
    if (file.size > 2 * 1024 * 1024) { notify.error('The CSV file must be 2 MB or smaller.'); return }
    setBusy(true)
    try {
      const res = await previewEquivalencyImport(file)
      setPreview(res.data)
      setFilter('')
    } catch (err) {
      notify.error(apiMessage(err, 'The file could not be checked'))
    } finally {
      setBusy(false)
    }
  }

  const c = preview?.counts || { new: 0, update: 0, duplicate: 0, invalid: 0, total: 0 }
  const importable = c.new + (updateExisting ? c.update : 0)

  const commit = async () => {
    setBusy(true)
    try {
      const rows = preview.rows.map(({ row, institution, course_code, title, outcome, bu_course, note }) => ({ row, institution, course_code, title, outcome, bu_course, note }))
      const res = await commitEquivalencyImport(rows, updateExisting)
      setSummary(res.data)
      onDone?.(res.data)
    } catch (err) {
      notify.error(apiMessage(err, 'The import failed; nothing was changed'))
    } finally {
      setBusy(false)
    }
  }

  const shownRows = (preview?.rows || []).filter(r => !filter || r.status === filter)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import equivalencies from CSV" size="xl">
      {summary ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-900">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-[14px]">
              <p className="font-semibold">Import complete</p>
              <p className="mt-0.5">
                {summary.added} added · {summary.updated} updated · {summary.skipped_duplicates} duplicates skipped
                {summary.skipped_existing ? ` · ${summary.skipped_existing} existing left unchanged` : ''} · {summary.invalid} invalid
              </p>
              <p className="mt-1 text-[12.5px] text-emerald-800">New and updated equivalencies apply to future transcripts. Decisions already made stay as they were.</p>
            </div>
          </div>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" id="eq-import-file"
              onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null) }} />
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />{file ? 'Choose another file' : 'Choose CSV file'}
            </Button>
            <span className="text-[13px] text-staff-ink2 truncate max-w-[16rem]" title={file?.name}>{file ? file.name : 'No file chosen'}</span>
            <Button onClick={runPreview} loading={busy && !preview} disabled={!file}>Preview</Button>
            <button type="button" onClick={downloadTemplate} className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700 hover:underline">
              <Download className="w-4 h-4" aria-hidden="true" />Download template
            </button>
          </div>
          <p className="text-[12.5px] text-staff-muted">
            Columns: <span className="font-mono">institution, course, title, outcome, bu_course, note</span>. Outcome is BU equivalent, Elective credit or No credit;
            bu_course is required for BU equivalent (join a combined award with +). Up to 1,000 rows, 2 MB.
          </p>

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]" role="group" aria-label="Show rows">
                {[['', 'All', c.total], ['new', 'New', c.new], ['update', 'Updates', c.update], ['duplicate', 'Duplicates', c.duplicate], ['invalid', 'Invalid', c.invalid]].map(([k, label, n]) => (
                  <button key={k || 'all'} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium border ${filter === k ? 'bg-staff-ink border-staff-ink text-white' : 'bg-white border-staff-line text-staff-ink2 hover:border-slate-300'}`}>
                    {label}<span className={`tabular-nums ${filter === k ? 'text-white/70' : 'text-staff-muted'}`}>{n}</span>
                  </button>
                ))}
                <span className="ml-auto text-staff-ink2">{c.new} new · {c.update} updates · {c.duplicate} duplicates · {c.invalid} invalid</span>
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-lg border border-staff-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-staff-sunk text-left text-staff-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Course</th>
                      <th className="px-3 py-2 font-medium">Award</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-staff-line2">
                    {shownRows.map(r => (
                      <tr key={r.row} className="align-top">
                        <td className="px-3 py-2 tabular-nums text-staff-muted">{r.row}</td>
                        <td className="px-3 py-2 min-w-0">
                          <span className="font-mono font-semibold text-staff-ink">{r.course_code || '—'}</span>
                          <span className="block text-staff-muted truncate max-w-[18rem]" title={r.institution}>{r.institution || '—'}{r.title ? ` · ${r.title}` : ''}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.status === 'invalid' ? (r.bu_course || r.outcome || '—') : awardOf(r)}</td>
                        <td className="px-3 py-2">
                          <StatusPill tone={ROW_TONES[r.status]}>{ROW_LABELS[r.status]}</StatusPill>
                          {r.reason && <span className={`block mt-1 text-[12px] ${r.status === 'invalid' ? 'text-red-700' : 'text-staff-muted'}`}>{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                    {!shownRows.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-staff-muted">No rows.</td></tr>}
                  </tbody>
                </table>
              </div>
              <label className={`flex items-start gap-2.5 text-[13.5px] ${c.update ? 'text-staff-ink' : 'text-staff-muted'}`}>
                <input type="checkbox" className="mt-0.5" checked={updateExisting} disabled={!c.update} onChange={e => setUpdateExisting(e.target.checked)} />
                <span>Also update existing equivalencies ({c.update})
                  <span className="block text-[12px] text-staff-muted">Otherwise rows for courses that already have a different equivalency are left as they are.</span>
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[12.5px] text-staff-muted mr-auto">Everything is imported together, or nothing is if an error occurs. Invalid rows and duplicates are skipped.</span>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={commit} loading={busy} disabled={!importable}>
                  <Upload className="w-4 h-4" aria-hidden="true" />Import {importable} {importable === 1 ? 'row' : 'rows'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
