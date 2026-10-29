import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Bell, LogOut, ChevronDown, ChevronRight, Menu, Search } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getNotifications, markAllRead } from '../../api/notifications'
import { initials } from '../../lib/reviews'

const ROLE_LABELS = {
  evaluator: 'Evaluator',
  admin: 'Administrator',
  credit_office: 'Credit Evaluation Office'
}

// Breadcrumb trail for each staff route
function crumbsFor(pathname, role) {
  if (pathname === '/evaluator') return ['My Workspace', 'Dashboard']
  if (pathname === '/evaluator/my-evaluations') return ['My Workspace', 'My Evaluations']
  if (pathname === '/evaluator/profile') return ['My Workspace', 'My Profile']
  if (pathname.startsWith('/evaluator/reviews/')) return ['My Workspace', 'My Evaluations', 'Course Review']
  if (pathname === '/office') return ['Credit Evaluation Office', 'Dashboard']
  if (pathname.startsWith('/office/applications/')) return ['Credit Evaluation Office', 'Credit Evaluations', 'Evaluation']
  if (pathname === '/admin/reports') return ['Administration', 'Reports']
  if (pathname === '/admin/conflicts') return ['Course Mapping', 'Equivalency Conflicts']
  if (pathname === '/admin/applications') return role === 'credit_office' ? ['Credit Evaluation Office', 'Credit Evaluations'] : ['Administration', 'Credit Evaluations']
  if (pathname === '/evaluator/applications/new') return ['Administration', 'Credit Evaluations', 'New Evaluation']
  if (pathname.startsWith('/evaluator/applications/')) {
    return role === 'admin' ? ['Administration', 'Credit Evaluations', 'Evaluation Report'] : role === 'credit_office' ? ['Credit Evaluation Office', 'Credit Evaluations', 'Evaluation Report'] : ['My Workspace', 'My Evaluations', 'Application Review']
  }
  if (pathname === '/evaluator/equivalencies') return ['Course Mapping', 'Course Equivalencies']
  if (pathname === '/admin') return ['Administration', 'Dashboard']
  if (pathname === '/admin/users') return ['Administration', 'Evaluators']
  if (pathname === '/admin/criteria') return ['Administration', 'Eligibility Criteria']
  if (pathname === '/admin/audit') return ['Administration', 'Audit Logs']
  return ['BU Transfer Portal']
}


export default function StaffTopbar({ onOpenNav }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [search, setSearch] = useState('')
  const notifRef = useRef(null)
  const userRef = useRef(null)

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const loadNotifications = async () => {
    try {
      const data = await getNotifications()
      setNotifications(data.data || data.notifications || [])
    } catch {
      // Silently fail
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch {
      // Silently fail
    }
  }

  const handleLogout = async () => {
    setShowUserMenu(false)
    await logout()
    navigate('/login')
  }

  // Admins search all applications; evaluators search their own evaluations. Both pages read ?search=
  const searchPage = ['admin', 'credit_office'].includes(user?.role) ? '/admin/applications' : '/evaluator/my-evaluations'
  const handleSearch = (e) => {
    e.preventDefault()
    const q = search.trim()
    navigate(q ? `${searchPage}?search=${encodeURIComponent(q)}` : searchPage)
  }

  const unreadCount = notifications.filter(n => !n.is_read).length
  const crumbs = crumbsFor(pathname, user?.role)

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-7 py-3 bg-white/90 backdrop-blur border-b border-staff-line">
      <button
        onClick={onOpenNav}
        className="lg:hidden p-2 -ml-1 rounded-lg text-staff-muted hover:bg-staff-sunk"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 flex items-center gap-1 text-[13px] text-staff-muted whitespace-nowrap overflow-hidden">
        {crumbs.map((c, i) => (
          <React.Fragment key={c}>
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />}
            <span className={`truncate ${i === crumbs.length - 1 ? 'font-semibold text-staff-ink' : ''}`}>{c}</span>
          </React.Fragment>
        ))}
      </nav>

      <form onSubmit={handleSearch} className="relative hidden md:block w-[min(340px,30vw)]" role="search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-staff-muted pointer-events-none" />
        <label htmlFor="staff-search" className="sr-only">Search evaluations</label>
        <input
          id="staff-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={['admin', 'credit_office'].includes(user?.role) ? 'Search students, Transfer Credit IDs, institutions' : 'Search my evaluations'}
          className="w-full pl-9 pr-3 py-2 text-sm bg-staff-sunk border border-transparent rounded-lg placeholder:text-staff-muted focus:outline-none focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </form>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative w-9 h-9 grid place-items-center rounded-lg border border-staff-line bg-white text-staff-ink2 hover:bg-staff-sunk transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10.5px] leading-[14px] rounded-full grid place-items-center font-bold border-2 border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-pop border border-staff-line overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-staff-line2">
              <h3 className="font-display font-semibold text-staff-ink">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-staff-muted text-sm">
                  No notifications
                </div>
              ) : (
                notifications.slice(0, 10).map(n => (
                  <div key={n.id} className="flex gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-staff-sunk">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${!n.is_read ? 'bg-primary-600' : 'bg-transparent'}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-staff-ink font-semibold">{n.title || n.message}</p>
                      {n.message && n.title && (
                        <p className="text-xs text-staff-ink2 mt-0.5">{n.message}</p>
                      )}
                      <p className="text-[11.5px] text-staff-muted mt-1">
                        {n.created_at ? new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.created_at)) : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-2 p-1 pr-1.5 rounded-xl hover:bg-staff-sunk transition-colors"
        >
          <span className="w-8 h-8 rounded-full grid place-items-center bg-primary-100 text-primary-800 text-xs font-bold tracking-wide">
            {initials(user?.full_name || user?.email)}
          </span>
          <span className="hidden sm:flex flex-col text-left leading-tight max-w-[170px]">
            <span className="text-[13px] font-semibold text-staff-ink truncate">{user?.full_name || user?.email}</span>
            <span className="text-[11.5px] text-staff-muted truncate">{ROLE_LABELS[user?.role] || user?.role}</span>
          </span>
          <ChevronDown className="w-4 h-4 text-staff-muted hidden sm:block" />
        </button>

        {showUserMenu && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-pop border border-staff-line overflow-hidden z-50">
            <div className="p-3 border-b border-staff-line2">
              <p className="staff-eyebrow mb-1">Signed in as</p>
              <p className="text-sm font-semibold text-staff-ink">{user?.full_name}</p>
              <p className="text-xs text-staff-muted">{user?.email}</p>
            </div>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-staff-ink2 hover:bg-staff-sunk"
              >
                Admin Dashboard
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
