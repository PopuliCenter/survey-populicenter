import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';

// ─── Lazy-loaded pages (code-splitting per rute) ──────────────────────────────
// Tiap halaman jadi chunk terpisah → bundle awal kecil. Importer dipakai ulang
// untuk lazy() DAN prefetch saat idle (lihat prefetchRoutes), agar navigasi
// berikutnya instan tanpa layar kosong.
const importers = {
  dashboard: () => import('./pages/Dashboard'),
  users: () => import('./pages/UserManagement'),
  surveyors: () => import('./pages/Surveyors'),
  surveys: () => import('./pages/Surveys'),
  builder: () => import('./pages/SurveyBuilder'),
  responses: () => import('./pages/Responses'),
  responseDetail: () => import('./pages/ResponseDetail'),
  reports: () => import('./pages/Reports'),
  map: () => import('./pages/MapView'),
  audit: () => import('./pages/AuditLog'),
  cleanup: () => import('./pages/Cleanup'),
  systemStatus: () => import('./pages/SystemStatus'),
};

const Dashboard = lazy(importers.dashboard);
const UserManagement = lazy(importers.users);
const Surveyors = lazy(importers.surveyors);
const Surveys = lazy(importers.surveys);
const SurveyBuilder = lazy(importers.builder);
const Responses = lazy(importers.responses);
const ResponseDetail = lazy(importers.responseDetail);
const Reports = lazy(importers.reports);
const MapView = lazy(importers.map);
const AuditLog = lazy(importers.audit);
const Cleanup = lazy(importers.cleanup);
const SystemStatus = lazy(importers.systemStatus);
const SurveyList = lazy(() => import('./surveyor/pages/SurveyList'));
const SurveyForm = lazy(() => import('./surveyor/pages/SurveyForm'));
const SubmitSuccess = lazy(() => import('./surveyor/pages/SubmitSuccess'));
const PublicResults = lazy(() => import('./public/PublicResults'));
const PublicMonitor = lazy(() => import('./public/PublicMonitor'));

// Prefetch chunk rute dashboard saat browser idle → klik menu jadi instan
// (chunk sudah ter-cache, tidak ada layar kosong + spinner).
function prefetchRoutes() {
  Object.values(importers).forEach((fn) => { fn().catch(() => {}); });
}

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

  // Optional role check (dengan pewarisan: PL≈viewer, Asisten≈supervisor)
  if (role) {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const ROLE_INHERITS = { partner_lokal: 'viewer', asisten_supervisor: 'supervisor' };
      const allowedRoles = Array.isArray(role) ? role : [role];
      const base = ROLE_INHERITS[user.role];
      const ok = allowedRoles.includes(user.role) || (base && allowedRoles.includes(base));
      if (!ok) {
        // Redirect to role-specific home page
        const homeByRole = {
          admin: '/dashboard',
          supervisor: '/surveys',
          viewer: '/dashboard',
          surveyor: '/surveyor',
          partner_lokal: '/dashboard',
          asisten_supervisor: '/dashboard',
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
  // Setelah render awal, prefetch chunk rute saat idle (hanya bila sudah login)
  // agar perpindahan halaman terasa instan.
  useEffect(() => {
    if (!localStorage.getItem('token')) return undefined;
    const ric = typeof window !== 'undefined' && window.requestIdleCallback;
    const id = ric ? ric(prefetchRoutes, { timeout: 4000 }) : setTimeout(prefetchRoutes, 2500);
    return () => {
      if (ric && window.cancelIdleCallback) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);

  return (
    <BrowserRouter>
      <ToastProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Embed publik hasil survei (tanpa login) — disematkan di populicenter.org */}
        <Route path="/embed/results/:slug" element={<PublicResults />} />

        {/* Embed monitoring klien (link bertoken) — capaian vs target */}
        <Route path="/embed/monitor/:token" element={<PublicMonitor />} />

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

        <Route
          path="/system"
          element={
            <ProtectedRoute role="admin">
              <SystemStatus />
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
