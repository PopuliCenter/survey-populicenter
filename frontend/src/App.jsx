import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';

// ─── Lazy-loaded pages (code-splitting per rute) ──────────────────────────────
// Tiap halaman jadi chunk terpisah → bundle awal kecil. Halaman berat (chart
// recharts, peta leaflet) hanya diunduh saat rutenya dibuka. Embed publik tidak
// lagi menarik seluruh kode dashboard.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Surveyors = lazy(() => import('./pages/Surveyors'));
const Surveys = lazy(() => import('./pages/Surveys'));
const SurveyBuilder = lazy(() => import('./pages/SurveyBuilder'));
const Responses = lazy(() => import('./pages/Responses'));
const ResponseDetail = lazy(() => import('./pages/ResponseDetail'));
const Reports = lazy(() => import('./pages/Reports'));
const MapView = lazy(() => import('./pages/MapView'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Cleanup = lazy(() => import('./pages/Cleanup'));
const SurveyList = lazy(() => import('./surveyor/pages/SurveyList'));
const SurveyForm = lazy(() => import('./surveyor/pages/SurveyForm'));
const SubmitSuccess = lazy(() => import('./surveyor/pages/SubmitSuccess'));
const PublicResults = lazy(() => import('./public/PublicResults'));

// Fallback saat chunk halaman sedang diunduh.
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div
        className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"
        role="status"
        aria-label="Memuat halaman"
      />
    </div>
  );
}

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
      <ToastProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Embed publik hasil survei (tanpa login) — disematkan di populicenter.org */}
        <Route path="/embed/results/:slug" element={<PublicResults />} />

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
      </Suspense>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
