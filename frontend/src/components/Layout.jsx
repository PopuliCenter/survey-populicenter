import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const NAV_ITEMS_BY_ROLE = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Manajemen Pengguna', path: '/users', icon: '👥' },
    { label: 'Surveyors', path: '/surveyors', icon: '🧑‍💼' },
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
    { label: 'Surveyors', path: '/surveyors', icon: '🧑‍💼' },
    { label: 'Responses', path: '/responses', icon: '📝' },
    { label: 'Reports', path: '/reports', icon: '📈' },
    { label: 'Map', path: '/map', icon: '🗺️' },
  ],
  viewer: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Surveys', path: '/surveys', icon: '📋' },
    { label: 'Reports', path: '/reports', icon: '📈' },
    { label: 'Map', path: '/map', icon: '🗺️' },
    { label: 'Responses', path: '/responses', icon: '📝' },
  ],
  surveyor: [], // surveyor menggunakan layout terpisah
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
    <div className="flex h-screen bg-gray-100">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-white shadow-md flex flex-col">
        {/* Logo / Brand */}
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img
              src="/logo-populi-center.png"
              alt="Populi Center"
              className="h-9 w-9 object-contain flex-shrink-0 rounded-lg"
            />
            <div>
              <h1 className="text-sm font-bold text-blue-700 leading-tight">
                Populi Center
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">{sidebarLabel}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4" aria-label="Sidebar navigation">
          <ul className="space-y-1 px-3">
            {navItems.map(({ label, path, icon }) => {
              const isActive = location.pathname === path;
              return (
                <li key={path}>
                  <Link
                    to={path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white shadow-sm px-6 py-3 flex items-center justify-between">
          <div />

          {/* User info + logout */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{user.name || user.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
