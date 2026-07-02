require('dotenv').config();

// Fail-fast: validate required environment variables
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Required environment variable ${key} is not set. Exiting.`);
    process.exit(1);
  }
}

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
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const redis = require('./config/redis');

const app = express();

// Di belakang nginx + Cloudflare: percayai 1 hop proxy (nginx) agar req.ip,
// req.protocol/req.secure benar, dan express-rate-limit tidak menolak header
// X-Forwarded-For. IP klien asli tetap diambil dari CF-Connecting-IP saat key
// rate-limit (lihat rateLimitKey & loginLimiter).
app.set('trust proxy', 1);

// Jadikan req.ip = IP klien ASLI dari Cloudflare (CF-Connecting-IP) agar access
// log (morgan), audit log, dan rate-limit mencatat IP pengunjung sebenarnya —
// bukan IP Cloudflare/nginx. Header ini diset Cloudflare & tak bisa dipalsukan
// klien selama origin hanya menerima trafik via Cloudflare (batasi firewall ke
// rentang IP Cloudflare untuk jaminan penuh). Dipasang paling awal agar berlaku
// untuk semua middleware & route di bawahnya.
app.use((req, res, next) => {
  const realIp = req.headers['cf-connecting-ip'];
  if (realIp) {
    Object.defineProperty(req, 'ip', { value: realIp, configurable: true });
  }
  next();
});

// ─── Sentry Express error handler ────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow: configured frontend URL, Capacitor native (null origin), localhost dev
    const allowed = [
      process.env.FRONTEND_URL,
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);

    // Allow requests with no origin (native apps, mobile)
    if (!origin || allowed.some(u => origin.startsWith(u))) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'X-Total-Count', 'X-Page', 'X-Page-Size'],
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

// ─── Global Rate Limiter ──────────────────────────────────────────────────────
// Di-key per PENGGUNA (bukan per-IP) bila ada token valid, agar banyak TPD yang
// berbagi satu IP (WiFi kantor / NAT seluler) tidak saling memblokir (bug M1).
// Ambang & status aktif dapat dikonfigurasi via env (untuk load test: naikkan
// RATE_LIMIT_MAX atau set RATE_LIMIT_DISABLED=true).
if (process.env.NODE_ENV !== 'test' && process.env.RATE_LIMIT_DISABLED !== 'true') {
  const jwt = require('jsonwebtoken');
  const RL_SECRET = process.env.JWT_SECRET;

  const rateLimitKey = (req) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ') && RL_SECRET) {
      try {
        const decoded = jwt.verify(auth.slice(7), RL_SECRET);
        if (decoded && decoded.id) return `user:${decoded.id}`;
      } catch {
        // token tidak valid → jatuh ke key IP
      }
    }
    // IP klien asli dari Cloudflare (bukan IP nginx internal).
    return req.headers['cf-connecting-ip'] || req.ip;
  };

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:global:', // prefix unik agar tidak bentrok dengan loginLimiter (ERR_ERL_DOUBLE_COUNT)
    }),
    message: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
  });
  app.use(globalLimiter);
}

// ─── Static Files (uploaded photos) ──────────────────────────────────────────
// Protected media endpoint — requires valid JWT
const { authMiddleware } = require('./middleware/auth');
app.get('/uploads/*', authMiddleware, (req, res) => {
  const filePath = path.join(__dirname, '..', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'File tidak ditemukan' });
    }
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/admins', require('./routes/admins'));
app.use('/supervisors', require('./routes/supervisors'));
app.use('/viewers', require('./routes/viewers'));
const { buildUserRoleRouter } = require('./routes/_userRoleRouter');
app.use('/partner-lokal', buildUserRoleRouter({ role: 'partner_lokal', label: 'Partner Lokal' }));
app.use('/asisten-supervisor', buildUserRoleRouter({ role: 'asisten_supervisor', label: 'Asisten Supervisor' }));
app.use('/surveyors', require('./routes/surveyors'));
app.use('/surveys', require('./routes/surveys'));
app.use('/', require('./routes/questions'));
app.use('/responses', require('./routes/responses'));
app.use('/reports', require('./routes/reports'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/monitoring', require('./routes/monitoring'));
app.use('/map', require('./routes/map'));
app.use('/upload', require('./routes/upload'));
app.use('/audit-logs', require('./routes/audit-logs'));
app.use('/cleanup', require('./routes/cleanup'));
app.use('/public', require('./routes/public'));

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

function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}] pid=${process.pid}`);
  });
}

// Dijalankan langsung (bukan saat di-import oleh test).
if (require.main === module) {
  const cluster = require('cluster');
  const os = require('os');

  // Jumlah worker: WEB_CONCURRENCY, atau jumlah CPU (dibatasi 2 untuk KVM 2), minimal 1.
  const desired = parseInt(process.env.WEB_CONCURRENCY, 10)
    || Math.min((os.cpus() || []).length || 1, 2);
  const workerCount = Math.max(1, desired);

  // Cluster hanya di produksi & bila worker > 1 — memanfaatkan kedua vCPU.
  if (process.env.NODE_ENV === 'production' && workerCount > 1 && cluster.isPrimary) {
    console.log(`[cluster] primary pid=${process.pid} memulai ${workerCount} worker`);
    for (let i = 0; i < workerCount; i++) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      console.warn(`[cluster] worker pid=${worker.process.pid} berhenti (${signal || code}) — fork ulang`);
      cluster.fork();
    });
  } else {
    startServer();
  }
}

module.exports = app;
