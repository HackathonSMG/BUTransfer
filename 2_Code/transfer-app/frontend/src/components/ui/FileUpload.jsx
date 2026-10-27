import React, { useState, useRef } from 'react'
import { Upload, File, X, CheckCircle } from 'lucide-react'

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'

export default function FileUpload({
  onFileSelect,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 10,
  label = 'Upload File',
  multiple = false,
  className = ''
}) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const validateFile = (file) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File "${file.name}" exceeds ${maxSizeMB}MB limit`
    }
    return null
  }

  const handleFiles = (files) => {
    const fileArray = Array.from(files)
    const errors = fileArray.map(validateFile).filter(Boolean)
    if (errors.length > 0) {
      setError(errors[0])
      return
    }
    setError('')
    if (multiple) {
      const newFiles = [...selectedFiles, ...fileArray]
      setSelectedFiles(newFiles)
      onFileSelect && onFileSelect(newFiles)
    } else {
      setSelectedFiles([fileArray[0]])
      onFileSelect && onFileSelect(fileArray[0])
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  const removeFile = (index) => {
    const updated = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(updated)
    onFileSelect && onFileSelect(multiple ? updated : null)
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <p className="text-sm font-medium text-gray-700">{label}</p>}

      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${dragOver
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">
          {dragOver ? 'Drop file here' : 'Click or drag & drop to upload'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Accepted: PDF, DOC, DOCX, JPG, PNG — Max {maxSizeMB}MB
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
