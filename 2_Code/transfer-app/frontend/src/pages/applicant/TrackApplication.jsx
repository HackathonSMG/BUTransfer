import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Mail, ShieldCheck, ArrowRight, LogOut } from 'lucide-react'
import { trackApplication, emailApplicationNumbers } from '../../api/student'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import ApplicationTracker from '../../components/applicant/ApplicationTracker'

// Transfer Credit Status: the Transfer Credit ID + the email the transcripts were submitted with, checked by the
// API every time. The access token the API returns is held in memory for this page only: a refresh, a later
// visit, a number in the URL or a signed-in staff session never opens an application without both details.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function TrackApplication() {
  const [params] = useSearchParams()
  const requested = (params.get('id') || params.get('application') || '').toUpperCase()
  const [session, setSession] = useState(null)

  const open = (s) => { setSession(s); window.scrollTo({ top: 0 }) }
  const close = () => setSession(null)

  if (session) {
    return (
      <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <ApplicationTracker
            token={session.access_token}
            headerAction={<button type="button" onClick={close} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><LogOut className="w-3.5 h-3.5" />Close</button>}
          />
        </div>
      </div>
    )
  }
  return <TrackForm initialNumber={requested || session?.reference_number || ''} onOpen={open} />
}

function TrackForm({ initialNumber, onOpen }) {
  const [number, setNumber] = useState(initialNumber)
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!number.trim()) errs.number = 'Enter your Transfer Credit ID'
    if (!EMAIL.test(email.trim())) errs.email = 'Enter the email address you submitted with'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    setErrors({})
    try {
      const { data } = await trackApplication(number.trim(), email.trim())
      onOpen(data)
    } catch (err) {
      const status = err.response?.status
      setErrors({
        general: status === 404
          ? 'We could not find a transfer credit evaluation with that Transfer Credit ID and email address. Check both and try again.'
          : status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : 'Something went wrong. Please try again.'
      })
    } finally {
      setBusy(false)
    }
  }

  const sendNumbers = async (e) => {
    e.preventDefault()
    if (!EMAIL.test(forgotEmail.trim())) return
    setBusy(true)
    try { await emailApplicationNumbers(forgotEmail.trim()); setForgotSent(true) } catch { setForgotSent(true) } finally { setBusy(false) }
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center">
          <span className="w-12 h-12 rounded-xl bg-red-50 grid place-items-center mx-auto"><Search className="w-6 h-6 text-brand" /></span>
          <h1 className="font-display text-3xl font-semibold text-gray-900 mt-4">Transfer Credit Status</h1>
          <p className="text-gray-600 mt-2">Enter your Transfer Credit ID and the email address you submitted your transcripts with.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 mt-8 space-y-5" noValidate>
          {errors.general && <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-800" role="alert">{errors.general}</div>}
          <Input label="Transfer Credit ID" required value={number} onChange={e => { setNumber(e.target.value.toUpperCase()); setErrors({}) }}
            error={errors.number} placeholder="TC-2026-0001" autoComplete="off" className="[&_input]:font-mono [&_input]:tracking-wide" />
          <Input label="Email address" required type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors({}) }}
            error={errors.email} placeholder="you@example.com" autoComplete="email" />
          <Button type="submit" loading={busy && !forgot} className="w-full" size="lg">Check Status<ArrowRight className="w-4 h-4" /></Button>
          <p className="text-xs text-gray-500 flex items-start gap-1.5"><ShieldCheck className="w-4 h-4 flex-shrink-0 text-gray-400" />Both details must match. Your Transfer Credit ID is in your confirmation email.</p>
        </form>

        <div className="mt-6 bg-white rounded-2xl border border-gray-200 px-6 py-5">
          {!forgot ? (
            <button type="button" onClick={() => setForgot(true)} className="text-sm font-medium text-gray-700 hover:text-gray-900 inline-flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />Forgot your Transfer Credit ID?
            </button>
          ) : forgotSent ? (
            <p className="text-sm text-gray-700">If there are evaluations for <span className="font-medium">{forgotEmail}</span>, we have emailed their Transfer Credit IDs to that address.</p>
          ) : (
            <form onSubmit={sendNumbers} className="space-y-3">
              <p className="text-sm text-gray-700">We will email your Transfer Credit ID to the address you submitted with.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                <Button type="submit" variant="secondary" loading={busy && forgot}>Email my ID</Button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Haven't submitted your transcripts yet? <Link to="/apply" className="font-semibold text-brand hover:underline">Submit Transcripts for Evaluation</Link>
        </p>
      </div>
    </div>
  )
}
