/**
 * Unit Tests — rilis aplikasi TPD (notifikasi pembaruan APK).
 *
 *   utils/appRelease            — validasi: https + domain resmi, SHA-256 wajib
 *                                 bila ada tautan APK, versi tak boleh turun
 *   GET  /public/app-version    — tanpa login, bentuk publik rilis terbaru
 *   GET/POST /monitoring/app-releases — khusus admin; push hanya saat versi naik
 */

const express = require('express');
const request = require('supertest');

let mockUser = { id: 'admin-1', role: 'admin' };
jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  return { ...actual, authMiddleware: (req, res, next) => { req.user = mockUser; next(); } };
});
jest.mock('../../src/models', () => ({
  AppRelease: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  User: { findAll: jest.fn() },
  FcmToken: {},
  AuditLog: { create: jest.fn() },
  sequelize: {},
}));
jest.mock('../../src/config/redis', () => ({ get: jest.fn(), status: 'ready', ping: jest.fn() }));
jest.mock('../../src/config/queue', () => ({ queue: { add: jest.fn() } }));
jest.mock('../../src/utils/push', () => ({ sendPushToUser: jest.fn().mockResolvedValue({ sent: 1 }) }));

const { AppRelease, User, AuditLog } = require('../../src/models');
const { sendPushToUser } = require('../../src/utils/push');
const { validateRelease, isAllowedUrl } = require('../../src/utils/appRelease');
const publicRouter = require('../../src/routes/public');
const monitoringRouter = require('../../src/routes/monitoring');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/public', publicRouter);
  app.use('/monitoring', monitoringRouter);
  return app;
}

const SHA = 'a'.repeat(64);
const valid = {
  version_code: 29,
  version_name: '1.0.1',
  min_version_code: 27,
  notes: 'Perbaikan keamanan.',
  page_url: 'https://populicenter.org/aplikasi-survei',
  apk_url: 'https://populicenter.org/unduh/SurveiPopuliCenter-code29.apk',
  apk_sha256: SHA.toUpperCase(),
};
const row = (over = {}) => ({ id: 'r1', created_at: new Date('2026-11-25T00:00:00Z'), ...valid, apk_sha256: SHA, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'admin-1', role: 'admin' };
  AppRelease.findOne.mockResolvedValue(null);
  AppRelease.create.mockImplementation(async (v) => row(v));
  AuditLog.create.mockResolvedValue({});
  User.findAll.mockResolvedValue([{ id: 'tpd-1' }, { id: 'tpd-2' }, { id: 'tpd-1' }]);
});

describe('validateRelease', () => {
  test('isian sah → tanpa galat, SHA dinormalkan huruf kecil', () => {
    const { errors, value } = validateRelease(valid, null);
    expect(errors).toEqual([]);
    expect(value.apk_sha256).toBe(SHA);
  });

  test.each([
    ['http (bukan https)', { page_url: 'http://populicenter.org/a' }],
    ['domain asing', { page_url: 'https://populicenter.org.evil.id/a' }],
    ['APK di domain asing', { apk_url: 'https://drive.google.com/x.apk' }],
    ['APK tanpa SHA-256', { apk_sha256: '' }],
    ['versi minimum > versi', { min_version_code: 30 }],
    ['kode versi bukan angka', { version_code: 'dua' }],
  ])('ditolak: %s', (_, over) => {
    expect(validateRelease({ ...valid, ...over }, null).errors.length).toBeGreaterThan(0);
  });

  test('kode versi tak boleh turun dari rilis terakhir', () => {
    expect(validateRelease(valid, { version_code: 30 }).errors[0]).toMatch(/turun/);
  });

  test('Google Play diizinkan; tanpa APK juga sah (unduh lewat halaman)', () => {
    expect(isAllowedUrl('https://play.google.com/store/apps/details?id=com.populicenter.survey')).toBe(true);
    expect(validateRelease({ ...valid, apk_url: '', apk_sha256: '' }, null).errors).toEqual([]);
  });
});

describe('GET /public/app-version', () => {
  test('tanpa login → rilis terbaru, tanpa id/pembuat, tak di-cache', async () => {
    AppRelease.findOne.mockResolvedValue(row({ created_by: 'admin-1' }));
    const res = await request(makeApp()).get('/public/app-version');
    expect(res.status).toBe(200);
    expect(res.body.release).toMatchObject({ version_code: 29, min_version_code: 27, apk_sha256: SHA });
    expect(res.body.release.id).toBeUndefined();
    expect(res.body.release.created_by).toBeUndefined();
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('belum ada rilis → release null', async () => {
    const res = await request(makeApp()).get('/public/app-version');
    expect(res.body.release).toBeNull();
  });
});

describe('POST /monitoring/app-releases', () => {
  test('admin, versi naik → tersimpan, diaudit, push ke tiap TPD sekali', async () => {
    AppRelease.findOne.mockResolvedValue(row({ version_code: 28 }));
    const res = await request(makeApp()).post('/monitoring/app-releases').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.announced).toBe(true);
    expect(AppRelease.create.mock.calls[0][0]).toMatchObject({ version_code: 29, created_by: 'admin-1', apk_sha256: SHA });
    expect(AuditLog.create.mock.calls[0][0].action).toBe('PUBLISH_APP_RELEASE');
    await new Promise((r) => setImmediate(r));
    expect(sendPushToUser).toHaveBeenCalledTimes(2);
    expect(sendPushToUser.mock.calls[0][1].data).toEqual({ type: 'app_update', version_code: '29' });
  });

  test('kode versi sama (koreksi tautan) → tanpa push ulang', async () => {
    AppRelease.findOne.mockResolvedValue(row({ version_code: 29 }));
    const res = await request(makeApp()).post('/monitoring/app-releases').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.announced).toBe(false);
    await new Promise((r) => setImmediate(r));
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  test('isian tak sah → 422, tak tersimpan', async () => {
    const res = await request(makeApp()).post('/monitoring/app-releases').send({ ...valid, page_url: 'https://bit.ly/x' });
    expect(res.status).toBe(422);
    expect(AppRelease.create).not.toHaveBeenCalled();
  });

  test.each(['supervisor', 'asisten_supervisor', 'viewer', 'surveyor'])('%s ditolak (403)', async (role) => {
    mockUser = { id: 'x', role };
    const res = await request(makeApp()).post('/monitoring/app-releases').send(valid);
    expect(res.status).toBe(403);
    expect(AppRelease.create).not.toHaveBeenCalled();
  });
});
