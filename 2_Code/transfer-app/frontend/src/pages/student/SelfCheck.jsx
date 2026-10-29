import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Trash2, Info, ArrowRight, CheckCircle, HelpCircle, FileText, History } from 'lucide-react'
import notify from '../../lib/notify'
import { getSelfCheckInstitutions, runSelfCheck } from '../../api/student'
import Button from '../../components/ui/Button'

// Self-check (step 1 of the transfer process): a preview from the equivalency database, never an official decision
const EMPTY = { course_code: '', title: '', credits: '', credit_system: 'Semester', grade: '' }

const STATUS = {
  established: { label: 'Established equivalency', icon: CheckCircle, cls: 'bg-green-50 text-green-800 border-green-200' },
  previously_evaluated: { label: 'Evaluated before', icon: History, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  likely: { label: 'Likely match', icon: CheckCircle, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  maybe: { label: 'Department review', icon: HelpCircle, cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  syllabus_needed: { label: 'Syllabus needed', icon: FileText, cls: 'bg-amber-50 text-amber-900 border-amber-300' }
}

const INPUT = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function SelfCheck() {
  const [institutions, setInstitutions] = useState([])
  const [institution, setInstitution] = useState('')
  const [rows, setRows] = useState([{ ...EMPTY }])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    getSelfCheckInstitutions().then(r => setInstitutions(r.data || [])).catch(() => setInstitutions([]))
  }, [])

  const update = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const submit = async (e) => {
    e.preventDefault()
    const courses = rows.filter(r => r.course_code.trim()).map(r => ({
      course_code: r.course_code.trim(),
      title: r.title.trim() || null,
      credits: r.credits === '' ? null : Number(r.credits),
      credit_system: r.credit_system,
      grade: r.grade.trim() || null
    }))
    if (!institution || !courses.length) { notify.error('Choose your college and enter at least one course code'); return }
    setLoading(true)
    try {
      const res = await runSelfCheck({ institution, courses })
      setResult(res.data)
    } catch (err) {
      notify.error(err.response?.data?.message || 'The self-check could not run. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-gray-700">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Course Credit Self-Check</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Course Credit Self-Check</h1>
        <p className="text-gray-500 mt-1">
          Preview how your courses are likely to transfer, which ones may need a syllabus, and what to send.
          This is a self-check only; the official decision comes after you submit your transcripts.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">College you attended</span>
            <select value={institution} onChange={e => setInstitution(e.target.value)} className={INPUT}>
              <option value="">Choose a college</option>
              {institutions.map(i => <option key={i.institution} value={i.institution}>{i.institution}</option>)}
            </select>
            <span className="block text-xs text-gray-400 mt-1">Colleges with course information on file. Courses from other colleges are still evaluated when you apply.</span>
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Your courses</p>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[7rem_minmax(0,1fr)_4.5rem_6.5rem_4rem_2rem] gap-2 text-xs text-gray-500 px-0.5">
                <span>Course code</span><span>Title (optional)</span><span>Credits</span><span>System</span><span>Grade</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_6.5rem_4rem_2rem] gap-2 items-center">
                  <input value={r.course_code} onChange={e => update(i, { course_code: e.target.value })} className={INPUT} placeholder="CSC 110" aria-label="Course code" />
                  <input value={r.title} onChange={e => update(i, { title: e.target.value })} className={INPUT} placeholder="Course title" aria-label="Title" />
                  <input value={r.credits} onChange={e => update(i, { credits: e.target.value })} type="number" min="0" max="30" step="0.5" className={INPUT} placeholder="4" aria-label="Credits" />
                  <select value={r.credit_system} onChange={e => update(i, { credit_system: e.target.value })} className={INPUT} aria-label="Credit system">
                    <option>Semester</option><option>Quarter</option>
                  </select>
                  <input value={r.grade} onChange={e => update(i, { grade: e.target.value })} className={INPUT} placeholder="B+" aria-label="Grade" />
                  <button type="button" onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : [{ ...EMPTY }])} className="p-2 text-gray-400 hover:text-red-600" aria-label="Remove course">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setRows(rs => rs.length < 20 ? [...rs, { ...EMPTY }] : rs)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800">
              <Plus className="w-4 h-4" />Add a course
            </button>
          </div>

          <Button type="submit" loading={loading}>Check my courses</Button>
        </form>
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />{result.disclaimer}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {result.results.map((r, i) => {
                const s = STATUS[r.status] || STATUS.maybe
                const Icon = s.icon
                return (
                  <li key={i} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm"><span className="font-mono font-semibold text-gray-900">{r.course_code}</span>{r.title && <span className="text-gray-600 ml-2">{r.title}</span>}</p>
                        {r.likely_bu_course && <p className="text-sm text-gray-900 mt-0.5">Likely BU credit: <span className="font-medium">{r.likely_bu_course}</span></p>}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}><Icon className="w-3.5 h-3.5" />{s.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1.5">{r.summary}</p>
                    {r.estimated_units != null && <p className="text-xs text-gray-500 mt-1">Estimated BU units if credit is awarded: {r.estimated_units}</p>}
                    {r.notes.map((n, j) => <p key={j} className="text-xs text-amber-800 mt-1">{n}</p>)}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1.5">What to send</h2>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">{result.documents.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1.5">Good to know</h2>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">{result.policy_notes.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
            <Link to="/apply" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
              Start your application<ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
