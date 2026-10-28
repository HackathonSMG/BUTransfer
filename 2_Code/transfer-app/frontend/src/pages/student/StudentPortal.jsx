import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, AlertCircle, FileText, RefreshCw } from 'lucide-react'
import { getMyApplications } from '../../api/student'
import { useAuth } from '../../hooks/useAuth'
import StatusBadge from '../../components/application/StatusBadge'
import Spinner from '../../components/ui/Spinner'

// The signed-in student's applications. Every number comes from the persisted course states (API).
export default function StudentPortal() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, rows: [], error: null })

  const load = useCallback(async () => {
    try {
      const res = await getMyApplications()
      setState({ loading: false, rows: res.data, error: null })
    } catch (err) {
      setState({ loading: false, rows: [], error: err.response?.data?.message || 'Your transfer credit evaluations could not be loaded.' })
    }
  }, [])
  useEffect(() => { load() }, [load])

  const firstName = (user?.full_name || '').split(' ')[0]

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500">Student Portal</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Welcome{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-gray-500 mt-1">Follow each course from submission to posted transfer credit.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><RefreshCw className="w-3 h-3" />Refresh</button>
          <Link to="/apply" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4" />Start Transfer Credit Evaluation
          </Link>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">My Transfer Credit Evaluations</h2>
      {state.loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" className="text-primary-600" /></div>
      ) : state.error ? (
        <p className="text-sm text-red-700">{state.error}</p>
      ) : state.rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="font-medium text-gray-900 mt-3">No evaluations yet</p>
          <p className="text-sm text-gray-500 mt-1">Start your transfer credit evaluation and upload your transcript.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.rows.map(a => <ApplicationCard key={a.id} a={a} />)}
        </ul>
      )}
    </div>
  )
}

function ApplicationCard({ a }) {
  const s = a.summary
  const draft = a.status === 'draft'
  const to = draft ? `/apply?resume=${a.secure_token}` : `/student/applications/${a.secure_token}`
  return (
    <li>
      <Link to={to} className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-gray-500">{a.reference_number}</p>
            <p className="font-semibold text-gray-900 mt-0.5">{a.transfer_to_program}{a.expected_start_term ? ` · starts ${a.expected_start_term}` : ''}</p>
            <p className="text-sm text-gray-500">{(a.institutions.length ? a.institutions : [a.transfer_from_institution]).join(' · ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </div>
        {draft ? (
          <p className="mt-3 text-sm text-amber-800 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />Not submitted yet. Upload your transcript and submit.</p>
        ) : s.courses > 0 ? (
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {[['Submitted', s.courses], ['Evaluated', s.decided], ['Pending', s.pending], ['Action needed', s.needs_student_action], ['Credits awarded', s.credits_posted]].map(([k, v]) => (
              <div key={k} className={`rounded-lg px-2 py-2 ${k === 'Action needed' && v ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                <dd className="text-lg font-bold text-gray-900 tabular-nums">{v}</dd>
                <dt className="text-[11px] text-gray-500">{k === 'Submitted' ? 'Courses' : k}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-gray-500">We're reviewing your academic documents.</p>
        )}
      </Link>
    </li>
  )
}
