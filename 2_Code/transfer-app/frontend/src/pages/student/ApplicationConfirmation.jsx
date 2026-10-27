import React, { useState } from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { CheckCircle, Copy, Check, ArrowRight, FileText, Brain, ClipboardCheck, Mail } from 'lucide-react'

const NEXT_STEPS = [
  {
    icon: ClipboardCheck,
    step: '1',
    title: 'Application Review',
    description: 'Our team will review your submitted documents and information.'
  },
  {
    icon: Brain,
    step: '2',
    title: 'AI Evaluation',
    description: 'Our AI system analyzes your application against eligibility criteria.'
  },
  {
    icon: FileText,
    step: '3',
    title: 'Evaluator Review',
    description: 'A BU admissions evaluator reviews the AI analysis and your application.'
  },
  {
    icon: Mail,
    step: '4',
    title: 'Decision Notification',
    description: 'You\'ll receive a decision via email and through your secure application link.'
  }
]

export default function ApplicationConfirmation() {
  const location = useLocation()
  const [copiedRef, setCopiedRef] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const { reference_number, secure_token, application_id } = location.state || {}

  if (!reference_number && !secure_token) {
    return <Navigate to="/apply" replace />
  }

  const secureLink = secure_token ? `${window.location.origin}/status/${secure_token}` : null

  const copyToClipboard = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2000)
    } catch {
      // Fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setter(true)
      setTimeout(() => setter(false), 2000)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Application Submitted Successfully!</h1>
        <p className="text-gray-500 mt-2">
          Your transfer application has been received. Save the information below to track your status.
        </p>
      </div>

      {/* Reference Number */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
        <p className="text-sm font-medium text-gray-500 mb-1">Your Reference Number</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold font-mono text-gray-900 tracking-wider">
            {reference_number || 'APP-PENDING'}
          </span>
          <button
            onClick={() => copyToClipboard(reference_number, setCopiedRef)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Copy reference number"
          >
            {copiedRef ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Keep this number for your records</p>
      </div>

      {/* Secure Link */}
      {secureLink && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5">
          <p className="text-sm font-semibold text-blue-900 mb-2">Your Secure Application Link</p>
          <div className="bg-white rounded-xl border border-blue-200 flex items-center gap-2 px-3 py-2.5">
            <span className="flex-1 text-xs text-gray-700 truncate font-mono">{secureLink}</span>
            <button
              onClick={() => copyToClipboard(secureLink, setCopiedLink)}
              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
              title="Copy link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Bookmark this link. You'll use it to track your application status, upload additional
            documents, and view your evaluation results. No login required.
          </p>
        </div>
      )}

      {/* What Happens Next */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">What Happens Next?</h2>
        <div className="space-y-4">
          {NEXT_STEPS.map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <s.icon className="w-4 h-4 text-primary-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.step}. {s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {secureLink && (
          <Link
            to={`/status/${secure_token}`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
          >
            Track My Application
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
        <Link
          to="/"
          className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  )
}
