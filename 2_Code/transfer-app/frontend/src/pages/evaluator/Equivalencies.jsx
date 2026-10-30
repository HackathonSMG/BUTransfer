import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Library, Landmark, History, Handshake, Search, RefreshCw, ChevronRight, ChevronDown, Equal, X, Sparkles, BookMarked, MessageSquare,
  Plus, Send, Check, Ban, RotateCcw, ShieldCheck, FileUp, ClipboardList
} from 'lucide-react'
import { getMemory, getProposals, approveProposal, rejectProposal, setMemoryStatus } from '../../api/memory'
import { useAuth } from '../../hooks/useAuth'
import notify from '../../lib/notify'
import { EquivalencyDialog, ImportDialog, ConfirmDialog, awardOf } from '../../components/staff/EquivalencyDialogs'
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
const apiMessage = (err, fallback) => err.response?.data?.message || err.response?.data?.error?.message || fallback
const PROPOSAL_TONES = { pending: 'warn', approved: 'ok', rejected: 'bad' }
const PROPOSAL_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

export default function Equivalencies() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [tab, setTab] = useState('equivalencies')
  const [search, setSearch] = useState('')
  const [institution, setInstitution] = useState('')
  const [status, setStatus] = useState('active')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState(() => new Set()) // institution groups start collapsed
  const { user } = useAuth() || {}
  const role = user?.role
  const canManage = role === 'admin' || role === 'credit_office'
  const canImport = role === 'admin'
  const [proposals, setProposals] = useState([])
  const [dialog, setDialog] = useState(null) // { kind: 'add' | 'propose' | 'import' | 'approve' | 'reject' | 'revoke' | 'restore', item? }

  const load = useCallback(async () => {
    setState(p => ({ ...p, loading: true }))
    try {
      const [res, props] = await Promise.all([
        getMemory(),
        // Proposals are supplementary: the knowledge base still shows if they cannot be loaded
        getProposals().catch(() => ({ data: [] }))
      ])
      setState({ loading: false, data: res.data || null, error: null })
      setProposals(props.data || [])
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || err.message })
    }
  }, [])

  const closeDialog = () => setDialog(null)
  const approve = async (p, note) => {
    try {
      const res = await approveProposal(p.id, note)
      const replaced = res.data?.replaced
      notify.success(`${p.course_code} → ${awardOf(p)} is now the equivalency (${res.data?.equivalency?.eq_id})${replaced ? `, replacing ${replaced.eq_id} (${awardOf(replaced)}${replaced.status === 'revoked' ? ', revoked' : ''})` : ''}. It applies to future transcripts.`)
      closeDialog()
      await load()
    } catch (err) {
      notify.error(apiMessage(err, 'The proposal could not be approved'))
    }
  }
  const reject = async (p, note) => {
    try {
      await rejectProposal(p.id, note)
      notify.success(`Proposal for ${p.course_code} rejected. ${p.proposed_by_name || 'The evaluator'} can see the reason.`)
      closeDialog()
      await load()
    } catch (err) {
      notify.error(apiMessage(err, 'The proposal could not be rejected'))
    }
  }
  const changeStatus = async (e, next) => {
    try {
      await setMemoryStatus('equivalency', e.eq_id, next)
      notify.success(next === 'revoked'
        ? `${e.eq_id} revoked. It no longer applies to new transcripts.`
        : `${e.eq_id} restored. It applies to new transcripts again.`)
      closeDialog()
      await load()
    } catch (err) {
      notify.error(apiMessage(err, 'The equivalency could not be updated'))
    }
  }

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

  const pendingCount = proposals.filter(p => p.status === 'pending').length
  const tabRows = tab === 'equivalencies' ? equivalencies : tab === 'precedents' ? precedents : []
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
          <>
            <Button variant="secondary" size="sm" onClick={load} loading={state.loading}>
              {!state.loading && <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
            {canImport && (
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'import' })}>
                <FileUp className="w-4 h-4" aria-hidden="true" />Import CSV
              </Button>
            )}
            {canManage ? (
              <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
                <Plus className="w-4 h-4" aria-hidden="true" />Add equivalency
              </Button>
            ) : role === 'evaluator' && (
              <Button size="sm" onClick={() => setDialog({ kind: 'propose' })}>
                <Send className="w-4 h-4" aria-hidden="true" />Propose equivalency
              </Button>
            )}
          </>
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
                    ['precedents', 'Past decisions', precedents.length],
                    ['proposals', 'Proposals', pendingCount ? `${pendingCount} pending` : proposals.length]
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
                {tab !== 'proposals' && (
                  <Select className="w-full sm:w-44" aria-label="Status" placeholder="Active and revoked" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
                )}
                {tab !== 'proposals' && institutions.length > MAX_CHIPS && (
                  <Select className="w-full sm:w-56" aria-label="Institution" placeholder="All Institutions" options={institutions} value={institution} onChange={(e) => setInstitution(e.target.value)} />
                )}
                {tab !== 'proposals' && <span className="ml-auto text-xs text-staff-muted">{rows.length} shown</span>}
              </div>
              {tab !== 'proposals' && institutions.length > 0 && institutions.length <= MAX_CHIPS && (
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

            {tab === 'proposals' ? (
              <ProposalList
                proposals={proposals.filter(p => matches(q, p.course_code, p.title, p.bu_course, p.institution, p.proposed_by_name, p.outcome))}
                canManage={canManage}
                onApprove={(p) => setDialog({ kind: 'approve', item: p })}
                onReject={(p) => setDialog({ kind: 'reject', item: p })}
              />
            ) : rows.length === 0 ? (
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
                          ? g.rows.map(e => (
                            <EquivalencyRow key={e.eq_id} e={e}
                              onRevoke={canManage ? () => setDialog({ kind: e.status === 'active' ? 'revoke' : 'restore', item: e }) : null} />
                          ))
                          : g.rows.map(p => <PrecedentRow key={p.decision_id} p={p} />)}
                      </ul>
                    )}
                  </div>
                )
              })
            )}

            {tab !== 'proposals' && rows.length > shown && (
              <div className="border-t border-staff-line2 px-4 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown(n => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, rows.length - shown)} more of {rows.length - shown}
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      <EquivalencyDialog
        isOpen={dialog?.kind === 'add' || dialog?.kind === 'propose'}
        mode={dialog?.kind === 'add' ? 'add' : 'propose'}
        institutions={institutions.map(i => i.value)}
        onClose={closeDialog}
        onDone={async (result) => {
          const adding = dialog?.kind === 'add'
          closeDialog()
          if (adding) {
            const eq = result?.equivalency
            notify.success(`${eq?.course_code} → ${awardOf(eq)} added (${eq?.eq_id})${result?.replaced ? `, replacing ${result.replaced.eq_id} (${awardOf(result.replaced)})` : ''}. It applies to future transcripts.`)
          } else {
            notify.success(`Proposal sent for ${result?.proposal?.course_code}. The Credit Evaluation Office will review it.`)
            setTab('proposals')
          }
          await load()
        }}
      />
      {canImport && (
        <ImportDialog isOpen={dialog?.kind === 'import'} onClose={closeDialog} onDone={() => load()} />
      )}
      <ConfirmDialog
        isOpen={dialog?.kind === 'approve'}
        title="Approve proposal"
        confirmLabel="Approve"
        variant="success"
        note={{ label: 'Note', placeholder: 'Optional note for the record' }}
        onClose={closeDialog}
        onConfirm={(note) => approve(dialog.item, note)}
      >
        {dialog?.kind === 'approve' && (
          <>
            <p><span className="font-mono font-semibold text-staff-ink">{dialog.item.course_code}</span> ({dialog.item.institution}) → <strong>{awardOf(dialog.item)}</strong> becomes the equivalency for future transcripts.</p>
            {dialog.item.current && (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900">
                This replaces {dialog.item.current.status === 'revoked' ? 'the revoked' : 'the active'} equivalency <span className="font-mono">{dialog.item.current.eq_id}</span>: {awardOf(dialog.item.current)}.
              </p>
            )}
            <p className="text-[12.5px] text-staff-muted">Decisions already made stay as they were.</p>
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={dialog?.kind === 'reject'}
        title="Reject proposal"
        confirmLabel="Reject"
        variant="danger"
        note={{ label: 'Reason', required: true, requiredMessage: 'Give the reason; the evaluator who proposed it sees it.', placeholder: 'e.g. The lab component is not covered; keep CAS CS 111 without the lab.' }}
        onClose={closeDialog}
        onConfirm={(note) => reject(dialog.item, note)}
      >
        {dialog?.kind === 'reject' && (
          <p><span className="font-mono font-semibold text-staff-ink">{dialog.item.course_code}</span> ({dialog.item.institution}) → {awardOf(dialog.item)}, proposed by {dialog.item.proposed_by_name}.</p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={dialog?.kind === 'revoke' || dialog?.kind === 'restore'}
        title={dialog?.kind === 'restore' ? 'Restore equivalency' : 'Revoke equivalency'}
        confirmLabel={dialog?.kind === 'restore' ? 'Restore' : 'Revoke'}
        variant={dialog?.kind === 'restore' ? 'primary' : 'danger'}
        onClose={closeDialog}
        onConfirm={() => changeStatus(dialog.item, dialog.kind === 'restore' ? 'active' : 'revoked')}
      >
        {(dialog?.kind === 'revoke' || dialog?.kind === 'restore') && (
          <>
            <p><span className="font-mono">{dialog.item.eq_id}</span>: <span className="font-mono font-semibold text-staff-ink">{dialog.item.course_code}</span> ({dialog.item.institution}) → {awardOf(dialog.item)}.</p>
            <p>{dialog.kind === 'restore'
              ? 'It applies automatically to new transcripts again.'
              : 'It stops applying to new transcripts; those courses go to a department evaluator. Decisions already made stay as they were, and evaluator agreement will not bring it back automatically.'}</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}

function ProposalList({ proposals, canManage, onApprove, onReject }) {
  if (!proposals.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No proposals"
        description={canManage
          ? 'Proposals from evaluators appear here for approval.'
          : 'Propose an equivalency here or from a course decision; you can follow its review on this tab.'}
      />
    )
  }
  return (
    <ul className="divide-y divide-staff-line2">
      {proposals.map(p => (
        <li key={p.id} className="px-5 py-3 hover:bg-staff-bg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)_200px_auto] items-center gap-3 lg:gap-4">
            <SourceCard code={p.course_code} sub={[p.institution, p.title].filter(Boolean).join(' · ')} />
            <Outcome value={p.outcome} />
            <BuCard value={p.bu_course} sub={p.current && p.status === 'pending'
              ? `Replaces ${p.current.eq_id}: ${awardOf(p.current)}${p.current.status === 'revoked' ? ' (revoked)' : ''}`
              : 'Boston University'} />
            <div className="min-w-0 text-[12px] text-staff-muted">
              <p className="text-[12.5px] text-staff-ink2 truncate">{p.proposed_by_name}{p.source === 'decision' ? ' · from a decision' : ''}</p>
              <p className="truncate">Proposed {formatDate(String(p.proposed_at || '').slice(0, 10))}</p>
              {p.status !== 'pending' && p.reviewed_by_name && (
                <p className="truncate">{PROPOSAL_LABELS[p.status]} by {p.reviewed_by_name}{p.reviewed_at ? ` · ${formatDate(String(p.reviewed_at).slice(0, 10))}` : ''}</p>
              )}
            </div>
            <div className="flex items-center gap-2 lg:justify-self-end">
              {canManage && p.status === 'pending' ? (
                <>
                  <Button size="sm" variant="success" onClick={() => onApprove(p)}><Check className="w-3.5 h-3.5" aria-hidden="true" />Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => onReject(p)}><X className="w-3.5 h-3.5" aria-hidden="true" />Reject</Button>
                </>
              ) : (
                <StatusPill tone={PROPOSAL_TONES[p.status] || 'neutral'} className="w-fit">{PROPOSAL_LABELS[p.status] || p.status}</StatusPill>
              )}
            </div>
          </div>
          {(p.note || p.review_note) && (
            <div className="mt-2 space-y-1 text-[12.5px] text-staff-ink2">
              {p.note && (
                <p className="flex items-start gap-1.5"><MessageSquare className="w-3.5 h-3.5 mt-0.5 text-staff-muted flex-shrink-0" aria-hidden="true" /><span className="line-clamp-2" title={p.note}>{p.note}</span></p>
              )}
              {p.review_note && (
                <p className="flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-staff-muted flex-shrink-0" aria-hidden="true" /><span className="line-clamp-2" title={p.review_note}><span className="font-medium">Review:</span> {p.review_note}</span></p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
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

const SOURCE_LABELS = { manual: 'Added by the office', standard: 'Office standard', imported: 'Imported' }

function Origin({ learned, learnedLabel, title, meta, source }) {
  return (
    <div className="min-w-0">
      {SOURCE_LABELS[source] ? (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap bg-sky-50 text-sky-800">
          <ShieldCheck className="w-3 h-3" aria-hidden="true" />{SOURCE_LABELS[source]}
        </span>
      ) : learned ? (
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

// With row actions (revoke / restore) the last column is wider
const ROW_ACTIONS = 'px-5 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)_200px_170px] items-center gap-3 lg:gap-4'

function EquivalencyRow({ e, onRevoke }) {
  const promoted = e.source === 'promoted'
  return (
    <li className={`${onRevoke ? ROW_ACTIONS : ROW} hover:bg-staff-bg`}>
      <SourceCard code={e.course_code} sub={e.title} />
      <Outcome value={e.outcome} />
      <BuCard value={e.bu_course} />
      <Origin
        learned={promoted}
        source={e.source}
        learnedLabel={`Learned from ${plural(e.promoted_from?.length || 0, 'decision')}`}
        title={(e.promoted_from || []).join(', ')}
        meta={[formatDate(e.approved_on), e.eq_id, e.evaluator].filter(Boolean).join(' · ')}
      />
      {onRevoke ? (
        <div className="flex items-center gap-2 lg:justify-self-end">
          <ActivePill status={e.status} />
          <Button size="sm" variant="ghost" onClick={onRevoke} title={e.status === 'active' ? 'Stop applying this equivalency' : 'Apply this equivalency again'}>
            {e.status === 'active' ? <><Ban className="w-3.5 h-3.5" aria-hidden="true" />Revoke</> : <><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />Restore</>}
          </Button>
        </div>
      ) : (
        <ActivePill status={e.status} />
      )}
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
