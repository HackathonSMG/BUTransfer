import React from 'react'
import Navbar from './Navbar'
import StaffShell from './StaffShell'
import { useAuth } from '../../hooks/useAuth'

export default function Layout({ children }) {
  const { isAuthenticated } = useAuth()

  // Signed-in staff get the portal shell; the public (student) pages keep the simple top bar
  if (isAuthenticated) return <StaffShell>{children}</StaffShell>

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex flex-1">
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
