import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
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
import AdminDashboard from './pages/admin/Dashboard'
import EligibilityCriteria from './pages/admin/EligibilityCriteria'
import AuditLogs from './pages/admin/AuditLogs'
import UserManagement from './pages/admin/UserManagement'
import NotFound from './pages/NotFound'

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

        {/* Evaluator protected routes */}
        <Route
          path="/evaluator"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <Layout>
                <EvaluatorDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluator/applications/new"
          element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <Layout>
                <NewApplication />
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
