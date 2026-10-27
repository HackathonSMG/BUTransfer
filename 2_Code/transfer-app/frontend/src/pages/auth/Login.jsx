import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const errs = {}
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address'
    }
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
      if (user.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/evaluator')
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid email or password'
      setErrors({ general: msg })
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-xl">BU</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BU Transfer Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Staff login for evaluators and administrators</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 mb-5">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              required
              type="email"
              placeholder="your@bu.edu"
              value={email}
              onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '', general: '' })) }}
              error={errors.email}
              autoComplete="email"
            />

            <div className="relative">
              <Input
                label="Password"
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '', general: '' })) }}
                error={errors.password}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Are you a student?{' '}
            <Link to="/apply" className="text-primary-600 hover:text-primary-700 font-medium">
              Submit a Transfer Application
            </Link>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Students use their secure link — no login required.
          </p>
        </div>
      </div>
    </div>
  )
}
