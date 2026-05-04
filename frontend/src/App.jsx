import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminUsers from './pages/AdminUsers';
import UserManagement from './pages/UserManagement';
import Surveyors from './pages/Surveyors';
import Surveys from './pages/Surveys';
import SurveyBuilder from './pages/SurveyBuilder';
import Responses from './pages/Responses';
import ResponseDetail from './pages/ResponseDetail';
import Reports from './pages/Reports';
import MapView from './pages/MapView';
import AuditLog from './pages/AuditLog';
import Cleanup from './pages/Cleanup';
import SurveyList from './surveyor/pages/SurveyList';
import SurveyForm from './surveyor/pages/SurveyForm';
import SubmitSuccess from './surveyor/pages/SubmitSuccess';

// ─── Protected Route ──────────────────────────────────────────────────────────
/**
 * Wraps a route so that unauthenticated users are redirected to /login.
 * Optionally restricts access to one or more roles.
 *
 * @param {{ children: React.ReactNode, role?: string | string[] }} props
 */
function ProtectedRoute({ children, role }) {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Optional role check
  if (role) {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const allowedRoles = Array.isArray(role) ? role : [role];
      if (!allowedRoles.includes(user.role)) {
        // Redirect to role-specific home page
        const homeByRole = {
          admin: '/dashboard',
          supervisor: '/surveys',
          viewer: '/dashboard',
          surveyor: '/surveyor',
        };
        return <Navigate to={homeByRole[user.role] || '/login'} replace />;
      }
    } catch {
      return <Navigate to="/login" replace />;
    }
  }

  return children;
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Redirect root ke login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Protected admin/supervisor routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* User Management (replaces Admin Users) */}
        <Route
          path="/users"
          element={
            <ProtectedRoute role={['admin', 'supervisor']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />

        {/* Backward compatibility: redirect /admin-users to /users */}
        <Route path="/admin-users" element={<Navigate to="/users" replace />} />

        {/* Survei TPD management */}
        <Route
          path="/surveyors"
          element={
            <ProtectedRoute role={['admin', 'supervisor']}>
              <Surveyors />
            </ProtectedRoute>
          }
        />

        {/* Surveys management */}
        <Route
          path="/surveys"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer', 'surveyor']}>
              <Surveys />
            </ProtectedRoute>
          }
        />

        {/* Survey Builder */}
        <Route
          path="/surveys/:id/builder"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer', 'surveyor']}>
              <SurveyBuilder />
            </ProtectedRoute>
          }
        />

        {/* Responses list */}
        <Route
          path="/responses"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer']}>
              <Responses />
            </ProtectedRoute>
          }
        />

        {/* Response detail */}
        <Route
          path="/responses/:id"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer']}>
              <ResponseDetail />
            </ProtectedRoute>
          }
        />

        {/* Reports & Export */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer']}>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Map view */}
        <Route
          path="/map"
          element={
            <ProtectedRoute role={['admin', 'supervisor', 'viewer']}>
              <MapView />
            </ProtectedRoute>
          }
        />

        {/* Audit Log — admin only */}
        <Route
          path="/audit-log"
          element={
            <ProtectedRoute role="admin">
              <AuditLog />
            </ProtectedRoute>
          }
        />

        {/* Data Cleanup — admin only */}
        <Route
          path="/cleanup"
          element={
            <ProtectedRoute role="admin">
              <Cleanup />
            </ProtectedRoute>
          }
        />

        {/* TPD routes */}
        <Route
          path="/surveyor"
          element={
            <ProtectedRoute role="surveyor">
              <SurveyList />
            </ProtectedRoute>
          }
        />

        {/* TPD survey form */}
        <Route
          path="/surveyor/survey/:id"
          element={
            <ProtectedRoute role="surveyor">
              <SurveyForm />
            </ProtectedRoute>
          }
        />

        {/* TPD submit success */}
        <Route
          path="/surveyor/survey/:id/success"
          element={
            <ProtectedRoute role="surveyor">
              <SubmitSuccess />
            </ProtectedRoute>
          }
        />

        {/* 404 fallback */}
        <Route
          path="*"
          element={
            <div className="flex items-center justify-center min-h-screen">
              <p className="text-gray-500">404 — Halaman tidak ditemukan</p>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
