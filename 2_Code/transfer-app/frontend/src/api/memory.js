import client from './client'

// Equivalency knowledge base: approved equivalencies, past decisions (precedents) and reuse stats
export const getMemory = () =>
  client.get('/memory').then(r => r.data)
