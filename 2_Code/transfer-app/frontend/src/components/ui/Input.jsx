import React from 'react'

export default function Input({
  label,
  error,
  required = false,
  helperText,
  className = '',
  id,
  ...rest
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors
          placeholder:text-gray-400
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
          }
          disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
        `}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  )
}
