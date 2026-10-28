import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check, Info, Lock, Mail, Pencil, FileSearch, Send, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  startApplication, updateDraftApplication, submitApplicationForEvaluation, getApplicationStatus,
  checkExistingApplications, emailApplicationNumbers
} from '../../api/student'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import DocumentDropzone, { ACCEPTED, formatSize } from '../../components/applicant/DocumentDropzone'
import { PROGRAMS, TERMS, PROGRAM_DEPARTMENTS } from '../../lib/application'

// Transfer Credit Evaluation: an admitted transfer student submits transcripts; no account needed. The application is saved as a draft once the
// applicant's details are entered, documents upload to it as they are chosen (transcripts are read on upload),
// and submitting starts processing on the server. The application number and email are then used to track it.
const STEPS = [
  { id: 1, label: 'Student Information' },
  { id: 2, label: 'Academic Documents' },
  { id: 3, label: 'Additional Information' },
  { id: 4, label: 'Review & Submit' }
]
const DRAFT_KEY = 'bu.transfer.application'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COMMENTS_MAX = 5000

const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || null } catch { return null } }
const saveDraft = (d) => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* private mode */ } }
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* private mode */ } }

const EMPTY = { first_name: '', last_name: '', email: '', confirm_email: '', institution: '', program: '', term: '' }

function toPayload(d) {
  return {
    student_name: `${d.first_name.trim()} ${d.last_name.trim()}`,
    student_email: d.email.trim(),
    transfer_from_institution: d.institution.trim(),
    transfer_to_program: PROGRAMS.find(p => p.value === d.program)?.label || d.program,
    transfer_to_department: PROGRAM_DEPARTMENTS[d.program] || null,
    expected_start_term: TERMS.find(t => t.value === d.term)?.label || d.term
  }
}

export default function TransferCreditApplication() {
  const { user, isAuthenticated, loading } = useAuth()
  if (loading) return <PageSpinner />
  if (isAuthenticated && user.role !== 'student') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900">You are signed in as staff</h1>
        <p className="text-gray-500 mt-2">Students submit transcripts without an account. Staff raise applications from the staff portal.</p>
      </div>
    )
  }
  return <ApplicationWizard accountEmail={isAuthenticated ? user.email : null} />
}

function ApplicationWizard({ accountEmail }) {
  const navigate = useNavigate()
  // ?resume=<token>: a draft opened from the student portal (accounts created before applicant-first intake)
  const resume = new URLSearchParams(window.location.search).get('resume')
  const saved = readDraft() || (resume ? { token: resume, step: 2, details: null } : null)
  const [step, setStep] = useState(saved?.step || 1)
  const [details, setDetails] = useState(saved?.details || { ...EMPTY, email: accountEmail || '', confirm_email: accountEmail || '' })
  const [token, setToken] = useState(saved?.token || null)
  const [savedEmail, setSavedEmail] = useState(saved?.details?.email || null)
  const [transcripts, setTranscripts] = useState([])
  const [supporting, setSupporting] = useState([])
  const [comments, setComments] = useState(saved?.comments || '')
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(Boolean(saved?.token))
  const [existing, setExisting] = useState(null)

  // Coming back to an unfinished application in this browser session: reload its documents
  useEffect(() => {
    if (!saved?.token) return
    getApplicationStatus(saved.token).then(res => {
      const a = res.data || res
      if (a.status !== 'draft') { clearDraft(); navigate(`/status/${saved.token}`, { replace: true }); return }
      if (!saved.details) {
        const [first, ...rest] = (a.student_name || '').split(' ')
        setDetails({
          first_name: first || '', last_name: rest.join(' '), email: a.student_email || '', confirm_email: a.student_email || '',
          institution: a.transfer_from_institution || '', program: PROGRAMS.find(p => p.label === a.transfer_to_program)?.value || '',
          term: TERMS.find(t => t.label === a.expected_start_term)?.value || ''
        })
        setSavedEmail(a.student_email || null)
      }
      const asItem = d => ({ key: d.id, documentId: d.id, name: d.file_name, size: d.file_size || 0, kind: ACCEPTED[(d.file_name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()] || 'File', status: 'uploaded', progress: 100 })
      setTranscripts((a.documents || []).filter(d => d.document_type === 'transcript').map(asItem))
      setSupporting((a.documents || []).filter(d => d.document_type !== 'transcript').map(asItem))
    }).catch(() => { clearDraft(); setToken(null); setStep(1) }).finally(() => setRestoring(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { saveDraft({ step, details, token, comments }) }, [step, details, token, comments])

  const set = (key, value) => { setDetails(p => ({ ...p, [key]: value })); setErrors(p => ({ ...p, [key]: '' })) }
  const go = (s) => { setStep(s); setErrors({}); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const validateDetails = () => {
    const e = {}
    if (!details.first_name.trim()) e.first_name = 'Enter your first name'
    if (!details.last_name.trim()) e.last_name = 'Enter your last name'
    if (!EMAIL.test(details.email.trim())) e.email = 'Enter a valid email address'
    else if (!accountEmail && details.email.trim().toLowerCase() !== details.confirm_email.trim().toLowerCase()) e.confirm_email = 'The email addresses do not match'
    if (details.institution.trim().length < 2) e.institution = 'Enter the college or university you attended'
    if (!details.program) e.program = 'Select your intended program'
    if (!details.term) e.term = 'Select your intended start term'
    return e
  }

  // Saves the applicant's details: creates the draft the first time, updates it after that
  const saveDetails = async () => {
    if (!token) {
      const { data } = await startApplication(toPayload(details))
      setToken(data.secure_token)
    } else {
      await updateDraftApplication(token, toPayload(details))
    }
    setSavedEmail(details.email.trim())
  }

  const continueFromDetails = async ({ skipExistingCheck = false } = {}) => {
    const e = validateDetails()
    if (Object.keys(e).length) { setErrors(e); return }
    setBusy(true)
    try {
      const emailChanged = details.email.trim().toLowerCase() !== (savedEmail || '').toLowerCase()
      if (!skipExistingCheck && emailChanged) {
        const { data } = await checkExistingApplications(details.email.trim())
        if (data.exists) { setExisting(data); return }
      }
      await saveDetails()
      setExisting(null)
      go(2)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Your details could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const uploadsPending = [...transcripts, ...supporting].some(i => ['uploading', 'queued'].includes(i.status))
  const uploadedTranscripts = transcripts.filter(i => i.status === 'uploaded')

  const continueFromDocuments = () => {
    if (uploadsPending) { setErrors({ documents: 'Wait for your files to finish uploading.' }); return }
    if (!uploadedTranscripts.length) { setErrors({ transcripts: 'Upload your academic transcript to continue.' }); return }
    go(3)
  }

  const submit = async () => {
    if (!confirmed) { setErrors({ confirmed: 'Confirm that your information is accurate to submit.' }); return }
    setBusy(true)
    try {
      const { data } = await submitApplicationForEvaluation(token, comments.trim())
      clearDraft()
      navigate('/apply/submitted', { replace: true, state: { ...data, applicant: details.first_name.trim() } })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Your application could not be submitted. Please try again.')
      setBusy(false)
    }
  }

  if (restoring) return <PageSpinner />

  const programLabel = PROGRAMS.find(p => p.value === details.program)?.label
  const termLabel = TERMS.find(t => t.value === details.term)?.label

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
      {/* Page header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <p className="text-sm font-semibold text-brand tracking-wide uppercase">Boston University · Transfer Credit</p>
          <h1 className="font-display text-3xl sm:text-[34px] font-semibold text-gray-900 mt-2 leading-tight">Transfer Credit Evaluation</h1>
          <p className="text-gray-600 mt-3 text-[15px] leading-relaxed max-w-2xl">
            For admitted transfer students. Submit the final transcript from every college you attended, plus any supporting
            documents. Each course is evaluated for BU credit, and you receive an application number to follow the evaluation. No account is needed.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5"><FileSearch className="w-4 h-4" />About 5 minutes</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="w-4 h-4" />Your documents are private</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="w-4 h-4" />Updates by email</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={step} />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mt-6">
          {step === 1 && existing && (
            <ExistingApplications
              email={details.email.trim()}
              result={existing}
              busy={busy}
              onAnother={() => continueFromDetails({ skipExistingCheck: true })}
              onBack={() => setExisting(null)}
            />
          )}

          {step === 1 && !existing && (
            <StepBody title="Student Information" intro="We use your email address to send updates and to let you track your application.">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="First name" required autoComplete="given-name" value={details.first_name} onChange={e => set('first_name', e.target.value)} error={errors.first_name} />
                <Input label="Last name" required autoComplete="family-name" value={details.last_name} onChange={e => set('last_name', e.target.value)} error={errors.last_name} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Email address" required type="email" autoComplete="email" value={details.email} disabled={Boolean(accountEmail)}
                  onChange={e => set('email', e.target.value)} error={errors.email} placeholder="you@example.com" />
                {!accountEmail && (
                  <Input label="Confirm email address" required type="email" autoComplete="email" value={details.confirm_email}
                    onChange={e => set('confirm_email', e.target.value)} error={errors.confirm_email} onPaste={e => e.preventDefault()} />
                )}
              </div>
              <Input label="Previous college or university" required value={details.institution} onChange={e => set('institution', e.target.value)}
                error={errors.institution} placeholder="e.g., Riverside Community College"
                helperText="Attended more than one? Name the most recent; you can upload a transcript from each in the next step." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Select label="Intended program at BU" required options={PROGRAMS} value={details.program} onChange={e => set('program', e.target.value)} error={errors.program} placeholder="Select a program" />
                <Select label="Intended start term" required options={TERMS} value={details.term} onChange={e => set('term', e.target.value)} error={errors.term} placeholder="Select a term" />
              </div>
              <p className="text-xs text-gray-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Transfer credit must be transferred within one year of starting at BU.</p>
            </StepBody>
          )}

          {step === 2 && (
            <StepBody title="Academic Documents" intro="Files upload as you add them. You can remove a file and upload it again before you submit.">
              <DocumentDropzone token={token} documentType="transcript" items={transcripts} onChange={l => { setTranscripts(l); setErrors({}) }}
                invalid={Boolean(errors.transcripts)}
                title={<>Academic Transcript <span className="ml-1 text-xs font-semibold text-brand align-middle">Required</span></>}
                hint="Upload your transcript from your previous institution. Attended more than one college? Upload a transcript from each." />
              {errors.transcripts && <p className="text-sm text-red-700 -mt-3 flex gap-1.5" role="alert"><AlertCircle className="w-4 h-4 mt-0.5" />{errors.transcripts}</p>}

              <div className="border-t border-gray-100 pt-6">
                <DocumentDropzone token={token} documentType="supporting" items={supporting} onChange={l => { setSupporting(l); setErrors({}) }}
                  title={<>Supporting Documents <span className="ml-1 text-xs font-medium text-gray-500 align-middle">Optional</span></>}
                  hint="For example a course syllabus, course descriptions, or additional academic records. If a department needs a syllabus for a course, we will ask you for it." />
              </div>
              {errors.documents && <p className="text-sm text-amber-700" role="alert">{errors.documents}</p>}
            </StepBody>
          )}

          {step === 3 && (
            <StepBody title="Additional Information" intro="Optional. This is shared with the transfer credit team with your application.">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">Is there anything else you would like the transfer credit team to know?</span>
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value.slice(0, COMMENTS_MAX))}
                  rows={7}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  placeholder="For example: a course that was renamed, coursework taken at another institution, or a transcript that is on its way."
                />
                <span className="block text-right text-xs text-gray-400 mt-1">{comments.length.toLocaleString()} / {COMMENTS_MAX.toLocaleString()}</span>
              </label>
            </StepBody>
          )}

          {step === 4 && (
            <StepBody title="Review & Submit" intro="Check your application before you submit it.">
              <ReviewBlock title="Student Information" onEdit={() => go(1)}>
                <Field label="Name" value={`${details.first_name} ${details.last_name}`} />
                <Field label="Email address" value={details.email} />
                <Field label="Previous institution" value={details.institution} />
                <Field label="Intended program" value={programLabel} />
                <Field label="Intended start term" value={termLabel} />
              </ReviewBlock>
              <ReviewBlock title="Academic Documents" onEdit={() => go(2)}>
                <div className="sm:col-span-2 space-y-1.5">
                  {[...uploadedTranscripts.map(i => ['Transcript', i]), ...supporting.filter(i => i.status === 'uploaded').map(i => ['Supporting', i])].map(([kind, i]) => (
                    <p key={i.key} className="text-sm text-gray-900 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-gray-500 w-20 flex-shrink-0">{kind}</span><span className="truncate">{i.name}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">{formatSize(i.size)}</span>
                    </p>
                  ))}
                </div>
              </ReviewBlock>
              <ReviewBlock title="Additional Information" onEdit={() => go(3)}>
                <p className="sm:col-span-2 text-sm text-gray-900 whitespace-pre-wrap">{comments.trim() || <span className="text-gray-400">None</span>}</p>
              </ReviewBlock>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 leading-relaxed">
                <p className="font-semibold text-gray-900 mb-1">What happens next</p>
                Your transcript is processed and each course is checked against Boston University's transfer equivalency records.
                Courses with an established equivalency are evaluated straight away; others are reviewed by the academic department.
                The Credit Evaluation Office completes a final review before credit is posted. We will email you at each important stage.
              </div>

              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                errors.confirmed ? 'border-red-300 bg-red-50' : confirmed ? 'border-brand/60 bg-red-50/40' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setErrors({}) }} className="mt-0.5 w-4 h-4 accent-[#cc0000] flex-shrink-0" />
                <span className="text-sm text-gray-700">I confirm that the information and documents I have provided are accurate and complete.</span>
              </label>
              {errors.confirmed && <p className="text-sm text-red-700 -mt-3" role="alert">{errors.confirmed}</p>}
            </StepBody>
          )}

          {!(step === 1 && existing) && (
            <footer className="flex items-center justify-between gap-3 px-5 sm:px-8 py-5 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
              {step === 1 ? (
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft className="w-4 h-4" />Home</Link>
              ) : (
                <Button variant="secondary" onClick={() => go(step - 1)} disabled={busy}><ChevronLeft className="w-4 h-4" />Back</Button>
              )}
              <span className="hidden sm:block text-xs text-gray-400">Step {step} of {STEPS.length}</span>
              {step === 1 && <Button onClick={() => continueFromDetails()} loading={busy}>Continue<ChevronRight className="w-4 h-4" /></Button>}
              {step === 2 && <Button onClick={continueFromDocuments} disabled={uploadsPending}>Continue<ChevronRight className="w-4 h-4" /></Button>}
              {step === 3 && <Button onClick={() => go(4)}>Continue<ChevronRight className="w-4 h-4" /></Button>}
              {step === 4 && <Button onClick={submit} loading={busy}><Send className="w-4 h-4" />Submit Application</Button>}
            </footer>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already submitted? <Link to="/track" className="font-semibold text-brand hover:underline">Track your application</Link>
        </p>
      </div>
    </div>
  )
}

// An earlier application exists for this email. Numbers are masked here; the full number goes only to the email.
function ExistingApplications({ email, result, busy, onAnother, onBack }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const send = async () => {
    setSending(true)
    try { await emailApplicationNumbers(email); setSent(true) } catch { toast.error('We could not send the email. Please try again.') } finally { setSending(false) }
  }
  return (
    <div className="px-5 sm:px-8 py-7">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 grid place-items-center flex-shrink-0"><FileSearch className="w-5 h-5" /></span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">We found an existing transfer credit application</h2>
          <p className="text-sm text-gray-600 mt-1">We already have {result.applications.length === 1 ? 'an application' : `${result.applications.length} applications`} associated with <span className="font-medium text-gray-900">{email}</span>.</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {result.applications.map((a, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 py-3 text-sm">
            <div><p className="text-xs text-gray-500">Application number</p><p className="font-mono text-gray-900">{a.masked_reference}</p></div>
            <div><p className="text-xs text-gray-500">Submitted</p><p className="text-gray-900">{new Date(a.submitted_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</p></div>
            <div><p className="text-xs text-gray-500">Current status</p><StatusChip tone={a.tone}>{a.status_label}</StatusChip></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">For your privacy, part of the application number is hidden. The full number is in your confirmation email.</p>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link to="/track" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark">Track Existing Application</Link>
        <Button variant="secondary" onClick={send} loading={sending} disabled={sent}><Mail className="w-4 h-4" />{sent ? 'Application number sent' : 'Email me my application number'}</Button>
      </div>
      {sent && <p className="text-sm text-green-700 mt-3">We sent the application number{result.applications.length > 1 ? 's' : ''} to {email}.</p>}

      <div className="mt-7 pt-6 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Need another evaluation?</h3>
        <p className="text-sm text-gray-600 mt-1">
          {result.has_active
            ? 'You can submit another application, for example for coursework from another institution or a different start term. Because your earlier application is still in progress, the Credit Evaluation Office will review the two together before any credit is posted.'
            : 'Your earlier application is complete. You can submit a new application, for example for coursework you have taken since.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={onAnother} loading={busy}>Submit Another Application<ChevronRight className="w-4 h-4" /></Button>
          <button type="button" onClick={onBack} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2"><Pencil className="w-3.5 h-3.5 inline mr-1" />Use a different email</button>
        </div>
      </div>
    </div>
  )
}

const CHIP = { done: 'bg-green-50 text-green-800 border-green-200', action: 'bg-amber-50 text-amber-900 border-amber-300', progress: 'bg-blue-50 text-blue-800 border-blue-200', waiting: 'bg-gray-50 text-gray-700 border-gray-200' }
function StatusChip({ tone, children }) {
  return <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${CHIP[tone] || CHIP.waiting}`}>{children}</span>
}

function Stepper({ step }) {
  return (
    <ol className="flex items-start" aria-label="Application steps">
      {STEPS.map((s, i) => {
        const done = step > s.id
        const current = step === s.id
        return (
          <li key={s.id} className="flex-1 flex flex-col items-center relative" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 -z-0 ${step >= s.id ? 'bg-brand' : 'bg-gray-200'}`} aria-hidden="true" />}
            <span className={`relative z-10 w-8 h-8 rounded-full grid place-items-center text-sm font-semibold ring-4 ring-gray-50 ${
              done ? 'bg-brand text-white' : current ? 'bg-white text-brand border-2 border-brand' : 'bg-white text-gray-400 border-2 border-gray-200'
            }`}>{done ? <Check className="w-4 h-4" /> : s.id}</span>
            <span className={`mt-2 text-[11px] sm:text-xs text-center font-medium leading-tight px-1 ${current ? 'text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function StepBody({ title, intro, children }) {
  return (
    <div className="px-5 sm:px-8 py-7 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {intro && <p className="text-sm text-gray-500 mt-1">{intro}</p>}
      </div>
      {children}
    </div>
  )
}

function ReviewBlock({ title, onEdit, children }) {
  return (
    <section className="rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-medium text-brand hover:underline inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />Edit</button>
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 px-4 py-4">{children}</dl>
    </section>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{value || '—'}</dd>
    </div>
  )
}

function PageSpinner() {
  return <div className="flex justify-center py-24"><Spinner size="lg" className="text-brand" /></div>
}
