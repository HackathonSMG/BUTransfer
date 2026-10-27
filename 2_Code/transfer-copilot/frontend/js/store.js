/**
 * UI state (view state only — business data always comes from the API) and the app-level actions
 * pages can call. app.js fills in the functions at start-up.
 */
export const state = {
  user: null,
  page: 'dashboard',
  params: {},
  showSrc: false,
  sbCollapsed: false,
  qf: { q: '', status: 'open', priority: 'all', subject: 'all', category: '' },
  qSort: '', qDir: 'desc',
  cq: '',
  open: {}, // expanded one-line courses on the case page
  draft: {}, // unsent comments per course
  focusCourse: null,
  disagree: null, overrideFor: null, askOpen: false,
  rqTab: 'courses',
  caseOpenedAt: {},
  demo: {},
  letter: false, chat: [],
  sim: { perYear: 800, uniq: 30000, manual: 30, ai: 10 },
  cache: {},
  loginRole: null,
  kb: { q: '', status: 'active', origin: 'all', institution: '', tab: 'library' },
};

export const app = {
  go: () => {},
  render: () => {},
  openCase: () => {},
  refreshShell: () => {},
  setTitle: () => {},
};

export const NAVS = {
  student: [['dashboard', 'Dashboard', 'dash'], ['upload', 'Upload transcript', 'up'], ['courses', 'Course evaluations', 'list'], ['degree', 'Degree plan', 'cap'], ['transcript', 'Transcript', 'doc']],
  evaluator: [['dashboard', 'Dashboard', 'dash'], ['queue', 'My evaluations', 'list'], ['requests', 'Transfer requests', 'folder'], ['students', 'Students', 'users'], ['knowledge', 'Knowledge base', 'brain'], ['courses', 'Courses', 'book'], ['team', 'Team & routing', 'route']],
  admin: [['dashboard', 'Dashboard', 'dash'], ['knowledge', 'Knowledge base', 'brain'], ['requests', 'Transfer requests', 'folder'], ['reports', 'Reports', 'chart'], ['courses', 'Courses', 'book'], ['scenarios', 'Scenarios & validation', 'play'], ['settings', 'Settings', 'gear']],
};
export const ROLE_LABEL = { student: 'Student', evaluator: 'Evaluator', admin: 'Administrator' };
