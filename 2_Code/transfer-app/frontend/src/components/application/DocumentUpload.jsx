import React, { useState } from 'react'
import notify from '../../lib/notify'
import FileUpload from '../ui/FileUpload'
import Select from '../ui/Select'
import Button from '../ui/Button'

const DOCUMENT_TYPES = [
  { value: 'transcript', label: 'Official Transcript' },
  { value: 'identification', label: 'Government-Issued ID' },
  { value: 'syllabus', label: 'Course Syllabus' },
  { value: 'supporting', label: 'Personal Statement / Recommendation Letter' },
  { value: 'other', label: 'Other Supporting Document' }
]

export default function DocumentUpload({ onUpload, uploading = false }) {
  const [file, setFile] = useState(null)
  const [docType, setDocType] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file to upload')
      return
    }
    if (!docType) {
      setError('Please select a document type')
      return
    }
    setError('')
    try {
      await onUpload(file, docType)
      setFile(null)
      setDocType('')
      notify.success('Document uploaded successfully')
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to upload document')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label="Document Type"
        required
        options={DOCUMENT_TYPES}
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        placeholder="Select document type..."
      />

      <FileUpload
        label="Select File"
        onFileSelect={setFile}
        maxSizeMB={20}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Button
        type="submit"
        loading={uploading}
        disabled={!file || !docType || uploading}
        className="w-full"
      >
        Upload Document
      </Button>
    </form>
  )
}
