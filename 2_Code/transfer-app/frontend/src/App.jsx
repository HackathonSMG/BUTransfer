import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Layout from './components/layout/Layout'

import Home from './pages/Home'
import EligibilityCheck from './pages/student/EligibilityCheck'
import EligibilityApplication from './pages/applicant/EligibilityApplication'
import ApplicationSubmitted from './pages/applicant/ApplicationSubmitted'
import TrackApplication from './pages/applicant/TrackApplication'
import ApplicationStatus from './pages/student/ApplicationStatus'
import Login from './pages/auth/Login'
import EvaluatorDashboard from './pages/evaluator/Dashboard'
import ApplicationDetail from './pages/evaluator/ApplicationDetail'
import NewApplication from './pages/evaluator/NewApplication'
import Equivalencies from './pages/evaluator/Equivalencies'
import AdminDashboard from './pages/admin/Dashboard'
import EligibilityCriteria from './pages/admin/EligibilityCriteria'
import AuditLogs from './pages/admin/AuditLogs'
import UserManagement from './pages/admin/UserManagement'
import MyDashboard from './pages/evaluator/MyDashboard'
import MyEvaluations from './pages/evaluator/MyEvaluations'
import MyProfile from './pages/evaluator/MyProfile'
import ReviewDetail from './pages/evaluator/ReviewDetail'
import ApplicationLookup from './pages/evaluator/ApplicationLookup'
import Reports from './pages/admin/Reports'
import Conflicts from './pages/admin/Conflicts'
import NotFound from './pages/NotFound'
import SelfCheck from './pages/student/SelfCheck'
import StudentPortal from './pages/student/StudentPortal'
import OfficeDashboard from './pages/office/OfficeDashboard'
import OfficeApplication from './pages/office/OfficeApplication'

// /evaluator is the evaluator's dashboard; older links that sent admins here now go to the applications list
function EvaluatorHome() {
  const { user } = useAuth()
  const { search } = useLocation()
  if (user?.role === 'admin') return <Navigate to={`/admin/applications${search}`} replace />
  if (user?.role === 'credit_office') return <Navigate to="/office" replace />
  return <Layout><MyDashboard /></Layout>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public applicant routes: no account needed */}
        <Route path="/" element={<Layout isPublic><Home /></Layout>} />
        <Route path="/apply" element={<Layout isPublic><EligibilityApplication /></Layout>} />
        <Route path="/apply/submitted" element={<Layout isPublic><ApplicationSubmitted /></Layout>} />
        <Route path="/apply/confirm" element={<Navigate to="/track" replace />} />
        <Route path="/track" element={<Layout isPublic><TrackApplication /></Layout>} />
        {/* Links from earlier emails: tracking always asks for the application number and email */}
        <Route path="/status/:token" element={<Navigate to="/track" replace />} />
        <Route path="/eligibility" element={<Layout isPublic><EligibilityCheck /></Layout>} />
        <Route path="/self-check" element={<Layout isPublic><SelfCheck /></Layout>} />

        {/* Student portal: applications of student accounts created before applicant-first intake */}
        <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><Layout><StudentPortal /></Layout></ProtectedRoute>} />
        <Route path="/student/applications/:token" element={<ProtectedRoute allowedRoles={['student']}><Layout><ApplicationStatus /></Layout></ProtectedRoute>} />
        <Route path="/login" element={<Layout isPublic><Login /></Layout>} />

        {/* Evaluator workspace; admins who land on /evaluator go to the admin applications list */}
        <Route
          path="/evaluator"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin', 'credit_office']}>
              <EvaluatorHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/my-evaluations"
          element={
            <ProtectedRoute allowedRoles={['evaluator']}>
              <Layout>
                <MyEvaluations />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/reviews/:id"
          element={
            <ProtectedRoute allowedRoles={['evaluator']}>
              <Layout>
                <ReviewDetail />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Application Lookup: where an application is and who has it (evaluators are scoped by the API) */}
        <Route
          path="/evaluator/lookup"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin', 'credit_office']}>
              <Layout>
                <ApplicationLookup />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/profile"
          element={
            <ProtectedRoute allowedRoles={['evaluator']}>
              <Layout>
                <MyProfile />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/applications/new"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <NewApplication />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/equivalencies"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin', 'credit_office']}>
              <Layout>
                <Equivalencies />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/applications/:id"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin', 'credit_office']}>
              <Layout>
                <ApplicationDetail />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Credit Evaluation Office (credit office staff and administrators) */}
        <Route
          path="/office"
          element={
            <ProtectedRoute allowedRoles={['credit_office', 'admin']}>
              <Layout>
                <OfficeDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/office/applications/:id"
          element={
            <ProtectedRoute allowedRoles={['credit_office', 'admin']}>
              <Layout>
                <OfficeApplication />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Admin protected routes */}
        <Route
          path="/admin/conflicts"
          element={
            <ProtectedRoute allowedRoles={['admin', 'credit_office']}>
              <Layout>
                <Conflicts />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/applications"
          element={
            <ProtectedRoute allowedRoles={['admin', 'credit_office']}>
              <Layout>
                <EvaluatorDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <AdminDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/criteria"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <EligibilityCriteria />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <AuditLogs />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout>
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Layout><NotFound /></Layout>} />
      </Routes>
    </AuthProvider>
  )
}
