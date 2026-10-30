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

// reviewed (optional, transcripts): what was confirmed on the review step, { institution, courses }
export const uploadDocument = (applicationId, file, documentType, reviewed) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('document_type', documentType)
  fd.append('application_id', applicationId)
  if (reviewed) fd.append('reviewed', JSON.stringify(reviewed))
  return client.post('/documents', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export const addEvaluatorNote = (id, note) =>
  client.post(`/applications/${id}/notes`, { note }).then(r => r.data)

// Staff uploading a transcript for a student: create a draft on the student's behalf, attach the files with
// uploadDocument, then submit it (the student receives the confirmation email)
export const createDraftOnBehalf = (data) =>
  client.post('/applications', { ...data, draft: true, on_behalf: true }).then(r => r.data)

export const submitOnBehalf = (id, applicantComments) =>
  client.post(`/applications/${id}/submit`, { applicant_comments: applicantComments || null }).then(r => r.data)
