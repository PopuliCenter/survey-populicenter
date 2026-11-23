/**
 * Unit Tests — gerbang media /uploads/* (app.js).
 *
 * Yang dijaga (audit 2026-11-23):
 *   - Berkas unggahan selain gambar/audio TAK PERNAH dirender di domain aplikasi
 *     (dipaksa unduh + CSP sandbox) → cegah stored XSS lewat .html/.svg.
 *   - PII tak tersimpan cache bersama (Cache-Control: private, no-store).
 *   - Berkas ekspor hanya lewat rute unduh ber-cek-pemilik, bukan /uploads.
 *   - JWT sesi via ?t= ditolak (hanya media-token berumur pendek).
 *   - Pewarisan role berlaku (partner lokal = viewer); akun nonaktif ditolak.
 */

const { Readable } = require('stream');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockRedisStore = new Map();
jest.mock('../../src/config/redis', () => ({
  get: jest.fn(async (k) => (mockRedisStore.has(k) ? mockRedisStore.get(k) : null)),
  set: jest.fn(), setex: jest.fn(), incr: jest.fn(), expire: jest.fn(), del: jest.fn(),
  call: jest.fn().mockResolvedValue('sha-test'),
}));
jest.mock('../../src/config/queue', () => ({ queue: { add: jest.fn() } }));
jest.mock('../../src/models', () => ({ Sequelize: { Op: {} } }));
jest.mock('../../src/utils/mediaStorage', () => ({
  getStream: jest.fn(),
  isS3: () => false,
}));

const app = require('../../src/app');
const mediaStorage = require('../../src/utils/mediaStorage');
const { signMediaToken } = require('../../src/utils/mediaToken');

const JWT_SECRET = process.env.JWT_SECRET;

function stored(contentType = null) {
  mediaStorage.getStream.mockResolvedValue({ stream: Readable.from([Buffer.from('isi')]), contentType, size: 3 });
}
const mt = (role, id = `${role}-1`) => encodeURIComponent(signMediaToken({ id, role }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisStore.clear();
});

test('foto: tampil inline, no-store, CSP sandbox', async () => {
  stored();
  const res = await request(app).get(`/uploads/photos/2026-11-23/a.jpg?t=${mt('admin')}`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
  expect(res.headers['content-disposition']).toBeUndefined();
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.headers['content-security-policy']).toMatch(/sandbox/);
});

test.each([
  ['uploads/photos/x.html', null],
  ['uploads/photos/x.svg', null],
  ['uploads/photos/x.png', 'text/html'], // mode s3: MIME dari klien
])('%s (%s) → dipaksa unduh, bukan dirender', async (p, ct) => {
  stored(ct);
  const res = await request(app).get(`/${p}?t=${mt('admin')}`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
  expect(res.headers['content-disposition']).toBe('attachment');
});

test('berkas ekspor tak bisa diambil lewat /uploads', async () => {
  const res = await request(app).get(`/uploads/exports/archive-123.zip?t=${mt('admin')}`);
  expect(res.status).toBe(404);
  expect(mediaStorage.getStream).not.toHaveBeenCalled();
});

test('JWT sesi lewat ?t= ditolak', async () => {
  stored();
  const sessionJwt = jwt.sign({ id: 'a1', role: 'admin', email: 'a@b.c' }, JWT_SECRET, { expiresIn: '8h' });
  const res = await request(app).get(`/uploads/photos/a.jpg?t=${sessionJwt}`);
  expect(res.status).toBe(401);
  expect(mediaStorage.getStream).not.toHaveBeenCalled();
});

test('JWT sesi di header Authorization tetap diterima', async () => {
  stored();
  const sessionJwt = jwt.sign({ id: 'a1', role: 'admin', email: 'a@b.c' }, JWT_SECRET, { expiresIn: '8h' });
  const res = await request(app).get('/uploads/photos/a.jpg').set('Authorization', `Bearer ${sessionJwt}`);
  expect(res.status).toBe(200);
});

test('pewarisan role: partner lokal (= viewer) boleh melihat media', async () => {
  stored();
  const res = await request(app).get(`/uploads/photos/a.jpg?t=${mt('partner_lokal')}`);
  expect(res.status).toBe(200);
});

test('TPD (surveyor) ditolak', async () => {
  const res = await request(app).get(`/uploads/photos/a.jpg?t=${mt('surveyor')}`);
  expect(res.status).toBe(403);
});

test('akun dinonaktifkan → media-token yang masih berlaku ditolak', async () => {
  mockRedisStore.set('user_revoked:v-off', '1');
  stored();
  const res = await request(app).get(`/uploads/photos/a.jpg?t=${mt('viewer', 'v-off')}`);
  expect(res.status).toBe(401);
});
