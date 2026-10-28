import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import ApplicationTracker from '../../components/applicant/ApplicationTracker'

// An application opened by its private link (/status/:token, from earlier emails) or from the student portal.
// Applicants normally arrive through Track Application (application number + email) instead.
export default function ApplicationStatus() {
  const { token } = useParams()
  const { user } = useAuth()
  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {user?.role === 'student' && <Link to="/student" className="inline-block text-sm text-gray-500 hover:text-gray-800 mb-4">← My Applications</Link>}
        <ApplicationTracker token={token} />
      </div>
    </div>
  )
}
