import React from 'react'
import campus from '../../assets/campus-hero.jpg'

// Title band for the public student pages: the campus photo under a BU red gradient, so the text stays readable
// at any width. children: a row of small facts or links under the intro.
export default function PublicHero({ eyebrow = 'Boston University · Transfer Credit', title, intro, children, width = 'max-w-3xl' }) {
  return (
    <header className="relative overflow-hidden bg-[#7a0000] text-white">
      <img src={campus} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover object-center opacity-35" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#990000] via-[#990000]/85 to-[#cc0000]/50" aria-hidden="true" />
      <div className={`relative ${width} mx-auto px-4 sm:px-6 py-9 sm:py-12`}>
        <p className="text-[13px] font-semibold tracking-[0.12em] uppercase text-white/80">{eyebrow}</p>
        <h1 className="font-display text-3xl sm:text-[36px] font-semibold mt-2 leading-tight">{title}</h1>
        {intro && <p className="text-white/90 mt-3 text-[15px] leading-relaxed max-w-2xl">{intro}</p>}
        {children && <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">{children}</div>}
      </div>
      <div className="relative h-1 bg-gradient-to-r from-white/0 via-white/40 to-white/0" aria-hidden="true" />
    </header>
  )
}
