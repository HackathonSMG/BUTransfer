import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Layout from './components/layout/Layout'

import Home from './pages/Home'
import EligibilityCheck from './pages/student/EligibilityCheck'
import ApplicationForm from './pages/student/ApplicationForm'
import ApplicationConfirmation from './pages/student/ApplicationConfirmation'
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
import NotFound from './pages/NotFound'

// /evaluator is the evaluator's dashboard; older links that sent admins here now go to the applications list
function EvaluatorHome() {
  const { user } = useAuth()
  const { search } = useLocation()
  if (user?.role === 'admin') return <Navigate to={`/admin/applications${search}`} replace />
  return <Layout><MyDashboard /></Layout>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/apply" element={<Layout><ApplicationForm /></Layout>} />
        <Route path="/apply/confirm" element={<Layout><ApplicationConfirmation /></Layout>} />
        <Route path="/status/:token" element={<Layout><ApplicationStatus /></Layout>} />
        <Route path="/eligibility" element={<Layout><EligibilityCheck /></Layout>} />
        <Route path="/login" element={<Layout><Login /></Layout>} />

        {/* Evaluator workspace; admins who land on /evaluator go to the admin applications list */}
        <Route
          path="/evaluator"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
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
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <Layout>
                <Equivalencies />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/applications/:id"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <Layout>
                <ApplicationDetail />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Admin protected routes */}
        <Route
          path="/admin/applications"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
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
