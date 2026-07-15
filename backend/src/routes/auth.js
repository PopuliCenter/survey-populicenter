const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { User } = require('../models');
const redis = require('../config/redis');
const { authMiddleware } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { readDeviceHeaders, checkBoundDevice } = require('../utils/deviceLock');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Server cannot start.');
  process.exit(1);
}

// IP asli klien (dari Cloudflare), bukan IP nginx internal.
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;

// ── Limiter login dua lapis ───────────────────────────────────────────────────
// Operator seluler Indonesia memakai CGNAT: puluhan TPD di satu wilayah bisa
// tampil sebagai SATU IP. Limiter lama (per-IP, 10/15mnt) membuat gelombang
// login pagi hari survei saling memblokir (30 TPD login serentak → TPD ke-11
// tertolak). Solusi:
//   Lapis 1 (per IP+email): tiap akun punya jatahnya sendiri per jaringan —
//     brute-force SATU akun tetap tercekik, TPD sebelahan tidak kena imbas.
//   Lapis 2 (per IP, plafon kasar): pagar terhadap tebakan terdistribusi
//     banyak-akun dari satu IP. Default 100/15mnt ≈ aman utk ±50 TPD se-CGNAT.
// Keduanya bisa disetel via env saat survei sangat besar:
//   LOGIN_RATE_LIMIT_MAX (default 10) · LOGIN_IP_RATE_LIMIT_MAX (default 100)
const LOGIN_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10;
const LOGIN_IP_MAX = parseInt(process.env.LOGIN_IP_RATE_LIMIT_MAX, 10) || 100;

// Di lingkungan test, JANGAN konstruksi RedisStore (konstruktornya memanggil
// redis.call yang di-mock → error saat import). Pakai memory store default;
// limiter juga di-skip via `skip` di bawah.
const redisStore = (prefix) =>
  process.env.NODE_ENV === 'test' ? {} : {
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix, // prefix unik antar limiter agar tidak bentrok (ERR_ERL_DOUBLE_COUNT)
    }),
  };

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${clientIp(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
  ...redisStore('rl:login:'),
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: LOGIN_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  ...redisStore('rl:loginip:'),
  message: { error: 'Terlalu banyak percobaan login dari jaringan ini. Coba lagi dalam 15 menit.' },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * POST /auth/login
 * Authenticate user and issue JWT
 */
router.post('/login', loginIpLimiter, loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({ error: 'Email atau password tidak valid' });
    }

    // Check rate limit before processing login
    const isBlocked = await checkRateLimit(req.ip);
    if (isBlocked) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit' });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });

    if (!user) {
      // Increment rate limit counter on failed attempt
      await incrementRateLimit(req.ip);
      return res.status(401).json({ error: 'Email atau password tidak valid' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment rate limit counter on failed attempt
      await incrementRateLimit(req.ip);
      return res.status(401).json({ error: 'Email atau password tidak valid' });
    }

    // Check if account is active (after password verification to avoid user enumeration)
    if (!user.is_active) {
      return res.status(403).json({ error: 'Akun Anda tidak aktif. Hubungi administrator' });
    }

    // Kunci perangkat (1 akun TPD = 1 HP): akun TPD yang SUDAH terikat hanya boleh
    // login dari perangkat terdaftar — ditolak sejak halaman masuk, bukan baru
    // ketahuan saat mau mengisi. Login TIDAK pernah mengikat perangkat baru;
    // pengikatan hanya lewat survei ber-device_lock. Jadi TPD yang belum terikat
    // tetap bebas login dari mana pun. Admin/supervisor tidak terpengaruh.
    if (user.role === 'surveyor') {
      const { deviceId } = readDeviceHeaders(req);
      const deviceCheck = checkBoundDevice(user, deviceId);
      if (!deviceCheck.ok) {
        return res.status(deviceCheck.status).json({ error: deviceCheck.error });
      }
    }

    // Clear rate limit on successful login
    await clearRateLimit(req.ip);

    // Issue JWT with different expiry based on role
    // admin, supervisor, viewer: 8 hours; surveyor: 12 hours
    const expiresIn = user.role === 'surveyor' ? '12h' : '8h';
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn }
    );

    // Audit log: record login event
    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout
 * Blacklist token in Redis
 */
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    // Decode token to get expiry time
    const decoded = jwt.decode(token);
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    if (ttl > 0) {
      // Blacklist token with TTL = remaining expiry time
      await redis.setex(`blacklist:${token}`, ttl, '1');
    }

    // Audit log: record logout event
    await createAuditLog({
      userId: req.user.id,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Logout berhasil' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 * Get current user profile from JWT
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at'],
    });

    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

/**
 * Rate limiting helper functions
 */
async function incrementRateLimit(ip) {
  const key = `rate_limit:login:${ip}`;
  const count = await redis.incr(key);

  // Set TTL on first failure
  if (count === 1) {
    await redis.expire(key, 900); // 15 minutes
  }

  return count;
}

async function checkRateLimit(ip) {
  const key = `rate_limit:login:${ip}`;
  const count = await redis.get(key);
  return count && parseInt(count, 10) >= 5;
}

async function clearRateLimit(ip) {
  const key = `rate_limit:login:${ip}`;
  await redis.del(key);
}

module.exports = router;
