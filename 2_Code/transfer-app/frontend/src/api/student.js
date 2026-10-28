import client from './client'

export const checkEligibility = (data) =>
  client.post('/student/eligibility-check', data).then(r => r.data)

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
