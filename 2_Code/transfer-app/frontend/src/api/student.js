import client from './client'


export const submitApplication = (application) =>
  client.post('/student/applications', application).then(r => r.data)

export const getApplicationStatus = (token) =>
  client.get(`/student/status/${token}`).then(r => r.data)

export const uploadStudentDocument = (token, file, documentType) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('document_type', documentType)
  return client.post(`/student/applications/${token}/documents`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export const getStudentNotifications = (token) =>
  client.get(`/student/status/${token}/notifications`).then(r => r.data)

export const respondToInfoRequest = (token, requestId, data) =>
  client.post(`/student/status/${token}/info-requests/${requestId}/respond`, data).then(r => r.data)

// Answer a course request with a file (e.g. the syllabus) and an optional note
export const uploadInfoResponse = (token, requestId, file, response = '') => {
  const fd = new FormData()
  fd.append('file', file)
  if (response) fd.append('response', response)
  return client.post(`/student/status/${token}/info-requests/${requestId}/respond`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

// Self-check: guidance before applying, not an official decision
export const getSelfCheckInstitutions = () =>
  client.get('/student/self-check/institutions').then(r => r.data)

export const runSelfCheck = (body) =>
  client.post('/student/self-check', body).then(r => r.data)

// Student portal (signed-in student)
export const getMyApplications = () =>
  client.get('/student/me/applications').then(r => r.data)

// Starts an application as a draft so documents can be attached before it is submitted
export const startApplication = (application) =>
  client.post('/student/applications', { ...application, draft: true }).then(r => r.data)

export const submitDraftApplication = (token) =>
  client.post(`/student/applications/${token}/submit`).then(r => r.data)

// ── Applicant intake and tracking (no account) ──

// Masked numbers of submitted applications for this email (see the backend tracking service)
export const checkExistingApplications = (email) =>
  client.post('/student/applications/check-email', { email }).then(r => r.data)

// Emails the address the full numbers of its applications
export const emailApplicationNumbers = (email) =>
  client.post('/student/applications/email-numbers', { email }).then(r => r.data)

// Application number + email -> { reference_number, access_token }
export const trackApplication = (applicationNumber, email) =>
  client.post('/student/track', { application_number: applicationNumber, email }).then(r => r.data)

export const updateDraftApplication = (token, fields) =>
  client.patch(`/student/applications/${token}`, fields).then(r => r.data)

export const removeDraftDocument = (token, documentId) =>
  client.delete(`/student/applications/${token}/documents/${documentId}`)

// Upload with progress (0-100) reported to onProgress
export const uploadApplicationDocument = (token, file, documentType, onProgress) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('document_type', documentType)
  return client.post(`/student/applications/${token}/documents`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => { if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
  }).then(r => r.data)
}

export const submitApplicationForEvaluation = (token, applicantComments) =>
  client.post(`/student/applications/${token}/submit`, { applicant_comments: applicantComments || null }).then(r => r.data)
