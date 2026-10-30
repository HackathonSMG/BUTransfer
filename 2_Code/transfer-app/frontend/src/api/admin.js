import client from './client'

export const getReports = () =>
  client.get('/admin/reports').then(r => r.data)

export const getAuditLogs = (params = {}) =>
  client.get('/admin/audit-logs', { params }).then(r => r.data)

export const getCriteria = () =>
  client.get('/admin/criteria').then(r => r.data)

export const createCriterion = (data) =>
  client.post('/admin/criteria', data).then(r => r.data)

export const updateCriterion = (id, data) =>
  client.put(`/admin/criteria/${id}`, data).then(r => r.data)

export const deleteCriterion = (id) =>
  client.delete(`/admin/criteria/${id}`).then(r => r.data)

export const getEvaluators = () =>
  client.get('/evaluators').then(r => r.data)

export const createEvaluator = (data) =>
  client.post('/evaluators', data).then(r => r.data)

export const updateEvaluator = (id, data) =>
  client.put(`/evaluators/${id}`, data).then(r => r.data)

export const getOverview = () =>
  client.get('/admin/overview').then(r => r.data)

export const assignPendingApplications = () =>
  client.post('/evaluators/assign-pending').then(r => r.data)

export const importStaffRoster = (initialPassword) =>
  client.post('/evaluators/import', { initial_password: initialPassword }).then(r => r.data)

export const getStats = () =>
  client.get('/admin/stats').then(r => r.data)

export const getEvaluatorProfile = (id) =>
  client.get(`/evaluators/${id}/profile`).then(r => r.data)

export const getConflicts = () =>
  client.get('/admin/conflicts').then(r => r.data)

export const recordStandardEquivalency = (body) =>
  client.post('/admin/conflicts/standard', body).then(r => r.data)

// Process counts for a period and a BU start term: { term?, from?, to? } (dates YYYY-MM-DD, inclusive)
export const getAdminCounts = (params = {}) =>
  client.get('/admin/counts', { params }).then(r => r.data)

// Staff accounts: { role: 'evaluator' | 'credit_office', email, full_name, password?, ...evaluator fields }
export const createStaffMember = (data) =>
  client.post('/admin/staff', data).then(r => r.data)

export const getCreditOfficeStaff = () =>
  client.get('/admin/staff', { params: { role: 'credit_office' } }).then(r => r.data)

// { full_name?, is_active? }
export const updateCreditOfficeStaff = (id, data) =>
  client.put(`/admin/staff/${id}`, data).then(r => r.data)
