import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getNotifications, markAllRead } from '../../api/notifications'

const ROLE_LABELS = {
  evaluator: 'Evaluator',
  admin: 'Administrator'
}

const ROLE_COLORS = {
  evaluator: 'bg-blue-100 text-blue-800',
  admin: 'bg-purple-100 text-purple-800'
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const notifRef = useRef(null)
  const userRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications()
      const interval = setInterval(loadNotifications, 60000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

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

  const unreadCount = notifications.filter(n => !n.is_read).length

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
            {isAuthenticated ? (
              <>
                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                      <div className="flex items-center justify-between p-3 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-sm">
                            No notifications
                          </div>
                        ) : (
                          notifications.slice(0, 10).map(n => (
                            <div
                              key={n.id}
                              className={`p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${!n.is_read ? 'bg-blue-50' : ''}`}
                            >
                              <p className="text-sm text-gray-900 font-medium">{n.title || n.message}</p>
                              {n.message && n.title && (
                                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                {n.created_at ? new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.created_at)) : ''}
                              </p>
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
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-medium text-gray-900 leading-tight">
                        {user?.full_name || user?.email}
                      </p>
                      {user?.role && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                      <div className="p-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                      {user?.role === 'admin' && (
                        <Link
                          to="/admin"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                <User className="w-4 h-4" />
                Staff Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
