import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import StaffTopbar from './StaffTopbar'
import { PageStatus } from '../ui/StatusMessage'

export default function StaffShell({ children }) {
  const { pathname } = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  // Close the mobile navigation after moving to another page
  useEffect(() => { setNavOpen(false) }, [pathname])

  return (
    <div className="staff-shell min-h-screen bg-staff-bg text-staff-ink lg:grid lg:grid-cols-[248px_minmax(0,1fr)] border-t-[3px] border-brand">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="min-w-0 flex flex-col min-h-screen">
        <StaffTopbar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-8 lg:px-10 pt-8 pb-16">
          {/* Confirmations and errors for this page, in place rather than as a pop-up */}
          <PageStatus className="sticky top-20 z-30 mb-5 shadow-sm rounded-lg" />
          {children}
        </main>
      </div>
    </div>
  )
}
