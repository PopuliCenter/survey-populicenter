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
  },
  User: { findAll: jest.fn() },
}));

const { TpdNotification, User } = require('../../src/models');
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
});

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
