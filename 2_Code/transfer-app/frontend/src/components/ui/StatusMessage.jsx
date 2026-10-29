import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import notify from '../../lib/notify'

const STYLE = {
  success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: CheckCircle2, iconClass: 'text-emerald-600' },
  error: { box: 'bg-red-50 border-red-200 text-red-900', icon: AlertCircle, iconClass: 'text-red-600' },
  info: { box: 'bg-sky-50 border-sky-200 text-sky-900', icon: Info, iconClass: 'text-sky-600' },
}

// Messages raised with lib/notify for one region, shown in place (not as a pop-up)
export function StatusRegion({ region = 'page', className = '' }) {
  const [messages, setMessages] = useState([])
  useEffect(() => notify.subscribe((all) => setMessages(all.filter((m) => m.region === region))), [region])
  return (
    <div aria-live="polite" className={messages.length ? className : ''}>
      {messages.map((m) => {
        const s = STYLE[m.kind] || STYLE.info
        return (
          <div key={m.id} role={m.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${s.box}`}>
            <s.icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.iconClass}`} />
            <span className="flex-1 min-w-0">{m.text}</span>
            <button type="button" onClick={() => notify.dismiss(m.id)} className="p-0.5 -m-0.5 rounded opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// The page's region; messages are cleared when the user moves to another page
export function PageStatus({ className = '' }) {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    notify.pageChanged()
  }, [pathname])
  return <StatusRegion region="page" className={className} />
}

// A dialog's region: errors raised while the dialog is open appear inside it
export function useDialogRegion(open) {
  const [name] = useState(() => `dialog-${Math.random().toString(36).slice(2)}`)
  useEffect(() => (open ? notify.openRegion(name) : undefined), [open, name])
  return name
}
