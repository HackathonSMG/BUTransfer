import React from 'react'
import Navbar from './Navbar'
import StaffShell from './StaffShell'
import { useAuth } from '../../hooks/useAuth'
import { PageStatus } from '../ui/StatusMessage'

// isPublic: an applicant page (landing, apply, track, sign-in). It always uses the public top bar, whoever is
// signed in, so a staff session never mixes the staff portal into the applicant experience.
export default function Layout({ children, isPublic = false }) {
  const { isAuthenticated, user } = useAuth()

  // Signed-in staff get the portal shell on staff pages; applicants and visitors keep the simple top bar
  if (!isPublic && isAuthenticated && user?.role !== 'student') return <StaffShell>{children}</StaffShell>

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex flex-1">
        <main className="flex-1 min-w-0">
          <PageStatus className="sticky top-20 z-40 max-w-3xl mx-auto px-4 pt-4" />
          {children}
        </main>
      </div>
    </div>
  )
}
