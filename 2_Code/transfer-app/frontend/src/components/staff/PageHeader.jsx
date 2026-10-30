import React from 'react'
import campus from '../../assets/campus-hero.jpg'

// Page title block used across the staff portal: optional eyebrow, serif title, one line of context, actions.
// banner: the dashboards' welcome band, with the campus photo under a BU red gradient.
export default function PageHeader({ eyebrow, title, subtitle, actions, banner = false }) {
  if (banner) {
    return (
      <header className="relative overflow-hidden rounded-2xl bg-[#7a0000] text-white shadow-sm">
        <img src={campus} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover object-[center_40%] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#990000] via-[#990000]/90 to-[#cc0000]/40" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 sm:px-8 py-6 sm:py-7">
          <div className="min-w-0">
            {eyebrow && <p className="text-[13px] font-medium text-white/80 mb-1">{eyebrow}</p>}
            <h1 className="text-[28px] sm:text-[30px] leading-tight">{title}</h1>
            {subtitle && <p className="text-[15px] text-white/90 mt-1.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 [&_a]:text-white [&_a:hover]:text-white/80">{actions}</div>}
        </div>
      </header>
    )
  }
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] font-medium text-staff-muted mb-1">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight text-staff-ink">{title}</h1>
        <span className="block w-10 h-[3px] rounded-full bg-brand mt-2" aria-hidden="true" />
        {subtitle && <p className="text-[15px] text-staff-ink2 mt-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
