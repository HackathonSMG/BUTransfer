import client from './client'

// The signed-in evaluator's own workspace (the API scopes everything to the current user)
export const getMyDashboard = () =>
  client.get('/my/dashboard').then(r => r.data)

export const getMyReviews = (params = {}) =>
  client.get('/my/reviews', { params }).then(r => r.data)
