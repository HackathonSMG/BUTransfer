import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Scale, Award, BookOpen,
  ArrowRight, Search, ExternalLink, Shield, Mail
} from 'lucide-react'

const PROCESS_STEPS = [
  {
    icon: BookOpen,
    step: '01',
    title: 'Self-Check',
    description: 'Preview how your courses are likely to transfer and which ones may need a syllabus.'
  },
  {
    icon: FileText,
    step: '02',
    title: 'Apply & Upload',
    description: 'Submit the final transcript from every college you attended for credit evaluation. No account needed.'
  },
  {
    icon: Scale,
    step: '03',
    title: 'Course Evaluation',
    description: 'Established equivalencies apply straight away; other courses go to department evaluators.'
  },
  {
    icon: Award,
    step: '04',
    title: 'Credit Posted',
    description: 'Each decided course is posted with a grade of T. Track every course with your Transfer Credit ID.'
  }
]

export default function Home() {
  const navigate = useNavigate()
  const [trackInput, setTrackInput] = useState('')

  // The tracking page asks for the email that goes with the application number
  const handleTrack = (e) => {
    e.preventDefault()
    navigate(trackInput.trim() ? `/track?id=${encodeURIComponent(trackInput.trim().toUpperCase())}` : '/track')
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
            Transfer Your Credits<br />to Boston University
          </h1>
          <p className="text-lg sm:text-xl text-red-100 mb-8 max-w-2xl mx-auto">
            For admitted transfer students: submit final transcripts from every college you attended, receive an
            Transfer Credit ID, and follow every course through evaluation until your credit is posted.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/apply"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-brand font-semibold rounded-xl hover:bg-red-50 transition-colors shadow-lg"
            >
              <FileText className="w-5 h-5" />
              Submit Transcripts for Evaluation
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/self-check"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-transparent text-white font-semibold rounded-xl border-2 border-white/70 hover:bg-white/10 transition-colors"
            >
              <BookOpen className="w-5 h-5" />
              Preview Course Credit
            </Link>
            <Link
              to="/track"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-transparent text-white font-semibold rounded-xl border-2 border-white/70 hover:bg-white/10 transition-colors"
            >
              <Search className="w-5 h-5" />
              Track Transfer Credit
            </Link>
          </div>
          <p className="mt-6 text-sm text-red-100">
            No account needed. Academic departments make the final decision on every course.
          </p>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Track Your Transfer Credit</h2>
          <p className="text-gray-500 mb-6">
            See every course, its evaluation status and the credits awarded. You need your Transfer Credit ID and the email address you submitted with.
          </p>
          <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              aria-label="Transfer Credit ID"
              placeholder="Transfer Credit ID, e.g. TC-2026-0001"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              className="flex-1 px-4 py-3 text-sm font-mono border border-gray-300 rounded-xl focus:outline-none focus:border-brand focus:ring-2 focus:ring-red-100"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-brand text-white font-medium rounded-xl hover:bg-brand-dark transition-colors flex-shrink-0 inline-flex items-center justify-center gap-2"
            >
              Track Transfer Credit<ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-4 inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Your Transfer Credit ID is in your confirmation email.</p>
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
