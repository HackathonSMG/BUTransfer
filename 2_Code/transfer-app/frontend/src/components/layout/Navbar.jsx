import React from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'

// Public top bar for the student pages. Signed-in staff get StaffTopbar inside StaffShell instead.
export default function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">BU</span>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm sm:text-base leading-tight block">
                BU Transfer Portal
              </span>
              <span className="text-xs text-gray-500 hidden sm:block">Evaluation System</span>
            </div>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <User className="w-4 h-4" />
              Staff Login
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
