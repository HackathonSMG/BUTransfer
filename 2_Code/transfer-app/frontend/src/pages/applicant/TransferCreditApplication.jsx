import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Check, Lock, Mail, FileSearch, Send, AlertCircle, AlertTriangle, CheckCircle2,
  FileText, X, RotateCcw, Loader2, ChevronDown, Pencil, ArrowUp, Plus, UserRound, Landmark, Paperclip, MessageSquareText,
  FileCheck2, Building2, ScanLine, Sparkles, ShieldCheck, Eye
} from 'lucide-react'
import notify from '../../lib/notify'
import {
  readTranscriptFile, startApplication, uploadApplicationDocument, submitApplicationForEvaluation,
  checkExistingApplications, emailApplicationNumbers
} from '../../api/student'
import { createDraftOnBehalf, uploadDocument as uploadStaffDocument, submitOnBehalf } from '../../api/applications'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import students from '../../assets/campus-students.jpg'
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

// onBehalf (staff only, see pages/staff/UploadForStudent): { user, student: { name, email, earlier }, onChangeStudent,
// manualEntry }. Staff upload for a student: the same reading, review and corrections, then the staff APIs create a
// draft on the student's behalf, attach the files and submit it. Without it (the student) nothing here changes.
export function SubmissionFlow({ accountEmail, onBehalf = null }) {
  const staff = Boolean(onBehalf)
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

  // Staff: the student chosen (or entered) prefills the name and the email; choosing another starts a new draft
  const chosen = onBehalf?.student || null
  useEffect(() => {
    if (!staff || !chosen) return
    setEmail(chosen.email || '')
    setManual(m => ({ ...m, name: chosen.name || '' }))
    setConfirmed(false)
    draft.current = { token: null, uploaded: new Set() }
  }, [staff, chosen])

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
  // Staff enter the student's email once (prefilled from the student chosen); students confirm theirs
  const emailOk = EMAIL.test(email.trim()) && (accountEmail || staff || email.trim().toLowerCase() === confirmEmail.trim().toLowerCase())
  const ready = usable.length > 0 && !reading && institutionsOk && finalName.length >= 2 && finalProgram && finalTerm && emailOk
  const canSubmit = ready && confirmed && !submitting

  const goReview = () => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // ---- Submit: one evaluation for every transcript ----
  const submit = async () => {
    if (!canSubmit) return
    setSubmitError('')
    setSubmitting(true)
    try {
      // Staff see the student's earlier evaluations before starting; a new one is flagged for duplicate review
      if (!staff && !allowAnother && !draft.current.token) {
        setProgress('Checking for an earlier evaluation…')
        const { data } = await checkExistingApplications(email.trim())
        if (data.exists) { setExisting(data); setSubmitting(false); setProgress(''); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      }
      if (!draft.current.token) {
        setProgress(staff ? 'Creating the transfer credit evaluation…' : 'Creating your transfer credit evaluation…')
        const programValue = PROGRAMS.find(p => p.label.toLowerCase() === finalProgram.toLowerCase())?.value
        const { data } = await (staff ? createDraftOnBehalf : startApplication)({
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
        // The student's draft is reached by its secure token; the staff one by its id
        draft.current = { token: staff ? data.id : data.secure_token, uploaded: new Set() }
      }
      const files = [...transcripts.filter(t => t.status !== 'error').map(t => [t, 'transcript']), ...supporting.map(s => [s, 'supporting'])]
      for (const [i, [item, type]] of files.entries()) {
        if (draft.current.uploaded.has(item.key)) continue
        setProgress(`Uploading ${item.name} (${i + 1} of ${files.length})…`)
        // A transcript goes with what the student confirmed; the server keeps the original reading beside it
        const reviewed = type === 'transcript' && item.review
          ? { institution: item.review.institution.trim(), courses: item.status === 'read' ? item.review.courses : [] }
          : undefined
        if (staff) await uploadStaffDocument(draft.current.token, item.file, type, reviewed)
        else await uploadApplicationDocument(draft.current.token, item.file, type, undefined, reviewed)
        draft.current.uploaded.add(item.key)
      }
      setProgress('Submitting for credit evaluation…')
      if (staff) {
        const { data } = await submitOnBehalf(draft.current.token, comments.trim())
        notify.success(`Submitted for ${finalName}: Transfer Credit ID ${data.reference_number}. The student has been emailed the confirmation.`, { keepOnNavigate: true })
        navigate(`/office/applications/${data.id}`, { replace: true })
        return
      }
      const { data } = await submitApplicationForEvaluation(draft.current.token, comments.trim())
      navigate('/apply/submitted', { replace: true, state: { ...data, student: finalName.split(' ')[0], institutions } })
    } catch (err) {
      setSubmitError(err.response?.data?.message || err.response?.data?.error?.message || 'Your transcripts could not be submitted. Check your connection and try again; files already sent are not sent twice.')
      setSubmitting(false)
      setProgress('')
    }
  }

  // Sections the student completes on the review step, for the progress line above the submit button
  const sections = [finalName.length >= 2, Boolean(finalProgram), Boolean(finalTerm), institutionsOk, Boolean(emailOk)]
  const sectionsDone = sections.filter(Boolean).length

  // An earlier evaluation for this email: shown on its own, under the band
  if (existing && !allowAnother) {
    return (
      <div className="bg-paper min-h-[calc(100vh-4rem)]">
        <StepBand step={2} title="Before you submit" intro="We found transcripts already submitted with this email address." />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-raised">
            <ExistingEvaluations email={email.trim()} result={existing} busy={submitting}
              onAnother={() => { setAllowAnother(true); setExisting(null) }} onBack={() => setExisting(null)} />
          </div>
        </div>
      </div>
    )
  }

  const banner = staff ? <OnBehalfBanner student={chosen} name={finalName} onChange={onBehalf.onChangeStudent} /> : null

  // ---- Step 2: the transcript on the left, what was read (editable) on the right ----
  if (step === 2) {
    return (
      <div className="bg-paper min-h-[calc(100vh-4rem)]">
        {banner}
        <StepBand step={2} title="Check what we read" intro={staff ? "The student's transcript is on the left. Correct anything on the right that doesn't match it." : "Your transcript is on the left. Correct anything on the right that doesn't match it."} />
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-5 lg:sticky lg:top-20">
            <DocumentPreview transcripts={usable} />
          </aside>

          <div className="lg:col-span-7 space-y-5">
            <ReviewCard icon={UserRound} tone="red" title={staff ? 'Student' : 'You'} subtitle={staff ? "Read from the student's transcript; the BU details are asked for" : 'Read from your transcript; the BU details are asked for'}
              right={!(finalName.length >= 2 && finalProgram && finalTerm)
                ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-medium text-amber-800">To complete</span>
                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">Complete</span>}>
              <dl className="p-5 sm:p-6 grid sm:grid-cols-2 gap-4">
                <DetectedField label="Name" value={detected.name} conflict={names.length > 1 ? names : null}
                  edited={edited.name} onEdit={() => editDetail('name')} onRestore={() => restoreDetail('name')}
                  input={<Input aria-label={staff ? "Student's full name" : 'Your full name'} value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} placeholder={staff ? "Student's full name" : 'Your full name'} />} />
                <DetectedField label="Student ID" value={studentIds.join(', ') || null} optional note="As printed on your transcript" />
                <DetectedField label="BU program" value={detected.program} conflict={programs.length > 1 ? programs : null}
                  edited={edited.program} onEdit={() => editDetail('program')} onRestore={() => restoreDetail('program')}
                  note="Routes your courses to the right department"
                  input={<Select aria-label="BU program" options={PROGRAMS} value={manual.program} onChange={e => setManual(m => ({ ...m, program: e.target.value }))} placeholder="Select your BU program" />} />
                <DetectedField label="BU start term" value={detected.term} conflict={terms.length > 1 ? terms : null}
                  edited={edited.term} onEdit={() => editDetail('term')} onRestore={() => restoreDetail('term')}
                  note="Credit must transfer within a year of starting at BU"
                  input={<Select aria-label="BU start term" options={TERMS} value={manual.term} onChange={e => setManual(m => ({ ...m, term: e.target.value }))} placeholder="Select your start term" />} />
              </dl>
            </ReviewCard>

            <ReviewCard icon={Landmark} tone="sky" title={`Transcripts (${transcripts.length})`} subtitle="Open a college to see its courses; correct any that were read wrongly"
              right={<button type="button" onClick={() => setStep(1)} className="text-[13px] font-semibold text-brand hover:underline">Add or remove</button>}>
              <ul className="divide-y divide-gray-100">
                {transcripts.map(t => <TranscriptSummary key={t.key} t={t} onReview={review => reviewTranscript(t.key, review)} />)}
              </ul>
            </ReviewCard>

            <ReviewCard icon={Mail} tone="violet" title={staff ? "Student's email for updates" : 'Where we send updates'} subtitle={staff ? 'The confirmation email and every update go here' : 'Not on a transcript'}>
              <div className="p-5 sm:p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label={staff ? "Student's email address" : 'Email address'} required type="email" autoComplete="email" value={email} disabled={Boolean(accountEmail)}
                    onChange={e => { setEmail(e.target.value); setAllowAnother(false); draft.current = { token: null, uploaded: new Set() } }} placeholder={staff ? 'student@example.com' : 'you@example.com'}
                    error={email && !EMAIL.test(email.trim()) ? 'Enter a valid email address' : ''} />
                  {!accountEmail && !staff && (
                    <Input label="Confirm email address" required type="email" autoComplete="email" value={confirmEmail} onPaste={e => e.preventDefault()}
                      onChange={e => setConfirmEmail(e.target.value)}
                      error={confirmEmail && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase() ? 'The email addresses do not match' : ''} />
                  )}
                </div>
                <Optional icon={Paperclip} title="Supporting documents" hint="optional">
                  <p className="text-sm text-gray-500 mb-2">For example course descriptions or other academic records. If a department needs a syllabus for a course, we will ask you for it.</p>
                  <SupportingFiles files={supporting} onChange={setSupporting} />
                </Optional>
                <Optional icon={MessageSquareText} title="Additional information" hint="optional">
                  <textarea value={comments} onChange={e => setComments(e.target.value.slice(0, COMMENTS_MAX))} rows={4} aria-label="Additional information"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    placeholder="Anything else the transfer credit team should know, for example a course that was renamed." />
                </Optional>
              </div>
            </ReviewCard>

            {/* Confirm and submit */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-card">
              <div className="p-5 sm:p-6 space-y-4">
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-colors ${ready ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'} ${confirmed ? 'border-brand/60 bg-red-50/40' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={confirmed} disabled={!ready} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#cc0000] flex-shrink-0" />
                  <span className="text-sm text-gray-700">{staff
                    ? "I confirm that the information above is correct and I want to submit these transcripts for transfer credit evaluation on the student's behalf."
                    : 'I confirm that the information above is correct and I want to submit these transcripts for transfer credit evaluation.'}</span>
                </label>
                <div className="flex items-center gap-3 text-[13px] text-gray-500">
                  <span className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-dark transition-all" style={{ width: `${(sectionsDone / sections.length) * 100}%` }} />
                  </span>
                  <span>{sectionsDone} of {sections.length} details complete{!ready ? ' · complete the details above to confirm' : ''}</span>
                </div>
                {progress && <p className="text-sm text-primary-700 flex items-center gap-2"><Spinner size="sm" />{progress}</p>}
                {submitError && <p className="text-sm text-red-700 flex gap-1.5" role="alert"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{submitError}</p>}
              </div>
              <footer className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}><ChevronLeft className="w-4 h-4" />Back</Button>
                <Button onClick={submit} disabled={!canSubmit} loading={submitting}><Send className="w-4 h-4" />Submit for Credit Evaluation</Button>
              </footer>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---- Step 1: what the student is about to do on the left, the upload on the right; once files are added,
  // the documents on the left and what was found on the right ----
  const hasFiles = transcripts.length > 0
  return (
    <>
    {banner}
    <div className="bg-paper min-h-[calc(100vh-4rem)] relative">
      <div className={`absolute inset-x-0 top-0 bg-gradient-to-br from-brand to-brand-dark ${hasFiles ? 'h-[200px]' : 'h-[330px]'}`} aria-hidden="true" />
      <div className="relative max-w-[1216px] mx-auto px-4 sm:px-6 pt-10 pb-14 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-5">
          {hasFiles
            ? <DocumentsPanel transcripts={transcripts} onFiles={addTranscripts} onRemove={removeTranscript} onRetry={read} staff={staff} />
            : <StoryPanel staff={staff} />}
        </section>

        <section className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow-raised border border-gray-200/70 overflow-hidden">
            {hasFiles ? (
              <FoundSummary transcripts={transcripts} readable={readable} usable={usable} reading={reading}
                student={{ name: detected.name, studentId: studentIds.join(', ') }} staff={staff} />
            ) : (
              <>
                <div className="px-6 sm:px-8 pt-7 pb-6 border-b border-gray-100 flex items-start justify-between gap-6">
                  <div>
                    <p className="text-[12px] font-semibold text-brand tracking-wide uppercase">Step 1 of 3</p>
                    <h2 className="text-[22px] font-semibold text-gray-900 mt-1">{staff ? "Upload the student's official transcripts" : 'Upload your official transcripts'}</h2>
                    <p className="text-[14px] text-gray-500 mt-1">Each file is read as soon as you add it. Nothing is stored until you submit.</p>
                  </div>
                  <StepDots step={1} />
                </div>
                <div className="px-6 sm:px-8 py-7">
                  <TranscriptDrop onFiles={addTranscripts} />
                  <div className="mt-6 grid sm:grid-cols-3 gap-3">
                    <Tip icon={FileCheck2} tone="emerald" title="Use the official copy" text="The PDF your college issued reads best" />
                    <Tip icon={Building2} tone="sky" title="One per college" text="Add every college you attended" />
                    <Tip icon={ScanLine} tone="violet" title="Scans are fine" text="The office reads anything we can't" />
                  </div>
                </div>
              </>
            )}
            <footer className="flex items-center justify-between gap-3 px-6 sm:px-8 py-5 border-t border-gray-100 bg-gray-50/70">
              {staff
                ? <Link to="/admin/applications" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft className="w-4 h-4" />Credit Evaluations</Link>
                : <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft className="w-4 h-4" />Home</Link>}
              <Button onClick={goReview} disabled={reading || usable.length === 0}>{reading ? <><Loader2 className="w-4 h-4 animate-spin" />Reading…</> : <>Review details<ChevronRight className="w-4 h-4" /></>}</Button>
            </footer>
          </div>
          {staff ? (onBehalf.manualEntry && (
            <p className="text-center text-sm text-gray-500 mt-5">
              No transcript? <Link to={onBehalf.manualEntry} className="font-semibold text-brand hover:underline">Enter details without a transcript</Link>
            </p>
          )) : (
            <p className="text-center text-sm text-gray-500 mt-5">
              Already submitted? <Link to="/track" className="font-semibold text-brand hover:underline">Track your transfer credit</Link>
            </p>
          )}
        </section>
      </div>
    </div>
    </>
  )
}

// Staff mode: whose evaluation this is, on every step, and that the student is emailed (not the staff member)
function OnBehalfBanner({ student, name, onChange }) {
  const who = student?.name || name || 'the student'
  const earlier = student?.earlier?.length || 0
  return (
    <div className="bg-gradient-to-r from-[#7a0000] to-brand text-white" role="status">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-9 h-9 rounded-full bg-white/15 ring-1 ring-white/30 grid place-items-center text-[13px] font-semibold flex-shrink-0" aria-hidden="true">{initialsOf(who) || <UserRound className="w-4 h-4" />}</span>
        <span className="flex-1 min-w-0 text-[14px] leading-snug">
          <span className="block">Uploading on behalf of <span className="font-semibold">{who}</span>{student?.email ? <span className="text-white/80"> · {student.email}</span> : null}</span>
          <span className="block text-[12.5px] text-white/80">
            The student receives the confirmation email.
            {earlier > 0 && ` ${earlier} earlier evaluation${earlier === 1 ? '' : 's'}; a new one is flagged for duplicate review.`}
          </span>
        </span>
        {onChange && (
          <button type="button" onClick={onChange} className="rounded-full bg-white/15 ring-1 ring-white/30 px-3 py-1 text-[13px] font-medium hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Change student
          </button>
        )}
      </div>
    </div>
  )
}

// Before any file: what the student is about to do, the three steps, and what to expect
function StoryPanel({ staff = false }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-white/75">Boston University · Transfer Credit</p>
      {staff ? (
        <>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1] font-semibold mt-3 text-white">Upload a transcript<br />for a student.</h1>
          <p className="text-white/85 mt-4 text-[15.5px] leading-relaxed max-w-md">
            The student's transcripts are read as on the student form. Check and correct what was read, then submit: the student receives the confirmation email and the Transfer Credit ID.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.1] font-semibold mt-3 text-white">Bring the credit<br />you've earned with you.</h1>
          <p className="text-white/85 mt-4 text-[15.5px] leading-relaxed max-w-md">
            Upload your final transcripts. We read your courses for you, you check them, and the academic departments evaluate each one. No account is needed.
          </p>
        </>
      )}
      <figure className="relative mt-8 rounded-2xl overflow-hidden shadow-raised ring-1 ring-black/5">
        <img src={students} alt="Students walking on the Boston University campus" className="w-full h-[230px] sm:h-[250px] object-cover object-[center_35%]" />
        <figcaption className="absolute left-4 bottom-4 right-4 rounded-xl bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="w-9 h-9 rounded-lg bg-red-50 text-brand grid place-items-center flex-shrink-0"><Sparkles className="w-[18px] h-[18px]" /></span>
          <span className="text-[13.5px] leading-snug text-gray-700"><span className="font-semibold text-gray-900">Read in seconds.</span> Courses, grades and terms come straight from your transcript.</span>
        </figcaption>
      </figure>
      <ol className="mt-8">
        {[['Upload your transcripts', 'One file from each college you attended'], ['Check what we read', 'Correct anything that was read wrongly'], ['Get your Transfer Credit ID', 'Follow every course until credit is posted']].map(([title, text], i) => (
          <li key={title} className="flex gap-4" aria-current={i === 0 ? 'step' : undefined}>
            <span className="flex flex-col items-center">
              <span className={`w-8 h-8 rounded-full grid place-items-center text-[13px] ${i === 0 ? 'bg-brand text-white font-bold ring-4 ring-red-100' : 'bg-white border border-gray-300 text-gray-500 font-semibold'}`}>{i + 1}</span>
              {i < 2 && <span className="w-px flex-1 bg-gray-300 my-1" />}
            </span>
            <span className={i < 2 ? 'pb-5' : ''}>
              <span className={`block text-[15px] font-semibold ${i === 0 ? 'text-gray-900' : 'text-gray-700'}`}>{title}</span>
              <span className={`block text-[13.5px] ${i === 0 ? 'text-gray-600' : 'text-gray-500'}`}>{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-7 pt-5 border-t border-gray-200 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-gray-500">
        <span className="inline-flex items-center gap-1.5"><Lock className="w-4 h-4 text-gray-400" />Nothing stored until you submit</span>
        <span className="inline-flex items-center gap-1.5"><Mail className="w-4 h-4 text-gray-400" />Updates by email</span>
        <span className="inline-flex items-center gap-1.5"><FileSearch className="w-4 h-4 text-gray-400" />Details read from your transcript</span>
      </div>
    </div>
  )
}

// After files are added: each document, how it was read, and room for another
function DocumentsPanel({ transcripts, onFiles, onRemove, onRetry, staff = false }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-white/75">Step 1 of 3 · {staff ? "The student's documents" : 'Your documents'}</p>
      <h1 className="font-display text-[30px] sm:text-[32px] leading-tight font-semibold mt-2 text-white">
        {transcripts.length} transcript{transcripts.length === 1 ? '' : 's'} added
      </h1>
      <p className="text-white/85 mt-1.5 text-[15px]">Each one is read as soon as you add it.</p>
      <ul className="mt-8 space-y-3">
        {transcripts.map(t => <TranscriptItem key={t.key} t={t} onRemove={() => onRemove(t.key)} onRetry={() => onRetry(t)} />)}
      </ul>
      <div className="mt-3"><TranscriptDrop onFiles={onFiles} compact /></div>
    </div>
  )
}

// What the transcripts showed, at a glance: the student, then each college with its courses
function FoundSummary({ transcripts, readable, usable, reading, student, staff = false }) {
  const unread = transcripts.filter(t => t.status === 'unreadable')
  return (
    <>
      <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-gray-100 flex items-start justify-between gap-6">
        <div>
          <p className="text-[12px] font-semibold text-emerald-700 tracking-wide uppercase inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />{staff ? "Read from the student's transcripts" : 'Read from your transcripts'}</p>
          <h2 className="text-[22px] font-semibold text-gray-900 mt-1">{reading ? (staff ? 'Reading the transcripts…' : 'Reading your transcripts…') : readable.length ? "Here's what we found" : 'Ready for the office to read'}</h2>
          <p className="text-[14px] text-gray-500 mt-1">You'll check and correct everything on the next step.</p>
        </div>
        <StepDots step={1} />
      </div>
      <div className="px-6 sm:px-8 py-6 space-y-5">
        {student.name && (
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3.5">
            <span className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white grid place-items-center font-semibold flex-shrink-0" aria-hidden="true">{initialsOf(student.name)}</span>
            <span className="flex-1 min-w-0"><span className="block text-[16px] font-semibold text-gray-900 truncate">{student.name}</span>{student.studentId && <span className="block text-[13px] text-gray-500">Student ID {student.studentId}</span>}</span>
            <AutoFilled />
          </div>
        )}
        {readable.map(t => <CollegeGlance key={t.key} r={t.result} />)}
        {transcripts.filter(t => t.status === 'reading').map(t => (
          <div key={t.key} className="rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-3 text-[14px] text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin text-brand" />Reading {t.name}…
          </div>
        ))}
        {unread.map(t => (
          <div key={t.key} className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-5 py-3.5 flex items-center gap-3 text-[13.5px] text-amber-900">
            <ScanLine className="w-[18px] h-[18px] text-amber-600 flex-shrink-0" />
            <span><span className="font-semibold">{t.name}</span> will be read by the Credit Evaluation Office. You'll name the college on the next step.</span>
          </div>
        ))}
        {usable.length > 0 && !reading && readable.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex gap-1.5" role="status"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />No courses could be read automatically. You can still continue: the Credit Evaluation Office will read your transcript and enter the courses.</p>
        )}
      </div>
    </>
  )
}

function CollegeGlance({ r }) {
  const credits = r.courses.reduce((n, c) => n + (Number(c.credits) || 0), 0)
  const termCount = uniq(r.courses.map(c => c.term)).length
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
        <span className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 grid place-items-center flex-shrink-0"><Landmark className="w-5 h-5" /></span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold text-gray-900 truncate">{r.institution || 'College not shown on the transcript'}</span><span className="block text-[12.5px] text-gray-500">{r.credit_system ? `${r.credit_system} calendar` : 'Calendar not shown'}</span></span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <Figure value={r.courses.length} label={r.courses.length === 1 ? 'course' : 'courses'} />
        <Figure value={credits ? Math.round(credits * 10) / 10 : '—'} label="credits on the transcript" />
        <Figure value={termCount || '—'} label={termCount === 1 ? 'term' : 'terms'} />
      </div>
      <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap gap-1.5">
        {r.courses.slice(0, 12).map((c, i) => <span key={i} className="rounded-full border border-gray-200 px-2 py-0.5 font-mono text-[11.5px] text-gray-700">{c.course_code}</span>)}
        {r.courses.length > 12 && <span className="px-1 text-[12px] text-gray-500">+{r.courses.length - 12} more</span>}
      </div>
    </div>
  )
}

const Figure = ({ value, label }) => (
  <div className="px-5 py-4"><p className="font-display text-[28px] font-semibold text-gray-900 leading-none tabular-nums">{value}</p><p className="text-[12.5px] text-gray-500 mt-1.5">{label}</p></div>
)

const TIP_TONES = { emerald: 'bg-emerald-50 text-emerald-600', sky: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600' }
const Tip = ({ icon: Icon, tone, title, text }) => (
  <div className="rounded-xl border border-gray-200 px-4 py-3.5">
    <span className={`w-8 h-8 rounded-lg grid place-items-center ${TIP_TONES[tone]}`}><Icon className="w-4 h-4" /></span>
    <p className="text-[13px] font-semibold text-gray-900 mt-2">{title}</p>
    <p className="text-[12.5px] text-gray-500 mt-0.5">{text}</p>
  </div>
)

const StepDots = ({ step }) => (
  <div className="hidden sm:flex gap-1 mt-1.5" aria-hidden="true">
    {[1, 2, 3].map(n => <span key={n} className={`w-8 h-1.5 rounded-full ${n <= step ? 'bg-brand' : 'bg-gray-200'}`} />)}
  </div>
)

const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

// The band across the top of the later steps: the step, its title, and where the student is
function StepBand({ step, title, intro }) {
  const steps = ['Upload', 'Review & confirm', 'Transfer Credit ID']
  return (
    <div className="bg-gradient-to-br from-brand to-brand-dark text-white">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[12.5px] font-semibold tracking-[0.14em] uppercase text-white/75">Step {step} of 3</p>
          <h1 className="font-display text-[28px] sm:text-[30px] font-semibold leading-tight mt-1">{title}</h1>
          {intro && <p className="text-white/85 text-[14.5px] mt-1">{intro}</p>}
        </div>
        <ol className="flex items-center gap-3 text-[13px]" aria-label="Submission steps">
          {steps.map((label, i) => {
            const n = i + 1
            return (
              <React.Fragment key={label}>
                {i > 0 && <li aria-hidden="true" className={`w-8 sm:w-10 h-px ${step >= n ? 'bg-white/60' : 'bg-white/30'}`} />}
                <li className={`flex items-center gap-2 ${step === n ? 'font-semibold' : step > n ? '' : 'text-white/70'}`} aria-current={step === n ? 'step' : undefined}>
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${step > n ? 'bg-white text-brand' : step === n ? 'bg-white text-brand font-bold ring-4 ring-white/25' : 'border border-white/50'}`}>
                    {step > n ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </li>
              </React.Fragment>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

// A section of the review step: an icon in its meaning colour, the title, and its content
const CARD_TONES = { red: 'bg-red-50 text-brand', sky: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700' }
function ReviewCard({ icon: Icon, tone, title, subtitle, right, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-card">
      <header className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${CARD_TONES[tone]}`}><Icon className="w-[18px] h-[18px]" /></span>
        <span className="flex-1 min-w-0"><h2 className="text-[15.5px] font-semibold text-gray-900">{title}</h2>{subtitle && <p className="text-[12.5px] text-gray-500">{subtitle}</p>}</span>
        {right}
      </header>
      {children}
    </section>
  )
}

// The uploaded file itself, shown beside what was read from it. Nothing is uploaded to show it: the browser
// displays the file the student chose. A PDF or image is shown; other types only by name.
function DocumentPreview({ transcripts }) {
  const [key, setKey] = useState(transcripts[0]?.key)
  const current = transcripts.find(t => t.key === key) || transcripts[0]
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!current?.file) return undefined
    const u = URL.createObjectURL(current.file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [current?.file])
  if (!current) return null
  const type = current.file?.type || ''
  const r = current.result
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-[#eceae6] overflow-hidden shadow-card">
        <div className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2 text-[13px]">
          <FileText className="w-4 h-4 text-brand flex-shrink-0" /><span className="font-medium text-gray-800 flex-1 truncate">{current.name}</span>
          <span className="text-gray-400 whitespace-nowrap">{formatSize(current.size)}</span>
        </div>
        <div className="p-3">
          {url && type === 'application/pdf' ? (
            <iframe title={`Transcript: ${current.name}`} src={`${url}#toolbar=0&navpanes=0&zoom=page-width&view=FitH`} className="w-full h-[460px] lg:h-[560px] rounded bg-white shadow-md" />
          ) : url && type.startsWith('image/') ? (
            <img src={url} alt={`Transcript: ${current.name}`} className="w-full max-h-[560px] object-contain rounded bg-white shadow-md" />
          ) : (
            <div className="h-[260px] rounded bg-white grid place-items-center text-center text-[13.5px] text-gray-500 px-6">
              <span><FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />A preview isn't available for this type of file. It is sent with your submission.</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-3 text-[12.5px] whitespace-nowrap overflow-hidden">
          {current.status === 'read' ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><ShieldCheck className="w-4 h-4" />Read automatically</span>
              <span className="text-gray-300">·</span><span className="text-gray-500 truncate">{r.courses.length} course{r.courses.length === 1 ? '' : 's'}{r.check_carefully ? ' · please check each one' : ''}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium"><ScanLine className="w-4 h-4" />Read by the Credit Evaluation Office</span>
          )}
        </div>
      </div>
      {transcripts.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-2">
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Your transcripts</p>
          {transcripts.map(t => {
            const active = t.key === current.key
            return (
              <button key={t.key} type="button" onClick={() => setKey(t.key)} aria-pressed={active}
                className={`w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left ${active ? 'bg-red-50/60 ring-1 ring-brand/20' : 'hover:bg-gray-50'}`}>
                <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${t.status === 'read' ? 'bg-white text-brand shadow-sm' : 'bg-amber-50 text-amber-700'}`}>
                  {t.status === 'read' ? <FileText className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold text-gray-900 truncate">{t.status === 'read' ? (t.review?.institution || t.name) : t.name}</span>
                  <span className="block text-[12px] text-gray-500">{t.status === 'read' ? `${t.result.courses.length} courses` : 'Scanned copy · read by the office'}{active ? ' · showing' : ''}</span>
                </span>
                {active ? <Eye className="w-4 h-4 text-brand" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
              </button>
            )
          })}
        </div>
      )}
      <p className="text-[12.5px] text-gray-500 flex items-start gap-1.5 px-1"><Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Your transcript file is never changed. Corrections are sent beside it, and the office sees both.</p>
    </div>
  )
}

function TranscriptDrop({ onFiles, compact = false }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  const handlers = {
    role: 'button', tabIndex: 0,
    onClick: () => input.current?.click(),
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } },
    onDragOver: e => { e.preventDefault(); setOver(true) }, onDragLeave: () => setOver(false),
    onDrop: e => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }
  }
  const picker = <input ref={input} type="file" multiple className="sr-only" accept={Object.keys(ACCEPTED).join(',')} onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
  if (compact) {
    return (
      <div {...handlers} className={`rounded-2xl border-2 border-dashed px-4 py-4 flex items-center gap-3 text-[14px] cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${over ? 'border-brand bg-red-50/60' : 'border-gray-300 bg-white/70 hover:border-gray-400'}`}>
        <span className="w-9 h-9 rounded-lg bg-red-50 text-brand grid place-items-center flex-shrink-0"><Plus className="w-4 h-4" /></span>
        <span><span className="font-semibold text-brand">Add another transcript</span> <span className="text-gray-500">· one per college · or drop it here</span></span>
        {picker}
      </div>
    )
  }
  return (
    <div {...handlers} className={`rounded-2xl border-2 border-dashed px-6 py-11 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${over ? 'border-brand bg-red-50/70' : 'border-red-200 bg-gradient-to-b from-red-50/60 to-white hover:border-red-300'}`}>
      {/* Stacked transcript sheets */}
      <span className="relative block w-[92px] h-[78px] mx-auto" aria-hidden="true">
        <span className="absolute left-2 top-2 w-[62px] h-[74px] rounded-md bg-white border border-gray-200 shadow-sm -rotate-[8deg]" />
        <span className="absolute right-2 top-1 w-[62px] h-[74px] rounded-md bg-white border border-gray-200 shadow-sm rotate-[7deg]" />
        <span className="absolute left-1/2 -translate-x-1/2 top-0 w-[62px] h-[76px] rounded-md bg-white border border-gray-200 shadow px-2 pt-2 space-y-1.5">
          <span className="block h-1.5 w-8 rounded bg-brand/80" /><span className="block h-1 rounded bg-gray-200" /><span className="block h-1 rounded bg-gray-200" /><span className="block h-1 w-7 rounded bg-gray-200" /><span className="block h-1 rounded bg-gray-200" />
        </span>
        <span className="absolute -right-1 -bottom-2 w-8 h-8 rounded-full bg-brand text-white grid place-items-center ring-4 ring-white"><ArrowUp className="w-4 h-4" strokeWidth={2.5} /></span>
      </span>
      <p className="mt-6 text-[16px] text-gray-800"><span className="font-semibold text-brand underline decoration-red-200 underline-offset-4">Choose transcript files</span> or drag them here</p>
      <p className="mt-3 flex flex-wrap justify-center items-center gap-2 text-[12px]">
        {['PDF', 'JPG', 'PNG'].map(f => <span key={f} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 font-medium text-gray-600">{f}</span>)}
        <span className="text-gray-500">read automatically · up to {MAX_MB} MB each</span>
      </p>
      {picker}
    </div>
  )
}

function TranscriptItem({ t, onRemove, onRetry }) {
  const r = t.result
  const read = t.status === 'read'
  const scanned = t.status === 'unreadable'
  return (
    <li className={`bg-white rounded-2xl border p-4 flex gap-4 ${read ? 'border-gray-200 shadow-raised' : t.status === 'reading' ? 'border-gray-200 shadow-card' : 'border-amber-200 shadow-card'}`}>
      {/* Paper thumbnail */}
      <span className={`relative w-[60px] h-[76px] flex-shrink-0 rounded-md border border-gray-200 overflow-hidden ${scanned ? 'bg-[#f3f1ec]' : 'bg-white shadow-sm'}`} aria-hidden="true">
        <span className={`absolute inset-2 space-y-1.5 ${scanned ? 'opacity-60 -rotate-2' : ''}`}>
          <span className={`block h-1.5 w-8 rounded ${scanned ? 'bg-gray-500/60' : 'bg-brand/80'}`} /><span className="block h-1 rounded bg-gray-200" /><span className="block h-1 rounded bg-gray-200" /><span className="block h-1 w-6 rounded bg-gray-200" /><span className="block h-1 rounded bg-gray-200" /><span className="block h-1 w-7 rounded bg-gray-200" />
        </span>
        {t.status === 'reading' && <span className="absolute inset-0 bg-white/70 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-brand" /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-gray-900 truncate">{read && r.institution ? r.institution : t.name}</span>
            <span className="block text-[12.5px] text-gray-500 truncate">{read && r.institution ? `${t.name} · ` : ''}{formatSize(t.size)}</span>
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${read ? 'bg-emerald-50 text-emerald-700' : t.status === 'reading' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
            {read ? <><CheckCircle2 className="w-3.5 h-3.5" />Read</> : t.status === 'reading' ? 'Reading…' : scanned ? <><Eye className="w-3.5 h-3.5" />Office will read</> : <><AlertTriangle className="w-3.5 h-3.5" />Not uploaded</>}
          </span>
        </span>
        {read && (
          <span className="mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
            <span className="rounded-md bg-emerald-50/80 text-emerald-800 px-2 py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" strokeWidth={3} />{r.courses.length} course{r.courses.length === 1 ? '' : 's'}</span>
            <span className="rounded-md bg-emerald-50/80 text-emerald-800 px-2 py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" strokeWidth={3} />{r.credit_system || 'Calendar not shown'}</span>
            {r.student?.name && <span className="rounded-md bg-emerald-50/80 text-emerald-800 px-2 py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" strokeWidth={3} />Your details</span>}
            {r.check_carefully && <span className="rounded-md bg-amber-50 text-amber-800 px-2 py-1">Please check each course</span>}
          </span>
        )}
        {t.error && <span className="block mt-3 text-[12.5px] leading-snug text-amber-900 bg-amber-50/70 rounded-md px-2.5 py-2">{t.error}</span>}
        {read && <ReviewNotes notes={r.review_notes} />}
      </span>
      <span className="flex flex-col gap-1">
        {t.status !== 'reading' && <button type="button" onClick={onRemove} className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${t.name}`}><X className="w-4 h-4" /></button>}
        {t.status === 'error' && <button type="button" onClick={onRetry} className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100" aria-label={`Try ${t.name} again`}><RotateCcw className="w-4 h-4" /></button>}
      </span>
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
  // Starts collapsed; the header says when a transcript needs a careful check. It starts open only when the
  // college is missing from the transcript, because the required college field is inside
  const [open, setOpen] = useState(t.status === 'read' && !r?.institution)
  const [editing, setEditing] = useState(false)
  const setInstitution = (institution) => onReview({ ...review, institution })
  // Not read automatically: only the institution is asked for; the office enters the courses
  if (t.status !== 'read') {
    return (
      <li className="px-5 sm:px-6 py-4 space-y-3">
        <p className="text-sm text-amber-800 flex gap-2.5"><span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 grid place-items-center flex-shrink-0"><ScanLine className="w-4 h-4" /></span><span><span className="font-semibold">{t.name}</span><br />Courses not read automatically; the Credit Evaluation Office will read this transcript.</span></p>
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
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50">
        <span>
          <span className="block text-sm font-semibold text-gray-900">{review.institution || <span className="text-amber-700">College not shown on the transcript</span>}</span>
          <span className="block text-xs text-gray-500">
            {r.courses.length} course{r.courses.length === 1 ? '' : 's'} found · {r.credit_system || 'calendar not shown'}{r.student?.student_id ? ` · Student ID ${r.student.student_id}` : ''}
            {(edits > 0 || institutionEdited) && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 text-brand font-medium"><Pencil className="w-3 h-3" />{edits + (institutionEdited ? 1 : 0)} edited</span>}
          </span>
          {r.check_carefully && (
            <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Please check carefully: {open ? 'correct any course that was read wrongly' : 'open to review each course'}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-5 space-y-3">
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
            <p className="flex items-center gap-2 text-xs text-gray-500"><AutoFilled />Each course as read from your transcript</p>
            <button type="button" onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-red-50">
              {editing ? <><Check className="w-3.5 h-3.5" />Done editing</> : <><Pencil className="w-3.5 h-3.5" />Correct a course</>}
            </button>
          </div>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50/80">
                <th className="pl-5 sm:pl-6 pr-3 py-2 w-0"><span className="sr-only">Read or corrected</span></th>
                {COURSE_FIELDS.map(f => <th key={f.key} className={`py-2 pr-3 ${f.numeric || f.key === 'grade' ? 'text-right' : ''}`}>{f.label}</th>)}
                <th className="py-2 pr-5 sm:pr-6 w-8"><span className="sr-only">Changes</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {review.courses.map((c, i) => {
                  const changed = changedFields(r.courses[i], c)
                  return (
                    <tr key={i} className={changed.length ? 'bg-red-50/50' : ''}>
                      <td className="pl-5 sm:pl-6 pr-3 py-2"><span className={`block w-1 h-7 rounded-full ${changed.length ? 'bg-brand' : 'bg-emerald-400/70'}`} title={changed.length ? 'Corrected by you' : 'As on your transcript'} /></td>
                      {COURSE_FIELDS.map(f => (
                        <td key={f.key} className={`py-2 pr-3 align-middle ${f.numeric || f.key === 'grade' ? 'text-right' : ''}`}>
                          {editing ? (
                            <input aria-label={`${f.label}, course ${i + 1}`} value={c[f.key] ?? ''} inputMode={f.numeric ? 'decimal' : undefined}
                              onChange={e => setCourse(i, f.key, f.numeric ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)}
                              className={`px-2 py-1 text-sm border rounded-md outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${f.className} ${sameValue(r.courses[i][f.key], c[f.key]) ? 'border-gray-300' : 'border-brand/60'}`} />
                          ) : (
                            <span className={`${f.key === 'course_code' ? 'font-mono text-gray-900 whitespace-nowrap' : f.key === 'grade' ? 'font-medium' : f.key === 'title' ? 'text-gray-700' : 'text-gray-500 whitespace-nowrap'}`}
                              title={sameValue(r.courses[i][f.key], c[f.key]) ? 'From your transcript' : `Edited by you. Transcript shows: ${r.courses[i][f.key] ?? 'nothing'}`}>
                              {!sameValue(r.courses[i][f.key], c[f.key]) && r.courses[i][f.key] != null && r.courses[i][f.key] !== '' && <span className="mr-1.5 text-[12px] text-gray-400 line-through">{r.courses[i][f.key]}</span>}
                              {c[f.key] === '' || c[f.key] == null ? <span className="text-amber-700">not shown</span>
                                : <span className={sameValue(r.courses[i][f.key], c[f.key]) ? '' : 'font-semibold text-brand'}>{c[f.key]}</span>}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 pr-5 sm:pr-6 align-middle text-right">
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
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-emerald-400/70" />As on your transcript</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-brand" />Corrected by you; the original is kept</span>
          </p>
          {edits > 0 && <p className="text-xs text-gray-500">Your corrections are sent with the transcript. The Credit Evaluation Office sees both what the transcript shows and what you changed; the file itself is not changed.</p>}
        </div>
      )}
    </li>
  )
}

// Marks a value read automatically from the student's transcript; the full wording is on hover and for screen readers
function AutoFilled() {
  return (
    <span title="Read automatically from your transcript"
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70 whitespace-nowrap">
      <Sparkles className="w-3 h-3" aria-hidden="true" />Auto-filled
      <span className="sr-only">: read automatically from your transcript</span>
    </span>
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

// A value read from the transcript is marked "Auto-filled" and can be edited (the transcript's value is
// kept and can be restored); a missing one asks for input (only for fields that are needed)
function DetectedField({ label, value, conflict, input, note, optional = false, edited = false, onEdit, onRestore }) {
  const state = value && edited ? 'edited' : value ? 'read' : optional ? 'none' : 'missing'
  const box = { edited: 'border-brand/40 bg-red-50/30', read: 'border-gray-200', none: 'border-gray-200', missing: 'border-amber-300 bg-amber-50/30' }[state]
  const chip = {
    edited: <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-brand"><Pencil className="w-3 h-3" aria-hidden="true" />Edited</span>,
    read: <AutoFilled />,
    missing: <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"><AlertCircle className="w-3 h-3" aria-hidden="true" />{conflict ? 'Transcripts differ' : 'Not on transcript'}</span>,
    none: null
  }[state]
  return (
    <div className={`rounded-xl border px-4 py-3 min-w-0 ${box}`}>
      <dt className="flex items-center justify-between gap-2 text-[12px] font-medium text-gray-500">{label}{chip}</dt>
      <dd className="mt-1.5 min-w-0">
        {state === 'edited' ? (
          <>
            {input}
            <EditedNote original={value} onRestore={onRestore} />
          </>
        ) : state === 'read' ? (
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
            <span className="text-[16px] font-semibold text-gray-900 break-words">{value}</span>
            {onEdit && (
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" aria-label={`Edit ${label}`}>
                <Pencil className="w-3 h-3" aria-hidden="true" />Edit
              </button>
            )}
          </span>
        ) : state === 'none' ? (
          <span className="block py-1.5 text-sm text-gray-400">Not shown on the transcript</span>
        ) : (
          <>
            {conflict && <span className="block text-xs text-amber-800 mb-1.5">Your transcripts show {conflict.join(' / ')}. Please choose the correct one.</span>}
            {input}
          </>
        )}
        {note && <span className="block text-xs text-gray-500 mt-1.5">{note}</span>}
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

function Optional({ icon: Icon, title, hint, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={`rounded-xl ${open ? 'border border-gray-200' : 'bg-gray-50'}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3 flex items-center gap-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-100/70 rounded-xl">
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}{title}{hint && <span className="text-gray-400 font-normal">{hint}</span>}
        <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
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

