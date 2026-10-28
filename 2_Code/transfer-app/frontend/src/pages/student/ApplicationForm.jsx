import React, { useEffect, useState } from 'react'
import { useNavigate, Link, Navigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check, FileText, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { startApplication, uploadStudentDocument, submitDraftApplication, getApplicationStatus } from '../../api/student'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import FileUpload from '../../components/ui/FileUpload'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { PROGRAMS, TERMS, toApplicationPayload } from '../../lib/application'

// Start Transfer Credit Evaluation: the signed-in student's details, academic information, documents, submit.
// The application is created as a draft, the documents are attached to it (transcripts are read on upload),
// and submitting starts document processing and course evaluation on the server.
const STEPS = [
  { id: 1, label: 'Student Information' },
  { id: 2, label: 'Academic Information' },
  { id: 3, label: 'Documents' },
  { id: 4, label: 'Review & Submit' }
]

// File types the upload API accepts (routes/student.js); PDF transcripts are read automatically
const TRANSCRIPT_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const SUPPORTING_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png'

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              currentStep > step.id ? 'bg-green-500 text-white' : currentStep === step.id ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
            </div>
            <span className={`text-xs mt-1 hidden sm:block font-medium ${currentStep === step.id ? 'text-primary-600' : 'text-gray-500'}`}>{step.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-400' : 'bg-gray-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  )
}

function ReviewField({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}

export default function ApplicationForm() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [params] = useSearchParams()
  const resumeToken = params.get('resume')

  if (authLoading) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
  // Applications belong to a student account, so the student signs in (or creates one) first
  if (!isAuthenticated) return <Navigate to={`/login?mode=register&next=${encodeURIComponent('/apply' + (resumeToken ? `?resume=${resumeToken}` : ''))}`} replace />
  if (user.role !== 'student') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-gray-900">Student applications</h1>
        <p className="text-gray-500 mt-2">You are signed in as staff. Staff raise applications from the staff portal.</p>
      </div>
    )
  }
  return <Form user={user} resumeToken={resumeToken} />
}

function Form({ user, resumeToken }) {
  const navigate = useNavigate()
  const [first, ...rest] = (user.full_name || '').split(' ')
  const [step, setStep] = useState(resumeToken ? 3 : 1)
  const [resumed, setResumed] = useState(null)
  const [data, setData] = useState({
    first_name: first || '', last_name: rest.join(' '), email: user.email, phone: '', date_of_birth: '',
    transfer_from_institution: '', current_program: '', gpa: '', total_credits: '',
    program: '', expected_start_term: '',
    transcripts: [], supporting: [], confirmed: false
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')

  // Finishing an unsubmitted draft: its details are already saved; only documents and submission remain
  useEffect(() => {
    if (!resumeToken) return
    getApplicationStatus(resumeToken).then(res => {
      const a = res.data || res
      if (a.status !== 'draft') { navigate(`/student/applications/${resumeToken}`, { replace: true }); return }
      setResumed(a)
    }).catch(() => toast.error('That application could not be found.'))
  }, [resumeToken, navigate])

  const set = (key, value) => {
    setData(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validateStep = (s) => {
    const errs = {}
    if (s === 1) {
      if (!data.first_name.trim()) errs.first_name = 'First name is required'
      if (!data.last_name.trim()) errs.last_name = 'Last name is required'
    }
    if (s === 2) {
      if (!data.transfer_from_institution.trim()) errs.transfer_from_institution = 'Institution is required'
      if (!data.gpa || isNaN(data.gpa) || data.gpa < 0 || data.gpa > 4.0) errs.gpa = 'Valid GPA (0.0–4.0) is required'
      if (!data.total_credits || isNaN(data.total_credits)) errs.total_credits = 'Total credits is required'
      if (!data.program) errs.program = 'Program is required'
      if (!data.expected_start_term) errs.expected_start_term = 'BU start term is required'
    }
    if (s === 3) {
      if (!data.transcripts.length && !(resumed?.documents || []).some(d => d.document_type === 'transcript')) errs.transcripts = 'Upload your official transcript'
    }
    if (s === 4 && !data.confirmed) errs.confirmed = 'Confirm that the information is accurate'
    return errs
  }

  const nextStep = () => {
    const errs = validateStep(step)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setStep(s => s + 1)
    window.scrollTo(0, 0)
  }
  const prevStep = () => { setStep(s => s - 1); window.scrollTo(0, 0) }

  const handleSubmit = async () => {
    const errs = validateStep(4)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true)
    try {
      // 1. The application (a draft until submitted)
      let token = resumeToken
      if (!token) {
        setProgress('Saving your application…')
        const { data: created } = await startApplication(toApplicationPayload({
          ...data, email: user.email, academic_standing: null, graduation_date: null, address: null, why_transferring: null, personal_statement: null
        }))
        token = created.secure_token
      }
      // 2. Documents, attached to the application (transcripts are read as they arrive)
      const uploads = [...data.transcripts.map(f => [f, 'transcript']), ...data.supporting.map(f => [f, 'supporting'])]
      for (const [i, [file, type]] of uploads.entries()) {
        setProgress(`Uploading ${file.name} (${i + 1} of ${uploads.length})…`)
        await uploadStudentDocument(token, file, type)
      }
      // 3. Submit: document processing and course evaluation start on the server
      setProgress('Submitting…')
      await submitDraftApplication(token)
      toast.success('Application submitted')
      navigate(`/student/applications/${token}`)
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Your application could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
      setProgress('')
    }
  }

  const programLabel = PROGRAMS.find(p => p.value === data.program)?.label
  const termLabel = TERMS.find(t => t.value === data.expected_start_term)?.label

  if (resumeToken && !resumed) return <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
          <Link to="/student" className="hover:text-gray-700">My Applications</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">Transfer Credit Evaluation</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Start Transfer Credit Evaluation</h1>
        <p className="text-gray-500 text-sm mt-1">
          {resumed ? `Finish application ${resumed.reference_number}: attach your documents and submit.` : 'Boston University · about 5 minutes. Have your official transcript ready.'}
        </p>
      </div>

      <StepIndicator currentStep={step} />

      <Card>
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Student Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={data.first_name} onChange={e => set('first_name', e.target.value)} error={errors.first_name} />
              <Input label="Last Name" required value={data.last_name} onChange={e => set('last_name', e.target.value)} error={errors.last_name} />
            </div>
            <Input label="Email Address" type="email" value={user.email} disabled />
            <p className="text-xs text-gray-500 -mt-2">Updates about your application go to your account email.</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone Number" type="tel" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="Optional" />
              <Input label="Date of Birth" type="date" value={data.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Academic Information</h2>
            <Input label="Most Recent College or University" required value={data.transfer_from_institution}
              onChange={e => set('transfer_from_institution', e.target.value)} error={errors.transfer_from_institution} placeholder="e.g., Riverside Community College" />
            <p className="text-xs text-gray-500 -mt-2">Attended more than one college? Upload a transcript from each in the next step.</p>
            <Input label="Current Program / Major" value={data.current_program} onChange={e => set('current_program', e.target.value)} placeholder="e.g., Computer Science" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="GPA" required type="number" step="0.01" min="0" max="4.0" value={data.gpa} onChange={e => set('gpa', e.target.value)} error={errors.gpa} placeholder="e.g., 3.50" />
              <Input label="Total Credits Earned" required type="number" min="0" value={data.total_credits} onChange={e => set('total_credits', e.target.value)} error={errors.total_credits} placeholder="e.g., 30" />
            </div>
            <Select label="BU Program" required options={PROGRAMS} value={data.program} onChange={e => set('program', e.target.value)} error={errors.program} placeholder="Select a program..." />
            <Select label="BU Start Term" required options={TERMS} value={data.expected_start_term} onChange={e => set('expected_start_term', e.target.value)} error={errors.expected_start_term} placeholder="Select a term..." />
            <p className="text-xs text-gray-500 -mt-2 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />All transfer credit must be transferred within one year of starting at BU.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
              <p className="text-sm text-gray-500 mt-1">PDF transcripts are read automatically. Word documents and images are also accepted.</p>
            </div>

            <section>
              <p className="text-sm font-semibold text-gray-900">Official Transcript <span className="text-red-600">Required</span></p>
              <p className="text-xs text-gray-500 mb-2">One from every college you attended.</p>
              {(resumed?.documents || []).filter(d => d.document_type === 'transcript').map(d => (
                <p key={d.id} className="text-sm text-gray-700 flex items-center gap-1.5 mb-1"><FileText className="w-4 h-4 text-green-600" />{d.file_name} (already uploaded)</p>
              ))}
              <div className={`rounded-xl p-1 ${errors.transcripts ? 'ring-2 ring-red-300' : ''}`}>
                <FileUpload label="" accept={TRANSCRIPT_TYPES} maxSizeMB={10} multiple
                  onFileSelect={(files) => set('transcripts', Array.isArray(files) ? files : [files].filter(Boolean))} />
                {errors.transcripts && <p className="text-xs text-red-600 mt-1 px-1">{errors.transcripts}</p>}
              </div>
            </section>

            <section>
              <p className="text-sm font-semibold text-gray-900">Supporting Documents <span className="text-gray-500 font-normal">Optional</span></p>
              <p className="text-xs text-gray-500 mb-2">
                Course descriptions or other academic documents. You don't need syllabi now: if a department needs one for a course, it will appear on that course in your portal.
              </p>
              <FileUpload label="" accept={SUPPORTING_TYPES} maxSizeMB={10} multiple
                onFileSelect={(files) => set('supporting', Array.isArray(files) ? files : [files].filter(Boolean))} />
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Review & Submit</h2>
            {!resumed && (
              <>
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Student Information</h3>
                  <dl className="grid grid-cols-2 gap-3">
                    <ReviewField label="Name" value={`${data.first_name} ${data.last_name}`} />
                    <ReviewField label="Email" value={user.email} />
                    <ReviewField label="Phone" value={data.phone} />
                    <ReviewField label="Date of Birth" value={data.date_of_birth} />
                  </dl>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Academic Information</h3>
                  <dl className="grid grid-cols-2 gap-3">
                    <ReviewField label="College" value={data.transfer_from_institution} />
                    <ReviewField label="Current Program" value={data.current_program} />
                    <ReviewField label="GPA" value={data.gpa} />
                    <ReviewField label="Credits Earned" value={data.total_credits} />
                    <ReviewField label="BU Program" value={programLabel} />
                    <ReviewField label="BU Start Term" value={termLabel} />
                  </dl>
                </div>
              </>
            )}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
              <ul className="text-sm space-y-1">
                {[...(resumed?.documents || []).map(d => [d.file_name, d.document_type === 'transcript' ? 'Transcript' : 'Supporting']),
                  ...data.transcripts.map(f => [f.name, 'Transcript']), ...data.supporting.map(f => [f.name, 'Supporting'])].map(([name, kind], i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-900"><Check className="w-4 h-4 text-green-600" />{kind}: {name}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-gray-600">
              After you submit, we read your transcript and check each course against BU's equivalency database. Courses with an
              established equivalency are applied straight away; others go to the academic department. You can follow every
              course in your portal.
            </p>
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              errors.confirmed ? 'border-red-300 bg-red-50' : data.confirmed ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="checkbox" checked={data.confirmed} onChange={(e) => set('confirmed', e.target.checked)} className="mt-0.5 accent-primary-600 w-4 h-4 flex-shrink-0" />
              <span className="text-sm text-gray-700">I confirm that the information and documents I provided are accurate and complete.</span>
            </label>
            {errors.confirmed && <p className="text-xs text-red-600">{errors.confirmed}</p>}
            {progress && <p className="text-sm text-primary-700 flex items-center gap-2"><Spinner size="sm" />{progress}</p>}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
          <Button variant="secondary" onClick={step === 1 || (resumed && step === 3) ? () => navigate('/student') : prevStep} disabled={submitting}>
            <ChevronLeft className="w-4 h-4" />
            {step === 1 || (resumed && step === 3) ? 'My Applications' : 'Previous'}
          </Button>
          <span className="text-xs text-gray-400">Step {step} of {STEPS.length}</span>
          {step < STEPS.length ? (
            <Button onClick={nextStep}>Next<ChevronRight className="w-4 h-4" /></Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting}>Submit Application</Button>
          )}
        </div>
      </Card>
    </div>
  )
}
