import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckSquare, FileText, Brain, Award,
  ArrowRight, Search, ExternalLink, Shield
} from 'lucide-react'

const PROCESS_STEPS = [
  {
    icon: CheckSquare,
    step: '01',
    title: 'Check Eligibility',
    description: 'Answer a few quick questions to see if you meet the initial transfer requirements.'
  },
  {
    icon: FileText,
    step: '02',
    title: 'Submit Application',
    description: 'Complete the multi-step application form and upload your academic documents.'
  },
  {
    icon: Brain,
    step: '03',
    title: 'AI Evaluation',
    description: 'Our AI system evaluates your application against all eligibility criteria.'
  },
  {
    icon: Award,
    step: '04',
    title: 'Evaluator Decision',
    description: "A BU evaluator reviews the AI's analysis and makes the final admission decision."
  }
]

export default function Home() {
  const navigate = useNavigate()
  const [trackInput, setTrackInput] = useState('')

  const handleTrack = (e) => {
    e.preventDefault()
    if (!trackInput.trim()) return
    // Treat input as either a reference number (for search) or direct secure token
    navigate(`/status/${trackInput.trim()}`)
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-brand to-brand-dark text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-6">
            <Shield className="w-4 h-4" />
            Boston University Transfer Credit Evaluation System
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight">
            Check Your Transfer<br />Eligibility Today
          </h1>
          <p className="text-lg sm:text-xl text-red-100 mb-8 max-w-2xl mx-auto">
            Start your BU transfer journey. Our AI-powered evaluation system helps you understand
            your eligibility and streamlines the transfer process.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/eligibility"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-brand font-semibold rounded-xl hover:bg-red-50 transition-colors shadow-lg"
            >
              <CheckSquare className="w-5 h-5" />
              Check Eligibility
            </Link>
            <Link
              to="/apply"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-transparent text-white font-semibold rounded-xl border-2 border-white hover:bg-white/10 transition-colors"
            >
              <FileText className="w-5 h-5" />
              Start Application
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">How It Works</h2>
            <p className="text-gray-500">Four simple steps to your transfer decision</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS_STEPS.map((step, i) => (
              <div key={i} className="relative">
                {i < PROCESS_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gray-200 z-0" />
                )}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center mb-4">
                    <step.icon className="w-7 h-7 text-brand" />
                  </div>
                  <span className="text-xs font-bold text-brand bg-red-50 px-2 py-0.5 rounded-full mb-2">
                    STEP {step.step}
                  </span>
                  <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track Application */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <Search className="w-10 h-10 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Track Your Application</h2>
          <p className="text-gray-500 mb-6">
            Enter your secure application token to check your status.
          </p>
          <form onSubmit={handleTrack} className="flex gap-3">
            <input
              type="text"
              placeholder="Enter your application token..."
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors flex-shrink-0"
            >
              Track
            </button>
          </form>
          <p className="text-sm text-gray-500 mt-3">
            Already applied?{' '}
            <span className="text-primary-600">
              Use the secure link from your confirmation email.
            </span>
          </p>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-brand mb-1">2.5+</div>
              <p className="text-sm text-gray-600">Minimum GPA Required</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-brand mb-1">30+</div>
              <p className="text-sm text-gray-600">Credit Hours Minimum</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-brand mb-1">5–10</div>
              <p className="text-sm text-gray-600">Business Days for Decision</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand rounded-md flex items-center justify-center">
              <span className="text-white text-xs font-bold">BU</span>
            </div>
            <span className="text-sm font-medium text-gray-300">Boston University Transfer Portal</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Accessibility</a>
            <a href="https://www.bu.edu" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
              BU Website <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
