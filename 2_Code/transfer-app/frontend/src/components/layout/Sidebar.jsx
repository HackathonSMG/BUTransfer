import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  ScrollText,
  FilePlus
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

const evaluatorLinks = [
  { to: '/evaluator', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/evaluator/applications/new', label: 'New Application', icon: FilePlus }
]

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/evaluator', label: 'Applications', icon: FileText, end: true },
  { to: '/evaluator/applications/new', label: 'New Application', icon: FilePlus },
  { to: '/admin/users', label: 'Evaluators', icon: Users },
  { to: '/admin/criteria', label: 'Criteria', icon: Settings },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText }
]

export default function Sidebar() {
  const { user } = useAuth()
  const links = user?.role === 'admin' ? adminLinks : evaluatorLinks

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex-shrink-0">
      <nav className="p-4 space-y-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
