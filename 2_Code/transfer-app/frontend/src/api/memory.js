import client from './client'

// Equivalency knowledge base: approved equivalencies, past decisions (precedents) and reuse stats
export const getMemory = () =>
  client.get('/memory').then(r => r.data)

// Equivalency management: proposals (evaluators), approval / direct add (Credit Evaluation Office, admin), import (admin)
export const getProposals = (status) =>
  client.get('/memory/proposals', { params: status ? { status } : {} }).then(r => r.data)

// { institution, course_code, title?, outcome: 'BU equivalent' | 'Elective credit' | 'No credit', bu_course?, note?, review_id? }
export const proposeEquivalency = (payload) =>
  client.post('/memory/proposals', payload).then(r => r.data)

export const approveProposal = (id, note) =>
  client.post(`/memory/proposals/${id}/approve`, { note: note || null }).then(r => r.data)

export const rejectProposal = (id, reviewNote) =>
  client.post(`/memory/proposals/${id}/reject`, { review_note: reviewNote }).then(r => r.data)

// Same payload as proposeEquivalency, plus replace: true to replace a different active equivalency
export const addEquivalency = (payload) =>
  client.post('/memory/equivalencies', payload).then(r => r.data)

// kind: 'equivalency' | 'precedent'; status: 'active' | 'revoked'
export const setMemoryStatus = (kind, id, status) =>
  client.put(`/memory/${kind}/${encodeURIComponent(id)}/status`, { status }).then(r => r.data)

export const searchMemoryBuCourses = (search) =>
  client.get('/memory/bu-courses', { params: { search } }).then(r => r.data)

export const previewEquivalencyImport = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post('/memory/equivalencies/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

export const commitEquivalencyImport = (rows, updateExisting) =>
  client.post('/memory/equivalencies/import/commit', { rows, update_existing: !!updateExisting }).then(r => r.data)
