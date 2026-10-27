import React from 'react'

export default function Select({
  label,
  error,
  required = false,
  options = [],
  placeholder = 'Select...',
  className = '',
  id,
  ...rest
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors bg-white
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
          }
          disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
        `}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
