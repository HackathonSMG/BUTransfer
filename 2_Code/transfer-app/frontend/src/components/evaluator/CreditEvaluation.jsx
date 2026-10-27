import React, { useState } from 'react'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import Badge from '../ui/Badge'

const PATHS = {
  equivalency: { label: 'Approved equivalency', variant: 'success' },
  precedent: { label: 'Past decision', variant: 'info' },
  rule: { label: 'Policy rule', variant: 'error' },
  review: { label: 'Department review', variant: 'warning' },
  needs_information: { label: 'Needs information', variant: 'default' }
}

const num = (v) => (v === null || v === undefined ? '' : Number(v).toString())

function resultLabel(c) {
  if (c.outcome === 'no_credit') return <span className="text-red-700">No credit</span>
  if (c.award) return <span className="font-medium text-gray-900">{c.award}</span>
  if (c.suggestion) return <span className="text-gray-700">Suggested: <span className="font-medium text-gray-900">{c.suggestion}</span></span>
  return <span className="text-gray-400">To be decided</span>
}

function CourseRow({ c }) {
  const [open, setOpen] = useState(false)
  const path = PATHS[c.path]
  const variant = c.path === 'rule' && c.outcome === 'elective' ? 'warning' : path?.variant
  const quarter = /quarter/i.test(c.credit_system || '')

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(!open)}>
        <td className="px-3 pl-6 py-2.5 align-top">
          <div className="font-mono text-xs text-gray-900">{c.course_code}</div>
          <div className="text-sm text-gray-700">{c.title}</div>
          <div className="text-xs text-gray-400">{c.institution}</div>
        </td>
        <td className="px-3 py-2.5 align-top text-sm text-gray-600 whitespace-nowrap">{c.term}</td>
        <td className="px-3 py-2.5 align-top text-sm font-medium text-gray-900">{c.grade}</td>
        <td className="px-3 py-2.5 align-top text-sm text-gray-600 whitespace-nowrap">
          {num(c.source_credits)} {quarter ? 'qtr' : 'sem'}
          {c.bu_credits !== null && c.bu_credits !== undefined && quarter && (
            <span className="text-gray-400"> → {num(c.bu_credits)}</span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          {path ? <Badge variant={variant}>{path.label}</Badge> : <span className="text-xs text-gray-400">Not evaluated</span>}
        </td>
        <td className="px-3 py-2.5 align-top text-sm">{c.path ? resultLabel(c) : null}</td>
        <td className="px-2 pr-6 py-2.5 align-top text-gray-400">
          {c.path && (open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
        </td>
      </tr>
      {open && c.path && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 pb-3 pt-1">
            <ul className="space-y-1">
              {(c.reasons || []).map((r, i) => (
                <li key={i} className="text-xs text-gray-700 flex gap-2"><span className="text-gray-400">•</span>{r}</li>
              ))}
            </ul>
            {c.candidates?.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Closest BU courses by content: {c.candidates.map(k => `${k.code} ${k.title} (${Math.round(k.score * 100)}%)`).join(' · ')}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function CreditEvaluation({ courses = [], summary }) {
  if (courses.length === 0) {
    return (
      <div className="text-center py-6">
        <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-600">No transcript courses yet.</p>
        <p className="text-xs text-gray-400 mt-1">Upload the transcript PDF under Documents; its courses are read automatically. Then run the evaluation.</p>
      </div>
    )
  }

  const evaluated = courses.some(c => c.path)
  return (
    <div className="space-y-3">
      {summary && evaluated ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded-md bg-green-50 text-green-800">{num(summary.transferred_credits)} cr transfer</span>
          <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-800">{num(summary.elective_credits)} cr elective</span>
          <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-800">{num(summary.pending_credits)} cr pending review</span>
          <span className="px-2 py-1 rounded-md bg-red-50 text-red-800">{summary.no_credit_courses} course(s) no credit</span>
        </div>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {courses.length} course(s) read from the transcript. Run the evaluation to see the credit decision for each.
        </p>
      )}
      <div className="overflow-x-auto -mx-6">
        <table className="min-w-full text-left">
          <thead>
            <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 pl-6">Course</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Credits</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">BU credit</th>
              <th className="px-2 py-2 pr-6" />
            </tr>
          </thead>
          <tbody>
            {courses.map(c => <CourseRow key={c.id} c={c} />)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Suggestions only: department evaluators make the final decision on every course.</p>
    </div>
  )
}
