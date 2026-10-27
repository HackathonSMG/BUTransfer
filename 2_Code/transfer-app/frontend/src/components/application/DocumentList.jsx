import React from 'react'
import toast from 'react-hot-toast'
import { FileText, Image, File, Download, Calendar } from 'lucide-react'
import client from '../../api/client'

const DOC_TYPE_LABELS = {
  transcript: 'Official Transcript',
  id: 'Government ID',
  identification: 'Government ID',
  syllabus: 'Course Syllabus',
  personal_statement: 'Personal Statement',
  recommendation: 'Recommendation Letter',
  supporting: 'Supporting Document',
  other: 'Supporting Document'
}

// Documents are private; fetch a short-lived signed URL (staff JWT, or the student's secure token)
async function openDocument(doc, token) {
  // Open the tab synchronously so popup blockers allow it
  const tab = window.open('', '_blank')
  try {
    const { data } = await client.get(`/documents/${doc.id}`, { params: token ? { token } : undefined })
    tab.location.href = data.data.download_url
  } catch {
    tab?.close()
    toast.error('Could not open document')
  }
}

function getFileIcon(fileName, docType) {
  if (!fileName) return File
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return Image
  if (['pdf', 'doc', 'docx'].includes(ext)) return FileText
  return File
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dateStr))
}

export default function DocumentList({ documents = [], emptyText = 'No documents uploaded', token }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc, i) => {
        const Icon = getFileIcon(doc.file_name || doc.original_name, doc.document_type)
        return (
          <div
            key={doc.id || i}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-gray-500" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {doc.original_name || doc.file_name || 'Unnamed Document'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">
                  {DOC_TYPE_LABELS[doc.document_type] || doc.document_type || 'Document'}
                </span>
                {(doc.uploaded_at || doc.created_at) && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(doc.uploaded_at || doc.created_at)}
                  </span>
                )}
              </div>
            </div>

            {(doc.file_url || doc.url) ? (
              <a
                href={doc.file_url || doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            ) : doc.id && (
              <button
                type="button"
                onClick={() => openDocument(doc, token)}
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
                title="Open"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
