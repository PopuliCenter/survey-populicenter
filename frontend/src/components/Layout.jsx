import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const NAV_ITEMS_BY_ROLE = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Manajemen Pengguna', path: '/users', icon: '👥' },
    { label: 'TPD', path: '/surveyors', icon: '🧑‍💼' },
    { label: 'Surveys', path: '/surveys', icon: '📋' },
    { label: 'Responses', path: '/responses', icon: '📝' },
    { label: 'Reports', path: '/reports', icon: '📈' },
    { label: 'Map', path: '/map', icon: '🗺️' },
    { label: 'Audit Log', path: '/audit-log', icon: '🔍' },
    { label: 'Pembersihan Data', path: '/cleanup', icon: '🧹' },
  ],
  supervisor: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Surveys', path: '/surveys', icon: '📋' },
    { label: 'TPD', path: '/surveyors', icon: '🧑‍💼' },
    { label: 'Responses', path: '/responses', icon: '📝' },
    { label: 'Reports', path: '/reports', icon: '📈' },
    { label: 'Map', path: '/map', icon: '🗺️' },
  ],
  // Bug #4: viewer hanya bisa lihat responses survei aktif, sembunyikan Surveys & Reports
  viewer: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Responses', path: '/responses', icon: '📝' },
    { label: 'Map', path: '/map', icon: '🗺️' },
  ],
  surveyor: [], // TPD menggunakan layout terpisah
};

const SIDEBAR_LABEL_BY_ROLE = {
  admin: 'Admin Dashboard',
  supervisor: 'Supervisor Dashboard',
  viewer: 'Viewer Dashboard',
};

/**
 * Returns the nav items for the given role.
 * Exported for testing purposes.
 *
 * @param {string} role
 * @returns {Array<{ label: string, path: string, icon: string }>}
 */
export function getNavItemsForRole(role) {
  return NAV_ITEMS_BY_ROLE[role] || [];
}

/**
 * Admin/Supervisor/Viewer dashboard layout with sidebar navigation,
 * top header, and main content area.
 *
 * @param {{ children: React.ReactNode }} props
 */
function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Bug #1: state untuk toggle sidebar di mobile
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Read user info from localStorage
  let user = null;
  try {
    const raw = localStorage.getItem('user');
    if (raw) user = JSON.parse(raw);
  } catch {
    // ignore parse errors
  }

  const userRole = user?.role || '';
  const navItems = NAV_ITEMS_BY_ROLE[userRole] || [];
  const sidebarLabel = SIDEBAR_LABEL_BY_ROLE[userRole] || 'Dashboard';

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Proceed with logout even if the API call fails
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── Overlay untuk mobile ketika sidebar terbuka ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed md:relative z-30 md:z-auto
          h-full flex flex-col bg-white shadow-md
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 md:w-16 -translate-x-full md:translate-x-0'}
          overflow-hidden
        `}
        aria-label="Sidebar"
      >
        {/* Logo / Brand */}
        <div className={`border-b border-gray-200 flex items-center ${sidebarOpen ? 'px-6 py-5 gap-3' : 'px-2 py-4 justify-center'}`}>
          <img
            src="/logo-populi-center.png"
            alt="Populi Center"
            className="h-9 w-9 object-contain flex-shrink-0 rounded-lg"
          />
          {sidebarOpen && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-blue-700 leading-tight truncate">
                Populi Center
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{sidebarLabel}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4" aria-label="Sidebar navigation">
          <ul className={`space-y-1 ${sidebarOpen ? 'px-3' : 'px-2'}`}>
            {navItems.map(({ label, path, icon }) => {
              const isActive = location.pathname === path;
              return (
                <li key={path}>
                  <Link
                    to={path}
                    title={!sidebarOpen ? label : undefined}
                    className={`flex items-center rounded-md text-sm font-medium transition-colors ${
                      sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2'
                    } ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={!sidebarOpen ? label : undefined}
                  >
                    <span aria-hidden="true" className="text-base">{icon}</span>
                    {sidebarOpen && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Tombol sembunyikan sidebar (hanya tampil saat sidebar terbuka) */}
        {sidebarOpen && (
          <div className="border-t border-gray-200 p-3">
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              aria-label="Sembunyikan sidebar"
            >
              <span aria-hidden="true">◀</span>
              <span>Sembunyikan Panel</span>
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          {/* Tombol toggle sidebar */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 flex-shrink-0"
            aria-label={sidebarOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            aria-expanded={sidebarOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* User info + logout */}
          <div className="flex items-center gap-3 ml-auto">
            {user && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-800 truncate max-w-[160px]">{user.name || user.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 flex-shrink-0"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
