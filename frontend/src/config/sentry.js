/**
 * Sentry Error Tracking — Frontend
 *
 * Inisialisasi Sentry untuk menangkap error di React app.
 * DSN diambil dari environment variable VITE_SENTRY_DSN.
 *
 * Setup:
 * 1. Buat project baru (React) di https://sentry.io
 * 2. Copy DSN dari Settings > Client Keys
 * 3. Set di .env: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 */

import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.log('[Sentry] VITE_SENTRY_DSN not configured — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'development',
    release: `populi-survey-frontend@1.0.0`,

    // Performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    // Session replay for debugging UI issues (sample 10% in production)
    replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0, // Always capture replay on error

    // Filter noisy errors
    ignoreErrors: [
      'ResizeObserver loop',
      'Network Error',
      'AbortError',
      'ChunkLoadError',
      'Loading chunk',
    ],

    beforeSend(event) {
      // Don't send errors from localhost in development
      if (!import.meta.env.PROD && window.location.hostname === 'localhost') {
        return null;
      }
      return event;
    },
  });

  console.log('[Sentry] Frontend error tracking initialized');
}

export { Sentry };
