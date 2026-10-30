import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, BadgeCheck, GitCompare, Flame, Gavel, CircleSlash, Users, BookMarked, ChevronDown, AlertTriangle } from 'lucide-react'
import notify from '../../lib/notify'
import { getConflicts, recordStandardEquivalency } from '../../api/admin'
import { resolveConflict } from '../../api/office'
import PageHeader from '../../components/staff/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { formatDate, initials, avatarTint } from '../../lib/reviews'

const TITLES = {
  different_bu_course: 'Different BU courses awarded',
  different_outcome: 'Different outcomes',
  match_divergence: 'Very different course-match scores'
}
// Short names and colours for the type pills and the by-type bar
const TYPES = {
  different_bu_course: { short: 'Different BU course', bar: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
  different_outcome: { short: 'Different outcome', bar: 'bg-amber-400', pill: 'bg-amber-50 text-amber-800' },
  match_divergence: { short: 'Match scores differ', bar: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700' }
}
const typeOf = (t) => TYPES[t] || { short: t, bar: 'bg-slate-400', pill: 'bg-staff-sunk text-staff-ink2' }

// How urgent a conflict is: the open reviews of the course that will see it
function severity(n) {
  if (n >= 3) return { stripe: '#ef4444', pill: 'bg-red-50 text-red-700', hot: true }
  if (n >= 1) return { stripe: '#f59e0b', pill: 'bg-amber-50 text-amber-800', hot: false }
  return { stripe: '#cbd5e1', pill: 'bg-staff-sunk text-staff-ink2', hot: false }
}

// Each award in a split gets a colour: BU courses green then teal, elective amber, no credit rose
function awardTones(outcomes) {
  const BU = [
    { bar: 'bg-emerald-600', card: 'border-emerald-200 bg-emerald-50/40', text: 'text-emerald-800' },
    { bar: 'bg-teal-600', card: 'border-teal-200 bg-teal-50/40', text: 'text-teal-800' },
    { bar: 'bg-cyan-700', card: 'border-cyan-200 bg-cyan-50/40', text: 'text-cyan-800' }
  ]
  let bu = 0
  return outcomes.map(o => {
    if (o.grants_bu_course) return { ...BU[Math.min(bu++, BU.length - 1)], label: 'Awards a BU course', mono: true }
    if (/no credit/i.test(o.award)) return { bar: 'bg-rose-500', card: 'border-rose-200 bg-rose-50/40', text: 'text-rose-700', label: 'No credit' }
    return { bar: 'bg-amber-500', card: 'border-amber-200 bg-amber-50/40', text: 'text-amber-800', label: 'Elective or partial credit only' }
  })
}

const keyOf = (c) => `${c.institution}|${c.course_code}`

// Transfer courses whose earlier decisions disagree, side by side, with a way to record the standard
export default function Conflicts() {
  const [state, setState] = useState({ loading: true, rows: [], error: null })
  const [resolving, setResolving] = useState(null)
  const [marking, setMarking] = useState(null)
  // Which conflicts are open in full; until one is toggled, the most urgent is
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await getConflicts()
      setState({ loading: false, rows: res.data, error: null })
    } catch (err) {
      setState({ loading: false, rows: [], error: err.response?.data?.message || err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Most open reviews first: those conflicts reach evaluators soonest
  const rows = [...state.rows].sort((a, b) => b.open_reviews - a.open_reviews)
  const isOpen = (c, i) => (expanded ? expanded.has(keyOf(c)) : i === 0)
  const toggle = (c, i) => setExpanded(prev => {
    const next = new Set(prev || (rows[0] ? [keyOf(rows[0])] : []))
    if (isOpen(c, i)) next.delete(keyOf(c)); else next.add(keyOf(c))
    return next
  })

  // Expanded conflicts are cards of their own; consecutive collapsed ones share one list card
  const groups = []
  rows.forEach((c, i) => {
    if (isOpen(c, i)) groups.push({ open: true, items: [[c, i]] })
    else if (groups.length && !groups[groups.length - 1].open) groups[groups.length - 1].items.push([c, i])
    else groups.push({ open: false, items: [[c, i]] })
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equivalency Conflicts"
        subtitle="Transfer courses where earlier decisions disagree. Recording a standard applies to future transcripts; existing decisions are not changed."
      />

      {state.loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" className="text-primary-600" /></div>
      ) : state.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : state.rows.length === 0 ? (
        <div className="staff-card flex items-center gap-3 px-6 py-6 text-[15px] text-staff-ink2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          No conflicts. Decisions for every transfer course agree with each other and with the established equivalencies.
        </div>
      ) : (
        <>
          <AttentionBand rows={rows} />
          <p className="flex justify-end text-[12.5px] text-staff-muted -mb-2">Sorted by most open reviews first</p>
          <div className="space-y-4">
            {groups.map(g => g.open ? (
              <ConflictCard key={keyOf(g.items[0][0])} c={g.items[0][0]} onToggle={() => toggle(...g.items[0])}
                onResolve={() => setMarking(g.items[0][0])} onStandard={() => setResolving(g.items[0][0])} />
            ) : (
              <ul key={keyOf(g.items[0][0])} className="staff-card overflow-hidden divide-y divide-staff-line2">
                {g.items.map(([c, i]) => <ConflictRow key={keyOf(c)} c={c} onToggle={() => toggle(c, i)} />)}
              </ul>
            ))}
          </div>
        </>
      )}

      <StandardModal conflict={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); load() }} />
      <ResolveModal conflict={marking} onClose={() => setMarking(null)} onDone={() => { setMarking(null); load() }} />
    </div>
  )
}

// How big the problem is: open conflicts, the open reviews they reach, and the kinds of disagreement
function AttentionBand({ rows }) {
  const reviews = rows.reduce((n, c) => n + (c.open_reviews || 0), 0)
  const byType = {}
  rows.forEach(c => c.conflicts.forEach(x => { byType[x.type] = (byType[x.type] || 0) + 1 }))
  const types = Object.entries(byType)
  return (
    <section className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 via-white to-white p-5 grid grid-cols-2 sm:grid-cols-[auto_1fr_1fr] lg:grid-cols-[auto_1fr_1fr_1.4fr] items-center gap-5 lg:gap-6"
      aria-label="Conflicts at a glance">
      <span className="hidden sm:grid w-14 h-14 rounded-2xl bg-red-600 text-white place-items-center shadow-sm"><GitCompare className="w-7 h-7" aria-hidden="true" /></span>
      <div>
        <p className="font-display tabular-nums text-[34px] font-semibold leading-none text-red-700">{rows.length}</p>
        <p className="text-[13px] text-staff-ink2 mt-1">open {rows.length === 1 ? 'conflict' : 'conflicts'}</p>
      </div>
      <div>
        <p className="font-display tabular-nums text-[34px] font-semibold leading-none text-staff-ink">{reviews}</p>
        <p className="text-[13px] text-staff-ink2 mt-1">open {reviews === 1 ? 'review follows' : 'reviews follow'} them</p>
      </div>
      <div className="col-span-2 sm:col-span-3 lg:col-span-1">
        <p className="text-[12px] font-medium text-staff-muted mb-1.5">By type</p>
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" role="img" aria-label={types.map(([t, n]) => `${typeOf(t).short} ${n}`).join(', ')}>
          {types.map(([t, n]) => <span key={t} className={typeOf(t).bar} style={{ flex: n }} />)}
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-staff-ink2">
          {types.map(([t, n]) => (
            <span key={t} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-sm ${typeOf(t).bar}`} aria-hidden="true" />{typeOf(t).short} {n}</span>
          ))}
        </p>
      </div>
    </section>
  )
}

function WaitingPill({ n, long = false, className = '' }) {
  const s = severity(n)
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${s.pill} ${className}`}>
      {s.hot && <Flame className="w-3 h-3" aria-hidden="true" />}
      {n === 0 ? 'None waiting' : long ? `${n} open review${n === 1 ? '' : 's'} waiting` : `${n} waiting`}
    </span>
  )
}

// The split as a vote bar: one segment per award, its width by the number of decisions
function VoteBar({ outcomes, small = false }) {
  const tones = awardTones(outcomes)
  return (
    <div className={`flex ${small ? 'h-6 rounded-md text-[11px]' : 'h-9 rounded-lg text-[12.5px]'} overflow-hidden font-semibold text-white`}
      role="img" aria-label={`Decisions: ${outcomes.map(o => `${o.award} ${o.count}`).join(', ')}`}>
      {outcomes.map((o, i) => (
        <span key={o.award} className={`${tones[i].bar} flex items-center gap-2 min-w-0 ${small ? 'px-2' : 'px-3'}`} style={{ flex: o.count }} title={`${o.award}: ${o.count}`}>
          <span className={`truncate ${tones[i].mono ? 'font-mono' : ''}`}>{o.award}</span>
          <span className="font-normal opacity-80 whitespace-nowrap">{small ? `· ${o.count}` : `${o.count} decision${o.count === 1 ? '' : 's'}`}</span>
        </span>
      ))}
    </div>
  )
}

// The award most decisions agree on, when one leads
function leading(c) {
  const [a, b] = c.previous.outcomes
  return a && a.grants_bu_course && (!b || a.count > b.count) ? a.award : null
}

function ConflictCard({ c, onToggle, onResolve, onStandard }) {
  const s = severity(c.open_reviews)
  const tones = awardTones(c.previous.outcomes)
  const cols = Math.min(3, c.previous.outcomes.length)
  return (
    <section className="staff-card overflow-hidden" style={{ borderLeft: `4px solid ${s.stripe}` }}>
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-staff-muted">
            <WaitingPill n={c.open_reviews} long />
            {c.conflicts.map(x => <span key={x.type} className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${typeOf(x.type).pill}`}>{typeOf(x.type).short}</span>)}
            {c.institution}
          </p>
          <h2 className="mt-2 text-[19px] font-semibold text-staff-ink">
            <span className="font-mono">{c.course_code}</span>
            {c.title && <span className="font-normal text-staff-ink2"> · {c.title}</span>}
          </h2>
          <ul className="mt-1.5 space-y-0.5">
            {c.conflicts.map(x => (
              <li key={x.type} className="flex gap-2 text-[13px] text-staff-ink2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span><span className="font-medium text-staff-ink">{TITLES[x.type] || x.type}.</span> {x.summary}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onResolve}>Mark as resolved</Button>
          <Button onClick={onStandard}><Gavel className="w-4 h-4" aria-hidden="true" />Record standard</Button>
          <button type="button" onClick={onToggle} aria-expanded="true" aria-label={`Collapse ${c.course_code}`}
            className="p-2 rounded-lg text-staff-muted hover:bg-staff-sunk focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <ChevronDown className="w-4 h-4 rotate-180" aria-hidden="true" />
          </button>
        </div>
      </div>

      {c.previous.outcomes.length > 0 && <div className="px-6"><VoteBar outcomes={c.previous.outcomes} /></div>}

      {c.previous.outcomes.length > 0 && (
        <div className={`px-6 py-5 grid grid-cols-1 gap-4 ${cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : ''}`}>
          {c.previous.outcomes.map((o, i) => (
            <div key={o.award} className={`rounded-xl border p-4 min-w-0 ${tones[i].card}`}>
              <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${tones[i].text}`}>
                {o.grants_bu_course && <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />}{tones[i].label}
                <span className="ml-auto font-normal text-staff-muted">{o.count} decision{o.count === 1 ? '' : 's'}</span>
              </p>
              <p className={`text-[16px] font-semibold text-staff-ink mt-1.5 ${o.grants_bu_course ? 'font-mono' : ''}`}>{o.award}</p>
              <ul className="mt-2 space-y-3">
                {c.previous.decisions.filter(d => o.decision_ids.includes(d.decision_id)).map(d => {
                  const who = d.source === 'evaluator' ? d.evaluator || 'Evaluator' : 'Reference record'
                  return (
                    <li key={d.decision_id}>
                      {d.reason && <p className="text-[13px] text-staff-ink2">“{d.reason}”</p>}
                      <p className="text-[12px] text-staff-muted mt-1.5 flex items-center gap-1.5">
                        {d.source === 'evaluator' ? (
                          <span className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-semibold flex-shrink-0 ${avatarTint(who)}`} aria-hidden="true">{initials(who)}</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-staff-sunk text-staff-ink2 grid place-items-center flex-shrink-0" aria-hidden="true"><BookMarked className="w-3 h-3" /></span>
                        )}
                        {who} · {formatDate(d.decided_on)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-6 py-3 border-t border-staff-line2 bg-staff-sunk/50 text-[12.5px] text-staff-muted">
        {c.established ? (
          <span className="inline-flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />Established: {c.established.bu_course || c.established.outcome} (since {formatDate(c.established.approved_on)})</span>
        ) : <span className="inline-flex items-center gap-1.5"><CircleSlash className="w-3.5 h-3.5" aria-hidden="true" />No established equivalency yet</span>}
        <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" aria-hidden="true" />{c.open_reviews} open review{c.open_reviews === 1 ? '' : 's'} of this course see{c.open_reviews === 1 ? 's' : ''} this conflict</span>
        {c.escalations.length > 0 && <span className="text-amber-800">Raised by {c.escalations[0].actor}{c.escalations[0].note ? `: “${c.escalations[0].note}”` : ''}</span>}
      </div>
    </section>
  )
}

// A collapsed conflict: one line with its urgency, the course and the split; opens in place
function ConflictRow({ c, onToggle }) {
  const s = severity(c.open_reviews)
  const lead = leading(c)
  return (
    <li style={{ borderLeft: `4px solid ${s.stripe}` }}>
      <button type="button" onClick={onToggle} aria-expanded="false"
        className="w-full text-left px-6 py-4 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 hover:bg-staff-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500">
        <WaitingPill n={c.open_reviews} className="md:w-[120px]" />
        <span className="flex-1 min-w-0">
          <span className="font-mono font-semibold text-staff-ink">{c.course_code}</span>
          {c.title && <span className="text-staff-ink2"> · {c.title}</span>}
          <span className="block text-[12px] text-staff-muted">
            {c.institution} · {c.conflicts.map(x => typeOf(x.type).short.toLowerCase()).join(', ')}
            {lead && <> · <b className="font-medium text-emerald-700">most decisions: {lead}</b></>}
          </span>
        </span>
        {c.previous.outcomes.length > 0 && <span className="w-full md:w-64 flex-shrink-0"><VoteBar outcomes={c.previous.outcomes} small /></span>}
        <ChevronDown className="w-4 h-4 text-staff-muted flex-shrink-0 hidden md:block" aria-hidden="true" />
      </button>
    </li>
  )
}

function StandardModal({ conflict, onClose, onDone }) {
  const [choice, setChoice] = useState('')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setChoice(''); setCustom(''); setNote('') }, [conflict])
  if (!conflict) return null

  const options = [
    ...conflict.previous.outcomes.filter(o => o.grants_bu_course).map(o => ({ value: `bu:${o.award}`, label: o.award, detail: `${o.count} earlier decision${o.count === 1 ? '' : 's'}` })),
    { value: 'custom', label: 'Another BU course', detail: 'Enter the course code' },
    { value: 'elective', label: 'Elective credit only', detail: 'No specific BU course' },
    { value: 'none', label: 'No credit', detail: 'The course does not transfer' }
  ]

  const save = async () => {
    const body = { institution: conflict.institution, course_code: conflict.course_code, note }
    if (choice.startsWith('bu:')) Object.assign(body, { outcome: 'BU equivalent', bu_course: choice.slice(3) })
    else if (choice === 'custom') Object.assign(body, { outcome: 'BU equivalent', bu_course: custom.trim().toUpperCase() })
    else if (choice === 'elective') Object.assign(body, { outcome: 'Elective credit', bu_course: null })
    else Object.assign(body, { outcome: 'No credit', bu_course: null })
    setSaving(true)
    try {
      await recordStandardEquivalency(body)
      notify.success('Standard equivalency recorded')
      onDone()
    } catch (err) {
      notify.error(err.response?.data?.message || 'The standard could not be recorded')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Record standard equivalency" size="md">
      <div className="space-y-4">
        <p className="text-[14px] text-staff-ink2">
          <span className="font-mono font-semibold text-staff-ink">{conflict.course_code}</span> at {conflict.institution}.
          The standard applies to future transcripts; decisions already made are not changed.
        </p>
        <div className="space-y-2" role="radiogroup">
          {options.map(o => (
            <label key={o.value} className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${choice === o.value ? 'border-primary-600 bg-primary-50/50' : 'border-staff-line hover:bg-staff-bg'}`}>
              <input type="radio" name="standard" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="accent-primary-600" />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-staff-ink">{o.label}</span>
                <span className="block text-[12.5px] text-staff-muted">{o.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {choice === 'custom' && (
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. CAS CS 112" aria-label="BU course code"
            className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        )}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (optional): why this is the standard"
          className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!choice || (choice === 'custom' && !custom.trim())}>Record standard</Button>
        </div>
      </div>
    </Modal>
  )
}

// Closes a conflict without changing the standard (e.g. each outcome was right for its syllabus); a later
// disagreeing decision opens it again
function ResolveModal({ conflict, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setNote('') }, [conflict])
  if (!conflict) return null
  const save = async () => {
    setSaving(true)
    try {
      await resolveConflict({ institution: conflict.institution, course_code: conflict.course_code, note: note.trim() })
      notify.success('Conflict marked as resolved')
      onDone()
    } catch (err) {
      notify.error(err.response?.data?.message || 'The conflict could not be resolved')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Mark conflict as resolved" size="sm">
      <div className="space-y-4">
        <p className="text-[14px] text-staff-ink2">
          <span className="font-mono font-semibold text-staff-ink">{conflict.course_code}</span> at {conflict.institution}. The standard stays as it is; a later decision that disagrees will raise the conflict again.
        </p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus placeholder="How was it resolved? e.g. The two outcomes reflect different syllabus versions."
          className="w-full px-3 py-2 text-sm border border-staff-line rounded-lg focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={note.trim().length < 3}>Mark as resolved</Button>
        </div>
      </div>
    </Modal>
  )
}
