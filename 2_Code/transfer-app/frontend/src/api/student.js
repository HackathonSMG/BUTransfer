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
