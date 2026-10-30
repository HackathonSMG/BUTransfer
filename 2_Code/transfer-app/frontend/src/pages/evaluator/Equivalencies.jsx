import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Library, Landmark, History, Handshake, Search, RefreshCw, ChevronRight, ChevronDown, Equal, X, Sparkles, BookMarked, MessageSquare
} from 'lucide-react'
import { getMemory } from '../../api/memory'
import PageHeader from '../../components/staff/PageHeader'
import StatusPill, { TONES as PILL_TONES } from '../../components/staff/StatusPill'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const PAGE_SIZE = 50
// Up to this many institutions the filter is a row of chips; beyond it, a dropdown
const MAX_CHIPS = 6

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

// "Northeastern University" -> NU, "New York University" -> NY
const institutionMark = (name = '') => name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('') || '?'
const isCourseCode = (s) => /^[A-Z]{2,4} [A-Z]{2} \d{3}/.test(s || '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function Equivalencies() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [tab, setTab] = useState('equivalencies')
  const [search, setSearch] = useState('')
  const [institution, setInstitution] = useState('')
  const [status, setStatus] = useState('active')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState(() => new Set()) // institution groups start collapsed

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

  const tabRows = tab === 'equivalencies' ? equivalencies : precedents
  // Entries per institution on this tab (under the status filter), for the institution chips
  const institutionCounts = useMemo(() => {
    const counts = new Map()
    for (const r of tabRows) if (!status || r.status === status) counts.set(r.institution, (counts.get(r.institution) || 0) + 1)
    return counts
  }, [tabRows, status])
  const statusTotal = [...institutionCounts.values()].reduce((n, c) => n + c, 0)

  const q = search.trim().toLowerCase()
  const rows = tabRows.filter(r =>
    (!institution || r.institution === institution) &&
    (!status || r.status === status) &&
    (tab === 'equivalencies'
      ? matches(q, r.course_code, r.title, r.bu_course, r.institution, r.eq_id)
      : matches(q, r.course_code, r.proposed_bu, r.bu_awarded, r.institution, r.decision_id, r.reason))
  )

  // The page of rows shown, grouped by institution in the order they first appear; group counts cover every match
  const groups = useMemo(() => {
    const totals = new Map()
    for (const r of rows) {
      const t = totals.get(r.institution) || { total: 0, learned: 0 }
      t.total += 1
      if (r.source === (tab === 'equivalencies' ? 'promoted' : 'evaluator')) t.learned += 1
      totals.set(r.institution, t)
    }
    const by = new Map()
    for (const r of rows.slice(0, shown)) {
      if (!by.has(r.institution)) by.set(r.institution, { institution: r.institution, ...totals.get(r.institution), rows: [] })
      by.get(r.institution).rows.push(r)
    }
    return [...by.values()]
  }, [rows, shown, tab])

  const toggleGroup = (key) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Course Equivalencies"
        subtitle="How courses from other institutions map to Boston University courses."
        actions={
          <Button variant="secondary" size="sm" onClick={load} loading={state.loading}>
            {!state.loading && <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        }
      />

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
          {/* The knowledge base in four numbers, and how a mapping is reused */}
          <section className="staff-card overflow-hidden">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-staff-line2">
              <Kpi icon={Library} chip="bg-violet-50 text-violet-700" value={activeEq.length} label="active equivalencies"
                detail={`${stats.promoted_equivalencies || 0} learned from evaluator decisions`} />
              <Kpi icon={Landmark} chip="bg-sky-50 text-sky-700" value={new Set(activeEq.map(e => e.institution)).size} label="institutions covered"
                detail="with at least one approved mapping" />
              <Kpi icon={History} chip="bg-staff-sunk text-staff-ink2" value={precedents.filter(p => p.status === 'active').length} label="past decisions"
                detail={`${stats.learned_precedents || 0} recorded by evaluators here`} />
              <Kpi icon={Handshake} chip="bg-emerald-50 text-emerald-700" value={stats.agreement_rate != null ? `${stats.agreement_rate}%` : '—'} label="evaluator agreement"
                detail={stats.decisions ? `with the recommendation, ${plural(stats.decisions, 'course decision')}` : 'No course decisions yet'} />
            </div>
            <ol className="px-5 py-3 border-t border-staff-line2 bg-staff-sunk/50 flex flex-wrap items-center gap-2 text-[12.5px] text-staff-ink2" aria-label="How a mapping is reused">
              <li className="staff-eyebrow mr-1">Reuse</li>
              {[
                ['Transcript course'],
                ['Match institution + code'],
                ['Equivalency applies automatically', 'or'],
                ['Past decisions inform the recommendation'],
                ['Evaluator decides'],
                [`${stats.promotion_min_evaluators || 2} evaluators agree → new equivalency`]
              ].map(([step, joiner], i, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${i === 2 ? 'bg-violet-50 text-violet-800' : 'bg-white border border-staff-line'}`}>{step}</span>
                  {i < all.length - 1 && (joiner
                    ? <span className="text-staff-muted">{joiner}</span>
                    : <ChevronRight className="w-3.5 h-3.5 text-staff-muted" aria-hidden="true" />)}
                </li>
              ))}
            </ol>
          </section>

          <section className="staff-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-staff-line2 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-1 rounded-lg bg-staff-sunk" role="tablist">
                  {[
                    ['equivalencies', 'Equivalencies', equivalencies.length],
                    ['precedents', 'Past decisions', precedents.length]
                  ].map(([key, label, count]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className={`px-3 py-1 rounded-md text-[13px] font-medium transition-colors ${
                        tab === key ? 'bg-white text-staff-ink shadow-sm' : 'text-staff-muted hover:text-staff-ink'
                      }`}
                    >
                      {label} <span className="tabular-nums text-staff-muted">{count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-[280px] sm:ml-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Course code, title or BU course..."
                    aria-label="Search equivalencies"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-staff-line rounded-lg placeholder:text-staff-muted focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <Select className="w-full sm:w-44" aria-label="Status" placeholder="Active and revoked" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
                {institutions.length > MAX_CHIPS && (
                  <Select className="w-full sm:w-56" aria-label="Institution" placeholder="All Institutions" options={institutions} value={institution} onChange={(e) => setInstitution(e.target.value)} />
                )}
                <span className="ml-auto text-xs text-staff-muted">{rows.length} shown</span>
              </div>
              {institutions.length > 0 && institutions.length <= MAX_CHIPS && (
                <div className="flex flex-wrap gap-1.5 text-[12.5px]" role="group" aria-label="Institution">
                  {[{ value: '', label: 'All', count: statusTotal }, ...institutions.map(i => ({ ...i, count: institutionCounts.get(i.value) || 0 }))].map(i => (
                    <button
                      key={i.value || 'all'}
                      type="button"
                      onClick={() => setInstitution(i.value)}
                      aria-pressed={institution === i.value}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium whitespace-nowrap border transition-colors ${
                        institution === i.value ? 'bg-staff-ink border-staff-ink text-white' : 'bg-white border-staff-line text-staff-ink2 hover:border-slate-300'
                      }`}
                    >
                      {i.label}<span className={`tabular-nums ${institution === i.value ? 'text-white/70' : 'text-staff-muted'}`}>{i.count}</span>
                    </button>
                  ))}
                </div>
              )}
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
              /* Grouped by institution; each row reads left to right as a mapping */
              groups.map((g, gi) => {
                const key = `${tab}:${g.institution}`
                const open = expanded.has(key)
                const listId = `eq-group-${tab}-${gi}`
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      aria-expanded={open}
                      aria-controls={listId}
                      className={`w-full px-5 py-2.5 bg-staff-sunk/60 border-staff-line2 flex items-center gap-3 text-left hover:bg-staff-sunk focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${gi > 0 ? 'border-y' : 'border-b'}`}
                    >
                      <span className="w-7 h-7 rounded-md bg-violet-700 text-white grid place-items-center text-[11px] font-bold flex-shrink-0" aria-hidden="true">{institutionMark(g.institution)}</span>
                      <span className="font-semibold text-[14px] text-staff-ink truncate">{g.institution || 'Unknown institution'}</span>
                      <span className="text-[12.5px] text-staff-muted truncate">
                        {tab === 'equivalencies'
                          ? `${g.total} equivalenc${g.total === 1 ? 'y' : 'ies'}${g.learned ? ` · ${g.learned} learned from decisions` : ''}`
                          : `${plural(g.total, 'past decision')}${g.learned ? ` · ${g.learned} by evaluators here` : ''}`}
                        {g.rows.length < g.total && ` · ${g.rows.length} shown`}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-staff-muted ml-auto flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open && (
                      <ul id={listId} className="divide-y divide-staff-line2">
                        {tab === 'equivalencies'
                          ? g.rows.map(e => <EquivalencyRow key={e.eq_id} e={e} />)
                          : g.rows.map(p => <PrecedentRow key={p.decision_id} p={p} />)}
                      </ul>
                    )}
                  </div>
                )
              })
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

function Kpi({ icon: Icon, chip, value, label, detail }) {
  return (
    <div className="bg-white p-5 flex items-center gap-4 min-w-0">
      <span className={`w-11 h-11 rounded-lg grid place-items-center flex-shrink-0 ${chip}`}><Icon className="w-5 h-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="font-display tabular-nums text-[30px] font-semibold leading-none text-staff-ink">{value}</p>
        <p className="text-[12.5px] font-medium text-staff-ink2 mt-1">{label}</p>
        <p className="text-[11.5px] text-staff-muted">{detail}</p>
      </div>
    </div>
  )
}

const OUTCOME_ICONS = { ok: Equal, bad: X }

// The outcome between the two courses, on a connecting line on wide screens
function Outcome({ value }) {
  const tone = OUTCOME_TONES[value] || 'neutral'
  const Icon = OUTCOME_ICONS[tone]
  return (
    <div className="relative flex items-center lg:justify-center">
      <span className="hidden lg:block absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-staff-line via-slate-300 to-red-200" aria-hidden="true" />
      <span className={`relative inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold leading-none whitespace-nowrap ${PILL_TONES[tone]}`}>
        {Icon ? <Icon className="w-3 h-3" aria-hidden="true" /> : <i className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
        {value || 'Unknown'}
      </span>
    </div>
  )
}

function SourceCard({ code, sub }) {
  return (
    <div className="rounded-lg border border-staff-line px-3 py-2 min-w-0">
      <p className="font-mono text-[13.5px] font-semibold text-staff-ink truncate">{code}</p>
      {sub && <p className="text-[12.5px] text-staff-muted truncate" title={sub}>{sub}</p>}
    </div>
  )
}

function BuCard({ value, sub = 'Boston University' }) {
  if (!value) {
    return (
      <div className="rounded-lg border border-dashed border-staff-line px-3 py-2 min-w-0">
        <p className="text-[13.5px] text-staff-muted">No BU course</p>
        {sub && <p className="text-[12.5px] text-staff-muted truncate">{sub}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-white px-3 py-2 min-w-0">
      <p className={`text-[13.5px] font-semibold text-brand truncate ${isCourseCode(value) ? 'font-mono' : ''}`} title={value}>{value}</p>
      {sub && <p className="text-[12.5px] text-staff-muted truncate" title={sub}>{sub}</p>}
    </div>
  )
}

function Origin({ learned, learnedLabel, title, meta }) {
  return (
    <div className="min-w-0">
      {learned ? (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap max-w-full bg-violet-50 text-violet-800" title={title}>
          <Sparkles className="w-3 h-3 flex-shrink-0" aria-hidden="true" /><span className="truncate">{learnedLabel}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap bg-staff-sunk text-staff-ink2">
          <BookMarked className="w-3 h-3" aria-hidden="true" />Reference data
        </span>
      )}
      <p className="text-[11.5px] text-staff-muted mt-1 truncate" title={meta}>{meta}</p>
    </div>
  )
}

const ROW = 'px-5 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)_200px_84px] items-center gap-3 lg:gap-4'

const ActivePill = ({ status }) => (
  <StatusPill tone={status === 'active' ? 'ok' : 'neutral'} className="lg:justify-self-end w-fit">{status === 'active' ? 'Active' : 'Revoked'}</StatusPill>
)

function EquivalencyRow({ e }) {
  const promoted = e.source === 'promoted'
  return (
    <li className={`${ROW} hover:bg-staff-bg`}>
      <SourceCard code={e.course_code} sub={e.title} />
      <Outcome value={e.outcome} />
      <BuCard value={e.bu_course} />
      <Origin
        learned={promoted}
        learnedLabel={`Learned from ${plural(e.promoted_from?.length || 0, 'decision')}`}
        title={(e.promoted_from || []).join(', ')}
        meta={[formatDate(e.approved_on), e.eq_id, e.evaluator].filter(Boolean).join(' · ')}
      />
      <ActivePill status={e.status} />
    </li>
  )
}

function PrecedentRow({ p }) {
  const byEvaluator = p.source === 'evaluator'
  const proposedDiffers = p.proposed_bu && p.proposed_bu !== p.bu_awarded
  return (
    <li className="hover:bg-staff-bg">
      <div className={`${ROW} ${p.reason ? '!pb-1.5' : ''}`}>
        <SourceCard code={p.course_code} />
        <Outcome value={p.decision} />
        <BuCard value={p.bu_awarded} sub={proposedDiffers ? `Proposed ${p.proposed_bu}` : 'Boston University'} />
        <Origin
          learned={byEvaluator}
          learnedLabel={p.evaluator ? `Decided by ${p.evaluator}` : 'Evaluator decision'}
          meta={[formatDate(p.decided_on), p.decision_id, !byEvaluator && p.evaluator].filter(Boolean).join(' · ')}
        />
        <ActivePill status={p.status} />
      </div>
      {p.reason && (
        <p className="px-5 pb-3 text-[12.5px] text-staff-ink2 flex items-start gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-staff-muted flex-shrink-0" aria-hidden="true" />
          <span className="line-clamp-2" title={p.reason}>{p.reason}</span>
        </p>
      )}
    </li>
  )
}
