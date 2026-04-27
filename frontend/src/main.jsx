import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          if (confirm('Pembaruan aplikasi tersedia. Muat ulang sekarang?')) {
            window.location.reload();
          }
        },
        onOfflineReady() {
          console.log('Aplikasi siap digunakan offline');
        },
        onRegistered(registration) {
          console.log('Service Worker terdaftar:', registration);
        },
        onRegisterError(error) {
          console.error('Gagal mendaftarkan Service Worker:', error);
        },
      });
    }).catch((err) => {
      // virtual:pwa-register only available in production build
      console.log('PWA register not available in dev mode:', err.message);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
