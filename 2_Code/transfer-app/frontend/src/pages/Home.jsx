import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Scale, Award, BookOpen,
  ArrowRight, ExternalLink, ShieldCheck, Mail, Sparkles, GraduationCap, Activity
} from 'lucide-react'
import aerial from '../assets/campus-aerial.jpg'
import buSign from '../assets/students-bu-sign.jpg'

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
    description: 'Submit the final transcript from every college you attended for credit evaluation.'
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

const HERO_FACTS = [
  { icon: Sparkles, text: 'Courses read straight from your transcript' },
  { icon: GraduationCap, text: 'Decided by BU academic departments' },
  { icon: Activity, text: 'Every course tracked until credit is posted' }
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
      {/* Hero: the campus along the Charles under a BU red gradient from the left (full cover on small screens) */}
      <section className="relative overflow-hidden bg-[#5c0000]">
        <img src={aerial} alt="Boston University campus along the Charles River" className="absolute inset-0 w-full h-full object-cover object-[center_45%]" />
        <div className="absolute inset-0 lg:hidden bg-gradient-to-r from-[#7a0000] via-[#990000]/90 to-[#990000]/75" aria-hidden="true" />
        <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-[#7a0000] via-[#990000]/85 via-40% to-transparent" aria-hidden="true" />
        <div className="relative max-w-[1216px] mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="max-w-[620px] text-white motion-safe:animate-[fade-up_.7s_ease-out_both]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur px-3 py-1 text-[13px]">
              <ShieldCheck className="w-4 h-4" />
              Boston University Transfer Credit Evaluation
            </span>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[56px] leading-[1.06] lg:leading-[1.04] font-semibold mt-5">
              Bring the credit<br className="hidden sm:block" /> you've earned<br className="hidden sm:block" /> to Boston University.
            </h1>
            <p className="text-white/90 text-[16px] sm:text-[17px] leading-relaxed mt-5 max-w-[540px]">
              For admitted transfer students: submit your final transcripts, and follow every course through evaluation until your credit is posted.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <Link
                to="/apply"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand px-5 py-3.5 text-[15.5px] font-semibold shadow-lg hover:bg-red-50 transition-colors"
              >
                <FileText className="w-5 h-5" />
                Submit Transcripts for Evaluation
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/self-check"
                className="inline-flex items-center justify-center gap-2 rounded-xl ring-1 ring-white/60 text-white px-5 py-3.5 text-[15.5px] font-semibold hover:bg-white/10 transition-colors"
              >
                <BookOpen className="w-5 h-5" />
                Preview Course Credit
              </Link>
            </div>
            <p className="mt-6 text-[13.5px] text-white/80">
              Already submitted?{' '}
              <Link to="/track" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">Track your transfer credit</Link>
            </p>
          </div>
        </div>
        {/* Three facts on a glass strip at the foot of the photo */}
        <div className="relative border-t border-white/15 bg-black/20 backdrop-blur-sm">
          <ul className="max-w-[1216px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 text-white text-[14px]">
            {HERO_FACTS.map(f => (
              <li key={f.text} className="flex items-center gap-2.5">
                <f.icon className="w-5 h-5 text-white/80 flex-shrink-0" aria-hidden="true" />{f.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works: four steps on one connected line (stacked, without the line, on small screens) */}
      <section className="bg-paper py-16">
        <div className="max-w-[1216px] mx-auto px-4 sm:px-6">
          <p className="text-center text-[12.5px] font-semibold tracking-[0.14em] uppercase text-brand">How it works</p>
          <h2 className="text-center font-display text-[28px] sm:text-[34px] font-semibold text-gray-900 mt-2">From transcript to posted credit</h2>
          <ol className="relative mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-6">
            <span className="hidden lg:block absolute top-7 left-[12%] right-[12%] h-px bg-gradient-to-r from-red-200 via-brand to-red-200" aria-hidden="true" />
            {PROCESS_STEPS.map((step, i) => {
              const last = i === PROCESS_STEPS.length - 1
              return (
                <li key={step.step} className="relative text-center">
                  <span className={`mx-auto w-14 h-14 rounded-2xl grid place-items-center shadow-card ${last ? 'bg-brand text-white' : 'bg-white ring-1 ring-red-100 text-brand'}`}>
                    <step.icon className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-[12px] font-bold text-brand">STEP {step.step}</p>
                  <h3 className="text-[17px] font-semibold text-gray-900 mt-1">{step.title}</h3>
                  <p className="text-[14px] text-gray-600 mt-1.5 leading-relaxed">{step.description}</p>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* Track: the tracker on a red band, framed by the BU sign on the right (photo hidden on small screens) */}
      <section className="relative overflow-hidden bg-[#5c0000]">
        <img src={buSign} alt="" aria-hidden="true" className="hidden md:block absolute right-0 top-0 h-full w-1/2 object-cover object-[center_30%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#7a0000] via-[#990000] to-[#990000] md:via-50% md:to-[#990000]/0" aria-hidden="true" />
        <div className="relative max-w-[1216px] mx-auto px-4 sm:px-6 py-14 text-white">
          <div className="max-w-[560px]">
            <h2 className="font-display text-[28px] sm:text-[32px] font-semibold">Track your transfer credit</h2>
            <p className="text-white/85 mt-2 text-[15px] leading-relaxed">
              See every course, its evaluation status and the credits awarded. You need your Transfer Credit ID and the email address you submitted with.
            </p>
            <form onSubmit={handleTrack} className="mt-6 flex gap-2 rounded-xl bg-white p-1.5 shadow-xl focus-within:ring-2 focus-within:ring-white/70">
              <input
                type="text"
                aria-label="Transfer Credit ID"
                placeholder="Transfer Credit ID, e.g. TC-2026-0001"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 bg-transparent rounded-lg focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white px-5 py-2.5 text-[15px] font-semibold hover:bg-brand-dark transition-colors flex-shrink-0"
              >
                Track<ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <p className="text-xs text-white/75 mt-4 inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Your Transfer Credit ID is in your confirmation email.</p>
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
