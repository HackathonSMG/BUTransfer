import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  ScrollText,
  BarChart3,
  GitCompare,
  Library,
  ClipboardCheck,
  UserCircle,
  ShieldCheck,
  Stamp,
  X
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import BUCrest from './BUCrest'

// Detail pages keep their list highlighted: an application under Applications, a review under My Evaluations
const isApplicationDetail = (path) => /^\/(evaluator|office)\/applications\/[^/]+$/.test(path)
const isReviewDetail = (path) => path.startsWith('/evaluator/reviews/')

// Evaluators get a short, flat menu; admins a main group plus settings
const evaluatorSections = [
  {
    links: [
      { to: '/evaluator', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/evaluator/my-evaluations', label: 'My Evaluations', icon: ClipboardCheck, alsoActive: (p) => isReviewDetail(p) || isApplicationDetail(p) },
      { to: '/evaluator/equivalencies', label: 'Course Equivalencies', icon: Library },
      { to: '/evaluator/profile', label: 'My Profile', icon: UserCircle }
    ]
  }
]

// The Credit Evaluation Office processes applications and posts credit; no user or criteria administration
const officeSections = [
  {
    links: [
      { to: '/office', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/applications', label: 'Applications', icon: FileText, alsoActive: isApplicationDetail },
      { to: '/evaluator/equivalencies', label: 'Course Equivalencies', icon: Library },
      { to: '/admin/conflicts', label: 'Equivalency Conflicts', icon: GitCompare }
    ]
  }
]

const adminSections = [
  {
    links: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/office', label: 'Credit Office', icon: Stamp, end: true },
      { to: '/admin/applications', label: 'Applications', icon: FileText, alsoActive: isApplicationDetail },
      { to: '/admin/users', label: 'Evaluators', icon: Users },
      { to: '/evaluator/equivalencies', label: 'Course Equivalencies', icon: Library },
      { to: '/admin/conflicts', label: 'Equivalency Conflicts', icon: GitCompare },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 }
    ]
  },
  {
    title: 'Settings',
    links: [
      { to: '/admin/criteria', label: 'Eligibility Criteria', icon: Settings },
      { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText }
    ]
  }
]

export default function Sidebar({ open = false, onClose }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const isAdmin = user?.role === 'admin'
  const isOffice = user?.role === 'credit_office'
  const sections = isAdmin ? adminSections : isOffice ? officeSections : evaluatorSections

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
            <div key={section.title || 'main'} className="mb-5">
              {section.title && <p className="staff-eyebrow px-2.5 pt-1.5 pb-2">{section.title}</p>}
              {section.links.map(({ to, label, icon: Icon, end, alsoActive }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => {
                    const active = isActive || Boolean(alsoActive?.(pathname))
                    return `relative flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-[14.5px] transition-colors ${
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
          <div className="flex gap-2.5 items-center rounded-lg bg-staff-sunk p-2.5 text-xs leading-snug">
            <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${isAdmin || isOffice ? 'bg-brand/10 text-brand' : 'bg-primary-100 text-primary-700'}`}>
              {isAdmin ? <ShieldCheck className="w-4 h-4" /> : isOffice ? <Stamp className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-staff-ink">{isAdmin ? 'Administrator' : isOffice ? 'Credit Office' : 'Evaluator'} workspace</span>
              <span className="block text-staff-muted truncate">{user?.department || 'Transfer Credit Evaluation'}</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
