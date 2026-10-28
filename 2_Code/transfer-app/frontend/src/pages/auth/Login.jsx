import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn, Eye, EyeOff, UserPlus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import BUCrest from '../../components/layout/BUCrest'
import { homeFor } from '../../lib/homeFor'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// One sign-in for everyone: the account's role decides where the user lands. Students can also create an
// account here (?mode=register); ?next= returns them to where they were going (e.g. the application form).
export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, register } = useAuth()
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const next = params.get('next')
  const registering = mode === 'register'

  const validate = () => {
    const errs = {}
    if (registering && fullName.trim().length < 2) errs.fullName = 'Enter your full name'
    if (!email.trim() || !EMAIL.test(email)) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Password is required'
    else if (registering && password.length < 8) errs.password = 'Use at least 8 characters'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      const user = registering ? await register(fullName.trim(), email.trim(), password) : await login(email, password)
      toast.success(registering ? 'Your student account is ready' : `Welcome back, ${user.full_name || user.email}!`)
      // ?next= only applies to students (it points into the student journey)
      navigate(user.role === 'student' && next?.startsWith('/') ? next : homeFor(user.role))
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || (registering ? 'The account could not be created' : 'Invalid email or password')
      setErrors({ general: msg })
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (m) => { setMode(m); setErrors({}) }

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
          <h2 className="font-display text-[34px] leading-tight font-semibold">Your earlier coursework, evaluated with care.</h2>
          <ul className="mt-6 space-y-2.5 text-[15px] text-red-50">
            {['Upload your transcripts once', 'Follow every course as it is evaluated', 'See exactly which credits transfer'].map(t => (
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
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <BUCrest className="w-8 h-9" />
            <span className="font-display text-[18px] font-semibold text-gray-900">BU Transfer Portal</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{registering ? 'Create your student account' : 'Sign in'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {registering
              ? 'Start your transfer credit evaluation and follow it from submission to posted credit.'
              : 'Students, evaluators and Credit Evaluation Office staff use the same sign-in.'}
          </p>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7 mt-6">
            {errors.general && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 mb-5">{errors.general}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {registering && (
                <Input label="Full name" required value={fullName} autoComplete="name"
                  onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '', general: '' })) }} error={errors.fullName} />
              )}
              <Input
                label="Email address" required type="email" placeholder={registering ? 'you@example.com' : 'your@bu.edu'} value={email}
                onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '', general: '' })) }}
                error={errors.email} autoComplete="email"
              />
              <div className="relative">
                <Input
                  label="Password" required type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '', general: '' })) }}
                  error={errors.password} autoComplete={registering ? 'new-password' : 'current-password'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-gray-400 hover:text-gray-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">
                {registering ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {registering ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            {registering ? (
              <>Already have an account? <button type="button" onClick={() => switchMode('signin')} className="text-primary-600 hover:text-primary-700 font-medium">Sign in</button></>
            ) : (
              <>New transfer student? <button type="button" onClick={() => switchMode('register')} className="text-primary-600 hover:text-primary-700 font-medium">Create an account</button></>
            )}
          </p>
          <p className="mt-2 text-center text-xs text-gray-400">
            Have a secure status link from an earlier application? It still works. <Link to="/" className="underline">Home</Link>
          </p>
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
