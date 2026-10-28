import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn, Eye, EyeOff, Check, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import BUCrest from '../../components/layout/BUCrest'
import { homeFor } from '../../lib/homeFor'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Staff sign-in (evaluators, Credit Evaluation Office, administrators); the account's role decides where the
// user lands. Applicants don't sign in: they apply and track with their application number and email.
// ?next= returns a signed-in user to the page they were going to.
export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const next = params.get('next')

  const validate = () => {
    const errs = {}
    if (!email.trim() || !EMAIL.test(email)) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Password is required'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      const user = await login(email, password)
      toast.success(`Welcome back, ${user.full_name || user.email}!`)
      navigate(next?.startsWith('/') && !next.startsWith('//') ? next : homeFor(user.role))
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Invalid email or password'
      setErrors({ general: msg })
    } finally {
      setLoading(false)
    }
  }

  const clear = (key) => setErrors(p => ({ ...p, [key]: '', general: '' }))

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Left: BU red panel with an academic illustration */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#cc0000] via-[#b00000] to-[#7d0000] text-white px-12 py-14">
        <div className="relative z-10 flex items-center gap-3">
          <span className="w-11 h-12 grid place-items-center rounded-lg bg-white/95"><BUCrest className="w-7 h-8" /></span>
          <span>
            <span className="block font-display text-[20px] font-semibold leading-tight">Boston University</span>
            <span className="block text-[13px] text-red-100">Transfer Credit Evaluation</span>
          </span>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-[34px] leading-tight font-semibold">Every course evaluated with care, from transcript to posted credit.</h2>
          <ul className="mt-6 space-y-2.5 text-[15px] text-red-50">
            {['Review the courses assigned to your department', 'Compare with equivalency records and past decisions', 'Finalize and post transfer credit'].map(t => (
              <li key={t} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-white" />{t}</li>
            ))}
          </ul>
        </div>
        <CampusIllustration />
        <p className="relative z-10 text-[12px] text-red-100/80">Academic departments make the final decision on every course.</p>
      </aside>

      {/* Right: the form */}
      <main className="flex items-center justify-center px-4 sm:px-8 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <BUCrest className="w-8 h-9" />
            <span>
              <span className="block font-display text-[18px] font-semibold text-gray-900 leading-tight">Boston University</span>
              <span className="block text-xs text-gray-500">Transfer Credit Evaluation</span>
            </span>
          </div>
          <h1 className="font-display text-[30px] font-semibold text-gray-900 leading-tight">Welcome back</h1>
          <p className="text-gray-500 text-[15px] mt-1.5">For evaluators, the Credit Evaluation Office and administrators.</p>

          <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7 mt-7 space-y-5">
            {errors.general && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700" role="alert">{errors.general}</div>
            )}
            <Input
              label="Email address" required type="email" placeholder="you@bu.edu" value={email}
              onChange={e => { setEmail(e.target.value); clear('email') }} error={errors.email} autoComplete="username"
            />
            <div className="relative">
              <Input
                label="Password" required type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => { setPassword(e.target.value); clear('password') }} error={errors.password} autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-gray-400 hover:text-gray-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg"><LogIn className="w-4 h-4" />Sign in</Button>
            <p className="text-xs text-gray-500 text-center">Forgot your password? Contact your portal administrator to reset it.</p>
          </form>

          <div className="mt-6 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-600 flex items-start gap-3">
            <Search className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
            <span>Submitting transcripts for credit evaluation? You don't need an account. <Link to="/track" className="font-semibold text-brand hover:underline">Track your application</Link> or <Link to="/apply" className="font-semibold text-brand hover:underline">start one</Link>.</span>
          </div>
        </div>
      </main>
    </div>
  )
}

// A simple line drawing of a collegiate building (inline, so no external image is needed)
function CampusIllustration() {
  return (
    <svg viewBox="0 0 520 220" className="pointer-events-none absolute inset-x-0 bottom-0 w-full max-h-[34%] opacity-[0.14]" preserveAspectRatio="xMidYMax meet" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2">
      <path d="M20 210h480" />
      <path d="M60 210V120h400v90" />
      <path d="M40 120h440L260 40 40 120z" />
      <circle cx="260" cy="88" r="16" />
      {[90, 140, 190, 240, 290, 340, 390, 430].map(x => <path key={x} d={`M${x} 130v80`} />)}
      <path d="M220 210v-48a40 40 0 0 1 80 0v48" />
      <path d="M245 40V12h30v28" />
      <path d="M260 12V2" />
    </svg>
  )
}
