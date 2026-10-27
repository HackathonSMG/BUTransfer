import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOverview } from '../../api/admin'
import PageHeader from '../../components/staff/PageHeader'
import BarList from '../../components/staff/BarList'
import WorkloadChart, { WorkloadLegend } from '../../components/staff/WorkloadChart'
import Spinner from '../../components/ui/Spinner'
import { STATUS_LABELS } from '../../components/application/StatusBadge'

// Workflow order for the status chart
const STATUS_ORDER = ['submitted', 'under_evaluation', 'validation_failed', 'information_required', 'evaluation_completed',
  'under_evaluator_review', 'approved', 'rejected', 'closed', 'draft']

export default function Reports() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getOverview().then(res => setD(res.data)).catch(err => setError(err.response?.data?.message || err.message))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Where applications stand and how work is spread across evaluators." />
      {error ? <p className="text-sm text-red-700">{error}</p> : !d ? (
        <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="staff-card p-6">
              <h2 className="text-[17px] font-semibold text-staff-ink mb-4">Applications by status</h2>
              <BarList
                rows={STATUS_ORDER.filter(s => d.by_status[s]).map(s => ({
                  key: s, label: STATUS_LABELS[s] || s, value: d.by_status[s],
                  onClick: () => navigate(`/admin/applications?status=${s}`)
                }))}
                unit="applications"
                emptyText="No applications yet"
              />
            </section>
            <section className="staff-card p-6">
              <h2 className="text-[17px] font-semibold text-staff-ink mb-4">Applications by BU program</h2>
              <BarList rows={d.by_program.map(p => ({ key: p.program, label: p.program, value: p.count }))} unit="applications" emptyText="No applications yet" />
            </section>
          </div>
          <section className="staff-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[17px] font-semibold text-staff-ink">Evaluator workload</h2>
              <WorkloadLegend />
            </div>
            <WorkloadChart rows={d.evaluator_workload} />
          </section>
        </>
      )}
    </div>
  )
}
