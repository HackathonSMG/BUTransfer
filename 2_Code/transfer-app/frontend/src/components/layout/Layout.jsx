import React from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import { useAuth } from '../../hooks/useAuth'

export default function Layout({ children }) {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex flex-1">
        {isAuthenticated && <Sidebar />}
        <main className={`flex-1 ${isAuthenticated ? 'p-6' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}
