import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { addBackButtonListener } from '../utils/capacitorBridge';
import useStatusBar from '../hooks/useStatusBar';
import ConfirmSheet from '../components/ConfirmSheet';
import AppVersionLabel from '../components/AppVersionLabel';
import AppFooterLinks from '../components/AppFooterLinks';
import { setSentryUser } from '../config/sentry';

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

  // ─── Android back button: exit app dari halaman login ───────────────────────
  useEffect(() => {
    let cleanup = () => {};
    addBackButtonListener(() => {
      setShowExitConfirm(true);
      return true; // Prevent default
    }).then((fn) => { cleanup = fn; });
    return () => cleanup();
  }, []);

  // ─── Status bar adaptif ─────────────────────────────────────────────────────
  // Login berlatar biru gelap → ikon status bar PUTIH agar terbaca. Saat keluar
  // halaman (mis. ke daftar survei yang putih) hook otomatis balik ke ikon gelap.
  useStatusBar('dark');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      // Persist credentials
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
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

  return (
    <div
      className="relative flex flex-col justify-center min-h-screen px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ background: 'linear-gradient(160deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)' }}
    >
      {/* Brand */}
      <div className="text-center mb-7">
        <img
          src="/logo-populi-center.png"
          alt="Populi Center"
          className="h-32 w-auto mx-auto mb-5 object-contain drop-shadow-lg"
        />
        <h1 className="text-2xl font-bold text-white">Selamat Datang</h1>
        <p className="text-sm text-primary-100 mt-1">Masuk untuk mulai survei</p>
      </div>

      {/* Form card */}
      <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-5 w-full max-w-md mx-auto">
        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-600 mb-1">
              Email
            </label>
            <div className="relative">
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full h-12 pl-11 pr-3 bg-gray-100 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-accent-400 focus:outline-none"
                aria-required="true"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-600 mb-1">
              Password
            </label>
            <div className="relative">
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.1.9-2 2-2m-8 2a6 6 0 1112 0v3a2 2 0 01-2 2H8a2 2 0 01-2-2v-3z" />
              </svg>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 pl-11 pr-11 bg-gray-100 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-accent-400 focus:outline-none"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-400 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-1 mt-1"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>

      <p className="text-center text-[11px] text-primary-100 mt-6">© {new Date().getFullYear()} Populi Center</p>
      <AppVersionLabel className="block text-center text-[10px] text-primary-200/80 mt-1" />
      <AppFooterLinks className="text-center mt-1.5 text-[10px] text-primary-100" linkClassName="underline hover:text-white" />

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
