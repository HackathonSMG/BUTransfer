/**
 * App shell: sign-in, routing (hash based), sidebar / header, notifications, global search,
 * transcript viewer and the guided demo. Pages live in ./pages and fetch their own data.
 */
import { api, loadSession, hasSession, clearSession, onUnauthorized, qs } from './api.js';
import { state, app, NAVS, ROLE_LABEL } from './store.js';
import { $, $$, esc, toast, I, ico, avatar, badge, skeleton, errorBox, setShowSources, srcTag, timeStr, fmt } from './ui.js';
import * as studentPages from './pages/student.js';
import * as evaluatorPages from './pages/evaluator.js';
import * as casePage from './pages/case.js';
import * as adminPages from './pages/admin.js';
import * as knowledgePage from './pages/knowledge.js';
import { openDemo, closeDemo } from './demo.js';
import { transcriptHTML } from './transcript.js';

const PAGES = {
  student: { dashboard: studentPages.home, upload: studentPages.upload, processing: studentPages.processing, courses: studentPages.courses, degree: studentPages.degree, transcript: studentPages.transcript },
  evaluator: { dashboard: evaluatorPages.dashboard, queue: evaluatorPages.queue, requests: evaluatorPages.requests, students: evaluatorPages.students,
    courses: evaluatorPages.courses, team: evaluatorPages.team, knowledge: knowledgePage.render, processing: studentPages.processing, case: casePage.render },
  admin: { dashboard: adminPages.dashboard, requests: evaluatorPages.requests, reports: adminPages.reports, courses: evaluatorPages.courses,
    scenarios: adminPages.scenarios, settings: adminPages.settings, knowledge: knowledgePage.render, processing: studentPages.processing, case: casePage.render },
};
const LEGACY = new Set(['admin:dashboard', 'admin:reports', 'admin:scenarios', 'student:courses']);
const HEAVY = new Set(['dashboard', 'queue', 'requests', 'case', 'students', 'team', 'knowledge']);

/* ------------------------------------------------------------------ */
/* routing                                                              */
/* ------------------------------------------------------------------ */
function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (parts[0] === 'case' && parts[1]) return { page: 'case', params: { id: parts[1], course: parts[2] || params.course || null } };
  if (parts[1]) return { page: parts[0], params: { ...params, id: parts[1] } };
  return { page: parts[0] || 'dashboard', params };
}

app.go = (page, params = {}) => {
  const hash = page === 'case' ? `#/case/${params.id}${params.course ? `/${params.course}` : ''}` : `#/${page}${params.id ? `/${params.id}` : ''}`;
  $('#app').classList.remove('sbopen');
  if (location.hash === hash) app.render(); else location.hash = hash;
  window.scrollTo(0, 0);
};
app.openCase = (applicationId, courseEvaluationId) => {
  state.focusCourse = courseEvaluationId || null;
  state.focusScrolled = false;
  state.rqTab = 'courses';
  if (courseEvaluationId) state.open[courseEvaluationId] = true;
  app.go('case', { id: applicationId, course: courseEvaluationId || undefined });
};

let seq = 0;
app.render = async () => {
  if (!state.user) return;
  const { page, params } = parseHash();
  const role = state.user.role;
  state.page = PAGES[role][page] ? page : 'dashboard';
  state.params = params;
  const my = ++seq;
  const view = $('#view');
  view.className = `page page-${state.page} role-${role} ${LEGACY.has(`${role}:${state.page}`) ? 'legacy' : ''}`;
  syncShell();
  if (HEAVY.has(state.page) || role === 'student') view.innerHTML = skeleton(state.page === 'case' ? 'case' : 'list');
  const ctx = {
    seq: my,
    stale: () => my !== seq,
    paint: (html) => { if (my !== seq) return false; view.innerHTML = html; return true; },
  };
  try {
    await PAGES[role][state.page](ctx, params);
  } catch (e) {
    if (my !== seq) return;
    if (e.status === 401) return;
    view.innerHTML = errorBox(e);
    $('[data-retry]', view)?.addEventListener('click', () => app.render());
    if (e.status !== 403 && e.status !== 404) console.error(e);
  }
  if (my === seq) bindGo(view);
};
window.addEventListener('hashchange', () => app.render());

function bindGo(root = document) {
  $$('[data-go]', root).forEach((b) => { b.onclick = () => app.go(b.dataset.go); });
}

/* ------------------------------------------------------------------ */
/* shell                                                                */
/* ------------------------------------------------------------------ */
const titles = {
  student: { dashboard: ['Transfer overview', 'My Transfer'], upload: ['Upload transcript', 'My Transfer'], processing: ['Transcript processing', 'My Transfer'], courses: ['Course evaluations', 'My Transfer'], degree: ['Degree plan', 'My Transfer'], transcript: ['Transcript', 'My Transfer'] },
  evaluator: { dashboard: ['Evaluator dashboard', 'Transfer Management'], queue: ['My evaluations', 'Transfer Management'], requests: ['Transfer requests', 'Transfer Management'],
    students: ['Students', 'Transfer Management'], courses: ['Courses', 'Transfer Management'], team: ['Team & routing', 'Transfer Management'],
    knowledge: ['Equivalency knowledge base', 'Transfer Management'], processing: ['Transcript processing', 'Transfer Management'] },
  admin: { dashboard: ['Dashboard', 'Administration'], requests: ['Transfer requests', 'Administration'], reports: ['Reports', 'Administration'], courses: ['Courses', 'Administration'],
    scenarios: ['Scenarios & validation', 'Administration'], settings: ['Settings', 'Administration'],
    knowledge: ['Equivalency knowledge base', 'Administration'], processing: ['Transcript processing', 'Administration'] },
};
app.setTitle = (title, crumbs) => {
  $('#ptitle').textContent = title || '';
  $('#crumb').innerHTML = (crumbs || []).filter(Boolean).map((c, i, a) => (i < a.length - 1 ? `<span>${esc(c)}</span>${I.chev}` : `<b>${esc(c)}</b>`)).join('');
  document.title = `${title ? `${title} · ` : ''}Transfer Credit Intelligence`;
};

function syncShell() {
  const u = state.user;
  const r = u.role;
  $('#app').classList.toggle('collapsed', !!state.sbCollapsed);
  const counts = state.cache.navCounts || {};
  $('#sbnav').innerHTML = `<div class="sbsec">${ROLE_LABEL[r]} workspace</div>${NAVS[r].map(([k, l, ic]) => {
    const on = state.page === k || (state.page === 'case' && k === (r === 'admin' ? 'requests' : 'queue'));
    const n = counts[k] || 0;
    return `<button class="sbi ${on ? 'on' : ''}" data-go="${k}" title="${l}" ${on ? 'aria-current="page"' : ''}><span class="sbic">${I[ic]}</span><span class="sbl">${l}</span>${n ? `<b class="sbn ${r === 'student' ? 'att' : ''}">${n}</b>` : ''}</button>`;
  }).join('')}`;
  $('#sbfoot').innerHTML = r === 'student'
    ? '<div class="sbhelp"><b>Need help?</b><span>Email transfer@university.example or visit the Registrar\'s office.</span></div>'
    : agentStrip();
  if (state.page !== 'case') { const t = titles[r][state.page] || ['', '']; app.setTitle(t[0], [t[1], t[0] === 'Evaluator dashboard' ? 'Dashboard' : t[0]]); }
  $('#profname').textContent = u.fullName;
  $('#profrole').textContent = r === 'student' ? `Student · ${u.studentNumber}` : r === 'admin' ? 'Administrator' : u.department || 'Evaluator';
  $('#profav').innerHTML = avatar({ initials: initialsOf(u.fullName), tone: r === 'student' ? 'st1' : r === 'admin' ? 'tn-slate' : 'tn-indigo' });
  $('#pmwho').innerHTML = `<b>${esc(u.fullName)}</b><span>${esc(u.email)}</span><span class="xmuted">${esc(ROLE_LABEL[r])}${u.title ? ` · ${esc(u.title)}` : ''}</span>`;
  $('#tbsearchwrap').hidden = r === 'student';
  $('#srcbtn').setAttribute('aria-pressed', !!state.showSrc);
  $('#srcbtn').querySelector('span').textContent = state.showSrc ? 'Hide data sources' : 'Show data sources';
  $('#srclegend').hidden = !(state.showSrc || state.page === 'scenarios');
  setShowSources(state.showSrc);
  const unread = state.cache.unread || 0;
  $('#belldot').hidden = !unread;
  $('#belldot').textContent = unread > 9 ? '9+' : unread;
  bindGo($('#sbnav'));
}
const initialsOf = (n) => String(n || '').replace('Dr. ', '').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function agentStrip() {
  const s = state.cache.intake;
  if (!s) return '';
  if (s.queued.length) return `<div class="astrip busy" role="status"><span class="pulse" aria-hidden="true"></span>${ICON_AGENT()}<span><b>${s.queued.length} transcript${s.queued.length > 1 ? 's' : ''} in the intake queue.</b> ${esc(s.queued.map((q) => q.student).join(', '))} · the agent reads queued transcripts automatically.</span></div>`;
  return `<div class="astrip" role="status">${ICON_AGENT()}<span><b>Agent is up to date.</b> ${s.processed} transcripts read, online and paper. New arrivals are evaluated automatically and routed to evaluators.</span></div>`;
}
const ICON_AGENT = () => ico('agent');

app.refreshShell = async () => {
  if (!state.user) return;
  try {
    const n = await api.get('/notifications');
    state.cache.unread = n.unread;
    state.cache.notifications = n.items;
  } catch { /* shell refresh is best-effort */ }
  if (state.user.role !== 'student') {
    try { state.cache.intake = await api.get('/intake/status'); } catch { /* ignore */ }
  }
  try {
    if (state.user.role === 'evaluator') {
      const m = await api.get('/evaluators/me/evaluations?status=open');
      state.cache.navCounts = { queue: m.items.length };
    } else if (state.user.role === 'student') {
      const a = await api.get('/students/me/application');
      state.cache.navCounts = { courses: a.courses.filter((c) => c.infoRequest).length + a.requests.filter((q) => q.status === 'open').length };
    }
  } catch { /* ignore */ }
  syncShell();
};

/* ------------------------------------------------------------------ */
/* notifications                                                        */
/* ------------------------------------------------------------------ */
async function openNotifs() {
  const box = $('#notifs');
  box.innerHTML = `<div class="dh"><b>Notifications</b><button class="xlink" id="nall">Mark all as read</button><button class="xicon" id="nclose" aria-label="Close">✕</button></div><div class="dl">${skeleton('list')}</div>`;
  box.hidden = false; $('#scrim').hidden = false;
  $('#nclose').onclick = closeDrawers;
  let n;
  try { n = await api.get('/notifications'); } catch (e) { $('.dl', box).innerHTML = errorBox(e); return; }
  state.cache.unread = n.unread; syncShell();
  $('.dl', box).innerHTML = n.items.length ? n.items.map((x) => `<button class="ni ${x.read ? '' : 'unread'}" data-ni="${x.id}"><span class="nd"></span><span><b>${esc(x.title)}</b><span>${esc(x.body)}</span><small>${esc(new Date(x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></span></button>`).join('')
    : `<div class="xempty"><span class="xei">${ico('check')}</span><b>No notifications</b><span>You're all caught up.</span></div>`;
  $('#nall').onclick = async () => { const r = await api.post('/notifications/read', { ids: 'all' }); state.cache.unread = r.unread; syncShell(); openNotifs(); };
  $$('[data-ni]', box).forEach((b) => {
    b.onclick = async () => {
      const x = n.items.find((i) => i.id === b.dataset.ni);
      api.post('/notifications/read', { ids: [x.id] }).then((r) => { state.cache.unread = r.unread; syncShell(); }).catch(() => {});
      closeDrawers();
      const l = x.link || {};
      if (l.page === 'case' && state.user.role !== 'student') app.openCase(l.applicationId, l.courseEvaluationId);
      else app.go(PAGES[state.user.role][l.page] ? l.page : 'dashboard');
    };
  });
}
function closeDrawers() {
  $('#notifs').hidden = true; closeDemo(); $('#scrim').hidden = true; $('#pmenu').hidden = true;
  $('#profbtn').setAttribute('aria-expanded', 'false');
}
app.closeDrawers = closeDrawers;

/* ------------------------------------------------------------------ */
/* global search                                                        */
/* ------------------------------------------------------------------ */
let searchTimer;
async function globalSearch(q) {
  const box = $('#gres');
  if (q.trim().length < 2) { box.hidden = true; return; }
  let r;
  try { r = await api.get(`/search${qs({ q })}`); } catch { return; }
  if ($('#gsearch').value !== q) return;
  box.innerHTML = (r.students.length ? `<div class="gh">Students</div>${r.students.map((s) => `<button class="gi" data-gcase="${s.applicationId}">${avatar({ initials: s.initials, tone: 'st2' })}<span><b>${esc(s.name)}</b><small>${esc(s.number)} · ${esc(s.previousUniversity)}</small></span>${badge(s.status)}</button>`).join('')}` : '')
    + (r.courses.length ? `<div class="gh">Courses</div>${r.courses.map((c) => `<button class="gi" data-gcase="${c.applicationId}" data-gcourse="${c.courseEvaluationId}"><span class="gic">${I.book}</span><span><b class="mono">${esc(c.code)} → ${esc(c.target)}</b><small>${esc(c.student)} · ${esc(c.institution)}</small></span>${badge(c.status)}</button>`).join('')}` : '')
    + (r.evaluators.length ? `<div class="gh">Evaluators</div>${r.evaluators.map((e) => `<button class="gi" data-gteam="1">${avatar(e)}<span><b>${esc(e.name)}</b><small>${esc(e.department)}</small></span></button>`).join('')}` : '')
    || `<div class="gempty">No results for “${esc(q)}”</div>`;
  box.hidden = false;
  $$('[data-gcase]', box).forEach((b) => { b.onclick = () => { box.hidden = true; $('#gsearch').value = ''; app.openCase(b.dataset.gcase, b.dataset.gcourse); }; });
  $$('[data-gteam]', box).forEach((b) => { b.onclick = () => { box.hidden = true; app.go(state.user.role === 'admin' ? 'settings' : 'team'); }; });
}

/* ------------------------------------------------------------------ */
/* transcript viewer                                                     */
/* ------------------------------------------------------------------ */
async function openTranscript(applicationId) {
  const m = $('#txmodal');
  $('#txbody').innerHTML = skeleton('list');
  m.hidden = false;
  try {
    const t = state.user.role === 'student' ? await api.get('/students/me/transcript') : await api.get(`/evaluations/${applicationId}/transcript`);
    $('#txbody').innerHTML = transcriptHTML(t);
  } catch (e) { $('#txbody').innerHTML = errorBox(e); }
  $('#txclose').focus();
}

/* ------------------------------------------------------------------ */
/* sign-in                                                              */
/* ------------------------------------------------------------------ */
const ROLE_COPY = {
  student: ['Student sign in', 'See your transfer request, upload a transcript and follow every course.'],
  evaluator: ['Evaluator sign in', 'Review AI recommendations, reuse approved equivalencies and decide courses.'],
  admin: ['Administrator sign in', 'Manage the equivalency knowledge base, evaluation policy and routing.'],
};
const ROLE_ICON = { student: 'cap', evaluator: 'book', admin: 'gear' };
const savedRole = () => { try { return localStorage.getItem('tc.role'); } catch { return null; } };

function chooseRole(role) {
  state.loginRole = role;
  try { if (role) localStorage.setItem('tc.role', role); } catch { /* storage unavailable */ }
  $('#lrole').hidden = !!role;
  $('#lformwrap').hidden = !role;
  if (!role) { $$('.lrc')[0]?.focus(); return; }
  const [title, sub] = ROLE_COPY[role];
  $('#lformtitle').textContent = title;
  $('#lformsub').textContent = sub;
  $('#lrolechip').innerHTML = `<span class="lchip r-${role}">${I[ROLE_ICON[role]]}${esc(ROLE_LABEL[role])}</span>`;
  $('#lerr').hidden = true;
  renderDemoAccounts(role);
  $('#lemail').focus();
}

function renderDemoAccounts(role) {
  const d = state.cache.demo;
  const box = $('#ldemo');
  if (!d) { box.hidden = true; return; }
  const list = d.accounts.filter((a) => a.role === role);
  box.innerHTML = `<div class="ldh"><b>Demo accounts</b><span class="xdemo">Synthetic Data</span></div><p class="xmuted">Password for every demo account: <code>${esc(d.password)}</code>. Select one to sign in.</p>
    <div class="ldg">${list.map((a) => `<button class="lda" data-email="${esc(a.email)}"><b>${esc(a.name)}</b><small title="${esc(a.detail)}">${esc(a.detail)}</small></button>`).join('')}</div>`;
  box.hidden = !list.length;
  $$('[data-email]', box).forEach((b) => { b.onclick = () => { $('#lemail').value = b.dataset.email; $('#lpass').value = d.password; signIn(); }; });
}

async function showLogin(msg) {
  state.user = null;
  $('#app').hidden = true;
  $('#login').hidden = false;
  document.title = 'Sign in · Transfer Credit Intelligence';
  try { state.cache.demo = await api.demoAccounts(); } catch { state.cache.demo = null; }
  chooseRole(msg ? state.loginRole || savedRole() : null);
  $('#lerr').hidden = !msg;
  if (msg) $('#lerr').textContent = msg;
}

const ARTICLE = { student: 'a student', evaluator: 'an evaluator', admin: 'an administrator' };
async function signIn() {
  const email = $('#lemail').value.trim();
  const pw = $('#lpass').value;
  if (!email || !pw) { $('#lerr').textContent = 'Enter your email and password.'; $('#lerr').hidden = false; return; }
  $('#lsubmit').disabled = true;
  try {
    const user = await api.login(email, pw);
    if (state.loginRole && user.role !== state.loginRole) {
      await api.logout();
      $('#lerr').textContent = `This is ${ARTICLE[user.role]} account. Choose “${ROLE_LABEL[user.role]}” to sign in with it.`;
      $('#lerr').hidden = false;
      return;
    }
    await enter(user);
  } catch (e) {
    $('#lerr').textContent = e.message; $('#lerr').hidden = false;
  } finally { $('#lsubmit').disabled = false; }
}

export async function switchAccount(email) {
  const d = state.cache.demo || await api.demoAccounts();
  await api.logout();
  const user = await api.login(email, d.password);
  state.open = {}; state.draft = {}; state.qf = { q: '', status: 'open', priority: 'all', subject: 'all', category: '' };
  state.cache.navCounts = {}; state.cache.unread = 0;
  await enter(user, { keepHash: true });
  return user;
}
app.switchAccount = switchAccount;

async function enter(user, { keepHash = false } = {}) {
  state.user = user;
  $('#login').hidden = true;
  $('#app').hidden = false;
  try { state.cache.demo = state.cache.demo || await api.demoAccounts(); } catch { state.cache.demo = null; }
  $('#demobtn').hidden = !state.cache.demo;
  $('#switchwrap').hidden = !state.cache.demo;
  if (state.cache.demo) {
    $('#switchacct').innerHTML = `<option value="">Choose an account…</option>${state.cache.demo.accounts.map((a) => `<option value="${esc(a.email)}" ${a.email === user.email ? 'selected' : ''}>${esc(a.name)} — ${esc(a.role === 'evaluator' ? a.detail.split(' · ')[1] : a.role)}</option>`).join('')}`;
  }
  if (!keepHash || !PAGES[user.role][parseHash().page]) location.hash = '#/dashboard';
  state.loginRole = user.role;
  await app.render();
  app.refreshShell();
}

/* ------------------------------------------------------------------ */
/* events                                                               */
/* ------------------------------------------------------------------ */
function bindShell() {
  $('#loginform').addEventListener('submit', (e) => { e.preventDefault(); signIn(); });
  $$('.lrc').forEach((b) => { b.onclick = () => chooseRole(b.dataset.role); });
  $('#lback').onclick = () => chooseRole(null);
  $('#sbcol').onclick = () => { state.sbCollapsed = !state.sbCollapsed; syncShell(); };
  $('#tbmenu').onclick = () => $('#app').classList.toggle('sbopen');
  $('#bell').onclick = () => ($('#notifs').hidden ? openNotifs() : closeDrawers());
  $('#demobtn').onclick = () => ($('#demo').hidden ? openDemo() : closeDrawers());
  $('#scrim').onclick = closeDrawers;
  $('#profbtn').onclick = (e) => { e.stopPropagation(); const m = $('#pmenu'); m.hidden = !m.hidden; $('#profbtn').setAttribute('aria-expanded', String(!m.hidden)); };
  $('#srcbtn').onclick = () => { state.showSrc = !state.showSrc; app.render(); };
  $('#logout').onclick = async () => { await api.logout(); location.hash = ''; showLogin(); };
  $('#switchacct').onchange = async (e) => {
    if (!e.target.value) return;
    $('#pmenu').hidden = true;
    try { await switchAccount(e.target.value); toast(`Signed in as ${state.user.fullName}.`); } catch (err) { toast(err.message, 'error'); }
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.prof')) { $('#pmenu').hidden = true; $('#profbtn').setAttribute('aria-expanded', 'false'); }
    if (!e.target.closest('.tbsearch')) $('#gres').hidden = true;
    const t = e.target.closest('[data-tx]');
    if (t) openTranscript(t.dataset.tx);
    if (e.target.id === 'txclose' || e.target.id === 'txmodal') $('#txmodal').hidden = true;
  });
  $('#gsearch').oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => globalSearch(e.target.value), 200); };
  $('#gsearch').onkeydown = (e) => { if (e.key === 'Escape') { $('#gres').hidden = true; e.target.blur(); } if (e.key === 'Enter') $('#gres .gi')?.click(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#txmodal').hidden) $('#txmodal').hidden = true; else closeDrawers(); }
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && state.user && state.user.role !== 'student') { e.preventDefault(); $('#gsearch').focus(); }
  });
  onUnauthorized(() => showLogin('Your session has ended. Sign in again.'));
  setInterval(() => { if (state.user && !document.hidden) app.refreshShell(); }, 30000);
}

async function boot() {
  bindShell();
  loadSession();
  if (!hasSession()) return showLogin();
  try {
    const { user } = await api.me();
    await enter(user, { keepHash: true });
  } catch {
    clearSession();
    showLogin();
  }
}
boot();
