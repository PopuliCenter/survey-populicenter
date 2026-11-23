/**
 * Unit Tests — pencabutan sesi berbasis user (utils/sessionRevocation.js).
 *
 * Yang dijaga (audit 2026-11-23):
 *   - TTL penanda ≥ umur token terpanjang. Dulu 12 jam vs token TPD 30 hari →
 *     TPD yang dinonaktifkan bisa masuk lagi setelah 12 jam.
 *   - Ganti password menolak token yang terbit SEBELUMNYA, token baru tetap jalan.
 *   - Hook model User: password_hash berubah → sesi lama dicabut; is_active tetap.
 *   - authMiddleware menolak token basi dengan 401.
 */

const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');

const mockStore = new Map();
jest.mock('../../src/config/redis', () => ({
  get: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k).v : null)),
  setex: jest.fn(async (k, ttl, v) => { mockStore.set(k, { v, ttl }); return 'OK'; }),
  del: jest.fn(async (k) => (mockStore.delete(k) ? 1 : 0)),
}));

const sr = require('../../src/utils/sessionRevocation');
const { authMiddleware } = require('../../src/middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;

beforeEach(() => mockStore.clear());

describe('umur token & TTL penanda', () => {
  test('TTL penanda ≥ umur token terpanjang (TPD 30 hari)', () => {
    expect(sr.tokenTtlSec('surveyor')).toBe(30 * 24 * 3600);
    expect(sr.tokenTtlSec('admin')).toBe(8 * 3600);
    expect(sr.tokenTtlSec('role-tak-dikenal')).toBe(8 * 3600);
    Object.values(sr.TOKEN_TTL_SEC).forEach((ttl) => expect(sr.MARKER_TTL_SEC).toBeGreaterThanOrEqual(ttl));
  });

  test('revokeUser memakai TTL penanda, bukan 12 jam', async () => {
    await sr.revokeUser('u1');
    expect(mockStore.get('user_revoked:u1').ttl).toBe(sr.MARKER_TTL_SEC);
  });
});

describe('sessionRejection', () => {
  test('akun dicabut → revoked; re-aktivasi → boleh lagi', async () => {
    await sr.revokeUser('u1');
    expect(await sr.sessionRejection({ id: 'u1', iat: 1 })).toBe('revoked');
    await sr.clearRevocation('u1');
    expect(await sr.sessionRejection({ id: 'u1', iat: 1 })).toBeNull();
  });

  test('ganti password: token lama stale, token sesudahnya boleh', async () => {
    await sr.invalidateSessionsBefore('u1', 1_800_000_000_000); // detik 1.800.000.000
    expect(await sr.sessionRejection({ id: 'u1', iat: 1_799_999_999 })).toBe('stale');
    expect(await sr.sessionRejection({ id: 'u1', iat: 1_800_000_000 })).toBeNull();
    expect(await sr.sessionRejection({ id: 'u2', iat: 1 })).toBeNull();
  });
});

describe('authMiddleware', () => {
  function run(token) {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return authMiddleware(req, res, next).then(() => ({ res, next }));
  }

  test('token terbit sebelum ganti password → 401 dengan pesan jelas', async () => {
    const iat = Math.floor(Date.now() / 1000) - 60;
    const token = jwt.sign({ id: 'u1', role: 'surveyor', email: 'a@b.c', iat }, JWT_SECRET, { expiresIn: '30d' });
    await sr.invalidateSessionsBefore('u1');

    const { res, next } = await run(token);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/password/i);
  });

  test('token sehat → lanjut', async () => {
    const token = jwt.sign({ id: 'u9', role: 'admin', email: 'a@b.c' }, JWT_SECRET, { expiresIn: '8h' });
    const { next } = await run(token);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('hook model User', () => {
  // define() tak membuka koneksi; hook dijalankan langsung lewat runHooks.
  const sequelize = new Sequelize('postgres://u:p@127.0.0.1:1/x', { logging: false });
  const User = require('../../src/models/User')(sequelize);

  function existing(attrs) {
    return User.build({ name: 'A', email: 'a@b.c', password_hash: 'h1', role: 'surveyor', is_active: true, ...attrs }, { isNewRecord: false, raw: true });
  }

  test('password_hash berubah → sesi lama dicabut, akun TIDAK dinonaktifkan', async () => {
    const u = existing({ id: '11111111-1111-4111-8111-111111111111' });
    u.password_hash = 'h2';
    await User.runHooks('afterUpdate', u);
    expect(mockStore.has(`user_valid_after:${u.id}`)).toBe(true);
    expect(mockStore.has(`user_revoked:${u.id}`)).toBe(false);
  });

  test('hanya nama berubah → tak ada pencabutan', async () => {
    const u = existing({ id: '22222222-2222-4222-8222-222222222222' });
    u.name = 'B';
    await User.runHooks('afterUpdate', u);
    expect(mockStore.size).toBe(0);
  });
});
