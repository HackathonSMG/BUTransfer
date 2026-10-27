/**
 * Shared presentation helpers and components (no business rules: the API sends computed values).
 */
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (Math.round(Number(n || 0) * 100) / 100).toString();
export const dateStr = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
export const timeStr = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
export const stamp = (d) => (d ? `${new Date(d).toISOString().slice(0, 10)} ${timeStr(d)}` : '');
export const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
export const recv = (d) => (isToday(d) ? 'Today' : shortDate(d));
export const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

let showSources = false;
export const setShowSources = (v) => { showSources = !!v; };
const SRC_CLS = { Worksheet: 's-ws', 'Synthetic Data': 's-syn', 'System-generated': 's-sys', Missing: 's-miss', 'Student upload': 's-sys' };
export function srcTag(src, compact = true, force = false) {
  if (!src || !(showSources || force)) return '';
  return String(src).split(' + ').map((p) => {
    const k = p.startsWith('Worksheet') ? 'Worksheet' : p;
    const label = compact ? ({ Worksheet: 'Worksheet', 'Synthetic Data': 'Synthetic', 'System-generated': 'System', Missing: 'Missing' }[k] || p) : p;
    return `<span class="srct ${SRC_CLS[k] || 's-syn'}" title="Source: ${esc(p)}">${esc(label)}</span>`;
  }).join('');
}

export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6500 : 4200);
}

export const ICON = {
  online: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 15h8a4 4 0 0 0 .6-7.95A5 5 0 0 0 5 8a3.5 3.5 0 0 0 1 7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 13V8m-2.2 2.2L10 8l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  etx: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.8h7l3 3V17H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 8 8 12h3l-1.5 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  offline: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="5" width="14.4" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m3.5 6 6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  agent: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="6" width="12" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="10.5" r="1.1" fill="currentColor"/><circle cx="12" cy="10.5" r="1.1" fill="currentColor"/><path d="M10 6V3.5" stroke="currentColor" stroke-width="1.6"/></svg>',
  inbox: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 11.5 5 4h10l2 7.5V16H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 11.5h4l1 2h4l1-2h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  clock: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  flag: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 17V3.5m0 0h9l-2 3.5 2 3.5H5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m7 10.2 2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 16.5a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};
export const I = {
  dash: '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="6" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3" width="6" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="13" width="6" height="4" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="10" width="6" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  list: '<svg viewBox="0 0 20 20"><path d="M7 5h10M7 10h10M7 15h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="3.6" cy="5" r="1.1" fill="currentColor"/><circle cx="3.6" cy="10" r="1.1" fill="currentColor"/><circle cx="3.6" cy="15" r="1.1" fill="currentColor"/></svg>',
  folder: '<svg viewBox="0 0 20 20"><path d="M2.8 5.5A1.5 1.5 0 0 1 4.3 4h3.6l1.6 1.8h6.2a1.5 1.5 0 0 1 1.5 1.5v7.4a1.5 1.5 0 0 1-1.5 1.5H4.3a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  users: '<svg viewBox="0 0 20 20"><circle cx="7.5" cy="7" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 16a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 11.6A4.6 4.6 0 0 1 17.5 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 20 20"><path d="M4 3.5h9.5a2 2 0 0 1 2 2V17H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 15a2 2 0 0 1 2-2h9.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  chart: '<svg viewBox="0 0 20 20"><path d="M3 17h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 14V9M10 14V5M14 14v-3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 7v6l5-3z" fill="currentColor"/></svg>',
  cap: '<svg viewBox="0 0 20 20"><path d="M10 4 2 8l8 4 8-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 9.8V14c1.2 1.2 2.8 1.8 4.5 1.8s3.3-.6 4.5-1.8V9.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  doc: '<svg viewBox="0 0 20 20"><path d="M5 2.8h7l3 3V17H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 9.5h5M7.5 12.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z" fill="currentColor"/><path d="M15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.6 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 20 20"><path d="m7.5 5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 20 20"><path d="M10 13.5V4m-3.6 3.4L10 4l3.6 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 13v2.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  brain: '<svg viewBox="0 0 20 20"><ellipse cx="10" cy="5" rx="6" ry="2.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 5v10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V5M4 10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  route: '<svg viewBox="0 0 20 20"><circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 5h4a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};
export const ico = (n) => ICON[n] || I[n] || '';

const STATUS = {
  Draft: 's-neutral', Submitted: 's-neutral', Processing: 's-info', Matching: 's-info', 'Waiting for Confirmation': 's-warn', 'In Review': 's-info',
  Confirmed: 's-ok', Rejected: 's-bad', 'Needs Information': 's-bad', Completed: 's-ok', Withdrawn: 's-neutral',
};
export const badge = (st) => `<span class="xb ${STATUS[st] || 's-neutral'}"><i></i>${esc(st)}</span>`;
const PRI = { High: 'pr-urg', Medium: 'pr-high', Low: 'pr-low', Done: 'pr-done' };
export const priPill = (p) => (p ? `<span class="xp ${PRI[p.level] || 'pr-norm'}" title="${esc((p.why || []).join(' · ') || 'No urgency signals')}">${esc(p.level)}</span>` : '');
export const matchLabel = (p) => (p == null ? 'Not scored' : p >= 90 ? 'Strong match' : p >= 70 ? 'Partial match' : 'Weak match');
export const matchCls = (p) => (p == null ? 'm-none' : p >= 90 ? 'm-strong' : p >= 70 ? 'm-mod' : 'm-weak');
export const meter = (p) => `<span class="xm ${matchCls(p)}"><span class="xmt"><i style="width:${p || 0}%"></i></span><b>${p == null ? '—' : `${p}%`}</b></span>`;
export const BAND_CLS = { High: 'b-high', Medium: 'b-med', Low: 'b-low', 'Not scored': 'b-none' };
export const bandPill = (band) => `<span class="xband ${BAND_CLS[band] || 'b-none'}">${esc(band)} confidence</span>`;
export const riskDot = (risk) => `<i class="rk rk-${String(risk || 'low').toLowerCase()}" title="${esc(risk)} risk"></i>`;
export const avatar = (who, big = false) => (who ? `<span class="xav ${esc(who.tone || 'tn-slate')} ${big ? 'lg' : ''}" aria-hidden="true">${esc(who.initials || '?')}</span>` : '');
export const kpi = (label, val, sub, tone, icon, go) => `<${go ? 'button' : 'div'} class="xkpi ${tone || ''}" ${go ? `data-go="${go}"` : ''}><span class="xki">${icon || ''}</span><span class="xkl">${label}</span><b class="xkv">${val}</b>${sub ? `<span class="xks">${sub}</span>` : ''}</${go ? 'button' : 'div'}>`;
export const empty = (title, body, icon = 'check') => `<div class="xempty"><span class="xei">${ico(icon)}</span><b>${esc(title)}</b><span>${esc(body)}</span></div>`;
export const REC_CLS = { Accept: 'r-acc', 'Accept as elective': 'r-ele', 'Partial credit': 'r-part', Reject: 'r-rej', 'Needs info': 'r-info' };
export const CH_SHORT = { online: 'Portal upload', etx: 'E-transcript', offline: 'Paper, scanned', mixed: 'Portal + paper' };
export const cls = (st) => (st === 'Confirmed' ? 's-Confirmed' : st === 'Likely' ? 's-Likely' : st === 'Under review' || st === 'Info requested' ? 's-review' : 's-none');
export const pill = (st) => `<span class="pill ${cls(st)}">${esc(st)}</span>`;
export const demoTag = (title = 'Historical counts are generated for the demo. Decisions recorded in the system are added live.') => `<span class="xdemo" title="${esc(title)}">Demo data</span>`;

export function skeleton(kind) {
  const bar = (w) => `<span class="sk" style="width:${w}"></span>`;
  return `<div class="skwrap" aria-busy="true" aria-label="Loading">
    ${kind === 'case' ? `<div class="xcard">${bar('40%')}${bar('65%')}${bar('30%')}</div><div class="xgrid3">${[1, 2, 3].map(() => `<div class="xcard">${bar('50%')}${bar('80%')}${bar('70%')}</div>`).join('')}</div>`
    : `<div class="xkpis">${[1, 2, 3, 4].map(() => `<div class="xcard">${bar('40%')}${bar('25%')}</div>`).join('')}</div>`}
    <div class="xcard">${[1, 2, 3, 4, 5].map(() => `<div class="skrow">${bar('18%')}${bar('30%')}${bar('14%')}${bar('12%')}</div>`).join('')}</div></div>`;
}

export const errorBox = (e) => `<section class="xcard xerr"><b>We couldn't load this page.</b><p>${esc(e?.message || 'Something went wrong.')}</p><button class="xbtn" data-retry>Try again</button></section>`;

/* knowledge base / evaluation path presentation */
export const PATH = {
  known_equivalency: { label: 'Previously approved', cls: 'p-ok' },
  ai_recommended: { label: 'AI recommendation', cls: 'p-warn' },
  manual_review: { label: 'Manual review required', cls: 'p-bad' },
  policy_rule: { label: 'Institutional rule', cls: 'p-neutral' },
};
export const pathPill = (p) => (PATH[p] ? `<span class="pathpill ${PATH[p].cls}"><i></i>${esc(PATH[p].label)}</span>` : '');
export const confChip = (c, low = 80) => (c == null ? '' : `<span class="confchip ${Number(c) < low ? 'lo' : Number(c) < 90 ? 'mid' : 'hi'}" title="AI extraction confidence">${Math.round(Number(c))}%</span>`);
