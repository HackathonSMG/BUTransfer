import React from 'react'
import { Link } from 'react-router-dom'

// A headline number: label, large value, one short line of detail. Links somewhere when `to` is given.
export default function Metric({ label, value, detail, to, accent = false }) {
  const body = (
    <>
      <span className="block text-[13px] font-medium text-staff-ink2">{label}</span>
      <span className={`block mt-2 text-[34px] leading-none font-semibold tracking-tight tabular-nums ${accent ? 'text-brand' : 'text-staff-ink'}`}>
        {value ?? '—'}
      </span>
      {detail && <span className="block mt-2 text-[13px] text-staff-muted">{detail}</span>}
    </>
  )
  const cls = 'block bg-white rounded-xl border border-staff-line px-5 py-5 min-w-0'
  return to ? (
    <Link to={to} className={`${cls} transition hover:border-slate-300 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
