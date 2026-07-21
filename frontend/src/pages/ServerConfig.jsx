import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import { useNavigate } from 'react-router-dom';

/**
 * Halaman konfigurasi server — hanya tampil di native app (Capacitor).
 * Memungkinkan user memasukkan URL server backend sebelum login.
 *
 * URL disimpan di localStorage('api_server_url') dan digunakan oleh api.js.
 */
function ServerConfig() {
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'success' | 'error' | null
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('api_server_url');
    if (saved) setServerUrl(saved);
  }, []);

  async function handleTestConnection() {
    if (!serverUrl.trim()) return;

    setTesting(true);
    setTestResult(null);
    setErrorMsg('');

    try {
      const url = serverUrl.replace(/\/+$/, '');
      // Coba beberapa endpoint untuk tes koneksi
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test', password: 'test' }),
        signal: controller.signal,
        mode: 'cors',
      }).catch(() => null);

      clearTimeout(timeout);

      // Jika server merespons (bahkan 401/422), berarti koneksi berhasil
      if (response && response.status) {
        setTestResult('success');
      } else {
        // Fallback: coba GET request sederhana
        const fallback = await fetch(`${url}/surveys`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        if (fallback && fallback.status) {
          setTestResult('success');
        } else {
          setTestResult('error');
          setErrorMsg('Tidak dapat terhubung ke server. Periksa URL dan pastikan server aktif.');
        }
      }
    } catch (err) {
      setTestResult('error');
      if (err.name === 'AbortError') {
        setErrorMsg('Koneksi timeout. Server tidak merespons dalam 10 detik.');
      } else {
        setErrorMsg('Tidak dapat terhubung ke server. Periksa URL dan pastikan server aktif.');
      }
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    const url = serverUrl.trim().replace(/\/+$/, '');
    localStorage.setItem('api_server_url', url);
    // Reload agar api.js mengambil URL baru
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-5">
        {/* Logo */}
        <div className="text-center">
          <img
            src="/logo-populi-center.png"
            alt="Populi Center"
            className="h-16 w-16 mx-auto rounded-xl object-contain"
          />
          <h1 className="text-lg font-bold text-gray-800 mt-3">Populi Survey</h1>
          <p className="text-sm text-gray-500 mt-1">Konfigurasi Server</p>
        </div>

        {/* Info */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 text-xs text-primary-700">
          Masukkan alamat server backend untuk menghubungkan aplikasi.
          Hubungi administrator untuk mendapatkan URL server.
        </div>

        {/* Server URL input */}
        <div>
          <label htmlFor="server-url" className="block text-sm font-medium text-gray-700 mb-1">
            URL Server
          </label>
          <input
            id="server-url"
            type="url"
            value={serverUrl}
            onChange={(e) => { setServerUrl(e.target.value); setTestResult(null); }}
            placeholder="https://survey.populicenter.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            autoComplete="url"
          />
          <p className="mt-1 text-xs text-gray-500">
            Contoh: https://survey.populicenter.com atau http://192.168.1.100
          </p>
        </div>

        {/* Test result */}
        {testResult === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
            <Icon name="check" className="w-4 h-4 inline" /> Koneksi berhasil! Server merespons.
          </div>
        )}
        {testResult === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
            <Icon name="close" className="w-4 h-4 inline" /> {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleTestConnection}
            disabled={!serverUrl.trim() || testing}
            className="w-full px-4 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            {testing ? 'Menguji koneksi…' : 'Tes Koneksi'}
          </button>
          <button
            onClick={handleSave}
            disabled={!serverUrl.trim() || testResult !== 'success'}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            Simpan & Lanjutkan
          </button>
        </div>

        {/* Skip — jika sudah pernah set */}
        {localStorage.getItem('api_server_url') && (
          <button
            onClick={() => navigate('/login')}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Lewati (gunakan server sebelumnya)
          </button>
        )}
      </div>
    </div>
  );
}

export default ServerConfig;
