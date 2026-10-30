import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TONES } from './Metric'
import { activityLabel, timeAgo } from '../../lib/staffFormat'

// A card's title row: icon in its meaning colour, title, optional subtitle, and anything on the right
export function SectionTitle({ icon: Icon, tone = 'red', title, subtitle, right, id, border = true }) {
  const chip = tone === 'red' ? 'bg-red-50 text-brand' : TONES[tone]?.chip
  return (
    <div className={`px-6 py-4 flex items-center gap-3 ${border ? 'border-b border-staff-line2' : ''}`}>
      {Icon && <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${chip}`}><Icon className="w-[18px] h-[18px]" aria-hidden="true" /></span>}
      <span className="min-w-0 flex-1">
        <h2 id={id} className="text-[16px] font-semibold text-staff-ink">{title}</h2>
        {subtitle && <p className="text-[12.5px] text-staff-muted">{subtitle}</p>}
      </span>
      {right}
    </div>
  )
}

const ATTENTION_TONES = {
  bad: { stripe: 'bg-red-500', chip: 'bg-red-50 text-red-700' },
  warn: { stripe: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700' },
  good: { stripe: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  neutral: { stripe: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700' }
}

// Things to act on: a colour stripe and icon by urgency, the title, one line of detail, and where it's handled
export function AttentionList({ items }) {
  return (
    <ul className="divide-y divide-staff-line2">
      {items.map(item => {
        const t = ATTENTION_TONES[item.tone] || ATTENTION_TONES.neutral
        return (
          <li key={item.title} className="flex items-center gap-4 px-6 py-4">
            <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${t.stripe}`} aria-hidden="true" />
            <span className={`w-10 h-10 rounded-lg grid place-items-center flex-shrink-0 ${t.chip}`}><item.icon className="w-5 h-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-staff-ink">{item.title}</span>
              <span className="block text-[13px] text-staff-muted truncate">{item.detail}</span>
            </span>
            {item.action || (item.to && (
              <Link to={item.to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800 whitespace-nowrap">
                {item.cta}<ArrowRight className="w-4 h-4" />
              </Link>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

// The colour of an activity by what kind of thing happened
function activityTone(action) {
  const a = String(action || '')
  if (/fail|duplicate_suspected/.test(a)) return 'red'
  if (/decid|decision|posted|applied|resolved|received|responded/.test(a)) return 'emerald'
  if (/assign|transfer|reassign/.test(a)) return 'violet'
  if (/request|syllabus|info|exception/.test(a)) return 'amber'
  return 'sky'
}
const DOTS = { red: 'bg-red-500 ring-red-100', emerald: 'bg-emerald-500 ring-emerald-100', violet: 'bg-violet-500 ring-violet-100', amber: 'bg-amber-400 ring-amber-100', sky: 'bg-sky-500 ring-sky-100' }

// Recent activity as a timeline; each row: what happened, its context line, and when
export function ActivityTimeline({ rows, context }) {
  return (
    <ol className="relative px-6 py-4">
      <span className="absolute left-[29px] top-6 bottom-6 w-px bg-staff-line" aria-hidden="true" />
      {rows.map((r, i) => (
        <li key={i} className={`relative flex gap-4 ${i < rows.length - 1 ? 'pb-4' : ''}`}>
          <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ring-4 flex-shrink-0 ${DOTS[activityTone(r.action)]}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="font-medium text-staff-ink truncate">{activityLabel(r.action)}</span>
              <span className="text-[12px] text-staff-muted whitespace-nowrap">{timeAgo(r.created_at)}</span>
            </span>
            <span className="block text-[12.5px] text-staff-muted truncate">{context(r)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
