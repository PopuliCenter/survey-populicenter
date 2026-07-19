/**
 * Unit Tests for Auth Module
 * Tests: login sukses admin, login sukses surveyor, kredensial salah,
 *        akun nonaktif, token expired, rate limiting, logout invalidasi token
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn(),
  },
  AuditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike') } },
}));

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
}));

const app = require('../../src/app');
const { User } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper to create a hashed password
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Helper to create a valid JWT token
function createToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Helper to create an expired token
function createExpiredToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
}

describe('Auth Module - POST /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: not rate limited
    redis.get.mockResolvedValue(null);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
  });

  test('login sukses admin - mengembalikan JWT dengan expiry 8 jam', async () => {
    const passwordHash = await hashPassword('AdminPass1');
    User.findOne.mockResolvedValue({
      id: 'admin-uuid-123',
      name: 'Admin User',
      email: 'admin@example.com',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      id: 'admin-uuid-123',
      email: 'admin@example.com',
      role: 'admin',
    });

    // Verify token payload and expiry
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('admin');
    expect(decoded.email).toBe('admin@example.com');
    // 8 hours = 28800 seconds; allow 5 second tolerance
    const expectedExp = Math.floor(Date.now() / 1000) + 28800;
    expect(decoded.exp).toBeGreaterThan(expectedExp - 10);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
  });

  test('login sukses surveyor - mengembalikan JWT dengan expiry 30 hari (sesi lapangan)', async () => {
    const passwordHash = await hashPassword('SurveyorPass1');
    User.findOne.mockResolvedValue({
      id: 'surveyor-uuid-456',
      name: 'Surveyor User',
      email: 'surveyor@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'surveyor@example.com', password: 'SurveyorPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('surveyor');

    // Verify token expiry is 30 hari — sesi lapangan TPD tahan lama (aman:
    // blacklist logout + cek akun nonaktif per request tetap bisa mencabut).
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    const expectedExp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 hari
    expect(decoded.exp).toBeGreaterThan(expectedExp - 10);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
  });

  // Requirements 6.6, 6.7, 10.5
  test('login sukses supervisor - JWT payload mengandung role supervisor dan expiry 8 jam', async () => {
    const passwordHash = await hashPassword('SupervisorPass1');
    User.findOne.mockResolvedValue({
      id: 'supervisor-uuid-001',
      name: 'Supervisor User',
      email: 'supervisor@example.com',
      password_hash: passwordHash,
      role: 'supervisor',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'supervisor@example.com', password: 'SupervisorPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      id: 'supervisor-uuid-001',
      email: 'supervisor@example.com',
      role: 'supervisor',
    });

    // Verify JWT payload contains correct role
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('supervisor');
    expect(decoded.id).toBe('supervisor-uuid-001');
    expect(decoded.email).toBe('supervisor@example.com');

    // Verify token expiry is 8 hours (Requirement 6.7)
    const expectedExp = Math.floor(Date.now() / 1000) + 28800; // 8 hours
    expect(decoded.exp).toBeGreaterThan(expectedExp - 10);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
  });

  // Requirements 6.6, 6.8, 10.5
  test('login sukses viewer - JWT payload mengandung role viewer dan expiry 8 jam', async () => {
    const passwordHash = await hashPassword('ViewerPass1');
    User.findOne.mockResolvedValue({
      id: 'viewer-uuid-001',
      name: 'Viewer User',
      email: 'viewer@example.com',
      password_hash: passwordHash,
      role: 'viewer',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'viewer@example.com', password: 'ViewerPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      id: 'viewer-uuid-001',
      email: 'viewer@example.com',
      role: 'viewer',
    });

    // Verify JWT payload contains correct role
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('viewer');
    expect(decoded.id).toBe('viewer-uuid-001');
    expect(decoded.email).toBe('viewer@example.com');

    // Verify token expiry is 8 hours (Requirement 6.8)
    const expectedExp = Math.floor(Date.now() / 1000) + 28800; // 8 hours
    expect(decoded.exp).toBeGreaterThan(expectedExp - 10);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
  });

  // Requirement 10.5 — audit log LOGIN dicatat untuk supervisor
  test('login supervisor - audit log LOGIN dicatat', async () => {
    const passwordHash = await hashPassword('SupervisorPass1');
    User.findOne.mockResolvedValue({
      id: 'supervisor-uuid-002',
      name: 'Supervisor Two',
      email: 'supervisor2@example.com',
      password_hash: passwordHash,
      role: 'supervisor',
      is_active: true,
    });

    const { AuditLog } = require('../../src/models');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'supervisor2@example.com', password: 'SupervisorPass1' });

    expect(res.status).toBe(200);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'supervisor-uuid-002',
        action: 'LOGIN',
      })
    );
  });

  // Requirement 10.5 — audit log LOGIN dicatat untuk viewer
  test('login viewer - audit log LOGIN dicatat', async () => {
    const passwordHash = await hashPassword('ViewerPass1');
    User.findOne.mockResolvedValue({
      id: 'viewer-uuid-002',
      name: 'Viewer Two',
      email: 'viewer2@example.com',
      password_hash: passwordHash,
      role: 'viewer',
      is_active: true,
    });

    const { AuditLog } = require('../../src/models');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'viewer2@example.com', password: 'ViewerPass1' });

    expect(res.status).toBe(200);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'viewer-uuid-002',
        action: 'LOGIN',
      })
    );
  });

  test('kredensial salah - password salah mengembalikan 401', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    User.findOne.mockResolvedValue({
      id: 'user-uuid-789',
      email: 'user@example.com',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email atau password tidak valid' });
    // Rate limit should be incremented
    expect(redis.incr).toHaveBeenCalled();
  });

  test('kredensial salah - email tidak ditemukan mengembalikan 401', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'notfound@example.com', password: 'SomePass1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email atau password tidak valid' });
    expect(redis.incr).toHaveBeenCalled();
  });

  test('akun nonaktif - mengembalikan 403', async () => {
    const passwordHash = await hashPassword('InactivePass1');
    User.findOne.mockResolvedValue({
      id: 'inactive-uuid',
      email: 'inactive@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: false,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'inactive@example.com', password: 'InactivePass1' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Akun Anda tidak aktif. Hubungi administrator' });
  });

  test('rate limiting - 5 kali gagal memblokir IP', async () => {
    // Simulate IP already blocked (count >= 5)
    redis.get.mockResolvedValue('5');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'any@example.com', password: 'AnyPass1' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit' });
  });

  test('rate limiting - blokir setelah 5 percobaan gagal berturut-turut', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    User.findOne.mockResolvedValue({
      id: 'user-uuid',
      email: 'user@example.com',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    });

    // Simulate 4 previous failures, this is the 5th
    redis.get.mockResolvedValueOnce('4'); // not yet blocked on check
    redis.incr.mockResolvedValue(5); // becomes 5 after increment

    // 5th failed attempt (wrong password)
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(redis.incr).toHaveBeenCalled();
  });

  test('body kosong - mengembalikan 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email atau password tidak valid' });
  });
});

describe('Auth Module - POST /auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    redis.setex.mockResolvedValue('OK');
  });

  test('logout berhasil - token di-blacklist di Redis', async () => {
    const token = createToken({ id: 'user-uuid', role: 'admin', email: 'admin@example.com' });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logout berhasil' });
    // Token should be blacklisted
    expect(redis.setex).toHaveBeenCalledWith(
      `blacklist:${token}`,
      expect.any(Number),
      '1'
    );
  });

  test('logout tanpa token - mengembalikan 401', async () => {
    const res = await request(app)
      .post('/auth/logout');

    expect(res.status).toBe(401);
  });

  test('logout dengan token yang sudah di-blacklist - mengembalikan 401', async () => {
    const token = createToken({ id: 'user-uuid', role: 'admin', email: 'admin@example.com' });
    redis.get.mockResolvedValue('1'); // token is blacklisted

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  // Requirement 10.6 — audit log LOGOUT dicatat untuk supervisor
  test('logout supervisor - audit log LOGOUT dicatat', async () => {
    const { AuditLog } = require('../../src/models');
    const token = createToken({ id: 'supervisor-uuid-001', role: 'supervisor', email: 'supervisor@example.com' });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'supervisor-uuid-001',
        action: 'LOGOUT',
      })
    );
  });

  // Requirement 10.6 — audit log LOGOUT dicatat untuk viewer
  test('logout viewer - audit log LOGOUT dicatat', async () => {
    const { AuditLog } = require('../../src/models');
    const token = createToken({ id: 'viewer-uuid-001', role: 'viewer', email: 'viewer@example.com' });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'viewer-uuid-001',
        action: 'LOGOUT',
      })
    );
  });
});

describe('Auth Module - GET /auth/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
  });

  test('GET /auth/me - mengembalikan profil user dari JWT', async () => {
    const token = createToken({ id: 'admin-uuid', role: 'admin', email: 'admin@example.com' });
    User.findByPk.mockResolvedValue({
      id: 'admin-uuid',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'admin-uuid',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  test('GET /auth/me tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Auth Module - Token Expired Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('token expired - authMiddleware mengembalikan 401', async () => {
    const expiredToken = createExpiredToken({ id: 'user-uuid', role: 'admin', email: 'admin@example.com' });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesi telah berakhir, silakan login kembali' });
  });

  test('token tidak valid - authMiddleware mengembalikan 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesi telah berakhir, silakan login kembali' });
  });
});

describe('Auth Module - Logout Invalidates Token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('token yang sudah di-logout tidak bisa digunakan untuk /auth/me', async () => {
    const token = createToken({ id: 'user-uuid', role: 'admin', email: 'admin@example.com' });

    // Key-aware mock (authMiddleware kini juga cek 'user_revoked:*' untuk M1):
    //  - user_revoked:* → selalu null (user tak dicabut)
    //  - blacklist:*    → null pada cek logout (1x), '1' pada /auth/me setelahnya
    let blacklistCalls = 0;
    redis.get.mockImplementation(async (key) => {
      if (String(key).startsWith('user_revoked:')) return null;
      if (String(key).startsWith('blacklist:')) {
        blacklistCalls += 1;
        return blacklistCalls >= 2 ? '1' : null;
      }
      return null;
    });

    redis.setex.mockResolvedValue('OK');

    // Logout
    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Try to use the same token
    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});

// ─── Kunci perangkat (1 akun TPD = 1 HP) pada /auth/login ────────────────────
// Akun TPD yang SUDAH terikat hanya boleh login dari perangkat terdaftar.
// Login tidak pernah MENGIKAT perangkat (pengikatan hanya lewat survei ber-lock).

describe('Kunci perangkat pada POST /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
  });

  async function mockSurveyor(overrides = {}) {
    User.findOne.mockResolvedValue({
      id: 'tpd-uuid-001',
      name: 'TPD Satu',
      email: 'tpd@example.com',
      password_hash: await hashPassword('TpdPass1'),
      role: 'surveyor',
      is_active: true,
      device_id: null,
      device_label: null,
      ...overrides,
    });
  }

  test('TPD belum terikat → login bebas dari perangkat mana pun (200)', async () => {
    await mockSurveyor({ device_id: null });

    const res = await request(app)
      .post('/auth/login')
      .set('X-Device-Id', 'device-baru')
      .send({ email: 'tpd@example.com', password: 'TpdPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    // Login TIDAK mengikat perangkat — pengikatan hanya lewat survei ber-lock.
    expect(User.update).not.toHaveBeenCalled();
  });

  test('TPD terikat + perangkat SAMA → login berhasil (200)', async () => {
    await mockSurveyor({ device_id: 'device-abc', device_label: 'Samsung SM-A515F' });

    const res = await request(app)
      .post('/auth/login')
      .set('X-Device-Id', 'device-abc')
      .send({ email: 'tpd@example.com', password: 'TpdPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('TPD terikat + perangkat BERBEDA → login DITOLAK (403) dengan label HP', async () => {
    await mockSurveyor({ device_id: 'device-abc', device_label: 'Samsung SM-A515F' });

    const res = await request(app)
      .post('/auth/login')
      .set('X-Device-Id', 'device-LAIN')
      .send({ email: 'tpd@example.com', password: 'TpdPass1' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body.error).toMatch(/terkunci ke perangkat lain/i);
    expect(res.body.error).toContain('Samsung SM-A515F');
  });

  test('TPD terikat + APK lama (tanpa header) → ditolak, minta perbarui aplikasi', async () => {
    await mockSurveyor({ device_id: 'device-abc' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'tpd@example.com', password: 'TpdPass1' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body.error).toMatch(/perbarui aplikasi/i);
  });

  test('ADMIN terikat perangkat lain → tetap bisa login (kunci hanya untuk TPD)', async () => {
    User.findOne.mockResolvedValue({
      id: 'admin-uuid-1',
      name: 'Admin',
      email: 'admin@example.com',
      password_hash: await hashPassword('AdminPass1'),
      role: 'admin',
      is_active: true,
      device_id: 'device-abc',
      device_label: 'HP lain',
    });

    const res = await request(app)
      .post('/auth/login')
      .set('X-Device-Id', 'device-BEDA')
      .send({ email: 'admin@example.com', password: 'AdminPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
