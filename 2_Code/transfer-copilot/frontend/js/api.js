/**
 * REST client for the Node.js API. The browser only ever holds the user's own Supabase Auth session
 * (access + refresh token); it never sees database credentials or the service-role key.
 */
const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';
const KEY = 'tc.session';
let session = null;

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v) { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export function loadSession() { session = store.get(); return session; }
export function setSession(s) { session = s; store.set(s); }
export function clearSession() { session = null; store.set(null); }
export const hasSession = () => !!session?.accessToken;

let refreshing = null;
async function refresh() {
  if (!session?.refreshToken) return false;
  refreshing = refreshing || fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) })
    .then(async (r) => { if (!r.ok) return false; const b = await r.json(); setSession({ ...b.session, user: b.user }); return true; })
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

/** Called when the session can no longer be refreshed. */
let onSignedOut = () => {};
export const onUnauthorized = (fn) => { onSignedOut = fn; };

export async function request(method, path, body, { retry = true, form = false } = {}) {
  const headers = {};
  if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  if (body !== undefined && !form) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { error: { message: 'Cannot reach the server. Check your connection and that the API is running.' } });
  }
  if (res.status === 401 && retry && session?.refreshToken && !path.startsWith('/auth/')) {
    if (await refresh()) return request(method, path, body, { retry: false, form });
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) { clearSession(); onSignedOut(); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  upload: (p, file) => { const fd = new FormData(); fd.append('file', file); return request('POST', p, fd, { form: true }); },

  async login(email, password) {
    const b = await request('POST', '/auth/login', { email, password }, { retry: false });
    setSession({ ...b.session, user: b.user });
    return b.user;
  },
  async logout() {
    try { await request('POST', '/auth/logout', undefined, { retry: false }); } catch { /* already signed out */ }
    clearSession();
  },
  me: () => request('GET', '/auth/me'),
  /** Binary download with the user's token (e.g. the original transcript for verification). */
  async blob(path) {
    const res = await fetch(`${BASE}${path}`, { headers: session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {} });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res.blob();
  },
  /** Multipart upload with progress (XHR: fetch has no upload progress). Retries once after a token refresh. */
  uploadWithProgress(path, file, fields = {}, onProgress = () => {}, retry = true) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => { if (v != null) fd.append(k, v); });
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}${path}`);
      if (session?.accessToken) xhr.setRequestHeader('authorization', `Bearer ${session.accessToken}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onerror = () => reject(new ApiError(0, { error: { message: 'Cannot reach the server. Check your connection and try again.' } }));
      xhr.onload = async () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* empty body */ }
        if (xhr.status === 401 && retry && await refresh()) { resolve(api.uploadWithProgress(path, file, fields, onProgress, false)); return; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body); else reject(new ApiError(xhr.status, body));
      };
      xhr.send(fd);
    });
  },
  demoAccounts: () => request('GET', '/auth/demo-accounts', undefined, { retry: false }),
};

export const qs = (o) => {
  const p = Object.entries(o || {}).filter(([k, v]) => v !== undefined && v !== null && v !== '' && (v !== 'all' || k === 'status')).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return p.length ? `?${p.join('&')}` : '';
};
