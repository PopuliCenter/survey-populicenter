/**
 * Unit Tests — pengecualian respons dari laporan + hapus permanen.
 *
 * PATCH /responses/:id/exclude  (admin + supervisor; alasan wajib saat mengecualikan)
 * DELETE /responses/:id         (KHUSUS admin; hapus jawaban + media)
 *
 * Konteks: oversampling menambal data fraud — data fraud DIKECUALIKAN (bukti
 * audit tetap ada, kuota TPD bebas untuk penambal), hapus permanen hanya untuk
 * data sampah/uji coba.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const MockSequelize = {
    Op: {
      ne: Symbol('ne'),
      like: Symbol('like'),
      notLike: Symbol('notLike'),
      gte: Symbol('gte'),
      lte: Symbol('lte'),
      and: Symbol('and'),
      or: Symbol('or'),
      in: Symbol('in'),
      iLike: Symbol('iLike'),
    },
    literal: jest.fn((sql) => ({ __literal: sql })),
  };

  return {
    Response: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByPk: jest.fn(),
      count: jest.fn(),
      destroy: jest.fn().mockResolvedValue(1),
    },
    Answer: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(2),
    },
    Question: { findAll: jest.fn() },
    Survey: { findOne: jest.fn(), findByPk: jest.fn() },
    User: { findOne: jest.fn(), findByPk: jest.fn().mockResolvedValue({ name: 'Pak Admin' }) },
    SurveyorQuota: { findOne: jest.fn() },
    TpdNotification: { create: jest.fn().mockResolvedValue({}) },
    AuditLog: { create: jest.fn().mockResolvedValue({}) },
    Sequelize: MockSequelize,
    sequelize: {
      // Rute delete memakai bentuk callback: sequelize.transaction(async (t) => {...})
      transaction: jest.fn(async (fn) => fn({ id: 'tx' })),
      query: jest.fn().mockResolvedValue([[]]),
      QueryTypes: { SELECT: 'SELECT', RAW: 'RAW' },
    },
  };
});

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  call: jest.fn().mockResolvedValue('sha-test'),
}));

// Hindari sentuhan fs/DB nyata: media & statistik pra-hitung di-mock utuh.
jest.mock('../../src/utils/mediaFiles', () => ({
  collectMediaPaths: jest.fn().mockResolvedValue(['uploads/photos/a.jpg', 'uploads/audio/b.webm']),
  deleteMediaFiles: jest.fn().mockResolvedValue(2),
}));
jest.mock('../../src/utils/statisticsUpdater', () => ({
  incrementResponseStats: jest.fn().mockResolvedValue(undefined),
  markStatsDirty: jest.fn().mockResolvedValue(undefined),
  recomputeSurveyStats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/cache', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheDelPattern: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../../src/app');
const { Response, Answer, AuditLog } = require('../../src/models');
const { collectMediaPaths, deleteMediaFiles } = require('../../src/utils/mediaFiles');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function tokenFor(role, id = `${role}-uuid-001`) {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET, { expiresIn: '8h' });
}

function mockResponseRow(overrides = {}) {
  const row = {
    id: 'resp-001',
    survey_id: 'survey-001',
    surveyor_id: 'tpd-001',
    questionnaire_number: 'SAMPEL-20260721-0009',
    excluded: false,
    exclude_reason: null,
    excluded_at: null,
    ...overrides,
  };
  row.update = jest.fn(async (patch) => Object.assign(row, patch));
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  Response.destroy.mockResolvedValue(1);
  Answer.destroy.mockResolvedValue(2);
  collectMediaPaths.mockResolvedValue(['uploads/photos/a.jpg', 'uploads/audio/b.webm']);
  deleteMediaFiles.mockResolvedValue(2);
});

// ─── PATCH /responses/:id/exclude ────────────────────────────────────────────

describe('PATCH /responses/:id/exclude', () => {
  test('viewer & TPD ditolak 403', async () => {
    for (const role of ['viewer', 'surveyor']) {
      const res = await request(app)
        .patch('/responses/resp-001/exclude')
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .send({ excluded: true, reason: 'fraud' });
      expect(res.status).toBe(403);
    }
  });

  test('tanpa field excluded → 422', async () => {
    const res = await request(app)
      .patch('/responses/resp-001/exclude')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ reason: 'fraud' });
    expect(res.status).toBe(422);
  });

  test('mengecualikan TANPA alasan → 422 (alasan = jejak audit, wajib)', async () => {
    Response.findByPk.mockResolvedValue(mockResponseRow());
    const res = await request(app)
      .patch('/responses/resp-001/exclude')
      .set('Authorization', `Bearer ${tokenFor('supervisor')}`)
      .send({ excluded: true, reason: '   ' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/alasan/i);
  });

  test('supervisor mengecualikan dengan alasan → tersimpan + res.body lengkap', async () => {
    const row = mockResponseRow();
    Response.findByPk.mockResolvedValue(row);

    const res = await request(app)
      .patch('/responses/resp-001/exclude')
      .set('Authorization', `Bearer ${tokenFor('supervisor')}`)
      .send({ excluded: true, reason: 'Terindikasi fraud — diganti oversample' });

    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      excluded: true,
      exclude_reason: 'Terindikasi fraud — diganti oversample',
      excluded_by: 'supervisor-uuid-001',
    }));
    // Kontrak res.body (bukan hanya argumen query!)
    expect(res.body.excluded).toBe(true);
    expect(res.body.exclude_reason).toBe('Terindikasi fraud — diganti oversample');
    expect(res.body.excluder_name).toBe('Pak Admin');
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXCLUDE_RESPONSE' }));
  });

  test('membatalkan pengecualian → semua field pengecualian dibersihkan', async () => {
    const row = mockResponseRow({ excluded: true, exclude_reason: 'fraud', excluded_at: new Date() });
    Response.findByPk.mockResolvedValue(row);

    const res = await request(app)
      .patch('/responses/resp-001/exclude')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ excluded: false });

    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({
      excluded: false, exclude_reason: null, excluded_by: null, excluded_at: null,
    });
    expect(res.body.excluded).toBe(false);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'INCLUDE_RESPONSE' }));
  });

  test('shell PENDING tidak bisa dikecualikan → 409', async () => {
    Response.findByPk.mockResolvedValue(mockResponseRow({ questionnaire_number: 'PENDING-abc' }));
    const res = await request(app)
      .patch('/responses/resp-001/exclude')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ excluded: true, reason: 'x' });
    expect(res.status).toBe(409);
  });

  test('respons tidak ditemukan → 404', async () => {
    Response.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .patch('/responses/nope/exclude')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ excluded: true, reason: 'x' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /responses/:id ───────────────────────────────────────────────────

describe('DELETE /responses/:id', () => {
  test('supervisor/viewer/TPD ditolak 403 — hapus permanen KHUSUS admin', async () => {
    for (const role of ['supervisor', 'viewer', 'surveyor']) {
      const res = await request(app)
        .delete('/responses/resp-001')
        .set('Authorization', `Bearer ${tokenFor(role)}`);
      expect(res.status).toBe(403);
    }
    expect(Response.destroy).not.toHaveBeenCalled();
  });

  test('admin menghapus → jawaban + baris + media ikut terhapus, audit tercatat', async () => {
    Response.findByPk.mockResolvedValue(mockResponseRow());

    const res = await request(app)
      .delete('/responses/resp-001')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.files_deleted).toBe(2);
    expect(Answer.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { response_id: 'resp-001' } }));
    expect(Response.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'resp-001' } }));
    // Path media dikumpulkan SEBELUM baris dihapus
    expect(collectMediaPaths).toHaveBeenCalledWith(expect.anything(), ['resp-001']);
    expect(deleteMediaFiles).toHaveBeenCalledWith(['uploads/photos/a.jpg', 'uploads/audio/b.webm']);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_RESPONSE' }));
  });

  test('respons tidak ditemukan → 404 (tidak ada destroy)', async () => {
    Response.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete('/responses/nope')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(404);
    expect(Response.destroy).not.toHaveBeenCalled();
  });
});
