import client from './client'

// The signed-in evaluator's own workspace (the API scopes everything to the current user)
export const getMyDashboard = () =>
  client.get('/my/dashboard').then(r => r.data)

export const getMyReviews = (params = {}) =>
  client.get('/my/reviews', { params }).then(r => r.data)

export const getReview = (id) =>
  client.get(`/my/reviews/${id}`).then(r => r.data)

export const startReview = (id) =>
  client.post(`/my/reviews/${id}/start`).then(r => r.data)

// payload: { decision: equivalent | different_course | elective | no_credit, reason, bu_course, elective_label, units, conflict_action }
export const decideReview = (id, payload) =>
  client.post(`/my/reviews/${id}/decision`, payload).then(r => r.data)

// The same payload as decideReview, checked against the institution's record; records nothing
export const checkReviewDecision = (id, payload) =>
  client.post(`/my/reviews/${id}/check`, payload).then(r => r.data)

// kind: 'syllabus' asks the student for the course syllabus; 'information' for anything else
export const requestReviewInfo = (id, message, kind = 'information') =>
  client.post(`/my/reviews/${id}/request-info`, { message, kind }).then(r => r.data)

// BU catalog search for choosing a different BU course
export const searchBuCourses = (search) =>
  client.get('/my/bu-courses', { params: { search } }).then(r => r.data)

// Short-lived link to an uploaded document (the transcript PDF)
export const getDocumentLink = (documentId) =>
  client.get(`/documents/${documentId}`).then(r => r.data)

export const escalateReview = (id, note) =>
  client.post(`/my/reviews/${id}/escalate`, { note }).then(r => r.data)
