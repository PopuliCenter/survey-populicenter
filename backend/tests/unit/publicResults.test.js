/**
 * Unit tests untuk publikasi hasil survei:
 *   - Public API tanpa login (GET /public/results, /public/results/:slug)
 *   - Publish/unpublish (admin only) + status publikasi
 */

// Nonaktifkan rate-limiter (butuh Redis nyata) agar test berdiri sendiri —
// harus diset SEBELUM app di-require.
process.env.RATE_LIMIT_DISABLED = 'true';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const Op = {
    ne: Symbol('ne'), and: Symbol('and'), or: Symbol('or'),
    like: Symbol('like'), notLike: Symbol('notLike'), eq: Symbol('eq'), in: Symbol('in'),
  };
  return {
    Survey: { findByPk: jest.fn() },
    Question: { findAll: jest.fn().mockResolvedValue([]) },
    Response: { count: jest.fn().mockResolvedValue(0), findAll: jest.fn() },
    Answer: { findAll: jest.fn().mockResolvedValue([]) },
    SurveyorQuota: { sum: jest.fn().mockResolvedValue(0) },
    AuditLog: { create: jest.fn().mockResolvedValue({}) },
    PublishedResult: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    MonitoringReport: { findOne: jest.fn(), create: jest.fn() },
    sequelize: { fn: jest.fn(), col: jest.fn(), query: jest.fn(), transaction: jest.fn() },
    Sequelize: { Op },
  };
});

jest.mock('../../src/config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(), setex: jest.fn(), incr: jest.fn(), expire: jest.fn(), del: jest.fn(),
  // Balasan valid agar rate-limit-redis (RedisStore) tidak gagal saat memuat
  // skrip Lua-nya. SCRIPT LOAD → sha string; EVALSHA → [hits, ttlMs].
  call: jest.fn((cmd) => {
    if (cmd === 'SCRIPT') return Promise.resolve('sha-test');
    if (cmd === 'EVALSHA') return Promise.resolve([1, 60000]);
    return Promise.resolve(null);
  }),
}));

const app = require('../../src/app');
const { Survey, PublishedResult, MonitoringReport, Response } = require('../../src/models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const adminToken = jwt.sign({ id: 'admin-1', role: 'admin', email: 'a@x.com' }, JWT_SECRET, { expiresIn: '8h' });
const supervisorToken = jwt.sign({ id: 'sup-1', role: 'supervisor', email: 's@x.com' }, JWT_SECRET, { expiresIn: '8h' });

beforeEach(() => {
  jest.clearAllMocks();
  Response.count.mockResolvedValue(0);
});

describe('Public API — tanpa login', () => {
  test('GET /public/results mengembalikan daftar yang dipublikasikan', async () => {
    PublishedResult.findAll.mockResolvedValue([
      { slug: 'survei-a', title: 'Survei A', survey_type: 'nasional', summary: null, response_count: 100, published_at: new Date('2026-01-01') },
    ]);

    const res = await request(app).get('/public/results');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ slug: 'survei-a', title: 'Survei A', type: 'nasional', response_count: 100 });
    // CORS terbuka untuk endpoint publik.
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('GET /public/results/:slug mengembalikan snapshot', async () => {
    PublishedResult.findOne.mockResolvedValue({
      slug: 'survei-a', title: 'Survei A', survey_type: 'nasional', summary: 'ringkas',
      response_count: 100, published_at: new Date('2026-01-01'),
      snapshot: { questions: [{ id: 'q1', text: 'T', type: 'single_choice', distribution: [] }], map: null },
    });

    const res = await request(app).get('/public/results/survei-a');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('survei-a');
    expect(res.body.questions).toHaveLength(1);
  });

  test('GET /public/results/:slug → 404 bila tidak ada', async () => {
    PublishedResult.findOne.mockResolvedValue(null);
    const res = await request(app).get('/public/results/tidak-ada');
    expect(res.status).toBe(404);
  });
});

describe('Publish — admin only', () => {
  test('POST /surveys/:id/publish oleh admin membuat publikasi baru', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', title: 'Survei Kepuasan 2026', type: 'nasional', description: null });
    Response.count.mockResolvedValue(250);
    PublishedResult.findOne.mockResolvedValue(null); // belum ada + slug bebas
    PublishedResult.create.mockImplementation((payload) => Promise.resolve({ ...payload }));

    const res = await request(app)
      .post('/surveys/sv-1/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ summary: 'Ringkasan temuan' });

    expect(res.status).toBe(201);
    expect(res.body.is_published).toBe(true);
    expect(res.body.slug).toBe('survei-kepuasan-2026');
    expect(res.body.response_count).toBe(250);
    expect(PublishedResult.create).toHaveBeenCalled();
  });

  test('POST /surveys/:id/publish ditolak untuk supervisor (403)', async () => {
    const res = await request(app)
      .post('/surveys/sv-1/publish')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(PublishedResult.create).not.toHaveBeenCalled();
  });

  test('POST /surveys/:id/publish → 404 bila survei tidak ada', async () => {
    Survey.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post('/surveys/none/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('POST /surveys/:id/unpublish menyembunyikan tanpa menghapus snapshot', async () => {
    const update = jest.fn().mockResolvedValue(true);
    PublishedResult.findOne.mockResolvedValue({ slug: 'survei-a', is_published: true, update });

    const res = await request(app)
      .post('/surveys/sv-1/unpublish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(false);
    expect(update).toHaveBeenCalledWith({ is_published: false });
  });

  test('GET /surveys/:id/publication mengembalikan status (supervisor boleh baca)', async () => {
    PublishedResult.findOne.mockResolvedValue({
      slug: 'survei-a', title: 'Survei A', summary: null, survey_type: 'nasional',
      response_count: 100, is_published: true, published_at: new Date('2026-01-01'),
    });

    const res = await request(app)
      .get('/surveys/sv-1/publication')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(true);
    expect(res.body.slug).toBe('survei-a');
  });
});

describe('Target sampling per provinsi', () => {
  test('GET /surveys/:id/region-targets mengembalikan target tersimpan', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', region_targets: [{ province: 'JAWA BARAT', target: 500 }] });

    const res = await request(app)
      .get('/surveys/sv-1/region-targets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ province: 'JAWA BARAT', target: 500 }]);
  });

  test('PUT /surveys/:id/region-targets menormalisasi (buang target <=0, gabung duplikat)', async () => {
    const update = jest.fn().mockResolvedValue(true);
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', region_targets: [], update });

    const res = await request(app)
      .put('/surveys/sv-1/region-targets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ region_targets: [
        { province: 'JAWA BARAT', target: 300 },
        { province: 'JAWA BARAT', target: 200 },
        { province: 'BALI', target: 0 },
        { province: '', target: 100 },
      ] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ province: 'JAWA BARAT', target: 500 }]);
    expect(update).toHaveBeenCalledWith({ region_targets: [{ province: 'JAWA BARAT', target: 500 }] });
  });

  test('PUT /surveys/:id/region-targets ditolak untuk viewer', async () => {
    const viewerToken = jwt.sign({ id: 'v-1', role: 'viewer', email: 'v@x.com' }, JWT_SECRET, { expiresIn: '8h' });
    const res = await request(app)
      .put('/surveys/sv-1/region-targets')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ region_targets: [] });
    expect(res.status).toBe(403);
  });
});

describe('Monitoring klien (embed bertoken)', () => {
  test('POST /surveys/:id/monitoring/enable (admin) membuat token + snapshot', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', title: 'Survei A', type: 'nasional', region_targets: [{ province: 'JAWA BARAT', target: 500 }] });
    Response.count.mockResolvedValue(120);
    MonitoringReport.findOne.mockResolvedValue(null);
    MonitoringReport.create.mockImplementation((payload) => Promise.resolve({ ...payload }));

    const res = await request(app)
      .post('/surveys/sv-1/monitoring/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.is_enabled).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(20);
    expect(MonitoringReport.create).toHaveBeenCalled();
  });

  test('POST /surveys/:id/monitoring/enable ditolak untuk supervisor', async () => {
    const res = await request(app)
      .post('/surveys/sv-1/monitoring/enable')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('GET /public/monitor/:token menyajikan snapshot tersimpan (masih segar)', async () => {
    MonitoringReport.findOne.mockResolvedValue({
      survey_id: 'sv-1',
      snapshot: { survey: { title: 'Survei A' }, total: { target: 500, achieved: 120, pct: 24 }, regions: [{ province: 'JAWA BARAT', target: 500, actual: 120, pct: 24 }], has_region_data: true },
      snapshot_at: new Date(),
      update: jest.fn(),
    });

    const res = await request(app).get('/public/monitor/abc123');
    expect(res.status).toBe(200);
    expect(res.body.total.achieved).toBe(120);
    expect(res.body.regions).toHaveLength(1);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('GET /public/monitor/:token → 404 bila token tidak valid', async () => {
    MonitoringReport.findOne.mockResolvedValue(null);
    const res = await request(app).get('/public/monitor/salah');
    expect(res.status).toBe(404);
  });
});

describe('Konfigurasi laporan PPTX', () => {
  test('PUT /surveys/:id/report-config menyimpan & menormalisasi', async () => {
    const update = jest.fn().mockResolvedValue(true);
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', report_config: {}, update });

    const res = await request(app)
      .put('/surveys/sv-1/report-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        methodology: 'Baris 1\nBaris 2',
        narratives: { q1: 'Narasi q1', q2: '   ' },
        demographics: ['d1', 'd2', 123],
        sections: { q1: ' Kondisi Ekonomi ', q3: '' },
      });

    expect(res.status).toBe(200);
    expect(res.body.methodology).toBe('Baris 1\nBaris 2');
    expect(res.body.narratives).toEqual({ q1: 'Narasi q1' }); // q2 kosong dibuang
    expect(res.body.demographics).toEqual(['d1', 'd2']); // non-string dibuang
    expect(res.body.sections).toEqual({ q1: 'Kondisi Ekonomi' }); // trim + kosong dibuang
    expect(update).toHaveBeenCalled();
  });

  test('GET /surveys/:id/report-config mengembalikan config', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'sv-1', report_config: { methodology: 'X', demographics: ['d1'] } });
    const res = await request(app)
      .get('/surveys/sv-1/report-config')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.demographics).toEqual(['d1']);
  });

  test('PUT /surveys/:id/report-config ditolak untuk viewer', async () => {
    const viewerToken = jwt.sign({ id: 'v-1', role: 'viewer', email: 'v@x.com' }, JWT_SECRET, { expiresIn: '8h' });
    const res = await request(app)
      .put('/surveys/sv-1/report-config')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ methodology: 'x' });
    expect(res.status).toBe(403);
  });
});
