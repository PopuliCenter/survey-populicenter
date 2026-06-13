/**
 * Unit tests untuk endpoint pengayaan dashboard:
 *   - /dashboard/responses-by-province (peta sebaran, manual + cache)
 *   - /dashboard/time-pattern (pola waktu)
 *   - /dashboard/data-quality (kualitas data)
 */

process.env.RATE_LIMIT_DISABLED = 'true';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  Survey: { findAll: jest.fn(), findOne: jest.fn() },
  User: { count: jest.fn() },
  Response: { findAll: jest.fn(), count: jest.fn() },
  SurveyorQuota: { findAll: jest.fn() },
  sequelize: { query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike'), between: Symbol('between'), in: Symbol('in'), and: Symbol('and'), or: Symbol('or'), eq: Symbol('eq') } },
}));

jest.mock('../../src/config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  set: jest.fn(),
  call: jest.fn((cmd) => {
    if (cmd === 'SCRIPT') return Promise.resolve('sha-test');
    if (cmd === 'EVALSHA') return Promise.resolve([1, 60000]);
    return Promise.resolve(null);
  }),
}));

jest.mock('../../src/utils/statisticsUpdater', () => ({
  getDashboardStats: jest.fn(),
  getSurveyorResponseCounts: jest.fn(),
}));

const app = require('../../src/app');
const { Survey, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const token = jwt.sign({ id: 'a-1', role: 'admin', email: 'a@x.com' }, JWT_SECRET, { expiresIn: '8h' });

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null);
  // Default: satu survei aktif.
  Survey.findAll.mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111' }]);
});

describe('GET /dashboard/responses-by-province', () => {
  test('agregasi + normalisasi nama provinsi, terurut desc', async () => {
    sequelize.query.mockResolvedValue([
      { province: 'DKI Jakarta', count: 3 },
      { province: 'Jakarta', count: 2 },
      { province: 'Jawa Barat', count: 10 },
    ]);

    const res = await request(app)
      .get('/dashboard/responses-by-province')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // "DKI Jakarta" + "Jakarta" dilebur jadi JAKARTA = 5; Jawa Barat = 10.
    expect(res.body.regions[0]).toEqual({ province: 'JAWA BARAT', count: 10 });
    const jkt = res.body.regions.find((r) => r.province === 'JAKARTA');
    expect(jkt.count).toBe(5);
    expect(res.body.cached).toBe(false);
    expect(redis.setex).toHaveBeenCalled();
  });

  test('menyajikan dari cache bila tersedia', async () => {
    // Key-aware: blacklist token → null (jangan 401); hanya key cache yang berisi.
    redis.get.mockImplementation((key) =>
      Promise.resolve(
        key && key.startsWith('dash:prov:')
          ? JSON.stringify({ regions: [{ province: 'BALI', count: 7 }], generated_at: '2026-06-13T00:00:00Z' })
          : null
      )
    );

    const res = await request(app)
      .get('/dashboard/responses-by-province')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.regions[0].province).toBe('BALI');
    expect(sequelize.query).not.toHaveBeenCalled();
  });
});

describe('GET /dashboard/time-pattern', () => {
  test('membangun array 7 hari & 24 jam dari hasil group', async () => {
    sequelize.query.mockResolvedValue([
      { dow: 1, hour: 9, count: 4 },
      { dow: 1, hour: 10, count: 2 },
      { dow: 6, hour: 9, count: 1 },
    ]);

    const res = await request(app)
      .get('/dashboard/time-pattern')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.by_weekday).toHaveLength(7);
    expect(res.body.by_hour).toHaveLength(24);
    expect(res.body.by_weekday[1].count).toBe(6); // Senin: 4+2
    expect(res.body.by_hour[9].count).toBe(5); // jam 9: 4+1
  });
});

describe('GET /dashboard/data-quality', () => {
  test('rangkum status review, cakupan GPS, & pending', async () => {
    sequelize.query
      .mockResolvedValueOnce([
        { review_status: 'verified', count: 8, with_gps: 8 },
        { review_status: 'unreviewed', count: 2, with_gps: 1 },
      ])
      .mockResolvedValueOnce([{ pending: 3 }]);

    const res = await request(app)
      .get('/dashboard/data-quality')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(res.body.by_review).toEqual({ unreviewed: 2, flagged: 0, verified: 8 });
    expect(res.body.gps.with).toBe(9);
    expect(res.body.gps.pct).toBe(90);
    expect(res.body.pending).toBe(3);
  });
});
