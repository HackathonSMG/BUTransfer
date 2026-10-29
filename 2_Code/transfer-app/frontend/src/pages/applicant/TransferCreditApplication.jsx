import React, { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Check, Lock, Mail, FileSearch, Send, AlertCircle, AlertTriangle, CheckCircle2,
  UploadCloud, FileText, X, RotateCcw, Loader2, ChevronDown, Pencil
} from 'lucide-react'
import notify from '../../lib/notify'
import {
  readTranscriptFile, startApplication, uploadApplicationDocument, submitApplicationForEvaluation,
  checkExistingApplications, emailApplicationNumbers
} from '../../api/student'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import PublicHero from '../../components/layout/PublicHero'
import { ACCEPTED, MAX_MB, formatSize } from '../../components/applicant/DocumentDropzone'
import { PROGRAMS, TERMS, PROGRAM_DEPARTMENTS } from '../../lib/application'
import { homeFor, ROLE_LABELS } from '../../lib/homeFor'

// Transfer Credit Evaluation for an admitted student, transcript first:
//   1. upload the official transcript(s); each is read straight away with the existing transcript reader
//      (nothing is stored yet): institution, courses, and the header (name, student ID, BU major, BU start)
//   2. review what was read; only details the transcripts did not show are asked for (plus the email, which a
//      transcript never carries); confirm
//   3. submit: the existing draft -> upload -> submit APIs create ONE evaluation for all transcripts and return
//      the Transfer Credit ID
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COMMENTS_MAX = 5000
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
const uniq = (values) => [...new Set(values.map(v => (v || '').trim()).filter(Boolean))]
let seq = 0

export default function TransferCreditApplication() {
  const { user, isAuthenticated, loading, logout } = useAuth()
  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-brand" /></div>
  // A staff session on the student form: say whose session it is and offer both ways forward, rather than a dead end
  if (isAuthenticated && user.role !== 'student') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900">You are signed in as {user.full_name || user.email}</h1>
        <p className="text-sm text-gray-500 mt-1">{ROLE_LABELS[user.role] || user.role} account</p>
        <p className="text-gray-600 mt-4">Students submit transcripts without an account. To submit as a student, sign out first; staff create credit evaluations from the staff workspace.</p>
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <Link to={homeFor(user.role)}><Button variant="secondary">Go to my workspace</Button></Link>
          <Button onClick={() => logout()}>Sign out and continue as a student</Button>
        </div>
      </div>
    )
  }
  return <SubmissionFlow accountEmail={isAuthenticated ? user.email : null} />
}

function SubmissionFlow({ accountEmail }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [transcripts, setTranscripts] = useState([])
  const [supporting, setSupporting] = useState([])
  const [manual, setManual] = useState({ name: '', program: '', term: '' })
  // Detected details the student chose to correct; the transcript's value is kept and can be restored
  const [edited, setEdited] = useState({ name: false, program: false, term: false })
  const [email, setEmail] = useState(accountEmail || '')
  const [confirmEmail, setConfirmEmail] = useState(accountEmail || '')
  const [comments, setComments] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [existing, setExisting] = useState(null)
  const [allowAnother, setAllowAnother] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [submitError, setSubmitError] = useState('')
  const draft = useRef({ token: null, uploaded: new Set() })

  // ---- Transcripts: read each one as it is added ----
  const latest = useRef(transcripts)
  latest.current = transcripts
  const setList = (list) => { latest.current = list; setTranscripts(list) }
  const patch = (key, changes) => setList(latest.current.map(t => (t.key === key ? { ...t, ...changes } : t)))

  const read = async (item) => {
    patch(item.key, { status: 'reading', error: '' })
    try {
      const { data } = await readTranscriptFile(item.file)
      // review: what the student confirms (starts as the reading; the reading itself is never changed)
      const review = { institution: data.institution || '', courses: (data.courses || []).map(c => ({ ...c })) }
      patch(item.key, data.readable ? { status: 'read', result: data, review } : { status: 'unreadable', result: data, review, error: data.reason })
    } catch (err) {
      patch(item.key, { status: 'error', error: err.response?.data?.message || 'The file could not be uploaded. Check your connection and try again.' })
    }
  }
  const addTranscripts = (files) => {
    const fresh = []
    for (const f of Array.from(files || [])) {
      if (!ACCEPTED[extOf(f.name)]) { notify.error(`${f.name}: use a PDF, Word, JPG or PNG file.`); continue }
      if (f.size > MAX_MB * 1024 * 1024) { notify.error(`${f.name} is larger than ${MAX_MB} MB.`); continue }
      fresh.push({ key: `t${++seq}`, file: f, name: f.name, size: f.size, status: 'reading', result: null, error: '' })
    }
    if (!fresh.length) return
    setList([...latest.current, ...fresh])
    setConfirmed(false)
    fresh.forEach(read)
  }
  const removeTranscript = (key) => { setList(latest.current.filter(t => t.key !== key)); setConfirmed(false) }

  // ---- What the transcripts showed ----
  const readable = transcripts.filter(t => t.status === 'read')
  // A transcript that couldn't be read (a scan, say) can still be submitted; the Credit Evaluation Office reads it
  const usable = transcripts.filter(t => t.status === 'read' || t.status === 'unreadable')
  const reading = transcripts.some(t => t.status === 'reading')
  const heads = readable.map(t => t.result.student || {})
  const names = uniq(heads.map(h => h.name))
  const programs = uniq(heads.map(h => h.program))
  const terms = uniq(heads.map(h => h.start_term))
  const studentIds = uniq(heads.map(h => h.student_id))
  const institutions = uniq(usable.map(t => t.review.institution))
  const institutionsOk = usable.every(t => t.review.institution.trim().length >= 2)
  // A field counts as detected only when every transcript that shows it agrees
  const detected = { name: names.length === 1 ? names[0] : null, program: programs.length === 1 ? programs[0] : null, term: terms.length === 1 ? terms[0] : null }
  const own = (key) => edited[key] || !detected[key]
  const finalName = own('name') ? manual.name.trim() : detected.name
  const finalProgram = own('program') ? PROGRAMS.find(p => p.value === manual.program)?.label || '' : detected.program
  const finalTerm = own('term') ? TERMS.find(t => t.value === manual.term)?.label || '' : detected.term
  const final = { name: finalName, program: finalProgram, term: finalTerm }
  // Detected details the student changed: the transcript's value is sent beside the corrected one
  const correctedFields = Object.keys(detected).filter(k => detected[k] && edited[k] && final[k] && final[k] !== detected[k])
  const editDetail = (key) => {
    const options = key === 'program' ? PROGRAMS : key === 'term' ? TERMS : null
    const start = options ? options.find(o => o.label.toLowerCase() === String(detected[key]).toLowerCase())?.value || '' : detected[key]
    setManual(m => ({ ...m, [key]: start }))
    setEdited(e => ({ ...e, [key]: true }))
    setConfirmed(false)
  }
  const restoreDetail = (key) => { setEdited(e => ({ ...e, [key]: false })); setConfirmed(false) }
  const reviewTranscript = (key, review) => { patch(key, { review }); setConfirmed(false) }
  const emailOk = EMAIL.test(email.trim()) && (accountEmail || email.trim().toLowerCase() === confirmEmail.trim().toLowerCase())
  const ready = usable.length > 0 && !reading && institutionsOk && finalName.length >= 2 && finalProgram && finalTerm && emailOk
  const canSubmit = ready && confirmed && !submitting

  const goReview = () => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // ---- Submit: one evaluation for every transcript ----
  const submit = async () => {
    if (!canSubmit) return
    setSubmitError('')
    setSubmitting(true)
    try {
      if (!allowAnother && !draft.current.token) {
        setProgress('Checking for an earlier evaluation…')
        const { data } = await checkExistingApplications(email.trim())
        if (data.exists) { setExisting(data); setSubmitting(false); setProgress(''); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      }
      if (!draft.current.token) {
        setProgress('Creating your transfer credit evaluation…')
        const programValue = PROGRAMS.find(p => p.label.toLowerCase() === finalProgram.toLowerCase())?.value
        const { data } = await startApplication({
          student_name: finalName,
          student_email: email.trim(),
          transfer_from_institution: institutions.join('; '),
          transfer_to_program: finalProgram,
          transfer_to_department: PROGRAM_DEPARTMENTS[programValue] || null,
          expected_start_term: finalTerm,
          academic_history: {
            transcript_student_ids: studentIds,
            details_from_transcript: Object.keys(detected).filter(k => detected[k] && !correctedFields.includes(k)),
            ...(correctedFields.length && {
              corrected_fields: correctedFields,
              extracted: Object.fromEntries(correctedFields.map(k => [k, detected[k]]))
            })
          }
        })
        draft.current = { token: data.secure_token, uploaded: new Set() }
      }
      const files = [...transcripts.filter(t => t.status !== 'error').map(t => [t, 'transcript']), ...supporting.map(s => [s, 'supporting'])]
      for (const [i, [item, type]] of files.entries()) {
        if (draft.current.uploaded.has(item.key)) continue
        setProgress(`Uploading ${item.name} (${i + 1} of ${files.length})…`)
        // A transcript goes with what the student confirmed; the server keeps the original reading beside it
        const reviewed = type === 'transcript' && item.review
          ? { institution: item.review.institution.trim(), courses: item.status === 'read' ? item.review.courses : [] }
          : undefined
        await uploadApplicationDocument(draft.current.token, item.file, type, undefined, reviewed)
        draft.current.uploaded.add(item.key)
      }
      setProgress('Submitting for credit evaluation…')
      const { data } = await submitApplicationForEvaluation(draft.current.token, comments.trim())
      navigate('/apply/submitted', { replace: true, state: { ...data, student: finalName.split(' ')[0], institutions } })
    } catch (err) {
      setSubmitError(err.response?.data?.message || err.response?.data?.error?.message || 'Your transcripts could not be submitted. Check your connection and try again; files already sent are not sent twice.')
      setSubmitting(false)
      setProgress('')
    }
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
      <PublicHero title="Transfer Credit Evaluation"
        intro="For admitted transfer students. Upload the final transcript from every college you attended. We read your details and courses from the transcripts; you confirm them and submit. You then receive a Transfer Credit ID to follow the evaluation. No account is needed.">
        <span className="inline-flex items-center gap-1.5"><FileSearch className="w-4 h-4" />Details read from your transcript</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="w-4 h-4" />Nothing is stored until you submit</span>
        <span className="inline-flex items-center gap-1.5"><Mail className="w-4 h-4" />Updates by email</span>
      </PublicHero>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={step} />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mt-6">
          {existing && !allowAnother ? (
            <ExistingEvaluations email={email.trim()} result={existing} busy={submitting}
              onAnother={() => { setAllowAnother(true); setExisting(null) }} onBack={() => setExisting(null)} />
          ) : step === 1 ? (
            <Body title="Upload your official transcript(s)" intro="Add the final transcript from every college you attended. Each file is read as soon as you add it.">
              <TranscriptDrop onFiles={addTranscripts} />
              {transcripts.length > 0 && (
                <ul className="space-y-2">
                  {transcripts.map(t => <TranscriptItem key={t.key} t={t} onRemove={() => removeTranscript(t.key)} onRetry={() => read(t)} />)}
                </ul>
              )}
              {usable.length > 0 && !reading && readable.length === 0 && (
                <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex gap-1.5" role="status"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />No courses could be read automatically. You can still continue: the Credit Evaluation Office will read your transcript and enter the courses.</p>
              )}
            </Body>
          ) : (
            <Body title="Review and confirm" intro="Check the details read from your transcripts and correct anything that is wrong. Only what the transcripts did not show is asked for.">
              {/* Student details */}
              <section className="rounded-xl border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Student information</h3>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />Filled in from your transcript. Please check these are right, and edit anything that is wrong.</p>
                </div>
                <dl className="divide-y divide-gray-100">
                  <DetectedField label="Name" value={detected.name} conflict={names.length > 1 ? names : null}
                    edited={edited.name} onEdit={() => editDetail('name')} onRestore={() => restoreDetail('name')}
                    input={<Input aria-label="Your full name" value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} placeholder="Your full name" />} />
                  <DetectedField label="Student ID" value={studentIds.join(', ') || null} optional note="As printed on your transcript" />
                  <DetectedField label="BU program" value={detected.program} conflict={programs.length > 1 ? programs : null}
                    edited={edited.program} onEdit={() => editDetail('program')} onRestore={() => restoreDetail('program')}
                    note="Used for program rules and to route your courses"
                    input={<Select aria-label="BU program" options={PROGRAMS} value={manual.program} onChange={e => setManual(m => ({ ...m, program: e.target.value }))} placeholder="Select your BU program" />} />
                  <DetectedField label="BU start term" value={detected.term} conflict={terms.length > 1 ? terms : null}
                    edited={edited.term} onEdit={() => editDetail('term')} onRestore={() => restoreDetail('term')}
                    note="All transfer credit must be transferred within one year of starting at BU"
                    input={<Select aria-label="BU start term" options={TERMS} value={manual.term} onChange={e => setManual(m => ({ ...m, term: e.target.value }))} placeholder="Select your start term" />} />
                </dl>
              </section>

              {/* Transcripts */}
              <section className="rounded-xl border border-gray-200">
                <h3 className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Transcripts ({transcripts.length})</h3>
                <ul className="divide-y divide-gray-100">
                  {transcripts.map(t => <TranscriptSummary key={t.key} t={t} onReview={review => reviewTranscript(t.key, review)} />)}
                </ul>
                <button type="button" onClick={() => setStep(1)} className="px-4 py-3 border-t border-gray-100 w-full text-left text-sm font-medium text-brand hover:bg-gray-50">Add or remove transcripts</button>
              </section>

              {/* Contact */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Email for updates <span className="font-normal text-gray-500">(not on a transcript)</span></h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Email address" required type="email" autoComplete="email" value={email} disabled={Boolean(accountEmail)}
                    onChange={e => { setEmail(e.target.value); setAllowAnother(false); draft.current = { token: null, uploaded: new Set() } }} placeholder="you@example.com"
                    error={email && !EMAIL.test(email.trim()) ? 'Enter a valid email address' : ''} />
                  {!accountEmail && (
                    <Input label="Confirm email address" required type="email" autoComplete="email" value={confirmEmail} onPaste={e => e.preventDefault()}
                      onChange={e => setConfirmEmail(e.target.value)}
                      error={confirmEmail && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase() ? 'The email addresses do not match' : ''} />
                  )}
                </div>
              </section>

              {/* Optional */}
              <Optional title="Supporting documents (optional)">
                <p className="text-sm text-gray-500 mb-2">For example course descriptions or other academic records. If a department needs a syllabus for a course, we will ask you for it.</p>
                <SupportingFiles files={supporting} onChange={setSupporting} />
              </Optional>
              <Optional title="Additional information (optional)">
                <textarea value={comments} onChange={e => setComments(e.target.value.slice(0, COMMENTS_MAX))} rows={4} aria-label="Additional information"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  placeholder="Anything else the transfer credit team should know, for example a course that was renamed." />
              </Optional>

              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-colors ${ready ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'} ${confirmed ? 'border-brand/60 bg-red-50/40' : 'border-gray-200'}`}>
                <input type="checkbox" checked={confirmed} disabled={!ready} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#cc0000] flex-shrink-0" />
                <span className="text-sm text-gray-700">I confirm that the information above is correct and I want to submit these transcripts for transfer credit evaluation.</span>
              </label>
              {!ready && <p className="text-xs text-gray-500 -mt-3">Complete the details above to confirm.</p>}
              {progress && <p className="text-sm text-primary-700 flex items-center gap-2"><Spinner size="sm" />{progress}</p>}
              {submitError && <p className="text-sm text-red-700 flex gap-1.5" role="alert"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{submitError}</p>}
            </Body>
          )}

          {!(existing && !allowAnother) && (
            <footer className="flex items-center justify-between gap-3 px-5 sm:px-8 py-5 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
              {step === 1
                ? <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft className="w-4 h-4" />Home</Link>
                : <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}><ChevronLeft className="w-4 h-4" />Back</Button>}
              {step === 1
                ? <Button onClick={goReview} disabled={reading || usable.length === 0}>{reading ? <><Loader2 className="w-4 h-4 animate-spin" />Reading…</> : <>Review details<ChevronRight className="w-4 h-4" /></>}</Button>
                : <Button onClick={submit} disabled={!canSubmit} loading={submitting}><Send className="w-4 h-4" />Submit for Credit Evaluation</Button>}
            </footer>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already submitted? <Link to="/track" className="font-semibold text-brand hover:underline">Track your transfer credit</Link>
        </p>
      </div>
    </div>
  )
}

function TranscriptDrop({ onFiles }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  return (
    <div role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}
      className={`rounded-xl border-2 border-dashed px-5 py-9 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${over ? 'border-brand bg-red-50/60' : 'border-gray-300 bg-gray-50/60 hover:border-gray-400'}`}>
      <UploadCloud className={`w-10 h-10 mx-auto ${over ? 'text-brand' : 'text-gray-400'}`} />
      <p className="mt-2 text-sm text-gray-700"><span className="font-semibold text-brand">Choose transcript files</span> or drag and drop</p>
      <p className="text-xs text-gray-500 mt-1">One file per college · PDF, JPG and PNG transcripts are read automatically · up to {MAX_MB} MB each</p>
      <input ref={input} type="file" multiple className="sr-only" accept={Object.keys(ACCEPTED).join(',')} onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

function TranscriptItem({ t, onRemove, onRetry }) {
  const r = t.result
  return (
    <li className={`rounded-lg border px-3.5 py-3 bg-white ${t.status === 'read' ? 'border-gray-200' : t.status === 'reading' ? 'border-gray-200' : 'border-amber-300'}`}>
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${t.status === 'read' ? 'bg-green-50 text-green-700' : t.status === 'reading' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'}`}>
          {t.status === 'reading' ? <Loader2 className="w-4 h-4 animate-spin" /> : t.status === 'read' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900 truncate">{t.status === 'read' ? r.institution : t.name}</span>
          <span className="block text-xs text-gray-500 truncate">
            {t.status === 'reading' && `Reading ${t.name}…`}
            {t.status === 'read' && `${r.courses.length} course${r.courses.length === 1 ? '' : 's'} found · ${r.credit_system || 'calendar not shown'} · ${t.name} (${formatSize(t.size)})`}
            {['unreadable', 'error'].includes(t.status) && `${t.name} (${formatSize(t.size)})`}
          </span>
        </span>
        {t.status === 'error' && <button type="button" onClick={onRetry} className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100" aria-label={`Try ${t.name} again`}><RotateCcw className="w-4 h-4" /></button>}
        {t.status !== 'reading' && <button type="button" onClick={onRemove} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${t.name}`}><X className="w-4 h-4" /></button>}
      </div>
      {t.error && <p className="mt-1.5 text-xs text-amber-800">{t.error}{t.status === 'unreadable' && ' You can keep it with your submission; the Credit Evaluation Office will review it.'}</p>}
      {t.status === 'read' && <ReviewNotes notes={r.review_notes} />}
    </li>
  )
}

// What the transcript check found that may need more review, in plain language. Nothing is blocked: the student
// can still submit, and the notes say what to expect.
function ReviewNotes({ notes }) {
  if (!notes?.notes?.length) return null
  const attention = Boolean(notes.summary)
  return (
    <div className={`mt-2.5 rounded-md px-3 py-2 text-xs ${attention ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600'}`}>
      {attention && <p className="font-semibold">{notes.summary}</p>}
      <ul className={`${attention ? 'mt-1' : ''} space-y-0.5 list-disc pl-4`}>
        {notes.notes.map((n, i) => <li key={i}>{n.text}</li>)}
      </ul>
      {attention && <p className="mt-1 text-amber-800/90">You can still submit. We will contact you if anything else is needed.</p>}
    </div>
  )
}

// The fields of a course the student can correct; the original reading (t.result) is never changed
const COURSE_FIELDS = [
  { key: 'course_code', label: 'Course', className: 'w-28 font-mono' },
  { key: 'title', label: 'Title', className: 'min-w-[10rem]' },
  { key: 'term', label: 'Term', className: 'w-28' },
  { key: 'credits', label: 'Credits', className: 'w-16 text-right', numeric: true },
  { key: 'grade', label: 'Grade', className: 'w-14 text-right' },
]
const sameValue = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()
const changedFields = (original, course) => COURSE_FIELDS.filter(f => !sameValue(original[f.key], course[f.key])).map(f => f.label.toLowerCase())

function TranscriptSummary({ t, onReview }) {
  const r = t.result
  const review = t.review
  const [open, setOpen] = useState(Boolean(r?.check_carefully))
  const [editing, setEditing] = useState(false)
  const setInstitution = (institution) => onReview({ ...review, institution })
  // Not read automatically: only the institution is asked for; the office enters the courses
  if (t.status !== 'read') {
    return (
      <li className="px-4 py-3 space-y-2">
        <p className="text-sm text-amber-800 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{t.name}: courses not read automatically; the Credit Evaluation Office will read this transcript.</p>
        {review && (
          <Input label="College or university on this transcript" required value={review.institution} onChange={e => setInstitution(e.target.value)} placeholder="For example Northfield Community College"
            error={review.institution && review.institution.trim().length < 2 ? 'Enter the name of the college' : ''} />
        )}
      </li>
    )
  }
  const setCourse = (i, key, value) => onReview({ ...review, courses: review.courses.map((c, j) => (j === i ? { ...c, [key]: value } : c)) })
  const restoreCourse = (i) => onReview({ ...review, courses: review.courses.map((c, j) => (j === i ? { ...r.courses[i] } : c)) })
  const edits = review.courses.filter((c, i) => changedFields(r.courses[i], c).length).length
  const institutionEdited = Boolean(r.institution) && !sameValue(r.institution, review.institution)
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50">
        <span>
          <span className="block text-sm font-semibold text-gray-900">{review.institution || <span className="text-amber-700">College not shown on the transcript</span>}</span>
          <span className="block text-xs text-gray-500">
            {r.courses.length} course{r.courses.length === 1 ? '' : 's'} found · {r.credit_system || 'calendar not shown'}{r.student?.student_id ? ` · Student ID ${r.student.student_id}` : ''}
            {(edits > 0 || institutionEdited) && <span className="ml-1.5 text-brand font-medium">· {edits + (institutionEdited ? 1 : 0)} edited by you</span>}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {r.check_carefully && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              This transcript has a layout we see less often. Please check each course carefully and correct anything that was read wrongly.</p>
          )}
          <ReviewNotes notes={r.review_notes} />
          {(editing || !r.institution) && (
            <Input label="College or university" required value={review.institution} onChange={e => setInstitution(e.target.value)}
              error={review.institution.trim().length < 2 ? (r.institution ? 'Enter the name of the college' : 'Not shown on the transcript. Please enter it.') : ''} />
          )}
          {institutionEdited && <EditedNote original={r.institution} onRestore={() => setInstitution(r.institution)} />}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />From your transcript</p>
            <button type="button" onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              {editing ? <><Check className="w-3.5 h-3.5" />Done editing</> : <><Pencil className="w-3.5 h-3.5" />Correct a course</>}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {COURSE_FIELDS.map(f => <th key={f.key} className={`py-1.5 pr-3 ${f.numeric || f.key === 'grade' ? 'text-right' : ''}`}>{f.label}</th>)}
                <th className="py-1.5 w-8"><span className="sr-only">Changes</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {review.courses.map((c, i) => {
                  const changed = changedFields(r.courses[i], c)
                  return (
                    <tr key={i} className={changed.length ? 'bg-red-50/40' : ''}>
                      {COURSE_FIELDS.map(f => (
                        <td key={f.key} className={`py-1.5 pr-3 align-top ${f.numeric || f.key === 'grade' ? 'text-right' : ''}`}>
                          {editing ? (
                            <input aria-label={`${f.label}, course ${i + 1}`} value={c[f.key] ?? ''} inputMode={f.numeric ? 'decimal' : undefined}
                              onChange={e => setCourse(i, f.key, f.numeric ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)}
                              className={`px-2 py-1 text-sm border rounded-md outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${f.className} ${sameValue(r.courses[i][f.key], c[f.key]) ? 'border-gray-300' : 'border-brand/60'}`} />
                          ) : (
                            <span className={`${f.key === 'course_code' ? 'font-mono text-gray-900 whitespace-nowrap' : f.key === 'grade' ? 'font-medium' : f.key === 'title' ? 'text-gray-700' : 'text-gray-500 whitespace-nowrap'}`}
                              title={sameValue(r.courses[i][f.key], c[f.key]) ? 'From your transcript' : `Edited by you. Transcript shows: ${r.courses[i][f.key] ?? 'nothing'}`}>
                              {c[f.key] === '' || c[f.key] == null ? <span className="text-amber-700">not shown</span> : c[f.key]}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-1.5 align-top text-right">
                        {changed.length > 0 && (
                          <button type="button" onClick={() => restoreCourse(i)} className="p-1 rounded text-gray-400 hover:text-gray-800" aria-label={`Restore course ${i + 1} as read from the transcript`} title={`Edited: ${changed.join(', ')}. Restore the transcript's values`}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {edits > 0 && <p className="text-xs text-gray-500">Your corrections are sent with the transcript. The Credit Evaluation Office sees both what the transcript shows and what you changed; the file itself is not changed.</p>}
        </div>
      )}
    </li>
  )
}

function EditedNote({ original, onRestore }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-1">
      <span className="inline-flex items-center gap-1 font-medium text-brand"><Pencil className="w-3 h-3" aria-hidden="true" />Edited</span>
      <span>Transcript shows: <span className="text-gray-700">{original}</span></span>
      <button type="button" onClick={onRestore} className="font-semibold text-brand hover:underline">Restore</button>
    </span>
  )
}

// A value read from the transcript is marked "From your transcript" and can be edited (the transcript's value is
// kept and can be restored); a missing one asks for input (only for fields that are needed)
function DetectedField({ label, value, conflict, input, note, optional = false, edited = false, onEdit, onRestore }) {
  return (
    <div className="px-4 py-3 grid sm:grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 items-start">
      <dt className="text-sm text-gray-500 pt-0.5">{label}</dt>
      <dd className="min-w-0">
        {value && edited ? (
          <>
            {input}
            <EditedNote original={value} onRestore={onRestore} />
          </>
        ) : value ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-gray-900">{value}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />From your transcript
            </span>
            {onEdit && (
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" aria-label={`Edit ${label}`}>
                <Pencil className="w-3 h-3" aria-hidden="true" />Edit
              </button>
            )}
          </span>
        ) : optional ? (
          <span className="text-sm text-gray-400">Not shown on the transcript</span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs text-amber-700 mb-1.5"><AlertTriangle className="w-3.5 h-3.5" />
              {conflict ? `Your transcripts show different values (${conflict.join(' / ')}). Please enter the correct one.` : 'Not on your transcript. Please enter it.'}
            </span>
            {input}
          </>
        )}
        {note && <span className="block text-xs text-gray-500 mt-1">{note}</span>}
      </dd>
    </div>
  )
}

function SupportingFiles({ files, onChange }) {
  const input = useRef(null)
  const add = (list) => {
    const ok = Array.from(list || []).filter(f => {
      if (!ACCEPTED[extOf(f.name)]) { notify.error(`${f.name}: use a PDF, Word, JPG or PNG file.`); return false }
      if (f.size > MAX_MB * 1024 * 1024) { notify.error(`${f.name} is larger than ${MAX_MB} MB.`); return false }
      return true
    }).map(f => ({ key: `s${++seq}`, file: f, name: f.name, size: f.size }))
    onChange([...files, ...ok])
  }
  return (
    <div className="space-y-2">
      {files.map(f => (
        <div key={f.key} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
          <FileText className="w-4 h-4 text-gray-400" /><span className="flex-1 min-w-0 truncate text-sm text-gray-800">{f.name}</span>
          <span className="text-xs text-gray-400">{formatSize(f.size)}</span>
          <button type="button" onClick={() => onChange(files.filter(x => x.key !== f.key))} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove ${f.name}`}><X className="w-4 h-4" /></button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>Add supporting documents</Button>
      <input ref={input} type="file" multiple className="sr-only" accept={Object.keys(ACCEPTED).join(',')} onChange={e => { add(e.target.files); e.target.value = '' }} />
    </div>
  )
}

function Optional({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border border-gray-200">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3 flex items-center justify-between text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 rounded-xl">
        {title}<ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

// An earlier evaluation exists for this email. IDs are masked; the full ID is only emailed to the address itself.
function ExistingEvaluations({ email, result, busy, onAnother, onBack }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const send = async () => {
    setSending(true)
    try { await emailApplicationNumbers(email); setSent(true) } catch { notify.error('We could not send the email. Please try again.') } finally { setSending(false) }
  }
  return (
    <div className="px-5 sm:px-8 py-7">
      <h2 className="text-lg font-semibold text-gray-900">We found an earlier transfer credit evaluation</h2>
      <p className="text-sm text-gray-600 mt-1">Transcripts have already been submitted with <span className="font-medium text-gray-900">{email}</span>.</p>
      <div className="mt-5 rounded-xl border border-gray-200 divide-y divide-gray-100">
        {result.applications.map((a, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 py-3 text-sm">
            <div><p className="text-xs text-gray-500">Transfer Credit ID</p><p className="font-mono text-gray-900">{a.masked_reference}</p></div>
            <div><p className="text-xs text-gray-500">Submitted</p><p className="text-gray-900">{new Date(a.submitted_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</p></div>
            <div><p className="text-xs text-gray-500">Status</p><p className="text-gray-900">{a.status_label}</p></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">For your privacy, part of the Transfer Credit ID is hidden. The full ID is in your confirmation email.</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link to="/track" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark">Track Existing Evaluation</Link>
        <Button variant="secondary" onClick={send} loading={sending} disabled={sent}><Mail className="w-4 h-4" />{sent ? 'Transfer Credit ID sent' : 'Email me my Transfer Credit ID'}</Button>
      </div>
      <div className="mt-7 pt-6 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Submitting more transcripts?</h3>
        <p className="text-sm text-gray-600 mt-1">
          {result.has_active
            ? 'You can submit these transcripts as a separate evaluation. Because your earlier evaluation is still in progress, the Credit Evaluation Office will review the two together before any credit is posted.'
            : 'Your earlier evaluation is complete. You can submit these transcripts as a new evaluation, for example for coursework you have taken since.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={onAnother} loading={busy}>Continue with a new evaluation<ChevronRight className="w-4 h-4" /></Button>
          <button type="button" onClick={onBack} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2">Back</button>
        </div>
      </div>
    </div>
  )
}

function Stepper({ step }) {
  const steps = ['Upload Transcripts', 'Review & Confirm', 'Transfer Credit ID']
  return (
    <ol className="flex items-start" aria-label="Submission steps">
      {steps.map((label, i) => {
        const n = i + 1
        const done = step > n
        const current = step === n
        return (
          <li key={label} className="flex-1 flex flex-col items-center relative" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 ${step >= n ? 'bg-brand' : 'bg-gray-200'}`} aria-hidden="true" />}
            <span className={`relative z-10 w-8 h-8 rounded-full grid place-items-center text-sm font-semibold ring-4 ring-gray-50 ${done ? 'bg-brand text-white' : current ? 'bg-white text-brand border-2 border-brand' : 'bg-white text-gray-400 border-2 border-gray-200'}`}>{done ? <Check className="w-4 h-4" /> : n}</span>
            <span className={`mt-2 text-[11px] sm:text-xs text-center font-medium leading-tight px-1 ${current ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Body({ title, intro, children }) {
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
