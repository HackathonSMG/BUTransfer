import React from 'react'
import Navbar from './Navbar'
import StaffShell from './StaffShell'
import { useAuth } from '../../hooks/useAuth'

export default function Layout({ children }) {
  const { isAuthenticated, user } = useAuth()

  // Signed-in staff get the portal shell; students and visitors keep the simple top bar
  if (isAuthenticated && user?.role !== 'student') return <StaffShell>{children}</StaffShell>

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex flex-1">
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
