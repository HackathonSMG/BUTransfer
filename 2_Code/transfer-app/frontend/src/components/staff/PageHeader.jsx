import React from 'react'

// Page title block used across the staff portal: optional eyebrow, serif title, one line of context, actions
export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] font-medium text-staff-muted mb-1">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight text-staff-ink">{title}</h1>
        {subtitle && <p className="text-[15px] text-staff-ink2 mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
