import React, { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { CheckCircle2, Copy, Check, Mail, ArrowRight, FileSearch, Building2, Stamp } from 'lucide-react'

const NEXT = [
  { icon: FileSearch, title: 'Documents processed', text: 'Your transcript is read and each course is checked against BU\'s transfer equivalency records.' },
  { icon: Building2, title: 'Department review', text: 'Courses without an established equivalency are reviewed by the academic department. We may ask you for a syllabus.' },
  { icon: Stamp, title: 'Credit decision', text: 'The Credit Evaluation Office completes a final review and posts your transfer credit.' }
]

// Shown once, straight after submission (the details arrive in the navigation state, not the URL)
export default function ApplicationSubmitted() {
  const { state } = useLocation()
  const [copied, setCopied] = useState(false)
  if (!state?.reference_number) return <Navigate to="/track" replace />

  const copy = async () => {
    try { await navigator.clipboard.writeText(state.reference_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)] px-4 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 sm:px-10 pt-10 pb-8 text-center">
            <span className="w-14 h-14 rounded-full bg-green-50 grid place-items-center mx-auto"><CheckCircle2 className="w-8 h-8 text-green-600" /></span>
            <h1 className="font-display text-[28px] sm:text-3xl font-semibold text-gray-900 mt-4">Application Submitted</h1>
            <p className="text-gray-600 mt-2">
              {state.applicant ? `Thank you, ${state.applicant}. ` : ''}Your transfer credit eligibility application has been submitted successfully.
            </p>

            <div className="mt-7 rounded-xl border border-gray-200 bg-gray-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Application Number</p>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="font-mono text-[28px] sm:text-[32px] font-bold tracking-wide text-gray-900">{state.reference_number}</span>
                <button type="button" onClick={copy} className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white" aria-label="Copy application number">
                  {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Keep this number. You need it with your email address to track your application.</p>
            </div>

            <dl className="mt-5 grid sm:grid-cols-2 gap-3 text-left">
              <div className="rounded-xl border border-gray-200 px-4 py-3">
                <dt className="text-xs font-medium text-gray-500">Email</dt>
                <dd className="text-sm font-medium text-gray-900 mt-0.5 break-all">{state.student_email}</dd>
              </div>
              <div className="rounded-xl border border-gray-200 px-4 py-3">
                <dt className="text-xs font-medium text-gray-500">Status</dt>
                <dd className="mt-1"><span className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-800 border-blue-200">{state.status_info?.label || 'Submitted'} · Processing</span></dd>
              </div>
            </dl>

            <p className="mt-5 text-sm text-gray-600 flex items-center justify-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />We've sent a confirmation email to your email address.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={`/track?application=${encodeURIComponent(state.reference_number)}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-brand text-white font-semibold hover:bg-brand-dark">
                Track Application<ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/" className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Return to Home</Link>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50/70 px-6 sm:px-10 py-7">
            <h2 className="text-sm font-semibold text-gray-900">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {NEXT.map((n, i) => (
                <li key={n.title} className="flex gap-3">
                  <span className="w-8 h-8 rounded-lg bg-white border border-gray-200 grid place-items-center flex-shrink-0"><n.icon className="w-4 h-4 text-brand" /></span>
                  <span><span className="block text-sm font-medium text-gray-900">{i + 1}. {n.title}</span><span className="block text-sm text-gray-600">{n.text}</span></span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-gray-500 mt-5">Processing continues even if you close this page. We will email you when your application reaches an important stage.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
