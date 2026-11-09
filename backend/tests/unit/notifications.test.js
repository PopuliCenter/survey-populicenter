/**
 * Unit Tests — routes/notifications.js (pemberitahuan dashboard → app TPD)
 *
 * Yang dijaga:
 *   - kirim manual hanya admin/SPV; tepat sasaran (hanya akun role surveyor)
 *   - TPD hanya melihat pemberitahuan MILIKNYA + unread_count (kontrak res.body)
 *   - tanda-dibaca terkunci ke pemiliknya (tak bisa menandai punya orang)
 *   - validasi judul/isi/tujuan
 */

const express = require('express');
const request = require('supertest');

let mockCurrentUser = { id: 'tpd-1', role: 'surveyor' };
const mockRequiredRoles = [];
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = mockCurrentUser; next(); },
  requireRole: (roles) => {
    mockRequiredRoles.push(roles);
    return (req, res, next) => {
      const base = req.user.role === 'asisten_supervisor' ? 'supervisor' : req.user.role;
      const allowed = Array.isArray(roles) ? roles : [roles];
      if (!allowed.includes(req.user.role) && !allowed.includes(base)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      next();
    };
  },
}));

jest.mock('../../src/models', () => ({
  TpdNotification: {
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    findByPk: jest.fn(),
  },
  User: { findAll: jest.fn(), findOne: jest.fn() },
  AuditLog: { create: jest.fn() },
  // Transaksi terkelola: callback dijalankan dengan penanda transaksi palsu
  // supaya tes bisa memastikan hapus & audit memakai transaksi YANG SAMA.
  sequelize: { transaction: jest.fn(async (cb) => cb('tx-1')) },
}));

const { TpdNotification, User, AuditLog, sequelize } = require('../../src/models');
const notifRouter = require('../../src/routes/notifications');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notifRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { id: 'tpd-1', role: 'surveyor' };
  User.findAll.mockResolvedValue([{ id: 'tpd-1' }, { id: 'tpd-2' }]);
  TpdNotification.bulkCreate.mockImplementation(async (rows) => rows);
  TpdNotification.findAll.mockResolvedValue([]);
  TpdNotification.count.mockResolvedValue(0);
  TpdNotification.update.mockResolvedValue([1]);
  TpdNotification.destroy.mockResolvedValue(0);
  TpdNotification.findByPk.mockResolvedValue(null);
  User.findOne.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
  sequelize.transaction.mockImplementation(async (cb) => cb('tx-1'));
});

const NOTIF_ID = '11111111-2222-4333-8444-555555555555';
const TPD_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('POST /notifications — kirim manual', () => {
  test('admin mengirim ke TPD terpilih → satu baris per TPD sasaran', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };

    const res = await request(makeApp()).post('/notifications').send({
      surveyor_ids: ['tpd-1', 'tpd-2'],
      survey_id: 'srv-1',
      title: 'Data Anda belum masuk',
      body: 'Mohon sinkronkan aplikasi hari ini.',
    });

    expect(res.status).toBe(201);
    expect(res.body.sent).toBe(2);
    const rows = TpdNotification.bulkCreate.mock.calls[0][0];
    expect(rows.map((r) => r.surveyor_id).sort()).toEqual(['tpd-1', 'tpd-2']);
    rows.forEach((r) => {
      expect(r.type).toBe('manual');
      expect(r.created_by).toBe('admin-1');
      expect(r.survey_id).toBe('srv-1');
    });
  });

  test('id yang bukan akun TPD dibuang diam-diam (kiriman tetap jalan ke yang sah)', async () => {
    mockCurrentUser = { id: 'spv-1', role: 'supervisor' };
    User.findAll.mockResolvedValue([{ id: 'tpd-1' }]); // hanya 1 dari 2 yang sah

    const res = await request(makeApp()).post('/notifications').send({
      surveyor_ids: ['tpd-1', 'bukan-tpd'],
      title: 'Halo',
      body: 'Pesan uji.',
    });

    expect(res.status).toBe(201);
    expect(res.body.sent).toBe(1);
  });

  test('TPD tidak boleh mengirim (403)', async () => {
    const res = await request(makeApp()).post('/notifications').send({
      surveyor_ids: ['tpd-2'], title: 'x', body: 'y',
    });

    expect(res.status).toBe(403);
    expect(TpdNotification.bulkCreate).not.toHaveBeenCalled();
  });

  test.each([
    ['tanpa tujuan', { title: 'x', body: 'y' }],
    ['tujuan kosong', { surveyor_ids: [], title: 'x', body: 'y' }],
    ['tanpa judul', { surveyor_ids: ['tpd-1'], body: 'y' }],
    ['tanpa isi', { surveyor_ids: ['tpd-1'], title: 'x' }],
  ])('%s → 422', async (_label, body) => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };

    const res = await request(makeApp()).post('/notifications').send(body);

    expect(res.status).toBe(422);
  });
});

describe('GET /notifications — milik sendiri + unread_count', () => {
  test('mengembalikan daftar milik TPD login dan hitungan belum-dibaca', async () => {
    TpdNotification.findAll.mockResolvedValue([
      { id: 'n1', type: 'review', title: 'Respons ditandai', body: '...', read_at: null, created_at: new Date() },
    ]);
    TpdNotification.count.mockResolvedValue(1);

    const res = await request(makeApp()).get('/notifications');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.unread_count).toBe(1);
    // Scoping: query WAJIB dibatasi ke TPD login.
    expect(TpdNotification.findAll.mock.calls[0][0].where).toEqual({ surveyor_id: 'tpd-1' });
  });
});

describe('PATCH tanda dibaca', () => {
  test('read-all hanya menandai milik TPD login yang belum dibaca', async () => {
    const res = await request(makeApp()).patch('/notifications/read-all');

    expect(res.status).toBe(200);
    const where = TpdNotification.update.mock.calls[0][1].where;
    expect(where.surveyor_id).toBe('tpd-1');
    expect(where.read_at).toBeNull();
  });

  test(':id/read terkunci ke pemilik (id + surveyor_id di WHERE)', async () => {
    const res = await request(makeApp()).patch('/notifications/n-9/read');

    expect(res.status).toBe(200);
    const where = TpdNotification.update.mock.calls[0][1].where;
    expect(where.id).toBe('n-9');
    expect(where.surveyor_id).toBe('tpd-1');
  });
});

describe('DELETE /notifications/:id — hapus satu pesan (KHUSUS admin)', () => {
  function rowFixture() {
    return {
      id: NOTIF_ID,
      surveyor_id: TPD_ID,
      type: 'manual',
      title: 'Data belum masuk',
      body: 'Mohon sinkronkan hari ini.',
      read_at: null,
      created_at: new Date('2026-11-09T04:00:00Z'),
      destroy: jest.fn().mockResolvedValue(),
    };
  }

  test('admin → 200 {deleted:1}; hapus & audit dalam transaksi yang sama, isi pesan diarsip di audit', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    const row = rowFixture();
    TpdNotification.findByPk.mockResolvedValue(row);

    const res = await request(makeApp()).delete(`/notifications/${NOTIF_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1 });
    expect(row.destroy).toHaveBeenCalledWith({ transaction: 'tx-1' });
    const [audit, opts] = AuditLog.create.mock.calls[0];
    expect(opts).toEqual({ transaction: 'tx-1' });
    expect(audit).toMatchObject({
      user_id: 'admin-1',
      action: 'DELETE_TPD_NOTIFICATION',
      entity_type: 'tpd_notification',
      entity_id: NOTIF_ID,
      new_value: null,
    });
    expect(audit.old_value).toMatchObject({
      surveyor_id: TPD_ID, type: 'manual', title: 'Data belum masuk', body: 'Mohon sinkronkan hari ini.',
    });
  });

  test.each(['supervisor', 'asisten_supervisor', 'surveyor', 'viewer'])('%s → 403, tidak ada yang terhapus', async (role) => {
    mockCurrentUser = { id: `${role}-1`, role };
    const row = rowFixture();
    TpdNotification.findByPk.mockResolvedValue(row);

    const res = await request(makeApp()).delete(`/notifications/${NOTIF_ID}`);

    expect(res.status).toBe(403);
    expect(row.destroy).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('id bukan UUID → 404 tanpa menyentuh DB (bukan 500 dari Postgres)', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    const res = await request(makeApp()).delete('/notifications/bukan-uuid');

    expect(res.status).toBe(404);
    expect(TpdNotification.findByPk).not.toHaveBeenCalled();
  });

  test('pesan tak ada → 404, tanpa audit', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    const res = await request(makeApp()).delete(`/notifications/${NOTIF_ID}`);

    expect(res.status).toBe(404);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('audit gagal → 500 (transaksi batal, hapus tak boleh tanpa jejak)', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    TpdNotification.findByPk.mockResolvedValue(rowFixture());
    AuditLog.create.mockRejectedValue(new Error('db down'));

    const res = await request(makeApp()).delete(`/notifications/${NOTIF_ID}`);

    expect(res.status).toBe(500);
  });
});

describe('DELETE /notifications/surveyor/:surveyorId — hapus seluruh riwayat (KHUSUS admin)', () => {
  test('admin → hapus SEMUA milik TPD itu saja + audit berisi jumlah', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    User.findOne.mockResolvedValue({ id: TPD_ID, name: 'TPD Satu' });
    TpdNotification.destroy.mockResolvedValue(3);

    const res = await request(makeApp()).delete(`/notifications/surveyor/${TPD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect(User.findOne.mock.calls[0][0].where).toEqual({ id: TPD_ID, role: 'surveyor' });
    expect(TpdNotification.destroy).toHaveBeenCalledWith({ where: { surveyor_id: TPD_ID }, transaction: 'tx-1' });
    const [audit, opts] = AuditLog.create.mock.calls[0];
    expect(opts).toEqual({ transaction: 'tx-1' });
    expect(audit).toMatchObject({
      user_id: 'admin-1',
      action: 'DELETE_TPD_NOTIFICATIONS',
      entity_type: 'surveyor',
      entity_id: TPD_ID,
      old_value: { surveyor_name: 'TPD Satu', deleted: 3 },
    });
  });

  test.each(['supervisor', 'asisten_supervisor', 'surveyor'])('%s → 403', async (role) => {
    mockCurrentUser = { id: `${role}-1`, role };
    User.findOne.mockResolvedValue({ id: TPD_ID, name: 'TPD Satu' });

    const res = await request(makeApp()).delete(`/notifications/surveyor/${TPD_ID}`);

    expect(res.status).toBe(403);
    expect(TpdNotification.destroy).not.toHaveBeenCalled();
  });

  test('bukan akun TPD / tak ada → 404, tidak menghapus apa pun', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };

    const res = await request(makeApp()).delete(`/notifications/surveyor/${TPD_ID}`);

    expect(res.status).toBe(404);
    expect(TpdNotification.destroy).not.toHaveBeenCalled();
  });

  test('id bukan UUID → 404 tanpa query', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };

    const res = await request(makeApp()).delete('/notifications/surveyor/xyz');

    expect(res.status).toBe(404);
    expect(User.findOne).not.toHaveBeenCalled();
  });
});
