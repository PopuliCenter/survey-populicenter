import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { clearSentryUser } from '../config/sentry';
import { clearAuth } from '../utils/authStorage';
import { ICON_PATHS } from './Icon';

const NAV_ITEMS_BY_ROLE = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Manajemen Pengguna', path: '/users', icon: 'users' },
    { label: 'Manajemen TPD', path: '/surveyors', icon: 'brief' },
    { label: 'Survei', path: '/surveys', icon: 'doc' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Laporan', path: '/reports', icon: 'chart' },
    { label: 'Random Sampling', path: '/random-sampling', icon: 'target' },
    { label: 'Pemilihan RT', path: '/pemilihan-rt', icon: 'shuffle' },
    { label: 'Peta', path: '/map', icon: 'map' },
    { label: 'Log Audit', path: '/audit-log', icon: 'search' },
    { label: 'Status Sistem', path: '/system', icon: 'server' },
    { label: 'Penyimpanan', path: '/penyimpanan', icon: 'database' },
    { label: 'Pembersihan Data', path: '/cleanup', icon: 'trash' },
  ],
  supervisor: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Survei', path: '/surveys', icon: 'doc' },
    { label: 'Manajemen TPD', path: '/surveyors', icon: 'brief' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Laporan', path: '/reports', icon: 'chart' },
    { label: 'Random Sampling', path: '/random-sampling', icon: 'target' },
    { label: 'Pemilihan RT', path: '/pemilihan-rt', icon: 'shuffle' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  // Bug #4: viewer hanya bisa lihat responses survei aktif, sembunyikan Surveys & Reports
  viewer: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  // Partner Lokal (PL): akses lihat saja — sama seperti viewer
  partner_lokal: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  // Asisten Supervisor: seperti supervisor TANPA menu Survei
  asisten_supervisor: [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Manajemen TPD', path: '/surveyors', icon: 'brief' },
    { label: 'Data Responden', path: '/responses', icon: 'clipboard' },
    { label: 'Laporan', path: '/reports', icon: 'chart' },
    { label: 'Peta', path: '/map', icon: 'map' },
  ],
  surveyor: [], // TPD menggunakan layout terpisah
};

const SIDEBAR_LABEL_BY_ROLE = {
  admin: 'Admin Dashboard',
  supervisor: 'Supervisor Dashboard',
  viewer: 'Viewer Dashboard',
  partner_lokal: 'Partner Lokal',
  asisten_supervisor: 'Asisten Supervisor',
};

// Label tampilan role (mengganti tampilan mentah seperti "partner_lokal").
export const ROLE_LABELS = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  viewer: 'Viewer',
  surveyor: 'TPD',
  partner_lokal: 'Partner Lokal',
  asisten_supervisor: 'Asisten Supervisor',
};

// Ikon garis (SVG) — sumber tunggal di components/Icon.jsx.

// Preferensi sidebar dipertahankan antar-navigasi. Layout di-mount ulang tiap
// halaman (tiap rute membungkus dirinya dengan <Layout>), jadi tanpa ini pilihan
// buka/tutup pengguna akan ter-reset setiap pindah fitur.
const SIDEBAR_PREF_KEY = 'dashboard_sidebar_open';
const isDesktopViewport = () => typeof window !== 'undefined' && window.innerWidth >= 768;

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

  // State sidebar: di layar kecil (<768) selalu mulai TERTUTUP agar konten tidak
  // tertutup overlay saat membuka fitur baru; di desktop pakai preferensi tersimpan.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (!isDesktopViewport()) return false;
    try {
      const saved = localStorage.getItem(SIDEBAR_PREF_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });

  // Ubah state + simpan preferensi agar bertahan saat pindah halaman.
  const setSidebar = (open) => {
    setSidebarOpen(open);
    try { localStorage.setItem(SIDEBAR_PREF_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  };

  // ── Swipe-to-close drawer (khusus mobile) ───────────────────────────────────
  // Menggeser drawer ke kiri akan menutupnya; offset mengikuti jari (dragX),
  // lalu menutup bila tergeser melewati ambang. Hanya aktif saat sidebar terbuka
  // di layar kecil (di desktop sidebar bersifat tetap/rail).
  const DRAWER_WIDTH = 256; // selaras dengan w-64
  const dragRef = useRef({ startX: 0, startY: 0, active: false });
  const [dragX, setDragX] = useState(null); // px (≤0) saat menggeser; null = idle

  const onTouchStart = (e) => {
    if (isDesktopViewport() || !sidebarOpen) return;
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, active: false };
  };
  const onTouchMove = (e) => {
    if (isDesktopViewport() || !sidebarOpen) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    if (!dragRef.current.active) {
      if (Math.abs(dx) < 8) return;               // abaikan getaran kecil
      if (Math.abs(dx) < Math.abs(dy)) return;    // gerak vertikal → biarkan scroll
      dragRef.current.active = true;
    }
    setDragX(Math.max(-DRAWER_WIDTH, Math.min(0, dx))); // hanya ke kiri (menutup)
  };
  const onTouchEnd = () => {
    if (dragRef.current.active && dragX !== null && dragX < -DRAWER_WIDTH / 3) {
      setSidebar(false); // tergeser > 1/3 lebar → tutup
    }
    dragRef.current.active = false;
    setDragX(null);
  };

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
      clearAuth(); // hapus di localStorage + penyimpanan natif
      clearSentryUser();
      navigate('/login');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Overlay mobile (memudar; ikut redup saat digeser) ── */}
      <div
        className={`fixed inset-0 z-20 bg-black/40 md:hidden ${dragX !== null ? '' : 'transition-opacity duration-300'} ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={dragX !== null ? { opacity: Math.max(0, 1 + dragX / DRAWER_WIDTH) } : undefined}
        onClick={() => setSidebar(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar (gelap) — drawer geser di mobile, rail tetap di desktop ── */}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dragX !== null ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
        className={`
          fixed md:relative z-30 md:z-auto
          h-full flex flex-col bg-slate-900 text-slate-300
          w-64 ${sidebarOpen ? 'md:w-64' : 'md:w-16'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          transition-transform md:transition-all duration-300 ease-out will-change-transform
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
              <p className="text-2xs text-slate-400 mt-0.5 truncate">{sidebarLabel}</p>
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
                    onClick={() => { if (!isDesktopViewport()) setSidebar(false); }}
                    title={!sidebarOpen ? label : undefined}
                    className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
                      sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'
                    } ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
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
            <div className="w-9 h-9 rounded-full bg-primary-500/20 text-primary-300 font-bold flex items-center justify-center text-sm flex-shrink-0">
              {getInitials(user)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name || user.email}</p>
                <p className="text-2xs text-slate-400 capitalize truncate">{ROLE_LABELS[user.role] || user.role}</p>
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
            onClick={() => setSidebar(!sidebarOpen)}
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
                <p className="text-xs text-gray-500 capitalize">{ROLE_LABELS[user.role] || user.role}</p>
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
