import React from 'react'
import campus from '../../assets/campus-hero.jpg'

// Page title block used across the staff portal: optional eyebrow, serif title, one line of context, actions.
// banner: the dashboards' welcome band, with the campus photo beside the BU red. Its actions use BannerAction.
export default function PageHeader({ eyebrow, title, subtitle, actions, banner = false }) {
  if (banner) {
    // The photo shows on the right; the red holds the text and the actions on the left, so nothing covers the photo
    return (
      <header className="relative overflow-hidden rounded-2xl bg-[#7a0000] text-white shadow-card">
        <img src={campus} alt="" aria-hidden="true" className="absolute right-0 top-0 h-full w-full sm:w-[62%] object-cover object-[center_45%] opacity-40 sm:opacity-100" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#990000] via-[#990000]/95 via-45% to-[#990000]/10" aria-hidden="true" />
        <div className="relative px-6 sm:px-8 py-6 sm:py-7 max-w-[680px]">
          {eyebrow && <p className="text-[13px] font-medium text-white/80 mb-1">{eyebrow}</p>}
          <h1 className="text-[28px] sm:text-[32px] leading-tight">{title}</h1>
          {subtitle && <p className="text-[15px] text-white/90 mt-1.5">{subtitle}</p>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
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

// A pill-shaped action on the banner: solid (white) for the main one, glass for the others
export function BannerAction({ as: As = 'span', solid = false, className = '', children, ...props }) {
  return (
    <As {...props} className={`inline-flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 text-[13.5px] font-medium shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${solid ? 'bg-white text-staff-ink hover:bg-white/90' : 'bg-white/15 ring-1 ring-white/30 text-white hover:bg-white/25'} ${className}`}>
      {children}
    </As>
  )
}

