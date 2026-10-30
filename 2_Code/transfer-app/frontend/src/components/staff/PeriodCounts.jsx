import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, Inbox, Hourglass, CircleCheckBig, ChevronRight } from 'lucide-react'
import Spinner from '../ui/Spinner'

// Dashboard counts in context: a BU start term and a period. The API counts everything (course reviews, decisions,
// assignments, postings); this only chooses the filters and shows the result. Cards marked "now" describe work
// open at this moment, so the period does not apply to them; the term always does.
const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom range']]

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** from / to (inclusive, local dates) for a preset; null bounds mean "all time". */
function rangeFor(preset, custom) {
  const today = new Date()
  if (preset === 'today') return { from: iso(today), to: iso(today) }
  if (preset === 'week') {
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    return { from: iso(monday), to: iso(today) }
  }
  if (preset === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) }
  if (preset === 'custom') return { from: custom.from || null, to: custom.to || null }
  return { from: null, to: null }
}

// Cards can name a stage; the stages are then shown left to right, each in its meaning colour
const STAGES = [
  { key: 'received', label: 'Received', Icon: Inbox, box: 'bg-sky-50/70 border-sky-100', head: 'text-sky-800' },
  { key: 'progress', label: 'In progress', Icon: Hourglass, box: 'bg-amber-50/70 border-amber-100', head: 'text-amber-800' },
  { key: 'done', label: 'Completed', Icon: CircleCheckBig, box: 'bg-emerald-50/70 border-emerald-100', head: 'text-emerald-800' }
]
const BAR_TONES = { sky: 'bg-sky-500', amber: 'bg-amber-400', emerald: 'bg-emerald-500', slate: 'bg-slate-300' }

const FIELD = 'px-2.5 py-1.5 text-[13px] border border-staff-line rounded-lg bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

/**
 * @param {(params: {term?, from?, to?}) => Promise<{data: {counts, terms}}>} fetchCounts
 * @param {Array<{key, label, now?: boolean, detail?: (counts) => string, to?: string, stage?: 'received'|'progress'|'done'}>} cards
 * @param {Array<{key, tone}>} [bar] counts shown as one stacked bar (parts of the same whole)
 */
export default function PeriodCounts({ title, subtitle, fetchCounts, cards, bar }) {
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [term, setTerm] = useState('')
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const range = rangeFor(preset, custom)

  useEffect(() => {
    let live = true
    setState(s => ({ ...s, loading: true }))
    fetchCounts({ term: term || undefined, from: range.from || undefined, to: range.to || undefined })
      .then(res => live && setState({ loading: false, data: res.data, error: null }))
      .catch(err => live && setState({ loading: false, data: null, error: err.response?.data?.message || 'The counts could not be loaded' }))
    return () => { live = false }
  }, [fetchCounts, term, range.from, range.to])

  const counts = state.data?.counts
  const periodLabel = preset === 'custom'
    ? [range.from, range.to].filter(Boolean).join(' – ') || 'All time'
    : PRESETS.find(([k]) => k === preset)[1]
  return (
    <section className="staff-card" aria-labelledby="period-counts">
      <div className="px-6 pt-5 pb-4 border-b border-staff-line2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 mr-auto">
          <span className="w-9 h-9 rounded-lg bg-red-50 text-brand grid place-items-center"><CalendarRange className="w-[18px] h-[18px]" /></span>
          <span>
            <h2 id="period-counts" className="text-[16px] font-semibold text-staff-ink">{title}</h2>
            {subtitle && <p className="text-[12.5px] text-staff-muted">{subtitle}</p>}
          </span>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-staff-ink2">
          BU start term
          <select value={term} onChange={e => setTerm(e.target.value)} className={FIELD}>
            <option value="">All terms</option>
            {(state.data?.terms || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-1 p-[3px] rounded-lg bg-staff-sunk" role="group" aria-label="Period">
          {PRESETS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setPreset(key)} aria-pressed={preset === key}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium ${preset === key ? 'bg-white text-staff-ink shadow-card' : 'text-staff-muted hover:text-staff-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-[13px] text-staff-ink2 w-full sm:w-auto">
            <input type="date" value={custom.from} max={custom.to || undefined} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className={FIELD} aria-label="From" />
            <span>to</span>
            <input type="date" value={custom.to} min={custom.from || undefined} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className={FIELD} aria-label="To" />
          </div>
        )}
      </div>
      {state.error ? (
        <p className="px-6 py-5 text-[14px] text-red-700">{state.error}</p>
      ) : !counts ? (
        <div className="py-10 flex justify-center"><Spinner className="text-primary-600" /></div>
      ) : cards.some(c => c.stage) ? (
        <Staged cards={cards} counts={counts} bar={bar} periodLabel={periodLabel} loading={state.loading} />
      ) : (
        <ul className={`grid grid-cols-2 md:grid-cols-4 ${cards.length > 4 ? 'xl:grid-cols-8' : ''} divide-x divide-y xl:divide-y-0 divide-staff-line2 ${state.loading ? 'opacity-60' : ''}`}>
          {cards.map(c => {
            const body = (
              <>
                <p className="text-[24px] font-semibold text-staff-ink tabular-nums leading-tight">{counts[c.key] ?? 0}</p>
                <p className="text-[13px] text-staff-ink2">{c.label}</p>
                <p className="text-[11.5px] text-staff-muted mt-0.5">{c.now ? 'Now' : periodLabel}{c.detail ? ` · ${c.detail(counts)}` : ''}</p>
              </>
            )
            return (
              <li key={c.key} className="px-5 py-4">
                {c.to ? <Link to={c.to} className="block hover:opacity-80">{body}</Link> : body}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Count({ c, counts, periodLabel, big = false }) {
  const body = (
    <>
      <p className={`font-display font-semibold text-staff-ink tabular-nums leading-none ${big ? 'text-[28px]' : 'text-[24px]'}`}>{counts[c.key] ?? 0}</p>
      <p className="text-[13px] text-staff-ink2 mt-1.5">{c.label}</p>
      <p className="text-[11.5px] text-staff-muted mt-0.5">{c.now ? 'Now' : periodLabel}{c.detail ? ` · ${c.detail(counts)}` : ''}</p>
    </>
  )
  return c.to ? <Link to={c.to} className="block rounded-md hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">{body}</Link> : body
}

// The counts grouped by stage (received -> in progress -> completed), with an optional stacked bar of their parts
function Staged({ cards, counts, bar, periodLabel, loading }) {
  const stages = STAGES.map(st => ({ ...st, cards: cards.filter(c => c.stage === st.key) })).filter(st => st.cards.length)
  const parts = (bar || []).map(b => ({ ...b, n: Number(counts[b.key]) || 0, label: cards.find(c => c.key === b.key)?.label }))
  const total = parts.reduce((t, p) => t + p.n, 0)
  return (
    <div className={`p-5 space-y-5 ${loading ? 'opacity-60' : ''}`}>
      {total > 0 && (
        <div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-staff-line2" role="img"
            aria-label={parts.map(p => `${p.n} ${p.label?.toLowerCase()}`).join(', ')}>
            {parts.filter(p => p.n).map(p => <span key={p.key} className={BAR_TONES[p.tone] || BAR_TONES.slate} style={{ width: `${(p.n / total) * 100}%` }} />)}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-staff-muted">
            {parts.map(p => <span key={p.key} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-sm ${BAR_TONES[p.tone] || BAR_TONES.slate}`} />{p.n} {p.label?.toLowerCase()}</span>)}
          </p>
        </div>
      )}
      <div className="flex flex-col lg:flex-row items-stretch gap-3">
        {stages.map((st, i) => (
          <React.Fragment key={st.key}>
            {i > 0 && <ChevronRight className="hidden lg:block self-center w-5 h-5 text-staff-muted flex-shrink-0" aria-hidden="true" />}
            <div className={`rounded-xl border p-4 min-w-0 ${st.box}`} style={{ flex: `${st.cards.length} 1 0%` }}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] flex items-center gap-1.5 ${st.head}`}><st.Icon className="w-3.5 h-3.5" />{st.label}</p>
              <ul className="mt-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${st.cards.length}, minmax(0, 1fr))` }}>
                {st.cards.map(c => <li key={c.key} className="min-w-0"><Count c={c} counts={counts} periodLabel={periodLabel} big /></li>)}
              </ul>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
