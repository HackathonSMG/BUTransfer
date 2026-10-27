import React from 'react'

// Generic shield mark in BU red; drawn inline so it needs no image asset
export default function BUCrest({ className = 'w-8 h-9' }) {
  return (
    <svg viewBox="0 0 32 36" className={className} aria-hidden="true">
      <path d="M16 1.5 30 6v11c0 8.5-6 14.5-14 17.5C8 31.5 2 25.5 2 17V6z" fill="#cc0000" />
      <path d="M9 12h14M9 17h14M9 22h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
