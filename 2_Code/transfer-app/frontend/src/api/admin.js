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
