import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { createApplication, uploadDocument } from '../../api/applications'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import FileUpload from '../../components/ui/FileUpload'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { PROGRAMS, PROGRAM_DEPARTMENTS, TERMS, STANDING, toApplicationPayload } from '../../lib/application'

const INITIAL_DATA = {
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
  transfer_from_institution: '', current_program: '', gpa: '', total_credits: '', academic_standing: '',
  program: '', expected_start_term: '', personal_statement: '',
  transcript: null, syllabi: [], other_docs: []
}

// Staff (evaluator or admin) raise an application on a student's behalf, e.g. from an email or paper form
export default function NewApplication() {
  const navigate = useNavigate()
  const [data, setData] = useState(INITIAL_DATA)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const set = (key, value) => {
    setData(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!data.first_name.trim()) errs.first_name = 'First name is required'
    if (!data.last_name.trim()) errs.last_name = 'Last name is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Valid email address is required'
    if (!data.transfer_from_institution.trim()) errs.transfer_from_institution = 'Institution is required'
    const gpa = parseFloat(data.gpa)
    if (isNaN(gpa) || gpa < 0 || gpa > 4) errs.gpa = 'Valid GPA (0.0–4.0) is required'
    if (!data.total_credits || isNaN(data.total_credits)) errs.total_credits = 'Total credits is required'
    if (!data.program) errs.program = 'Program is required'
    if (!data.expected_start_term) errs.expected_start_term = 'Expected start term is required'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      const { data: application } = await createApplication(toApplicationPayload(data))

      const uploads = [
        [data.transcript, 'transcript'],
        ...data.syllabi.map(f => [f, 'syllabus']),
        ...data.other_docs.map(f => [f, 'supporting'])
      ].filter(([file]) => file)
      const failed = []
      for (const [file, type] of uploads) {
        try {
          await uploadDocument(application.id, file, type)
        } catch {
          failed.push(file.name)
        }
      }
      if (failed.length > 0) {
        toast.error(`Some documents could not be uploaded (${failed.join(', ')}). You can add them on the evaluation page.`)
      }

      toast.success(`Application ${application.reference_number} created`)
      navigate(`/evaluator/applications/${application.id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create the evaluation')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
          <Link to="/evaluator" className="hover:text-gray-700">Credit Evaluations</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">New Evaluation</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">New Credit Evaluation</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Raise a transfer application on a student's behalf. They get a status link to follow it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Card title="Student">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required value={data.first_name} onChange={e => set('first_name', e.target.value)} error={errors.first_name} />
              <Input label="Last Name" required value={data.last_name} onChange={e => set('last_name', e.target.value)} error={errors.last_name} />
            </div>
            <Input label="Email Address" required type="email" value={data.email} onChange={e => set('email', e.target.value)} error={errors.email} placeholder="student@example.com" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone Number" type="tel" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
              <Input label="Date of Birth" type="date" value={data.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </div>
          </div>
        </Card>

        <Card title="Academic Background">
          <div className="space-y-4">
            <Input
              label="Current/Previous Institution"
              required
              value={data.transfer_from_institution}
              onChange={e => set('transfer_from_institution', e.target.value)}
              error={errors.transfer_from_institution}
              placeholder="e.g., Riverside Community College"
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
          </div>
        </Card>

        <Card title="Transfer Request">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Program Applying To"
                required
                options={PROGRAMS}
                value={data.program}
                onChange={e => set('program', e.target.value)}
                error={errors.program}
                placeholder="Select a program..."
              />
              <Select
                label="Expected Start Term"
                required
                options={TERMS}
                value={data.expected_start_term}
                onChange={e => set('expected_start_term', e.target.value)}
                error={errors.expected_start_term}
                placeholder="Select a term..."
              />
            </div>
            {data.program && (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Department: <span className="font-medium text-gray-700">{PROGRAM_DEPARTMENTS[data.program]}</span>
              </div>
            )}
            <Textarea
              label="Student Statement (optional)"
              rows={4}
              maxLength={1000}
              value={data.personal_statement}
              onChange={e => set('personal_statement', e.target.value)}
              placeholder="Anything the student provided about their goals or reasons for transferring"
            />
          </div>
        </Card>

        <Card title="Documents" subtitle="Optional now: you can also upload documents later from the evaluation page.">
          <div className="space-y-5">
            <FileUpload
              label="Official Transcript"
              accept=".pdf,.doc,.docx"
              maxSizeMB={20}
              onFileSelect={(f) => set('transcript', f)}
            />
            <FileUpload
              label="Course Syllabi (multiple files)"
              accept=".pdf,.doc,.docx"
              multiple
              onFileSelect={(files) => set('syllabi', Array.isArray(files) ? files : [files].filter(Boolean))}
            />
            <FileUpload
              label="Other Supporting Documents"
              multiple
              onFileSelect={(files) => set('other_docs', Array.isArray(files) ? files : [files].filter(Boolean))}
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/evaluator')} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create Application
          </Button>
        </div>
      </form>
    </div>
  )
}
