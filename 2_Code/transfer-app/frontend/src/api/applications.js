import client from './client'

export const listApplications = (params = {}) =>
  client.get('/applications', { params }).then(r => r.data)

export const getApplication = (id) =>
  client.get(`/applications/${id}`).then(r => r.data)

export const createApplication = (data) =>
  client.post('/applications', data).then(r => r.data)

export const triggerEvaluation = (id) =>
  client.post(`/applications/${id}/evaluate`).then(r => r.data)

export const createInfoRequest = (id, data) =>
  client.post(`/applications/${id}/info-request`, data).then(r => r.data)

export const submitDecision = (id, data) =>
  client.post(`/applications/${id}/decision`, data).then(r => r.data)

export const updateStatus = (id, data) =>
  client.put(`/applications/${id}/status`, data).then(r => r.data)

export const getAuditLog = (id) =>
  client.get(`/applications/${id}/audit-log`).then(r => r.data)

export const uploadDocument = (applicationId, file, documentType) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('document_type', documentType)
  fd.append('application_id', applicationId)
  return client.post('/documents', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export const addEvaluatorNote = (id, note) =>
  client.post(`/applications/${id}/notes`, { note }).then(r => r.data)
