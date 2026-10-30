import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserRound, UserPlus, ChevronRight, ChevronLeft, AlertTriangle, Copy } from 'lucide-react'
import { listApplications } from '../../api/applications'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/staff/PageHeader'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { StagePill } from '../evaluator/ApplicationLookup'
import { SubmissionFlow } from '../applicant/TransferCreditApplication'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Staff upload a transcript for a student: choose who it is for, then the student submission flow itself (staff
// mode: same reading, review and corrections; the staff APIs create, attach and submit; the student is emailed).
export default function UploadForStudent() {
  const { user } = useAuth()
  const [student, setStudent] = useState(null)
  const [choosing, setChoosing] = useState(true)
  // The manual form (/evaluator/applications/new) is open to administrators only
  const manualEntry = user?.role === 'admin' ? '/evaluator/applications/new' : null
  const onBehalf = useMemo(() => ({ user, student, manualEntry, onChangeStudent: () => setChoosing(true) }), [user, student, manualEntry])

  return (
    <>
      {choosing && (
        <WhoStep current={student} manualEntry={manualEntry}
          onPick={(s) => { setStudent(s); setChoosing(false); window.scrollTo({ top: 0 }) }}
          onCancel={student ? () => setChoosing(false) : null} />
      )}
      {/* The flow stays mounted while the student is changed, so transcripts already read are kept */}
      <div hidden={choosing} className="-mt-2 rounded-2xl overflow-hidden ring-1 ring-staff-line shadow-card">
        <SubmissionFlow onBehalf={onBehalf} />
      </div>
    </>
  )
}

// Matching applications grouped into students (by email): name, email, Transfer Credit IDs, latest status
function groupStudents(rows) {
  const by = new Map()
  for (const a of rows) {
    const key = String(a.student_email || '').toLowerCase()
    if (!key) continue
    if (!by.has(key)) by.set(key, { name: a.student_name, email: a.student_email, earlier: [] })
    by.get(key).earlier.push(a)
  }
  return [...by.values()].map(s => {
    const earlier = [...s.earlier].sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
    return { ...s, name: earlier[0].student_name || s.name, earlier }
  })
}

function WhoStep({ current, manualEntry, onPick, onCancel }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState({ loading: false, students: null, error: '' })
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  // Debounced search over the existing applications list (name, email, Transfer Credit ID, institution, Student ID)
  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) { setResults({ loading: false, students: null, error: '' }); return undefined }
    let cancelled = false
    setResults(r => ({ ...r, loading: true, error: '' }))
    const t = setTimeout(async () => {
      try {
        const { data } = await listApplications({ search: q, limit: 50, sort: 'created_at', order: 'desc' })
        if (!cancelled) setResults({ loading: false, students: groupStudents(data || []), error: '' })
      } catch (err) {
        if (!cancelled) setResults({ loading: false, students: null, error: err.response?.data?.message || 'The search could not be run. Try again.' })
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [term])

  const startNew = () => {
    setAdding(true)
    const q = term.trim()
    if (EMAIL.test(q)) setEmail(q)
    else if (q && !/\d/.test(q)) setName(q)
  }
  const newOk = name.trim().length >= 2 && EMAIL.test(email.trim())

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Credit Evaluations" title="Upload transcript for a student"
        subtitle="The student's transcripts are read and checked as on the student form. The student receives the confirmation email." />

      <section className="staff-card overflow-hidden">
        <header className="px-5 sm:px-6 py-4 border-b border-staff-line flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-red-50 text-brand grid place-items-center flex-shrink-0"><UserRound className="w-[18px] h-[18px]" /></span>
          <span className="flex-1 min-w-0">
            <h2 className="text-[15.5px] font-semibold text-staff-ink">Who is this for?</h2>
            <p className="text-[12.5px] text-staff-muted">Find the student by name, email, Transfer Credit ID or Student ID, or add a new student</p>
          </span>
          <span className="staff-eyebrow hidden sm:inline">Before you upload</span>
        </header>

        {!adding ? (
          <div className="p-5 sm:p-6 space-y-4">
            <label className="relative block">
              <span className="sr-only">Search students</span>
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, email, Transfer Credit ID or Student ID"
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              {results.loading && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand" />}
            </label>

            {results.error && <p className="text-sm text-red-700 flex gap-1.5" role="alert"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{results.error}</p>}

            {results.students && (
              results.students.length ? (
                <ul className="rounded-xl border border-staff-line divide-y divide-staff-line overflow-hidden" aria-label="Matching students">
                  {results.students.map(s => <StudentRow key={s.email} s={s} onPick={() => onPick(s)} />)}
                </ul>
              ) : (
                <p className="text-sm text-staff-muted rounded-xl border border-dashed border-staff-line px-4 py-5 text-center">No student matches "{term.trim()}". Add them as a new student.</p>
              )
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="flex items-center gap-2">
                {onCancel && <Button variant="secondary" onClick={onCancel}><ChevronLeft className="w-4 h-4" />Keep {current?.name || 'current student'}</Button>}
                {!onCancel && <Link to="/admin/applications" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft className="w-4 h-4" />Credit Evaluations</Link>}
              </span>
              <Button variant="brand" onClick={startNew}><UserPlus className="w-4 h-4" />New student</Button>
            </div>
          </div>
        ) : (
          <form className="p-5 sm:p-6 space-y-4" onSubmit={e => { e.preventDefault(); if (newOk) onPick({ name: name.trim(), email: email.trim(), earlier: [], isNew: true }) }}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Student's full name" required value={name} onChange={e => setName(e.target.value)} placeholder="As on the transcript" autoFocus />
              <Input label="Student's email address" required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@example.com"
                error={email && !EMAIL.test(email.trim()) ? 'Enter a valid email address' : ''} helperText="The confirmation email and every update go here" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setAdding(false)}><ChevronLeft className="w-4 h-4" />Search instead</Button>
              <Button type="submit" variant="brand" disabled={!newOk}>Continue<ChevronRight className="w-4 h-4" /></Button>
            </div>
          </form>
        )}
      </section>

      {manualEntry && (
        <p className="text-sm text-staff-muted">
          No transcript? <Link to={manualEntry} className="font-semibold text-brand hover:underline">Enter details without a transcript</Link>
        </p>
      )}
    </div>
  )
}

function StudentRow({ s, onPick }) {
  const latest = s.earlier[0]
  const n = s.earlier.length
  return (
    <li>
      <button type="button" onClick={onPick} className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-staff-sunk/60 focus:outline-none focus-visible:bg-staff-sunk">
        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white grid place-items-center text-[13px] font-semibold flex-shrink-0" aria-hidden="true">
          {(s.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold text-staff-ink truncate">{s.name}</span>
          <span className="block text-[12.5px] text-staff-muted truncate">{s.email}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.earlier.slice(0, 4).map(a => <span key={a.id} className="rounded-full border border-staff-line px-2 py-0.5 font-mono text-[11px] text-staff-ink2">{a.reference_number}</span>)}
            {n > 4 && <span className="text-[11.5px] text-staff-muted">+{n - 4} more</span>}
          </span>
        </span>
        <span className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
          {latest?.stage ? <StagePill stage={latest.stage} /> : <span className="text-[12px] text-staff-muted capitalize">{String(latest?.status || '').replace(/_/g, ' ')}</span>}
          <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-800"><Copy className="w-3 h-3" aria-hidden="true" />{n} earlier evaluation{n === 1 ? '' : 's'}; a new one is flagged for duplicate review</span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
      </button>
    </li>
  )
}
