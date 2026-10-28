import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, LogOut, FolderOpen } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

// Top bar for the public and student pages. Signed-in staff get StaffTopbar inside StaffShell instead.
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const student = user?.role === 'student'

  const signOut = async () => {
    await logout()
    navigate('/')
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={student ? '/student' : '/'} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">BU</span>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm sm:text-base leading-tight block">
                BU Transfer Portal
              </span>
              <span className="text-xs text-gray-500 hidden sm:block">{student ? 'Student Portal' : 'Evaluation System'}</span>
            </div>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {student ? (
              <>
                <Link to="/student" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100">
                  <FolderOpen className="w-4 h-4" /><span className="hidden sm:inline">My Applications</span>
                </Link>
                <span className="hidden md:block text-sm text-gray-500">{user.full_name}</span>
                <button onClick={signOut} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">
                  <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                <User className="w-4 h-4" />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
