'use strict';

/**
 * Sentry Error Tracking Configuration
 *
 * Inisialisasi Sentry untuk menangkap error di backend.
 * DSN diambil dari environment variable SENTRY_DSN.
 * Jika SENTRY_DSN tidak diset, Sentry tidak aktif (safe untuk development).
 *
 * Setup di Sentry Dashboard:
 * 1. Buat project baru (Node.js) di https://sentry.io
 * 2. Copy DSN dari Settings > Client Keys
 * 3. Set environment variable: SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 */

const Sentry = require('@sentry/node');

function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not configured — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: `populi-survey-backend@${process.env.npm_package_version || '1.0.0'}`,

    // Performance monitoring — sample 20% of transactions in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Filter out noisy errors
    ignoreErrors: [
      'ECONNREFUSED',      // Redis connection during startup
      'ECONNRESET',        // Client disconnected
      'EPIPE',             // Broken pipe
    ],

    // Attach user context from JWT
    beforeSend(event) {
      // Strip sensitive data
      if (event.request && event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  // Express integration — must be first middleware
  Sentry.setupExpressErrorHandler(app);

  console.log('[Sentry] Error tracking initialized');
}

/**
 * Capture an exception manually (for worker processes, etc.)
 */
function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Capture a message (info/warning level)
 */
function captureMessage(message, level = 'info') {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
}

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  Sentry,
};
