import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { submitApplication, uploadStudentDocument } from '../../api/student'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import FileUpload from '../../components/ui/FileUpload'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { PROGRAMS, PROGRAM_DEPARTMENTS, TERMS, STANDING, toApplicationPayload } from '../../lib/application'

const STEPS = [
  { id: 1, label: 'Personal Info' },
  { id: 2, label: 'Academic Background' },
  { id: 3, label: 'Transfer Request' },
  { id: 4, label: 'Documents' },
  { id: 5, label: 'Review & Submit' }
]

const INITIAL_DATA = {
  // Step 1
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '', address: '',
  // Step 2
  transfer_from_institution: '', current_program: '', gpa: '', total_credits: '',
  academic_standing: '', graduation_date: '',
  // Step 3
  program: '', expected_start_term: '', why_transferring: '', personal_statement: '',
  // Step 4
  transcript: null, government_id: null, syllabi: [], other_docs: [],
  // Step 5
  confirmed: false
}

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              currentStep > step.id
                ? 'bg-green-500 text-white'
                : currentStep === step.id
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
            </div>
            <span className={`text-xs mt-1 hidden sm:block font-medium ${
              currentStep === step.id ? 'text-primary-600' : 'text-gray-500'
            }`}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
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
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [data, setData] = useState(INITIAL_DATA)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const set = (key, value) => {
    setData(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validateStep = (s) => {
    const errs = {}
    if (s === 1) {
      if (!data.first_name.trim()) errs.first_name = 'First name is required'
      if (!data.last_name.trim()) errs.last_name = 'Last name is required'
      if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errs.email = 'Valid email address is required'
      }
    }
    if (s === 2) {
      if (!data.transfer_from_institution.trim()) errs.transfer_from_institution = 'Institution is required'
      if (!data.gpa || isNaN(data.gpa) || data.gpa < 0 || data.gpa > 4.0) {
        errs.gpa = 'Valid GPA (0.0–4.0) is required'
      }
      if (!data.total_credits || isNaN(data.total_credits) || Number(data.total_credits) < 0) {
        errs.total_credits = Number(data.total_credits) < 0
          ? 'Total credits cannot be negative'
          : 'Total credits is required'
      }
    }
    if (s === 3) {
      if (!data.program) errs.program = 'Program is required'
      if (!data.expected_start_term) errs.expected_start_term = 'Expected start term is required'
    }
    if (s === 4) {
      if (!data.transcript) errs.transcript = 'Official transcript is required'
    }
    if (s === 5) {
      if (!data.confirmed) errs.confirmed = 'You must confirm the information is accurate'
    }
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
    const errs = validateStep(5)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      // The backend takes the application as JSON, then documents one at a time via the secure token
      const { data: result } = await submitApplication(toApplicationPayload(data))
      const secureToken = result.secure_link.split('/status/').pop()

      const uploads = [
        [data.transcript, 'transcript'],
        [data.government_id, 'identification'],
        ...data.syllabi.map(f => [f, 'syllabus']),
        ...data.other_docs.map(f => [f, 'supporting'])
      ].filter(([file]) => file)
      const failed = []
      for (const [file, type] of uploads) {
        try {
          await uploadStudentDocument(secureToken, file, type)
        } catch {
          failed.push(file.name)
        }
      }
      if (failed.length > 0) {
        toast.error(`Some documents could not be uploaded (${failed.join(', ')}). You can add them from your status page.`)
      }

      navigate('/apply/confirm', {
        state: {
          reference_number: result.reference_number,
          secure_token: secureToken,
          application_id: result.id
        }
      })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const programLabel = PROGRAMS.find(p => p.value === data.program)?.label
  const departmentLabel = data.program ? PROGRAM_DEPARTMENTS[data.program] : ''
  const termLabel = TERMS.find(t => t.value === data.expected_start_term)?.label
  const standingLabel = STANDING.find(s => s.value === data.academic_standing)?.label

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
          <Link to="/" className="hover:text-gray-700">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">Application Form</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Transfer Application</h1>
        <p className="text-gray-500 text-sm mt-1">Boston University — Transfer Credit Evaluation</p>
      </div>

      <StepIndicator currentStep={step} />

      <Card>
        {/* Step 1: Personal Information */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={data.first_name} onChange={e => set('first_name', e.target.value)} error={errors.first_name} />
              <Input label="Last Name" required value={data.last_name} onChange={e => set('last_name', e.target.value)} error={errors.last_name} />
            </div>
            <Input label="Email Address" required type="email" value={data.email} onChange={e => set('email', e.target.value)} error={errors.email} placeholder="you@example.com" />
            <Input label="Phone Number" type="tel" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
            <Input label="Date of Birth" type="date" value={data.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            <Input label="Current Address" value={data.address} onChange={e => set('address', e.target.value)} placeholder="Street, City, State, ZIP" />
          </div>
        )}

        {/* Step 2: Academic Background */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Academic Background</h2>
            <Input
              label="Current/Previous Institution"
              required
              value={data.transfer_from_institution}
              onChange={e => set('transfer_from_institution', e.target.value)}
              error={errors.transfer_from_institution}
              placeholder="e.g., University of Massachusetts Boston"
            />
            <Input label="Current Program/Major" value={data.current_program} onChange={e => set('current_program', e.target.value)} placeholder="e.g., Computer Science" />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="GPA"
                required
                type="number"
                step="0.01"
                min="0"
                max="4.0"
                value={data.gpa}
                onChange={e => set('gpa', e.target.value)}
                error={errors.gpa}
                placeholder="e.g., 3.50"
              />
              <Input
                label="Total Credits Earned"
                required
                type="number"
                min="0"
                value={data.total_credits}
                onChange={e => set('total_credits', e.target.value)}
                error={errors.total_credits}
                placeholder="e.g., 60"
              />
            </div>
            <Select
              label="Academic Standing"
              options={STANDING}
              value={data.academic_standing}
              onChange={e => set('academic_standing', e.target.value)}
              placeholder="Select standing..."
            />
            <Input label="Expected Graduation/Transfer Date" type="month" value={data.graduation_date} onChange={e => set('graduation_date', e.target.value)} />
          </div>
        )}

        {/* Step 3: Transfer Request */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Transfer Request</h2>
            <Select
              label="Program Applying To"
              required
              options={PROGRAMS}
              value={data.program}
              onChange={e => set('program', e.target.value)}
              error={errors.program}
              placeholder="Select a program..."
            />
            {data.program && (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Department: <span className="font-medium text-gray-700">{PROGRAM_DEPARTMENTS[data.program]}</span>
              </div>
            )}
            <Select
              label="Expected Start Term"
              required
              options={TERMS}
              value={data.expected_start_term}
              onChange={e => set('expected_start_term', e.target.value)}
              error={errors.expected_start_term}
              placeholder="Select a term..."
            />
            <Textarea
              label="Why are you transferring to BU?"
              rows={4}
              maxLength={500}
              value={data.why_transferring}
              onChange={e => set('why_transferring', e.target.value)}
              placeholder="Explain your reasons for wanting to transfer to Boston University..."
            />
            <Textarea
              label="Personal Statement"
              rows={6}
              maxLength={1000}
              value={data.personal_statement}
              onChange={e => set('personal_statement', e.target.value)}
              placeholder="Describe your academic goals, achievements, and why you are a good fit for BU..."
            />
          </div>
        )}

        {/* Step 4: Documents */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Document Upload</h2>
            <p className="text-sm text-gray-500">Upload required and supporting documents. PDF is preferred for transcripts.</p>

            <div className={`rounded-xl p-1 ${errors.transcript ? 'ring-2 ring-red-300' : ''}`}>
              <FileUpload
                label="Official Transcript (Required)"
                accept=".pdf,.doc,.docx"
                maxSizeMB={20}
                onFileSelect={(f) => { set('transcript', f); setErrors(p => ({ ...p, transcript: '' })) }}
              />
              {errors.transcript && <p className="text-xs text-red-600 mt-1 px-1">{errors.transcript}</p>}
            </div>

            <FileUpload
              label="Government-Issued ID (Optional)"
              accept=".pdf,.jpg,.jpeg,.png"
              maxSizeMB={5}
              onFileSelect={(f) => set('government_id', f)}
            />

            <FileUpload
              label="Course Syllabi (Optional — multiple files)"
              accept=".pdf,.doc,.docx"
              maxSizeMB={10}
              multiple
              onFileSelect={(files) => set('syllabi', Array.isArray(files) ? files : [files].filter(Boolean))}
            />

            <FileUpload
              label="Other Supporting Documents (Optional)"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              maxSizeMB={10}
              multiple
              onFileSelect={(files) => set('other_docs', Array.isArray(files) ? files : [files].filter(Boolean))}
            />
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Review Your Application</h2>
            <p className="text-sm text-gray-500">Please review all information before submitting.</p>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Information</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <ReviewField label="First Name" value={data.first_name} />
                  <ReviewField label="Last Name" value={data.last_name} />
                  <ReviewField label="Email" value={data.email} />
                  <ReviewField label="Phone" value={data.phone} />
                  <ReviewField label="Date of Birth" value={data.date_of_birth} />
                  <ReviewField label="Address" value={data.address} />
                </dl>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Academic Background</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <ReviewField label="From Institution" value={data.transfer_from_institution} />
                  <ReviewField label="Current Program" value={data.current_program} />
                  <ReviewField label="GPA" value={data.gpa} />
                  <ReviewField label="Total Credits" value={data.total_credits} />
                  <ReviewField label="Academic Standing" value={standingLabel} />
                  <ReviewField label="Transfer Date" value={data.graduation_date} />
                </dl>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Transfer Request</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <ReviewField label="Program" value={programLabel} />
                  <ReviewField label="Department" value={departmentLabel} />
                  <ReviewField label="Start Term" value={termLabel} />
                </dl>
                {data.personal_statement && (
                  <div className="mt-3">
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Personal Statement</dt>
                    <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap line-clamp-4">{data.personal_statement}</dd>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    {data.transcript ? <Check className="w-4 h-4 text-green-600" /> : <span className="w-4 h-4 text-gray-300">—</span>}
                    <span className={data.transcript ? 'text-gray-900' : 'text-gray-400'}>
                      Transcript: {data.transcript ? data.transcript.name : 'Not uploaded'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {data.government_id ? <Check className="w-4 h-4 text-green-600" /> : <span className="text-gray-400">—</span>}
                    <span className={data.government_id ? 'text-gray-900' : 'text-gray-400'}>
                      ID: {data.government_id ? data.government_id.name : 'Not uploaded'}
                    </span>
                  </li>
                  {data.syllabi && data.syllabi.length > 0 && (
                    <li className="text-gray-900 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      {data.syllabi.length} syllabus file(s)
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {/* Confirmation checkbox */}
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              errors.confirmed ? 'border-red-300 bg-red-50' : data.confirmed ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="checkbox"
                checked={data.confirmed}
                onChange={(e) => { set('confirmed', e.target.checked); setErrors(p => ({ ...p, confirmed: '' })) }}
                className="mt-0.5 accent-primary-600 w-4 h-4 flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                I confirm that all information provided in this application is accurate and complete.
                I understand that providing false information may result in disqualification.
              </span>
            </label>
            {errors.confirmed && <p className="text-xs text-red-600">{errors.confirmed}</p>}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
          <Button
            variant="secondary"
            onClick={step === 1 ? () => window.history.back() : prevStep}
            disabled={submitting}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Back to Home' : 'Previous'}
          </Button>

          <span className="text-xs text-gray-400">Step {step} of {STEPS.length}</span>

          {step < STEPS.length ? (
            <Button onClick={nextStep}>
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting} variant="primary">
              Submit Application
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
