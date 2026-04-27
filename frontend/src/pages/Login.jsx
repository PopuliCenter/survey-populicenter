import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

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
      const message =
        err.response?.data?.error ||
        'Terjadi kesalahan. Silakan coba kembali.';
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
          <p className="text-sm text-gray-500 mt-0.5">Web Survey Platform</p>
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
    </div>
  );
}

export default Login;
