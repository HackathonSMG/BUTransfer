import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
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

const FIELD = 'px-2.5 py-1.5 text-[13px] border border-staff-line rounded-lg bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

/**
 * @param {(params: {term?, from?, to?}) => Promise<{data: {counts, terms}}>} fetchCounts
 * @param {Array<{key, label, now?: boolean, detail?: (counts) => string, to?: string}>} cards
 */
export default function PeriodCounts({ title, fetchCounts, cards }) {
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
        <h2 id="period-counts" className="flex items-center gap-2 text-[16px] font-semibold text-staff-ink mr-auto">
          <CalendarRange className="w-[18px] h-[18px] text-staff-ink2" />{title}
        </h2>
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
