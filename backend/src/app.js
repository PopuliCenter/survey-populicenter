require('dotenv').config();

// Fail-fast: validate required environment variables
const REQUIRED_ENV = ['JWT_SECRET', 'SESSION_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
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

// M2: req.ip = X-Real-IP yang DISET nginx (bukan header cf-connecting-ip mentah).
// nginx memakai modul real_ip dgn rentang IP Cloudflare (lihat nginx-common.conf),
// sehingga X-Real-IP hanya berisi IP klien yang TERVALIDASI berasal dari CF —
// tak bisa dipalsukan attacker yang menembus origin langsung. Backend tak dapat
// diakses selain via nginx (port tak diekspos), jadi X-Real-IP selalu di-set
// server, bukan klien. Dipakai morgan, audit log, dan rate-limit login.
app.use((req, res, next) => {
  const realIp = req.headers['x-real-ip'];
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
    // Allow: configured frontend URL(s), Capacitor native (null origin), localhost dev.
    // FRONTEND_URL boleh berisi BANYAK origin dipisah koma (mis. saat migrasi
    // domain: "https://risetcenter.com,https://populicenter.com").
    const configuredOrigins = (process.env.FRONTEND_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = [
      ...configuredOrigins,
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);

    // L2: cocokkan origin PENUH (bukan prefix) — `startsWith` bocor ke
    // `http://localhost.evil.com` / `https://frontend.evil.com`. Normalisasi
    // trailing slash agar env FRONTEND_URL toleran.
    const norm = (u) => u.replace(/\/+$/, '');
    const allowedSet = new Set(allowed.map(norm));
    if (!origin || allowedSet.has(norm(origin))) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Id', 'X-Device-Label'],
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

// ─── Static Files (uploaded media) ────────────────────────────────────────────
// Media responden (foto/audio/tanda tangan) = PII. WAJIB JWT + role peninjau.
// Karena <img>/<audio>/<a> tak bisa mengirim header Authorization, token boleh
// lewat query ?t= (di-forward ke authMiddleware). Hanya admin/supervisor/viewer
// (termasuk role turunan) — surveyor TIDAK boleh mengakses media orang lain.
// Catatan keamanan: token di query bisa masuk log akses nginx; peningkatan
// lanjutan = media-token berumur-pendek terpisah dari JWT sesi.
const { authMiddleware, requireRole } = require('./middleware/auth');
const { signMediaToken, verifyMediaToken, MEDIA_TTL_SEC } = require('./utils/mediaToken');
const MEDIA_ROLES = ['admin', 'supervisor', 'viewer'];

// Mint token media berumur-pendek — frontend memakainya di URL <img>/<audio>
// alih-alih JWT sesi (kurangi paparan token sesi di log akses).
app.get('/auth/media-token', authMiddleware, requireRole(MEDIA_ROLES), (req, res) => {
  const token = signMediaToken({ id: req.user.id, role: req.user.role });
  res.json({ token, expiresInSec: MEDIA_TTL_SEC });
});

// Gerbang media: jalur utama = media-token via ?t=; fallback = JWT sesi
// (header, atau ?t= untuk kompat mundur). Keduanya butuh role peninjau.
async function mediaAuth(req, res, next) {
  const t = req.query.t;
  if (t) {
    const payload = verifyMediaToken(t);
    if (payload) {
      if (!MEDIA_ROLES.includes(payload.role)) {
        return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
      }
      req.user = { id: payload.id, role: payload.role };
      return next();
    }
    // Bukan media-token valid → perlakukan sebagai kemungkinan JWT sesi (kompat).
    if (!req.headers.authorization) req.headers.authorization = `Bearer ${t}`;
  }
  return authMiddleware(req, res, () => requireRole(MEDIA_ROLES)(req, res, next));
}

// Penyajian via mediaStorage (driver disk/s3 sesuai MEDIA_STORAGE) — dengan
// fallback dua arah: mode s3 tetap membaca file lama dari disk; mode disk
// tetap membaca objek yang terlanjur ada di MinIO (rollback aman).
const mediaStorage = require('./utils/mediaStorage');
app.get('/uploads/*', mediaAuth, async (req, res) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));
  try {
    const { stream, contentType, size } = await mediaStorage.getStream(relPath);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentType) res.type(contentType);
    else res.type(path.extname(relPath) || 'application/octet-stream');
    if (size != null) res.setHeader('Content-Length', size);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File tidak ditemukan' });
      else res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'MEDIA_BAD_PATH') {
      return res.status(400).json({ error: 'Path tidak valid' });
    }
    return res.status(404).json({ error: 'File tidak ditemukan' });
  }
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
app.use('/storage', require('./routes/storage'));
app.use('/map', require('./routes/map'));
app.use('/upload', require('./routes/upload'));
app.use('/sampling', require('./routes/sampling'));
app.use('/rt-selection', require('./routes/rtSelection'));
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
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}] pid=${process.pid}`);
  });

  // Graceful shutdown: berhenti terima koneksi baru → selesaikan in-flight →
  // tutup pool DB & Redis. Mencegah transaksi terputus paksa saat redeploy.
  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} diterima (pid=${process.pid}) — menutup server...`);
    const force = setTimeout(() => {
      console.error('[shutdown] batas waktu 15s — keluar paksa');
      process.exit(1);
    }, 15000);
    force.unref();
    server.close(async () => {
      try {
        const { sequelize } = require('./models');
        await sequelize.close();
      } catch (e) { console.error('[shutdown] gagal tutup DB:', e.message); }
      try {
        const redis = require('./config/redis');
        if (redis && redis.quit) await redis.quit();
      } catch (e) { console.error('[shutdown] gagal tutup Redis:', e.message); }
      clearTimeout(force);
      console.log('[shutdown] selesai — keluar');
      process.exit(0);
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
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

    let primaryShuttingDown = false;
    cluster.on('exit', (worker, code, signal) => {
      if (primaryShuttingDown) return; // jangan fork ulang saat shutdown
      // Backoff 1s agar worker yang crash-loop (mis. OOM) tak fork ketat tanpa henti.
      console.warn(`[cluster] worker pid=${worker.process.pid} berhenti (${signal || code}) — fork ulang dalam 1s`);
      setTimeout(() => { if (!primaryShuttingDown) cluster.fork(); }, 1000).unref();
    });

    const stopPrimary = (signal) => {
      if (primaryShuttingDown) return;
      primaryShuttingDown = true;
      console.log(`[cluster] primary ${signal} — menghentikan ${Object.keys(cluster.workers).length} worker...`);
      for (const w of Object.values(cluster.workers)) w.kill('SIGTERM');
      setTimeout(() => process.exit(0), 16000).unref();
    };
    process.on('SIGTERM', () => stopPrimary('SIGTERM'));
    process.on('SIGINT', () => stopPrimary('SIGINT'));
  } else {
    startServer();
  }
}

module.exports = app;
