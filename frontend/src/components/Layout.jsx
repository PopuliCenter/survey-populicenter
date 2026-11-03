import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { clearSentryUser } from '../config/sentry';
import { clearAuth } from '../utils/authStorage';
import { ICON_PATHS } from './Icon';
import ThemeToggle from './ThemeToggle';

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
    // Alat metodologi ikut supervisor (asisten mewarisi izin supervisor di
    // backend — yang dibatasi hanya kelola survei).
    { label: 'Random Sampling', path: '/random-sampling', icon: 'target' },
    { label: 'Pemilihan RT', path: '/pemilihan-rt', icon: 'shuffle' },
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

// Kelompok menu — hanya memengaruhi TAMPILAN; hak akses tetap dari NAV_ITEMS_BY_ROLE.
const NAV_GROUPS = [
  { label: 'Operasional', paths: ['/dashboard', '/surveys', '/surveyors', '/responses'] },
  { label: 'Analisis', paths: ['/reports', '/map', '/random-sampling', '/pemilihan-rt'] },
  { label: 'Sistem', paths: ['/users', '/audit-log', '/system', '/penyimpanan', '/cleanup'] },
];

function groupNavItems(items) {
  return NAV_GROUPS
    .map((g) => ({
      label: g.label,
      items: g.paths.map((p) => items.find((i) => i.path === p)).filter(Boolean),
    }))
    .filter((g) => g.items.length > 0);
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
 * Kerangka dashboard: sidebar terang berkelompok + area konten. Judul halaman
 * ada di h1 tiap halaman, identitas pengguna di kaki sidebar — keduanya sengaja
 * tidak diulang. Bar atas hanya muncul di HP (tombol menu).
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
  const DRAWER_WIDTH = 240; // selaras dengan w-60
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
  const navGroups = groupNavItems(navItems);

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

      {/* ── Sidebar — drawer geser di mobile, rail tetap di desktop ── */}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dragX !== null ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
        className={`
          fixed md:relative z-30 md:z-auto
          h-full flex flex-col flex-shrink-0 bg-white border-r border-gray-200
          w-60 ${sidebarOpen ? 'md:w-60' : 'md:w-14'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          transition-transform md:transition-all duration-200 ease-out will-change-transform
          overflow-hidden
        `}
        aria-label="Sidebar"
      >
        {/* Logo / Brand + tombol lipat */}
        <div className={`flex items-center h-14 flex-shrink-0 ${sidebarOpen ? 'pl-4 pr-2 gap-2.5' : 'justify-center'}`}>
          {sidebarOpen && (
            <>
              <img src="/logo-populi-center.png" alt="Populi Center" className="h-7 w-7 object-contain flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 leading-tight truncate">Populi Center</p>
                <p className="text-2xs text-gray-500 truncate">{sidebarLabel}</p>
              </div>
            </>
          )}
          <button
            onClick={() => setSidebar(!sidebarOpen)}
            className="hidden md:inline-flex p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors flex-shrink-0"
            aria-label={sidebarOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            aria-expanded={sidebarOpen}
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4zM9 5v14" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto pb-4" aria-label="Sidebar navigation">
          {navGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? (sidebarOpen ? 'mt-5' : 'mt-3 pt-3 mx-2 border-t border-gray-200') : ''}>
              {sidebarOpen && (
                <p className="px-4 pb-1.5 text-2xs font-medium text-gray-500">{group.label}</p>
              )}
              <ul className={`space-y-0.5 ${sidebarOpen ? 'px-2' : gi > 0 ? '' : 'px-2'}`}>
                {group.items.map(({ label, path, icon }) => {
                  const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
                  return (
                    <li key={path}>
                      <Link
                        to={path}
                        onClick={() => { if (!isDesktopViewport()) setSidebar(false); }}
                        title={!sidebarOpen ? label : undefined}
                        className={`flex items-center rounded-md text-sm transition-colors ${
                          sidebarOpen ? 'gap-2.5 px-2 py-1.5' : 'justify-center px-1 py-2'
                        } ${
                          isActive
                            ? 'bg-gray-100 text-gray-900 font-semibold'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={!sidebarOpen ? label : undefined}
                      >
                        <Icon name={icon} className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-500'}`} />
                        {sidebarOpen && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Profil pengguna + logout */}
        {user && (
          <div className={`border-t border-gray-200 flex-shrink-0 ${sidebarOpen ? 'p-2 pl-4 flex items-center gap-2.5' : 'p-2 flex flex-col items-center gap-1.5'}`}>
            {sidebarOpen ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name || user.email}</p>
                <p className="text-2xs text-gray-500 truncate">{ROLE_LABELS[user.role] || user.role}</p>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-semibold flex items-center justify-center text-xs" title={user.name || user.email}>
                {getInitials(user)}
              </div>
            )}
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors flex-shrink-0"
              aria-label="Logout"
              title="Keluar"
            >
              <Icon name="logout" className="w-[18px] h-[18px]" />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Bar atas — HP saja */}
        <header className="md:hidden bg-white border-b border-gray-200 h-14 px-2 flex items-center gap-2 flex-shrink-0 pt-[env(safe-area-inset-top)] box-content">
          <button
            onClick={() => setSidebar(!sidebarOpen)}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
            aria-label={sidebarOpen ? 'Sembunyikan menu' : 'Tampilkan menu'}
            aria-expanded={sidebarOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <img src="/logo-populi-center.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-gray-900">Populi Center</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto p-4 md:px-8 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
