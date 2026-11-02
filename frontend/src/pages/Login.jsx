import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { addBackButtonListener } from '../utils/capacitorBridge';
import useStatusBar from '../hooks/useStatusBar';
import ConfirmSheet from '../components/ConfirmSheet';
import AppVersionLabel from '../components/AppVersionLabel';
import AppFooterLinks from '../components/AppFooterLinks';
import { setSentryUser } from '../config/sentry';
import { persistAuth } from '../utils/authStorage';
import { getValidSession, homePathForUser } from '../utils/session';

/**
 * Login page with email + password form.
 * On success: stores JWT and user info in localStorage, then redirects based on role.
 */
function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // ─── Sudah login? Lewati form — langsung ke beranda sesuai role ─────────────
  // Sesi tersimpan (token 30 hari TPD) tetap dipakai walau aplikasi ditutup
  // paksa/dibersihkan; tanpa ini TPD selalu disuguhi form login lagi.
  useEffect(() => {
    const session = getValidSession();
    if (session) {
      navigate(homePathForUser(session.user), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Android back button: exit app dari halaman login ───────────────────────
  useEffect(() => {
    let cleanup = () => {};
    addBackButtonListener(() => {
      setShowExitConfirm(true);
      return true; // Prevent default
    }).then((fn) => { cleanup = fn; });
    return () => cleanup();
  }, []);

  // Layar login berlatar putih → ikon status bar gelap (tema default).
  useStatusBar('light');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      // Persist credentials — localStorage + penyimpanan natif (tahan
      // pembersih HP / tutup paksa; lihat utils/authStorage.js).
      await persistAuth(token, user);
      setSentryUser(user); // tandai error berikutnya dengan identitas pengguna

      // Redirect based on role
      const homeByRole = {
        admin: '/dashboard',
        supervisor: '/surveys',
        viewer: '/dashboard',
        surveyor: '/surveyor',
        partner_lokal: '/dashboard',
        asisten_supervisor: '/dashboard',
      };
      navigate(homeByRole[user.role] || '/surveyor');
    } catch (err) {
      let message;
      if (err.response?.data?.error) {
        message = err.response.data.error;
      } else if (err.message === 'Network Error') {
        message = 'Tidak dapat terhubung ke server. Periksa koneksi internet dan URL server.';
      } else if (err.code === 'ECONNABORTED') {
        message = 'Koneksi timeout. Server tidak merespons.';
      } else {
        message = `Terjadi kesalahan: ${err.message || 'Unknown error'}`;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = 'w-full h-12 px-3 bg-white border border-gray-300 rounded-md text-base sm:text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600';

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Panel brand — layar lebar saja. Di HP layar penuh dipakai untuk formulir. */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between bg-primary-500 text-gray-900 p-12">
        <div
          aria-hidden="true"
          className="absolute -right-48 -bottom-48 w-[720px] h-[720px] bg-primary-600 opacity-30"
          style={{
            WebkitMask: 'url(/logo-populi-center.png) center / contain no-repeat',
            mask: 'url(/logo-populi-center.png) center / contain no-repeat',
          }}
        />
        <p className="relative text-sm font-semibold">Populi Center</p>
        <div className="relative max-w-md">
          <p className="font-bold leading-snug" style={{ fontSize: 'clamp(1.75rem, 2.6vw, 2.5rem)' }}>
            Dari titik sampel sampai laporan.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Sistem survei lapangan untuk TPD, supervisor, dan tim riset Populi Center.
          </p>
        </div>
      </aside>

      {/* Kolom formulir */}
      <main className="min-h-screen flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:px-12">
        <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto">
          <img
            src="/logo-populi-center.png"
            alt="Populi Center"
            className="h-14 w-14 object-contain mb-8 lg:hidden"
          />
          <h1 className="text-2xl font-bold text-gray-900">Masuk</h1>
          <p className="text-sm text-gray-600 mt-1 mb-7">Gunakan akun yang diberikan Populi Center.</p>

          {error && (
            <div role="alert" className="mb-5 px-3 py-2.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className={fieldClass}
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${fieldClass} pr-11`}
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-gray-500 hover:text-gray-900"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:text-gray-600 text-white font-semibold rounded-md transition-colors"
            >
              {loading ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        </div>

        <div className="w-full max-w-sm mx-auto mt-10 text-2xs text-gray-500 space-y-1">
          <AppFooterLinks className="" linkClassName="underline hover:text-gray-900" />
          <p>
            © {new Date().getFullYear()} Populi Center · <AppVersionLabel className="inline" />
          </p>
        </div>
      </main>

      {/* Bottom sheet — Konfirmasi Keluar Aplikasi */}
      <ConfirmSheet
        open={showExitConfirm}
        iconType="exit"
        title="Keluar Aplikasi?"
        description="Apakah Anda yakin ingin menutup aplikasi Populi Survey?"
        confirmLabel="Keluar"
        cancelLabel="Batal"
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={async () => {
          try {
            const { App } = await import('@capacitor/app');
            App.exitApp();
          } catch {
            setShowExitConfirm(false);
          }
        }}
      />
    </div>
  );
}

export default Login;
