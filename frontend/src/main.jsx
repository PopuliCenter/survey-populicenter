import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import GlobalNotifications from './components/GlobalNotifications.jsx';
import './index.css';
import { initSentry, setSentryUser } from './config/sentry.js';

// Initialize Sentry error tracking (before anything else)
initSentry();
// Tandai sesi yang dipulihkan (sudah login) agar error ter-atribut ke pengguna.
try {
  const storedUser = localStorage.getItem('user');
  if (storedUser) setSentryUser(JSON.parse(storedUser));
} catch { /* abaikan */ }

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          // Auto-update tanpa popup — langsung update service worker
          updateSW(true);
        },
        onOfflineReady() {
          console.log('Aplikasi siap digunakan offline');
        },
        onRegistered(registration) {
          console.log('Service Worker terdaftar');
          // Check for updates setiap 1 jam
          if (registration) {
            setInterval(() => {
              registration.update();
            }, 60 * 60 * 1000);
          }
        },
        onRegisterError(error) {
          console.error('Gagal mendaftarkan Service Worker:', error);
        },
      });
    }).catch(() => {
      // virtual:pwa-register only available in production build
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <GlobalNotifications />
  </React.StrictMode>
);
