import React, { useState } from 'react'
import { CheckCircle2, CircleDashed, CircleSlash, ChevronDown } from 'lucide-react'

// Course comparison for the evaluator: the transfer course and the proposed BU course side by side, then each BU
// learning outcome and topic marked covered / partly covered / not evident in the transfer course's own text
// (description, learning outcomes, syllabus), with the shared terms that support it. Computed by the API
// (credit/comparison.js). It explains the recommendation; the evaluator decides.
const STATUS = {
  covered: { label: 'Covered', icon: CheckCircle2, cls: 'text-emerald-700' },
  partial: { label: 'Partly covered', icon: CircleDashed, cls: 'text-amber-700' },
  not_evident: { label: 'Not evident', icon: CircleSlash, cls: 'text-staff-muted' }
}
const CREDIT_NOTE = {
  equal: 'Same credit hours',
  fewer: 'Fewer credit hours than the BU course',
  more: 'More credit hours than the BU course',
  unknown: 'Credit hours not known for one of the courses'
}

export default function CourseComparison({ comparison: c, src, buCourses = [], number = null }) {
  const [showTopics, setShowTopics] = useState(false)
  if (!c) return null
  const oc = c.outcome_coverage
  const tc = c.topic_coverage

  return (
    <section className="staff-card mt-6 overflow-hidden" aria-labelledby="course-comparison">
      <div className="px-6 sm:px-8 pt-6 pb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="course-comparison" className="flex items-center gap-2.5 text-[16px] font-semibold text-staff-ink">
            {number != null && <span className="w-6 h-6 rounded-md bg-staff-ink text-white grid place-items-center text-[12px] font-semibold" aria-hidden="true">{number}</span>}
            Course comparison
          </h2>
          <p className="text-[13px] text-staff-muted mt-0.5">
            {c.has_source_text
              ? <>Compared using the {c.based_on.join(', ')}.</>
              : 'No description or syllabus is on file for the transfer course, so the content cannot be compared yet.'}
          </p>
        </div>
        {c.has_source_text && oc.total > 0 && (
          <p className="flex items-center gap-2.5 text-[13px] text-staff-ink2">
            <span className="w-28 h-2 rounded-full bg-staff-line2 overflow-hidden flex" aria-hidden="true">
              <span className="bg-emerald-500" style={{ width: `${(oc.covered / oc.total) * 100}%` }} />
              <span className="bg-amber-400" style={{ width: `${(oc.partial / oc.total) * 100}%` }} />
            </span>
            <span><span className="font-display text-[20px] font-semibold text-staff-ink tabular-nums">{oc.covered}</span> of {oc.total} BU learning outcomes covered</span>
            {oc.partial > 0 && <span className="text-staff-muted"> · {oc.partial} partly</span>}
          </p>
        )}
      </div>

      {/* Side by side */}
      <div className="grid md:grid-cols-2 gap-px bg-staff-line2 border-y border-staff-line2">
        <CourseColumn label="Transfer course" code={src?.course_code} title={src?.title}
          credits={c.credits.source != null ? `${c.credits.source} ${c.credits.credit_system === 'Quarter' ? 'quarter ' : ''}credits${c.credits.source_units != null && c.credits.source_units !== c.credits.source ? ` (${c.credits.source_units} BU units)` : ''}` : 'Credits not on transcript'}
          description={src?.description} outcomes={src?.learning_outcomes} />
        <CourseColumn label="Boston University course" code={buCourses.map(b => b.course_code).join(' + ')} title={buCourses.map(b => b.title).join(' + ')}
          credits={c.credits.bu != null ? `${c.credits.bu} credits` : null}
          description={buCourses.map(b => b.description).filter(Boolean).join(' ')} outcomes={buCourses.map(b => b.learning_outcomes).filter(Boolean).join(' ')} emphasis />
      </div>

      {c.has_source_text && (
        <div className="px-6 sm:px-8 py-5 space-y-5 text-[14px]">
          {/* Credit hours */}
          <p className="flex flex-wrap gap-x-2">
            <span className="font-medium text-staff-ink">Credit hours:</span>
            <span className="text-staff-ink2">{CREDIT_NOTE[c.credits.comparison]}{c.credits.source_units != null && c.credits.bu != null ? ` (${c.credits.source_units} vs ${c.credits.bu})` : ''}</span>
          </p>

          {/* BU learning outcomes */}
          {oc.total > 0 && (
            <div>
              <p className="font-medium text-staff-ink mb-2">BU learning outcomes</p>
              <ul className="space-y-2">{c.outcomes.map((o, i) => <CoverageRow key={i} item={o} />)}</ul>
            </div>
          )}

          {/* BU topics */}
          {tc.total > 0 && (
            <div>
              <button type="button" onClick={() => setShowTopics(v => !v)} aria-expanded={showTopics} className="flex items-center gap-2 font-medium text-staff-ink">
                BU course topics
                <span className="text-staff-muted font-normal">{tc.covered} covered · {tc.partial} partly · {tc.not_evident} not evident</span>
                <ChevronDown className={`w-4 h-4 text-staff-muted transition-transform ${showTopics ? 'rotate-180' : ''}`} />
              </button>
              {showTopics && <ul className="space-y-2 mt-2">{c.topics.map((t, i) => <CoverageRow key={i} item={t} />)}</ul>}
            </div>
          )}

          {/* Shared and missing terms */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Terms title="Shared with the BU course" terms={c.shared_terms} tone="bg-emerald-50 text-emerald-800 border-emerald-200" empty="No shared key terms" />
            <Terms title="In the BU course, not evident in the transfer course" terms={c.missing_terms} tone="bg-staff-sunk text-staff-ink2 border-staff-line" empty="None" />
          </div>
          <p className="text-[12.5px] text-staff-muted">
            Coverage is a text comparison of key terms to help the review. It is not a decision: the department evaluator makes the final academic decision.
          </p>
        </div>
      )}
    </section>
  )
}

function CourseColumn({ label, code, title, credits, description, outcomes, emphasis = false }) {
  return (
    <div className={`px-6 sm:px-8 py-5 ${emphasis ? 'bg-red-50/30' : 'bg-white'}`}>
      <p className="text-[12.5px] font-medium text-staff-muted">{label}</p>
      <p className={`font-mono text-[17px] font-semibold mt-0.5 ${emphasis ? 'text-primary-800' : 'text-staff-ink'}`}>{code || '—'}</p>
      <p className="text-[14.5px] text-staff-ink">{title}</p>
      {credits && <p className="text-[13px] text-staff-ink2 mt-0.5">{credits}</p>}
      <p className="text-[12.5px] font-medium text-staff-muted mt-3">Description</p>
      <p className="text-[13.5px] text-staff-ink2 leading-relaxed">{description || 'No description on file.'}</p>
      {outcomes && (
        <>
          <p className="text-[12.5px] font-medium text-staff-muted mt-3">Learning outcomes</p>
          <p className="text-[13.5px] text-staff-ink2 leading-relaxed">{outcomes}</p>
        </>
      )}
    </div>
  )
}

function CoverageRow({ item }) {
  const st = STATUS[item.status]
  const Icon = st.icon
  return (
    <li className="flex gap-2.5">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${st.cls}`} aria-label={st.label} />
      <span className="min-w-0">
        <span className="text-staff-ink">{item.text}</span>
        <span className={`ml-2 text-[12px] font-medium ${st.cls}`}>{st.label}</span>
        {item.matched.length > 0 && <span className="block text-[12.5px] text-staff-muted">Matched: {item.matched.join(', ')}</span>}
      </span>
    </li>
  )
}

function Terms({ title, terms, tone, empty }) {
  return (
    <div>
      <p className="text-[12.5px] font-medium text-staff-muted mb-1.5">{title}</p>
      {terms.length ? (
        <div className="flex flex-wrap gap-1.5">{terms.map(t => <span key={t} className={`text-[12.5px] px-2 py-0.5 rounded-full border ${tone}`}>{t}</span>)}</div>
      ) : <p className="text-[13px] text-staff-muted">{empty}</p>}
    </div>
  )
}
