require('dotenv').config();

// Sentry MUST be initialized before importing any other module
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: `populi-survey-backend@1.0.0`,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    ignoreErrors: ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'],
    beforeSend(event) {
      if (event.request && event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  console.log('[Sentry] Error tracking initialized');
} else {
  console.log('[Sentry] SENTRY_DSN not configured — error tracking disabled');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const app = express();

// ─── Sentry Express error handler ────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Izinkan semua origin untuk development + Capacitor native app
app.use(cors({
  origin: true, // Izinkan semua origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition'],
}));

// Explicit OPTIONS handler untuk preflight requests
app.options('*', cors());

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ─── Static Files (uploaded photos) ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/admins', require('./routes/admins'));
app.use('/supervisors', require('./routes/supervisors'));
app.use('/viewers', require('./routes/viewers'));
app.use('/surveyors', require('./routes/surveyors'));
app.use('/surveys', require('./routes/surveys'));
app.use('/', require('./routes/questions'));
app.use('/responses', require('./routes/responses'));
app.use('/reports', require('./routes/reports'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/map', require('./routes/map'));
app.use('/upload', require('./routes/upload'));
app.use('/audit-logs', require('./routes/audit-logs'));
app.use('/cleanup', require('./routes/cleanup'));

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Terjadi kesalahan internal server';

  if (status >= 500) {
    console.error('[ERROR]', err);
    // Sentry captures 5xx errors automatically via setupExpressErrorHandler,
    // but we also log for local visibility.
  }

  res.status(status).json({ error: message });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

module.exports = app;
