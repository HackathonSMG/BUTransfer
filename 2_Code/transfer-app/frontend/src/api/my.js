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

export const decideReview = (id, decision, reason) =>
  client.post(`/my/reviews/${id}/decision`, { decision, reason }).then(r => r.data)

export const requestReviewInfo = (id, message) =>
  client.post(`/my/reviews/${id}/request-info`, { message }).then(r => r.data)

// Short-lived link to an uploaded document (the transcript PDF)
export const getDocumentLink = (documentId) =>
  client.get(`/documents/${documentId}`).then(r => r.data)

export const escalateReview = (id, note) =>
  client.post(`/my/reviews/${id}/escalate`, { note }).then(r => r.data)
