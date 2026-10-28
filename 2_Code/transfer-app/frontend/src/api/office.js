import client from './client'

// Credit Evaluation Office workspace (credit office staff and administrators; enforced by the API)
export const getOfficeOverview = () =>
  client.get('/office/overview').then(r => r.data)

export const getOfficeApplication = (id) =>
  client.get(`/office/applications/${id}`).then(r => r.data)

export const postCredit = (id) =>
  client.post(`/office/applications/${id}/post`).then(r => r.data)

export const recordDeadlineException = (id, reason) =>
  client.post(`/office/applications/${id}/deadline-exception`, { reason }).then(r => r.data)

// action: keep_separate | close_duplicate
export const resolveDuplicate = (id, action, note) =>
  client.post(`/office/applications/${id}/duplicate`, { action, note }).then(r => r.data)

export const getEligibleEvaluators = (reviewId) =>
  client.get(`/office/reviews/${reviewId}/eligible-evaluators`).then(r => r.data)

// evaluatorId: an evaluator's id, 'auto' for the best eligible evaluator, or null for the office queue
export const assignReview = (reviewId, evaluatorId, note) =>
  client.post(`/office/reviews/${reviewId}/assign`, { evaluator_id: evaluatorId, note }).then(r => r.data)

export const placeOfficeQueue = () =>
  client.post('/office/queue/place').then(r => r.data)

export const getOfficeEvaluators = () =>
  client.get('/office/evaluators').then(r => r.data)

export const setEvaluatorAvailability = (id, availability, until) =>
  client.post(`/office/evaluators/${id}/availability`, { availability, until: until || null }).then(r => r.data)

export const reassignOpenWork = (id) =>
  client.post(`/office/evaluators/${id}/reassign-open`).then(r => r.data)

export const resolveConflict = (body) =>
  client.post('/admin/conflicts/resolve', body).then(r => r.data)

// One-off after deploying: brings applications evaluated earlier into the lifecycle (safe to repeat)
export const processExistingApplications = () =>
  client.post('/office/process-existing').then(r => r.data)

// Final review: send a course's decision back to the evaluator before it is posted
export const returnToEvaluator = (transcriptCourseId, reason) =>
  client.post(`/office/courses/${transcriptCourseId}/return`, { reason }).then(r => r.data)
