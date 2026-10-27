import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, CheckCircle, Clock, TrendingUp, Users, Settings, ScrollText, ArrowRight } from 'lucide-react'
import { getReports } from '../../api/admin'
import { listApplications } from '../../api/applications'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/application/StatusBadge'

function StatCard({ icon: Icon, label, value, subtitle, color, link }) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 ${link ? 'hover:border-primary-300 hover:shadow-md transition-all cursor-pointer' : ''}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-600 font-medium">{label}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
  return link ? <Link to={link}>{content}</Link> : content
}

function SimpleBarChart({ data = [], label, total }) {
  if (!data || data.length === 0) return <p className="text-sm text-gray-400">No data available</p>

  const max = Math.max(...data.map(d => d.count || 0), 1)

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 truncate flex-shrink-0">{item.label || item.name || item.status}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-700 flex items-center"
              style={{ width: `${Math.round(((item.count || 0) / max) * 100)}%`, minWidth: '8px' }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 w-8 text-right">{item.count || 0}</span>
        </div>
      ))}
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(new Date(d))
}

export default function AdminDashboard() {
  const [reports, setReports] = useState(null)
  const [recentApps, setRecentApps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      getReports().then(d => setReports(d.data || d)),
      listApplications({ page: 1, limit: 10, sort: 'submitted_at:desc' }).then(d => {
        setRecentApps(d.applications || d.data || [])
      })
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="xl" className="text-primary-600" />
      </div>
    )
  }

  // The reports endpoint has no stats object; derive the cards from its totals
  const stats = reports?.stats || {
    total_applications: reports?.total_applications,
    pending_evaluation: (reports?.by_status?.submitted || 0) + (reports?.by_status?.under_evaluation || 0),
    avg_processing_days: reports?.avg_processing_time_days,
  }

  const statusData = reports?.by_status
    ? Object.entries(reports.by_status).map(([status, count]) => ({
        label: status.replace(/_/g, ' '),
        status,
        count
      }))
    : []

  const sourceData = reports?.by_source
    ? Object.entries(reports.by_source).map(([name, count]) => ({
        label: name.replace(/_/g, ' '),
        count
      }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of transfer application processing</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ClipboardList}
          label="Total Applications"
          value={stats.total_applications ?? recentApps.length}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={CheckCircle}
          label="Approved This Month"
          value={stats.approved_month ?? 0}
          subtitle="Current month"
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={Clock}
          label="Pending Evaluation"
          value={stats.pending_evaluation ?? 0}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Processing Time"
          value={stats.avg_processing_days ? `${stats.avg_processing_days}d` : '—'}
          subtitle="Business days"
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Applications by Status</h3>
          {statusData.length > 0
            ? <SimpleBarChart data={statusData} />
            : <p className="text-sm text-gray-400">No data available</p>
          }
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Applications by Source</h3>
          {sourceData.length > 0
            ? <SimpleBarChart data={sourceData} />
            : <p className="text-sm text-gray-400">No data available</p>
          }
        </div>
      </div>

      {/* Recent Applications */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Recent Applications</h3>
          <Link to="/evaluator" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentApps.length === 0 ? (
          <p className="text-center py-8 text-sm text-gray-400">No applications yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 font-semibold text-gray-600">Reference</th>
                  <th className="text-left px-5 py-2.5 font-semibold text-gray-600">Student</th>
                  <th className="text-left px-5 py-2.5 font-semibold text-gray-600 hidden sm:table-cell">Program</th>
                  <th className="text-left px-5 py-2.5 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-5 py-2.5 font-semibold text-gray-600 hidden md:table-cell">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentApps.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/evaluator/applications/${app.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {app.reference_number || `#${app.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {app.student_name || `${app.first_name || ''} ${app.last_name || ''}`.trim()}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden sm:table-cell">{app.transfer_to_program || app.program || '—'}</td>
                    <td className="px-5 py-3"><StatusBadge status={app.status} /></td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{formatDate(app.submitted_at || app.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { to: '/admin/users', icon: Users, label: 'Manage Evaluators', desc: 'Add, edit, or deactivate evaluator accounts' },
          { to: '/admin/criteria', icon: Settings, label: 'Configure Criteria', desc: 'Manage eligibility rules and criteria' },
          { to: '/admin/audit', icon: ScrollText, label: 'View Audit Logs', desc: 'Full history of all application actions' }
        ].map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 bg-gray-100 group-hover:bg-primary-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
              <item.icon className="w-5 h-5 text-gray-500 group-hover:text-primary-600 transition-colors" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
