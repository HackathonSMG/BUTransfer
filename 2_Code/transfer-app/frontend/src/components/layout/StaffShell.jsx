import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import StaffTopbar from './StaffTopbar'

export default function StaffShell({ children }) {
  const { pathname } = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  // Close the mobile navigation after moving to another page
  useEffect(() => { setNavOpen(false) }, [pathname])

  return (
    <div className="staff-shell min-h-screen bg-staff-bg text-staff-ink lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="min-w-0 flex flex-col min-h-screen">
        <StaffTopbar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-7 pt-6 pb-14">
          {children}
        </main>
      </div>
    </div>
  )
}
