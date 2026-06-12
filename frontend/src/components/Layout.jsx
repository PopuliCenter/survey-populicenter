import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const NAV_ITEMS_BY_ROLE = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Manajemen Pengguna', path: '/users', icon: 'users' },
    { label: 'Manajemen TPD', path: '/surveyors', icon: 'brief' },
    { label: 'Survei', path: '/surveys', icon: 'doc' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Laporan', path: '/reports', icon: 'chart' },
    { label: 'Peta', path: '/map', icon: 'map' },
    { label: 'Log Audit', path: '/audit-log', icon: 'search' },
    { label: 'Pembersihan Data', path: '/cleanup', icon: 'trash' },
  ],
  supervisor: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Survei', path: '/surveys', icon: 'doc' },
    { label: 'Manajemen TPD', path: '/surveyors', icon: 'brief' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Laporan', path: '/reports', icon: 'chart' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  // Bug #4: viewer hanya bisa lihat responses survei aktif, sembunyikan Surveys & Reports
  viewer: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  surveyor: [], // TPD menggunakan layout terpisah
};

const SIDEBAR_LABEL_BY_ROLE = {
  admin: 'Admin Dashboard',
  supervisor: 'Supervisor Dashboard',
  viewer: 'Viewer Dashboard',
};

// ─── Ikon garis (SVG) — menggantikan emoji ──────────────────────────────────────
const ICON_PATHS = {
  grid: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  users: 'M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a3 3 0 11-2 5',
  brief: 'M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1m-9 0h14a1 1 0 011 1v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a1 1 0 011-1z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a1 1 0 01.7.3l5.4 5.4a1 1 0 01.3.7V19a2 2 0 01-2 2z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 4h6',
  chart: 'M4 19V5m0 14h16M8 17v-5m4 5V9m4 8v-3',
  map: 'M9 20l-5.447 1.724A1 1 0 013 20.382V6.618a1 1 0 01.553-.894L9 3.5m0 16.5l6-2.5m-6 2.5V3.5m6 14l5.447 1.776A1 1 0 0021 18.382V5.618a1 1 0 00-.553-.894L15 3.5m0 14V3.5m-6 0l6 2.5',
  search: 'M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

function Icon({ name, className = 'w-5 h-5' }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Inisial avatar dari nama/email pengguna. */
function getInitials(user) {
  const src = (user?.name || user?.email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Judul halaman dari rute saat ini (atau null jika tidak cocok). */
function getPageTitle(pathname, navItems) {
  const exact = navItems.find((i) => i.path === pathname);
  if (exact) return exact.label;
  const prefix = navItems.find((i) => pathname.startsWith(`${i.path}/`));
  return prefix ? prefix.label : null;
}

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
 * Admin/Supervisor/Viewer dashboard layout — sidebar gelap modern,
 * top header dengan judul halaman + avatar, dan area konten terang.
 *
 * @param {{ children: React.ReactNode }} props
 */
function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Bug #1: state untuk toggle sidebar di mobile — default tertutup di layar kecil, terbuka di >= md
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);

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
  const pageTitle = getPageTitle(location.pathname, navItems);

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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Overlay untuk mobile ketika sidebar terbuka ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (gelap) ── */}
      <aside
        className={`
          fixed md:relative z-30 md:z-auto
          h-full flex flex-col bg-slate-900 text-slate-300
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 md:w-16 -translate-x-full md:translate-x-0'}
          overflow-hidden
        `}
        aria-label="Sidebar"
      >
        {/* Logo / Brand */}
        <div className={`border-b border-white/10 flex items-center ${sidebarOpen ? 'px-5 py-4 gap-3' : 'px-2 py-4 justify-center'}`}>
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src="/logo-populi-center.png" alt="Populi Center" className="h-7 w-7 object-contain" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white leading-tight truncate">Populi Center</h1>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sidebarLabel}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4" aria-label="Sidebar navigation">
          <ul className={`space-y-1 ${sidebarOpen ? 'px-3' : 'px-2'}`}>
            {navItems.map(({ label, path, icon }) => {
              const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
              return (
                <li key={path}>
                  <Link
                    to={path}
                    title={!sidebarOpen ? label : undefined}
                    className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
                      sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'
                    } ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={!sidebarOpen ? label : undefined}
                  >
                    <Icon name={icon} className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Profil pengguna + logout */}
        {user && (
          <div className={`border-t border-white/10 ${sidebarOpen ? 'p-3 flex items-center gap-3' : 'p-2 flex flex-col items-center gap-2'}`}>
            <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center text-sm flex-shrink-0">
              {getInitials(user)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name || user.email}</p>
                <p className="text-[11px] text-slate-400 capitalize truncate">{user.role}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-white/20"
              aria-label="Logout"
              title="Keluar"
            >
              <Icon name="logout" className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          {/* Tombol toggle sidebar */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 flex-shrink-0"
            aria-label={sidebarOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            aria-expanded={sidebarOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Judul halaman */}
          {pageTitle && (
            <h2 className="text-base font-bold text-gray-900 truncate">{pageTitle}</h2>
          )}

          {/* Avatar pengguna */}
          {user && (
            <div className="flex items-center gap-3 ml-auto">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-800 truncate max-w-[160px]">{user.name || user.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-sm flex-shrink-0" title={user.name || user.email}>
                {getInitials(user)}
              </div>
            </div>
          )}
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
