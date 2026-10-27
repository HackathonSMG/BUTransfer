import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, XCircle, AlertCircle, ArrowRight, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { checkEligibility } from '../../api/student'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Card from '../../components/ui/Card'

const PROGRAMS = [
  { value: 'computer_science', label: 'Computer Science' },
  { value: 'business', label: 'Business Administration' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'liberal_arts', label: 'Liberal Arts' },
  { value: 'sciences', label: 'Sciences' },
  { value: 'education', label: 'Education' },
  { value: 'communication', label: 'Communication' }
]

const INITIAL_FORM = {
  gpa: '',
  credit_hours: '',
  transfer_from: '',
  program: '',
  has_transcripts: ''
}

export default function EligibilityCheck() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const update = (key, value) => {
    setForm(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.gpa || isNaN(form.gpa) || form.gpa < 0 || form.gpa > 4.0) {
      errs.gpa = 'Enter a valid GPA between 0.0 and 4.0'
    }
    if (!form.credit_hours || isNaN(form.credit_hours) || form.credit_hours < 0) {
      errs.credit_hours = 'Enter the number of credit hours completed'
    }
    if (!form.transfer_from.trim()) errs.transfer_from = 'Enter your current institution'
    if (!form.program) errs.program = 'Select the program you are applying to'
    if (!form.has_transcripts) errs.has_transcripts = 'Please answer this question'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      const { data } = await checkEligibility({
        gpa: parseFloat(form.gpa),
        credits: parseInt(form.credit_hours, 10),
        institution: form.transfer_from || null,
        program: form.program || null,
        hasTranscripts: form.has_transcripts === 'yes'
      })
      // The backend scores criteria as true / false / null with a reason
      setResult({
        ...data,
        partial: !data.eligible && data.score >= 50,
        criteria_results: data.criteria_results.map(c => ({
          ...c,
          result: c.result === true ? 'met' : c.result === false ? 'not_met' : 'needs_verification',
          detail: c.reason
        }))
      })
    } catch (err) {
      // If backend not available, do client-side check
      const gpa = parseFloat(form.gpa)
      const credits = parseInt(form.credit_hours, 10)
      const criteria = [
        { name: 'Minimum GPA (2.5)', result: gpa >= 2.5 ? 'met' : 'not_met', detail: `Your GPA: ${gpa}` },
        { name: 'Minimum Credits (30)', result: credits >= 30 ? 'met' : 'not_met', detail: `Your credits: ${credits}` },
        { name: 'Official Transcripts', result: form.has_transcripts === 'yes' ? 'met' : 'needs_verification', detail: form.has_transcripts === 'yes' ? 'Available' : 'Not confirmed' }
      ]
      const metCount = criteria.filter(c => c.result === 'met').length
      const eligible = metCount === criteria.length
      const partial = metCount >= 2 && !eligible
      setResult({
        eligible,
        partial: partial && !eligible,
        criteria_results: criteria
      })
      if (err.response?.status !== 404) {
        toast.error('Could not reach server — showing client-side estimate')
      }
    } finally {
      setLoading(false)
    }
  }

  const getResultBanner = () => {
    if (result.eligible) {
      return {
        bg: 'bg-green-50 border-green-200',
        icon: <CheckCircle className="w-6 h-6 text-green-600" />,
        title: 'You appear to be eligible!',
        subtitle: 'Based on your responses, you meet the initial transfer requirements. Submit your full application to continue.',
        color: 'text-green-800'
      }
    } else if (result.partial) {
      return {
        bg: 'bg-amber-50 border-amber-200',
        icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
        title: 'You may be eligible with additional review',
        subtitle: 'Some requirements need further evaluation. You can still submit an application and our team will review your case.',
        color: 'text-amber-800'
      }
    } else {
      return {
        bg: 'bg-red-50 border-red-200',
        icon: <XCircle className="w-6 h-6 text-red-600" />,
        title: 'You may not meet eligibility requirements',
        subtitle: 'Based on your responses, you may not currently meet minimum transfer requirements. Contact our admissions office for guidance.',
        color: 'text-red-800'
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-gray-700">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Eligibility Check</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Eligibility Pre-Check</h1>
        <p className="text-gray-500 mt-1">
          Answer a few questions to see if you meet the initial transfer requirements.
          This is an estimate only — final determination is made during the full review.
        </p>
      </div>

      {!result ? (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* GPA */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Current GPA <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="4.0"
                  step="0.1"
                  value={form.gpa || 0}
                  onChange={(e) => update('gpa', e.target.value)}
                  className="flex-1 accent-brand"
                />
                <input
                  type="number"
                  min="0"
                  max="4.0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.gpa}
                  onChange={(e) => update('gpa', e.target.value)}
                  className={`w-20 px-3 py-2 text-sm border rounded-lg text-center focus:outline-none focus:ring-2 ${
                    errors.gpa ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-primary-100 focus:border-primary-500'
                  }`}
                />
              </div>
              {errors.gpa && <p className="text-xs text-red-600 mt-1">{errors.gpa}</p>}
            </div>

            {/* Credit Hours */}
            <Input
              label="Total Credit Hours Completed"
              required
              type="number"
              min="0"
              placeholder="e.g., 60"
              value={form.credit_hours}
              onChange={(e) => update('credit_hours', e.target.value)}
              error={errors.credit_hours}
              helperText="Total credits earned across all institutions"
            />

            {/* Transfer From */}
            <Input
              label="Current Institution"
              required
              type="text"
              placeholder="e.g., University of Massachusetts Boston"
              value={form.transfer_from}
              onChange={(e) => update('transfer_from', e.target.value)}
              error={errors.transfer_from}
            />

            {/* Program */}
            <Select
              label="Program Applying To"
              required
              options={PROGRAMS}
              value={form.program}
              onChange={(e) => update('program', e.target.value)}
              error={errors.program}
              placeholder="Select a program..."
            />

            {/* Transcripts */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Do you have official transcripts? <span className="text-red-500">*</span>
              </p>
              <div className="flex gap-3">
                {['yes', 'no'].map(val => (
                  <label
                    key={val}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      form.has_transcripts === val
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="has_transcripts"
                      value={val}
                      checked={form.has_transcripts === val}
                      onChange={(e) => update('has_transcripts', e.target.value)}
                      className="sr-only"
                    />
                    <span className="font-medium capitalize">{val === 'yes' ? 'Yes, I have them' : 'Not yet'}</span>
                  </label>
                ))}
              </div>
              {errors.has_transcripts && <p className="text-xs text-red-600 mt-1">{errors.has_transcripts}</p>}
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Check My Eligibility
            </Button>
          </form>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Result Banner */}
          {(() => {
            const banner = getResultBanner()
            return (
              <div className={`border rounded-xl p-4 flex items-start gap-3 ${banner.bg}`}>
                {banner.icon}
                <div>
                  <h3 className={`font-bold text-base ${banner.color}`}>{banner.title}</h3>
                  <p className={`text-sm mt-0.5 ${banner.color} opacity-80`}>{banner.subtitle}</p>
                </div>
              </div>
            )
          })()}

          {/* Per-Criterion Results */}
          {result.criteria_results && result.criteria_results.length > 0 && (
            <Card title="Eligibility Criteria">
              <div className="space-y-3">
                {result.criteria_results.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {c.result === 'met'
                      ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      : c.result === 'not_met'
                      ? <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      : <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    }
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.name || c.criterion_name}</p>
                      {c.detail && <p className="text-xs text-gray-500">{c.detail}</p>}
                      {c.explanation && <p className="text-xs text-gray-500">{c.explanation}</p>}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      c.result === 'met' ? 'bg-green-100 text-green-700'
                      : c.result === 'not_met' ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {c.result === 'met' ? 'Met' : c.result === 'not_met' ? 'Not Met' : 'Review Needed'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* CTA */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <Link
              to="/apply"
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
            >
              Start Your Application
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setResult(null)}
              className="flex-1 px-6 py-3 text-gray-700 border border-gray-300 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Check Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
