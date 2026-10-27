import client from './client'

export const getNotifications = () =>
  client.get('/notifications').then(r => r.data)

export const markRead = (id) =>
  client.put(`/notifications/${id}/read`).then(r => r.data)

export const markAllRead = () =>
  client.put('/notifications/read-all').then(r => r.data)
