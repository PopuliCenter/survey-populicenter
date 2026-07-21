import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Versi aplikasi dari package.json → di-inject sebagai konstanta __APP_VERSION__
// (dipakai sebagai fallback web; di native diambil dari APK via @capacitor/app).
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      includeAssets: ['logo-populi-center.png', 'icons/*.png'],
      workbox: {
        // wilayahIndonesia.json disajikan dari /public, bukan di-bundle.
        // Exclude dari SW precache agar tidak melebihi batas 2 MB.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['**/wilayahIndonesia*', 'wilayahIndonesia.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB safety net
        // Skip waiting — langsung aktifkan SW baru tanpa tunggu tab ditutup
        skipWaiting: true,
        clientsClaim: true,
        // Navigasi LANGSUNG ke media responden (buka foto/audio/ttd di tab baru)
        // JANGAN dibelokkan ke index.html oleh SPA-fallback SW — teruskan ke
        // jaringan (nginx → backend berautentikasi). Tanpa ini, klik foto di
        // Data Responden menampilkan halaman 404 SPA walau berkasnya ada.
        navigateFallbackDenylist: [/^\/uploads\//],
        runtimeCaching: [
          // Data wilayah (~3,6 MB): HARUS punya cache sendiri. Sebelumnya ia
          // ikut 'api-cache' yang dibatasi 50 entri (LRU) + kedaluwarsa 1 hari,
          // sehingga tergusur lalu lintas API biasa → dropdown wilayah kosong
          // saat offline. Aturan ini didaftarkan PALING ATAS karena Workbox
          // memakai rute pertama yang cocok.
          // Catatan: sumber kebenaran offline tetap IndexedDB (utils/regionData.js);
          // ini lapisan kedua, bukan satu-satunya pengaman.
          {
            urlPattern: ({ url }) => url.pathname === '/wilayahIndonesia.json',
            handler: 'CacheFirst',
            options: {
              cacheName: 'region-data-cache',
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 tahun — data wilayah jarang berubah
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 86400,
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Property-based tests (fast-check) berat secara CPU; di bawah paralelisme
    // suite penuh, timeout default 5s bisa terlampaui. Beri headroom.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
