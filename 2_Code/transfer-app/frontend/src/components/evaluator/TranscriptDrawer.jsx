import React, { useEffect, useState } from 'react'
import { X, FileText, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDocumentLink } from '../../api/my'

// Side panel with the transcript as it was read: every course by institution and term, the course under review
// highlighted, and the original PDF one click away (opened in a new tab; the portal doesn't embed documents).
export default function TranscriptDrawer({ open, onClose, student, courses, documents, highlightCode, highlightInstitution }) {
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const byInstitution = courses.reduce((acc, c) => {
    (acc[c.institution] = acc[c.institution] || []).push(c)
    return acc
  }, {})
  // Transcripts first, then the student's supporting documents (syllabi, course descriptions)
  const transcripts = [...documents].sort((a, b) => (a.document_type === 'transcript' ? 0 : 1) - (b.document_type === 'transcript' ? 0 : 1))

  const openOriginal = async (doc) => {
    setOpening(doc.id)
    try {
      const res = await getDocumentLink(doc.id)
      window.open(res.data.download_url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err.response?.data?.message || 'The document could not be opened')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Transcript">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[min(560px,92vw)] bg-white shadow-pop flex flex-col">
        <div className="flex items-start gap-3 px-6 py-5 border-b border-staff-line">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-staff-muted">Transcript</p>
            <h2 className="font-display text-[22px] font-semibold text-staff-ink leading-tight">{student}</h2>
            <p className="text-[13px] text-staff-ink2 mt-0.5">{Object.keys(byInstitution).join(' · ') || 'No courses read'}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-staff-muted hover:bg-staff-sunk" aria-label="Close transcript">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {transcripts.length > 0 && (
            <div className="space-y-2">
              {transcripts.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => openOriginal(doc)}
                  disabled={opening === doc.id}
                  className="w-full flex items-center gap-3 rounded-lg border border-staff-line px-4 py-3 text-left hover:bg-staff-bg disabled:opacity-60"
                >
                  <FileText className="w-5 h-5 text-staff-muted flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-staff-ink truncate">{doc.file_name}</span>
                    <span className="block text-[12.5px] text-staff-muted">{doc.document_type === 'transcript' ? 'Transcript' : doc.document_type === 'syllabus' ? 'Syllabus' : 'Supporting document'}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[13px] font-semibold text-primary-700">
                    {opening === doc.id ? 'Opening…' : 'Open'}<ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {Object.entries(byInstitution).map(([institution, rows]) => (
            <section key={institution}>
              <h3 className="text-[15px] font-semibold text-staff-ink mb-2">{institution}</h3>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="text-left staff-eyebrow">
                    <th className="py-2 pr-3 font-semibold">Term</th>
                    <th className="py-2 pr-3 font-semibold">Course</th>
                    <th className="py-2 pr-3 font-semibold text-right">Credits</th>
                    <th className="py-2 font-semibold text-right">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-staff-line2">
                  {rows.map(c => {
                    const current = c.course_code === highlightCode && c.institution === highlightInstitution
                    return (
                      <tr key={c.id} className={current ? 'bg-primary-50' : ''}>
                        <td className="py-2.5 pr-3 text-staff-muted whitespace-nowrap align-top">{c.term || '—'}</td>
                        <td className="py-2.5 pr-3 align-top">
                          <span className={`font-mono ${current ? 'font-semibold text-primary-800' : 'text-staff-ink'}`}>{c.course_code}</span>
                          <span className="block text-staff-ink2">{c.title}</span>
                          {current && <span className="block text-[12px] font-semibold text-primary-700 mt-0.5">Under review</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums align-top">{c.source_credits != null ? Number(c.source_credits) : '—'}</td>
                        <td className="py-2.5 text-right font-semibold align-top">{c.grade || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}
