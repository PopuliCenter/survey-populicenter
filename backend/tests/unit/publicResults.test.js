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
    AuditLog: { create: jest.fn().mockResolvedValue({}) },
    PublishedResult: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
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
const { Survey, PublishedResult, Response } = require('../../src/models');

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
