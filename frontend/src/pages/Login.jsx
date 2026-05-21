import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { addBackButtonListener } from '../utils/capacitorBridge';

/**
 * Login page with email + password form.
 * On success: stores JWT and user info in localStorage, then redirects based on role.
 */
function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/dashboard');
      } else {
        navigate('/surveyor');
      }
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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 text-center">
          <img
            src="/logo-populi-center.png"
            alt="Populi Center"
            className="h-20 w-20 mx-auto mb-3 object-contain rounded-xl"
          />
          <h1 className="text-xl font-bold text-blue-700">Populi Center</h1>
          <p className="text-xs text-gray-400 mt-1">Masuk ke akun Anda</p>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm"
          >
            {error}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              aria-required="true"
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              aria-required="true"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>

      {/* Modal Konfirmasi Keluar App */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-800">Keluar Aplikasi?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">Apakah Anda yakin ingin menutup aplikasi?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    const { App } = await import('@capacitor/app');
                    App.exitApp();
                  } catch {
                    setShowExitConfirm(false);
                  }
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
