import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  ScrollText,
  FilePlus,
  Library,
  Sparkles,
  X
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import BUCrest from './BUCrest'

// An application's detail page keeps "Applications" (or the evaluator's "Dashboard") highlighted
const isApplicationDetail = (path) => /^\/evaluator\/applications\/(?!new$)[^/]+$/.test(path)

const evaluatorSections = [
  {
    title: 'Evaluation',
    links: [
      { to: '/evaluator', label: 'Dashboard', icon: LayoutDashboard, end: true, alsoActive: isApplicationDetail },
      { to: '/evaluator/applications/new', label: 'New Application', icon: FilePlus }
    ]
  },
  {
    title: 'Knowledge base',
    links: [
      { to: '/evaluator/equivalencies', label: 'Course Equivalencies', icon: Library }
    ]
  }
]

const adminSections = [
  {
    title: 'Overview',
    links: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }
    ]
  },
  {
    title: 'Evaluation',
    links: [
      { to: '/evaluator', label: 'Applications', icon: FileText, end: true, alsoActive: isApplicationDetail },
      { to: '/evaluator/applications/new', label: 'New Application', icon: FilePlus },
      { to: '/evaluator/equivalencies', label: 'Course Equivalencies', icon: Library }
    ]
  },
  {
    title: 'Administration',
    links: [
      { to: '/admin/users', label: 'Evaluators', icon: Users },
      { to: '/admin/criteria', label: 'Criteria', icon: Settings },
      { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText }
    ]
  }
]

export default function Sidebar({ open = false, onClose }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const sections = user?.role === 'admin' ? adminSections : evaluatorSections

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[248px] flex flex-col bg-white border-r border-staff-line transition-transform duration-200
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:z-30 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2.5 px-3.5 pt-4 pb-3.5 border-b border-staff-line2">
          <BUCrest className="w-[30px] h-[34px] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-[15px] leading-tight tracking-tight text-staff-ink whitespace-nowrap">
              BU Transfer Portal
            </p>
            <p className="text-[11px] text-staff-muted truncate">Transfer Credit Evaluation</p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-staff-muted hover:bg-staff-sunk"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {sections.map(section => (
            <div key={section.title} className="mb-3">
              <p className="staff-eyebrow px-2.5 pt-1.5 pb-2">{section.title}</p>
              {section.links.map(({ to, label, icon: Icon, end, alsoActive }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => {
                    const active = isActive || Boolean(alsoActive?.(pathname))
                    return `relative flex items-center gap-2.5 px-2.5 py-2 mb-0.5 rounded-lg text-[13.5px] transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-800 font-semibold before:absolute before:-left-2.5 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-primary-600'
                        : 'text-staff-ink2 font-medium hover:bg-staff-sunk hover:text-staff-ink'
                    }`
                  }}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-staff-line2">
          <div className="flex gap-2 items-start rounded-lg bg-staff-sunk p-2.5 text-xs leading-snug text-staff-ink2">
            <Sparkles className="w-4 h-4 flex-shrink-0 text-primary-600 mt-px" />
            <span>
              <b className="font-semibold text-primary-800">AI prepares the evidence.</b> Evaluators make every credit decision.
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
