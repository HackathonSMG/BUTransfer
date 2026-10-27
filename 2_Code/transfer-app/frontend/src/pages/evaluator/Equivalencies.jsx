import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Library, Building2, History, Handshake, ArrowRight, Search, RefreshCw } from 'lucide-react'
import { getMemory } from '../../api/memory'
import KpiCard from '../../components/staff/KpiCard'
import StatusPill from '../../components/staff/StatusPill'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const PAGE_SIZE = 50

const OUTCOME_TONES = {
  'BU equivalent': 'ok',
  'Elective credit': 'info',
  'Partial / elective': 'warn',
  'No credit': 'bad'
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active only' },
  { value: 'revoked', label: 'Revoked only' }
]

function formatDate(d) {
  if (!d) return '—'
  // Dates arrive as YYYY-MM-DD; parse as local so the day doesn't shift
  const [y, m, day] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(y, m - 1, day))
}

const matches = (q, ...fields) => !q || fields.some(f => f && String(f).toLowerCase().includes(q))

export default function Equivalencies() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [tab, setTab] = useState('equivalencies')
  const [search, setSearch] = useState('')
  const [institution, setInstitution] = useState('')
  const [status, setStatus] = useState('active')
  const [shown, setShown] = useState(PAGE_SIZE)

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const res = await getMemory()
      setState({ loading: false, data: res.data || null, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setShown(PAGE_SIZE) }, [tab, search, institution, status])

  const equivalencies = state.data?.equivalencies || []
  const precedents = state.data?.past_decisions || []
  const stats = state.data?.stats || {}
  const activeEq = equivalencies.filter(e => e.status === 'active')

  const institutions = useMemo(() => {
    const names = new Set([...equivalencies, ...precedents].map(r => r.institution).filter(Boolean))
    return [...names].sort().map(n => ({ value: n, label: n }))
  }, [equivalencies, precedents])

  const q = search.trim().toLowerCase()
  const rows = (tab === 'equivalencies' ? equivalencies : precedents).filter(r =>
    (!institution || r.institution === institution) &&
    (!status || r.status === status) &&
    (tab === 'equivalencies'
      ? matches(q, r.course_code, r.title, r.bu_course, r.institution, r.eq_id)
      : matches(q, r.course_code, r.proposed_bu, r.bu_awarded, r.institution, r.decision_id, r.reason))
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight text-staff-ink">Course Equivalencies</h1>
          <p className="text-sm text-staff-muted mt-1 max-w-[760px]">
            How courses from other institutions map to Boston University courses. Approved equivalencies apply
            automatically to new transcripts; past decisions guide the recommendation when no equivalency exists.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} loading={state.loading}>
          {!state.loading && <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {state.loading && !state.data ? (
        <div className="staff-card flex items-center justify-center py-20">
          <Spinner size="lg" className="text-primary-600" />
        </div>
      ) : state.error ? (
        <div className="staff-card">
          <EmptyState icon={Library} title="The knowledge base could not be loaded" description={state.error} action={load} actionLabel="Try Again" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard icon={Library} tone="ok" label="Active equivalencies" value={activeEq.length} sub={`${stats.promoted_equivalencies || 0} promoted from evaluator decisions`} />
            <KpiCard icon={Building2} tone="info" label="Institutions covered" value={new Set(activeEq.map(e => e.institution)).size} sub="with at least one approved mapping" />
            <KpiCard icon={History} tone="neutral" label="Past decisions" value={precedents.filter(p => p.status === 'active').length} sub={`${stats.learned_precedents || 0} recorded by evaluators here`} />
            <KpiCard
              icon={Handshake}
              tone="warn"
              label="Evaluator agreement"
              value={stats.agreement_rate != null ? `${stats.agreement_rate}%` : '—'}
              sub={stats.decisions ? `with the recommendation, ${stats.decisions} course decisions` : 'No course decisions yet'}
            />
          </div>

          {/* How a mapping is reused */}
          <section className="staff-card p-5">
            <h2 className="text-[15px] font-semibold text-staff-ink mb-3">How a mapping is reused</h2>
            <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary-800">
              {[
                'Transcript course',
                'Match on institution + course code',
                'Approved equivalency applies',
                'Otherwise: past decisions inform the recommendation',
                'Evaluator decides',
                'Decision stored as a precedent',
                `${stats.promotion_min_evaluators || 2} evaluators agree → new equivalency`
              ].map((step, i, all) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className="bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-full">{step}</span>
                  {i < all.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-staff-muted" aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </section>

          <section className="staff-card overflow-hidden">
            <div className="px-5 pt-4 pb-4 border-b border-staff-line2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-[3px] rounded-lg bg-staff-sunk" role="tablist">
                  {[
                    ['equivalencies', `Equivalencies (${equivalencies.length})`],
                    ['precedents', `Past decisions (${precedents.length})`]
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                        tab === key ? 'bg-white text-staff-ink shadow-card' : 'text-staff-muted hover:text-staff-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-staff-muted">{rows.length} shown</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search course code, title or BU course..."
                    aria-label="Search equivalencies"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <Select aria-label="Institution" placeholder="All Institutions" options={institutions} value={institution} onChange={(e) => setInstitution(e.target.value)} />
                <Select aria-label="Status" placeholder="Active and revoked" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={Library}
                title="Nothing matches"
                description="No entries match your search. Try another course code or institution."
                action={() => { setSearch(''); setInstitution(''); setStatus('active') }}
                actionLabel="Clear Filters"
              />
            ) : (
              <div className="overflow-x-auto">
                {tab === 'equivalencies'
                  ? <EquivalencyTable rows={rows.slice(0, shown)} />
                  : <PrecedentTable rows={rows.slice(0, shown)} />}
              </div>
            )}

            {rows.length > shown && (
              <div className="border-t border-staff-line2 px-4 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown(n => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, rows.length - shown)} more of {rows.length - shown}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function EquivalencyTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-staff-line bg-staff-bg/60">
          <th className="staff-th">Source institution</th>
          <th className="staff-th">Source course</th>
          <th className="staff-th"><span className="sr-only">maps to</span></th>
          <th className="staff-th">BU course</th>
          <th className="staff-th">Outcome</th>
          <th className="staff-th hidden md:table-cell">Origin</th>
          <th className="staff-th hidden lg:table-cell">Approved</th>
          <th className="staff-th">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-staff-line2">
        {rows.map(e => (
          <tr key={e.eq_id} className="hover:bg-staff-bg">
            <td className="px-4 py-3 align-top text-staff-ink2">{e.institution}</td>
            <td className="px-4 py-3 align-top">
              <p className="font-mono text-[12.5px] font-medium text-staff-ink whitespace-nowrap">{e.course_code}</p>
              {e.title && <p className="text-xs text-staff-muted max-w-[260px]">{e.title}</p>}
            </td>
            <td className="px-1 py-3 align-top text-staff-muted"><ArrowRight className="w-4 h-4" aria-hidden="true" /></td>
            <td className="px-4 py-3 align-top font-mono text-[12.5px] font-semibold text-primary-800 whitespace-nowrap">{e.bu_course || '—'}</td>
            <td className="px-4 py-3 align-top"><StatusPill tone={OUTCOME_TONES[e.outcome] || 'neutral'}>{e.outcome}</StatusPill></td>
            <td className="px-4 py-3 align-top hidden md:table-cell text-xs text-staff-ink2">
              {e.source === 'promoted'
                ? <span title={(e.promoted_from || []).join(', ')}>Promoted from {e.promoted_from?.length || 0} evaluator decisions</span>
                : 'Reference data'}
              <p className="font-mono text-[11px] text-staff-muted">{e.eq_id}</p>
            </td>
            <td className="px-4 py-3 align-top hidden lg:table-cell text-xs text-staff-ink2 whitespace-nowrap">
              {formatDate(e.approved_on)}
              {e.evaluator && <p className="text-staff-muted">{e.evaluator}</p>}
            </td>
            <td className="px-4 py-3 align-top">
              <StatusPill tone={e.status === 'active' ? 'ok' : 'neutral'}>{e.status === 'active' ? 'Active' : 'Revoked'}</StatusPill>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PrecedentTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-staff-line bg-staff-bg/60">
          <th className="staff-th">Source course</th>
          <th className="staff-th hidden md:table-cell">Proposed BU course</th>
          <th className="staff-th">Decision</th>
          <th className="staff-th">BU credit awarded</th>
          <th className="staff-th hidden lg:table-cell">Reason</th>
          <th className="staff-th hidden md:table-cell">Decided</th>
          <th className="staff-th">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-staff-line2">
        {rows.map(p => (
          <tr key={p.decision_id} className="hover:bg-staff-bg">
            <td className="px-4 py-3 align-top">
              <p className="font-mono text-[12.5px] font-medium text-staff-ink whitespace-nowrap">{p.course_code}</p>
              <p className="text-xs text-staff-muted">{p.institution}</p>
            </td>
            <td className="px-4 py-3 align-top hidden md:table-cell font-mono text-[12.5px] text-staff-ink2 whitespace-nowrap">{p.proposed_bu || '—'}</td>
            <td className="px-4 py-3 align-top"><StatusPill tone={OUTCOME_TONES[p.decision] || 'neutral'}>{p.decision}</StatusPill></td>
            <td className="px-4 py-3 align-top text-staff-ink2 max-w-[220px]">{p.bu_awarded || '—'}</td>
            <td className="px-4 py-3 align-top hidden lg:table-cell text-xs text-staff-ink2 max-w-[360px]">{p.reason || '—'}</td>
            <td className="px-4 py-3 align-top hidden md:table-cell text-xs text-staff-ink2 whitespace-nowrap">
              {formatDate(p.decided_on)}
              <p className="text-staff-muted">{p.source === 'evaluator' ? `Evaluator decision${p.evaluator ? ` · ${p.evaluator}` : ''}` : `Reference data${p.evaluator ? ` · ${p.evaluator}` : ''}`}</p>
              <p className="font-mono text-[11px] text-staff-muted">{p.decision_id}</p>
            </td>
            <td className="px-4 py-3 align-top">
              <StatusPill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status === 'active' ? 'Active' : 'Revoked'}</StatusPill>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
