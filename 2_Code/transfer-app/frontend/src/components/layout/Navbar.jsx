import React from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, FolderOpen, Search, FileText, LogIn } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

// Top bar for the public applicant pages. Applicants need no account: they start an application or track one.
// Staff sign in from here; signed-in staff get StaffTopbar inside StaffShell instead. A student account
// (created before applicant-first intake) still sees its applications.
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const student = user?.role === 'student'

  const signOut = async () => {
    await logout()
    navigate('/')
  }

  const navClass = ({ isActive }) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive ? 'text-brand bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link to="/" className="flex items-center gap-2 group min-w-0">
            <div className="w-8 h-8 bg-brand rounded-md flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">BU</span>
            </div>
            <div className="min-w-0">
              <span className="font-bold text-gray-900 text-sm sm:text-base leading-tight block truncate">BU Transfer Credit</span>
              <span className="text-xs text-gray-500 hidden sm:block">Boston University</span>
            </div>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/apply" className={navClass}><FileText className="w-4 h-4" /><span className="hidden md:inline">Submit Transcripts</span></NavLink>
            <NavLink to="/track" className={navClass}><Search className="w-4 h-4" /><span className="hidden sm:inline">Track Transfer Credit</span></NavLink>
            {student ? (
              <>
                <NavLink to="/student" className={navClass}><FolderOpen className="w-4 h-4" /><span className="hidden lg:inline">My Transfer Credit</span></NavLink>
                <button onClick={signOut} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">
                  <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : pathname !== '/login' && (
              <Link to="/login" className="inline-flex items-center gap-1.5 ml-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900">
                <LogIn className="w-4 h-4" /><span className="hidden sm:inline">Staff Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
