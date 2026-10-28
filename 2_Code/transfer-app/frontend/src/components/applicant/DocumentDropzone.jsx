import React, { useRef, useState } from 'react'
import { UploadCloud, FileText, Image as ImageIcon, X, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { uploadApplicationDocument, removeDraftDocument } from '../../api/student'

// The file types and size the upload API accepts (backend routes/student.js)
export const ACCEPTED = { '.pdf': 'PDF', '.doc': 'Word', '.docx': 'Word', '.jpg': 'JPEG image', '.jpeg': 'JPEG image', '.png': 'PNG image' }
export const MAX_MB = 10

export const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
const kindOf = (name) => ACCEPTED[extOf(name)] || 'File'
let seq = 0

/**
 * Uploads files to a draft application as soon as they are chosen, with per-file progress. The parent owns the
 * list (items/onChange) so other steps can read it. Item: { key, name, size, kind, status, progress, error, documentId, file }
 */
export default function DocumentDropzone({ token, documentType, items, onChange, multiple = true, title, hint, invalid = false }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [rejected, setRejected] = useState('')

  // Always update against the latest list: uploads finish asynchronously
  const latest = useRef(items)
  latest.current = items
  const set = (list) => { latest.current = list; onChange(list) }
  const patch = (key, changes) => set(latest.current.map(i => (i.key === key ? { ...i, ...changes } : i)))

  const upload = async (item) => {
    patch(item.key, { status: 'uploading', progress: 0, error: '' })
    try {
      const { data } = await uploadApplicationDocument(token, item.file, documentType, p => patch(item.key, { progress: p }))
      patch(item.key, { status: 'uploaded', progress: 100, documentId: data.document_id })
    } catch (err) {
      patch(item.key, { status: 'error', error: err.response?.data?.message || err.response?.data?.error?.message || 'The upload did not complete. Try again.' })
    }
  }

  const addFiles = (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const problems = []
    const accepted = []
    for (const f of files) {
      if (!ACCEPTED[extOf(f.name)]) problems.push(`${f.name}: use PDF, Word (DOC, DOCX), JPG or PNG.`)
      else if (f.size > MAX_MB * 1024 * 1024) problems.push(`${f.name} is ${formatSize(f.size)}; the limit is ${MAX_MB} MB.`)
      else if (f.size === 0) problems.push(`${f.name} is empty.`)
      else accepted.push(f)
    }
    setRejected(problems.join(' '))
    const chosen = multiple ? accepted : accepted.slice(0, 1)
    const fresh = chosen.map(f => ({ key: `f${++seq}`, file: f, name: f.name, size: f.size, kind: kindOf(f.name), status: 'queued', progress: 0, error: '' }))
    if (!fresh.length) return
    set([...(multiple ? latest.current : []), ...fresh])
    fresh.forEach(upload)
  }

  const remove = async (item) => {
    if (item.documentId) {
      try { await removeDraftDocument(token, item.documentId) } catch { /* already gone */ }
    }
    set(latest.current.filter(i => i.key !== item.key))
  }

  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      </div>
      {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        className={`mt-3 rounded-xl border-2 border-dashed px-5 py-7 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
          dragOver ? 'border-brand bg-red-50/60' : invalid ? 'border-red-300 bg-red-50/40' : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <UploadCloud className={`w-9 h-9 mx-auto ${dragOver ? 'text-brand' : 'text-gray-400'}`} />
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-semibold text-brand">Choose {multiple ? 'files' : 'a file'}</span> or drag and drop
        </p>
        <p className="text-xs text-gray-500 mt-1">PDF, Word, JPG or PNG · up to {MAX_MB} MB each</p>
        <input ref={inputRef} type="file" className="sr-only" multiple={multiple} accept={Object.keys(ACCEPTED).join(',')}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      {rejected && (
        <p className="mt-2 text-sm text-red-700 flex gap-1.5" role="alert"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{rejected}</p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map(item => (
            <li key={item.key} className={`rounded-lg border px-3.5 py-3 bg-white ${item.status === 'error' ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${item.status === 'uploaded' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {item.kind.includes('image') ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{item.name}</span>
                  <span className="block text-xs text-gray-500">
                    {item.kind} · {formatSize(item.size)}
                    {item.status === 'uploaded' && <span className="text-green-700"> · Uploaded</span>}
                    {item.status === 'uploading' && <span> · Uploading {item.progress}%</span>}
                    {item.status === 'queued' && <span> · Waiting</span>}
                  </span>
                </span>
                {item.status === 'uploaded' && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" aria-label="Uploaded" />}
                {item.status === 'error' && item.file && (
                  <button type="button" onClick={() => upload(item)} className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100" aria-label={`Retry ${item.name}`}>
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                {item.status !== 'uploading' && (
                  <button type="button" onClick={() => remove(item)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${item.name}`}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {(item.status === 'uploading' || item.status === 'queued') && (
                <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-brand transition-all duration-200" style={{ width: `${item.progress}%` }} />
                </div>
              )}
              {item.status === 'error' && <p className="mt-1.5 text-xs text-red-700">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
