import React from 'react';
import Icon from './Icon';
import * as Sentry from '@sentry/react';

/**
 * ErrorBoundary — menangkap error render agar aplikasi tidak "layar putih" total.
 * Menampilkan fallback ramah + tombol muat ulang, dan melaporkan ke Sentry.
 * (Error boundary WAJIB class component — belum ada padanan hooks.)
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    } catch { /* Sentry mungkin tak terinisialisasi — abaikan */ }
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"><Icon name="alert" className="w-7 h-7" /></div>
            <h1 className="text-lg font-semibold text-gray-800">Terjadi kesalahan tak terduga</h1>
            <p className="text-sm text-gray-500 mt-2">
              Halaman gagal ditampilkan. Tim kami sudah diberi tahu secara otomatis.
              Coba muat ulang halaman.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
            >
              Muat ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
