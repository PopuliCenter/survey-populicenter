/**
 * Unit Tests — push FCM: registrasi token perangkat + perilaku util push.
 *
 * POST /notifications/fcm-token (KHUSUS TPD — aplikasi yang menyetor token).
 * utils/push.js harus NO-OP total tanpa FIREBASE_SERVICE_ACCOUNT_PATH:
 * lingkungan dev/tes/VPS-belum-berkunci tidak boleh tersentuh kegagalan push.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  TpdNotification: {
    create: jest.fn().mockResolvedValue({}),
    bulkCreate: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue([0]),
  },
  FcmToken: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
  User: { findAll: jest.fn(), findOne: jest.fn() },
  Survey: {},
  Sequelize: { Op: { is: Symbol('is') } },
  sequelize: {
    fn: jest.fn((f, c) => ({ fn: f, c })),
    col: jest.fn((c) => c),
    literal: jest.fn((s) => ({ literal: s })),
  },
}));

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  call: jest.fn().mockResolvedValue('sha-test'),
}));

const app = require('../../src/app');
const { FcmToken, User, TpdNotification } = require('../../src/models');
const { sendPushToUser, isPushEnabled } = require('../../src/utils/push');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function tokenFor(role, id = `${role}-uuid-001`) {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET, { expiresIn: '8h' });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── utils/push — mode NONAKTIF (tanpa kunci Firebase) ───────────────────────

describe('utils/push tanpa FIREBASE_SERVICE_ACCOUNT_PATH', () => {
  test('nonaktif: sendPushToUser no-op aman, tidak menyentuh DB, tidak melempar', async () => {
    expect(process.env.FIREBASE_SERVICE_ACCOUNT_PATH).toBeUndefined();
    expect(isPushEnabled()).toBe(false);
    const hasil = await sendPushToUser('tpd-001', { title: 'Halo', body: 'Tes' });
    expect(hasil).toEqual({ sent: 0, pruned: 0 });
    expect(FcmToken.findAll).not.toHaveBeenCalled();
  });
});

// ─── POST /notifications/fcm-token ───────────────────────────────────────────

describe('POST /notifications/fcm-token', () => {
  test('hanya TPD — admin/supervisor/viewer ditolak 403', async () => {
    for (const role of ['admin', 'supervisor', 'viewer']) {
      const res = await request(app)
        .post('/notifications/fcm-token')
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .send({ token: 'tok-abc' });
      expect(res.status).toBe(403);
    }
    expect(FcmToken.create).not.toHaveBeenCalled();
  });

  test('token baru → dibuat untuk TPD ini', async () => {
    FcmToken.findOne.mockResolvedValue(null);
    FcmToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/notifications/fcm-token')
      .set('Authorization', `Bearer ${tokenFor('surveyor')}`)
      .send({ token: 'tok-abc', platform: 'android' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: true });
    expect(FcmToken.create).toHaveBeenCalledWith({
      user_id: 'surveyor-uuid-001',
      token: 'tok-abc',
      platform: 'android',
    });
  });

  test('token sudah ada (perangkat pindah akun) → kepemilikan DIPINDAH, bukan duplikat', async () => {
    const row = { update: jest.fn().mockResolvedValue({}) };
    FcmToken.findOne.mockResolvedValue(row);

    const res = await request(app)
      .post('/notifications/fcm-token')
      .set('Authorization', `Bearer ${tokenFor('surveyor', 'tpd-baru')}`)
      .send({ token: 'tok-abc' });

    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ user_id: 'tpd-baru', platform: 'android' });
    expect(FcmToken.create).not.toHaveBeenCalled();
  });

  test('token kosong / kepanjangan → 422', async () => {
    for (const bad of [{ token: '' }, {}, { token: 'x'.repeat(513) }]) {
      const res = await request(app)
        .post('/notifications/fcm-token')
        .set('Authorization', `Bearer ${tokenFor('surveyor')}`)
        .send(bad);
      expect(res.status).toBe(422);
    }
  });
});

// ─── GET /notifications/surveyor/:id — riwayat peringatan per TPD ────────────

describe('GET /notifications/surveyor/:id', () => {
  test('TPD & viewer ditolak 403 (khusus admin/SPV)', async () => {
    for (const role of ['surveyor', 'viewer']) {
      const res = await request(app)
        .get('/notifications/surveyor/tpd-1')
        .set('Authorization', `Bearer ${tokenFor(role)}`);
      expect(res.status).toBe(403);
    }
  });

  test('akun TPD tidak ada → 404', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/notifications/surveyor/bukan-tpd')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(404);
  });

  test('res.body: rekap per jenis + unread + daftar dengan pengirim & judul survei', async () => {
    User.findOne.mockResolvedValue({ id: 'tpd-1', name: 'TPD Satu' });
    TpdNotification.findAll
      .mockResolvedValueOnce([{
        id: 'n1',
        type: 'quality',
        title: 'Wawancara singkat',
        body: 'Durasi 12 detik.',
        read_at: null,
        created_at: '2026-07-23T10:00:00Z',
        sender: null,
        survey: { id: 's1', title: 'Survei Sampel' },
      }])
      .mockResolvedValueOnce([
        { type: 'quality', count: '3', unread: '2' },
        { type: 'manual', count: '1', unread: '0' },
      ]);

    const res = await request(app)
      .get('/notifications/surveyor/tpd-1')
      .set('Authorization', `Bearer ${tokenFor('supervisor')}`);

    expect(res.status).toBe(200);
    expect(res.body.surveyor).toEqual({ id: 'tpd-1', name: 'TPD Satu' });
    // Rekap dari SELURUH riwayat (query group), bukan dari 200 baris terbaru.
    expect(res.body.counts).toEqual({ manual: 1, review: 0, quality: 3, unread: 2 });
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'quality',
      title: 'Wawancara singkat',
      survey_title: 'Survei Sampel',
      sender_name: null,
      read_at: null,
    });
  });
});

// ─── Kiriman manual tetap sukses saat push nonaktif ──────────────────────────

describe('POST /notifications (manual) dengan push nonaktif', () => {
  test('lonceng tetap terkirim (201) — push hanya lapisan tambahan', async () => {
    User.findAll.mockResolvedValue([{ id: 'tpd-1' }, { id: 'tpd-2' }]);
    TpdNotification.bulkCreate.mockResolvedValue([{}, {}]);

    const res = await request(app)
      .post('/notifications')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ surveyor_ids: ['tpd-1', 'tpd-2'], title: 'Halo', body: 'Kumpul besok.' });

    expect(res.status).toBe(201);
    expect(res.body.sent).toBe(2);
  });
});
