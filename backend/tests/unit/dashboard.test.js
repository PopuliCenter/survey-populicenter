/**
 * Unit Tests untuk Dashboard.
 * Ditulis ulang agar cocok implementasi terkini: statistik pra-hitung
 * (statisticsUpdater.getDashboardStats/getSurveyorResponseCounts), trend via
 * sequelize.query, dan tanggal berbasis WIB (utils/time).
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  Survey: { count: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  User: { count: jest.fn(), findAll: jest.fn() },
  Response: { count: jest.fn(), findAll: jest.fn() },
  SurveyorQuota: { findAll: jest.fn() },
  sequelize: { query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike') } },
}));

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
}));

// Dashboard memakai statistik pra-hitung — mock agar terkendali & tak sentuh DB.
jest.mock('../../src/utils/statisticsUpdater', () => ({
  getDashboardStats: jest.fn(),
  getSurveyorResponseCounts: jest.fn(),
  incrementResponseStats: jest.fn(),
  recomputeSurveyStats: jest.fn(),
  markStatsDirty: jest.fn(),
  drainDirtyStats: jest.fn(),
}));

const app = require('../../src/app');
const { Survey, User, Response, SurveyorQuota, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');
const stats = require('../../src/utils/statisticsUpdater');
const { wibDateString } = require('../../src/utils/time');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const tok = (role, id = `${role}-uuid-001`) => jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET, { expiresIn: '8h' });
const createAdminToken = () => tok('admin');
const createSurveyorToken = () => tok('surveyor');
const createSupervisorToken = () => tok('supervisor');
const createViewerToken = () => tok('viewer');

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null); // cache miss + token tak diblacklist
  // Default: satu survei aktif → resolveDashboardSurveyIds mengembalikan ['s1'].
  Survey.findAll.mockResolvedValue([{ id: 's1' }]);
  Survey.count.mockResolvedValue(0);
  User.count.mockResolvedValue(0);
  User.findAll.mockResolvedValue([]);
  Response.findAll.mockResolvedValue([]);
  SurveyorQuota.findAll.mockResolvedValue([]);
  sequelize.query.mockResolvedValue([]);
  stats.getDashboardStats.mockResolvedValue({ totalResponses: 0, todayResponses: 0 });
  stats.getSurveyorResponseCounts.mockResolvedValue({});
});

// ─── GET /dashboard/stats ──────────────────────────────────────────────────────
describe('GET /dashboard/stats', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const res = await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createSurveyorToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns correct stats for admin', async () => {
    Survey.count.mockResolvedValue(5);
    User.count.mockResolvedValue(12);
    stats.getDashboardStats.mockResolvedValue({ totalResponses: 100, todayResponses: 3 });

    const res = await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activeSurveys: 5, activeSurveyors: 12, todayResponses: 3, totalResponses: 100 });
  });

  it('queries Survey.count with status active', async () => {
    await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(Survey.count).toHaveBeenCalledWith({ where: { status: 'active' } });
  });

  it('queries User.count with role surveyor and is_active true', async () => {
    await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(User.count).toHaveBeenCalledWith({ where: { role: 'surveyor', is_active: true } });
  });

  it('memakai getDashboardStats (statistik pra-hitung) untuk jumlah respons', async () => {
    await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(stats.getDashboardStats).toHaveBeenCalledWith(['s1']);
  });

  it('returns zeros when there is no data', async () => {
    const res = await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activeSurveys: 0, activeSurveyors: 0, todayResponses: 0, totalResponses: 0 });
  });

  it('supervisor dapat mengakses dashboard stats - mengembalikan 200', async () => {
    Survey.count.mockResolvedValue(3);
    User.count.mockResolvedValue(5);
    stats.getDashboardStats.mockResolvedValue({ totalResponses: 50, todayResponses: 1 });
    const res = await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createSupervisorToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeSurveys');
    expect(res.body).toHaveProperty('activeSurveyors');
    expect(res.body).toHaveProperty('todayResponses');
    expect(res.body).toHaveProperty('totalResponses');
  });

  it('viewer dapat mengakses dashboard stats - mengembalikan 200', async () => {
    const res = await request(app).get('/dashboard/stats').set('Authorization', `Bearer ${createViewerToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /dashboard/trend ──────────────────────────────────────────────────────
describe('GET /dashboard/trend', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/trend');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createSurveyorToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns an array of 7 items with correct shape', async () => {
    // Pakai wibDateString agar tanggal cocok persis dengan kode (WIB, bukan UTC).
    const now = new Date();
    const todayStr = wibDateString(now);
    const yesterdayStr = wibDateString(new Date(now.getTime() - 86400000));
    sequelize.query.mockResolvedValue([
      { date: todayStr, count: '5' },
      { date: yesterdayStr, count: '3' },
    ]);

    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createAdminToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
    for (const item of res.body) {
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('count');
      expect(typeof item.date).toBe('string');
      expect(/^\d{4}-\d{2}-\d{2}$/.test(item.date)).toBe(true);
      expect(typeof item.count).toBe('number');
    }
    expect(res.body.find((d) => d.date === todayStr).count).toBe(5);
    expect(res.body.find((d) => d.date === yesterdayStr).count).toBe(3);
  });

  it('returns zeros for days with no data', async () => {
    sequelize.query.mockResolvedValue([]);
    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    for (const item of res.body) expect(item.count).toBe(0);
  });

  it('returns dates in ascending order covering the last 7 days (WIB)', async () => {
    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    const now = new Date();
    const expectedDates = [];
    for (let i = 6; i >= 0; i--) expectedDates.push(wibDateString(new Date(now.getTime() - i * 86400000)));
    expect(res.body.map((item) => item.date)).toEqual(expectedDates);
  });

  it('supervisor dapat mengakses dashboard trend - mengembalikan 200', async () => {
    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createSupervisorToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });

  it('viewer dapat mengakses dashboard trend - mengembalikan 200', async () => {
    const res = await request(app).get('/dashboard/trend').set('Authorization', `Bearer ${createViewerToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /dashboard/top-surveyors ──────────────────────────────────────────────
describe('GET /dashboard/top-surveyors', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/top-surveyors');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const res = await request(app).get('/dashboard/top-surveyors').set('Authorization', `Bearer ${createSurveyorToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns an array of up to 5 items with correct shape', async () => {
    Response.findAll.mockResolvedValue([
      { surveyor_id: 'u1', responseCount: '10', surveyor: { id: 'u1', name: 'Alice', email: 'alice@example.com' } },
      { surveyor_id: 'u2', responseCount: '8', surveyor: { id: 'u2', name: 'Bob', email: 'bob@example.com' } },
      { surveyor_id: 'u3', responseCount: '5', surveyor: { id: 'u3', name: 'Carol', email: 'carol@example.com' } },
    ]);

    const res = await request(app).get('/dashboard/top-surveyors').set('Authorization', `Bearer ${createAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(5);
    expect(res.body).toHaveLength(3);
    for (const item of res.body) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.email).toBe('string');
      expect(typeof item.responseCount).toBe('number');
    }
    expect(res.body[0]).toEqual({ id: 'u1', name: 'Alice', email: 'alice@example.com', responseCount: 10 });
  });

  it('returns empty array when no data', async () => {
    Response.findAll.mockResolvedValue([]);
    const res = await request(app).get('/dashboard/top-surveyors').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('supervisor dapat mengakses top-surveyors - mengembalikan 200', async () => {
    Response.findAll.mockResolvedValue([
      { surveyor_id: 'u1', responseCount: '5', surveyor: { id: 'u1', name: 'Alice', email: 'alice@example.com' } },
    ]);
    const res = await request(app).get('/dashboard/top-surveyors').set('Authorization', `Bearer ${createSupervisorToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('viewer dapat mengakses top-surveyors - mengembalikan 200', async () => {
    const res = await request(app).get('/dashboard/top-surveyors').set('Authorization', `Bearer ${createViewerToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /dashboard/survey-progress/:surveyId ──────────────────────────────────
describe('GET /dashboard/survey-progress/:surveyId', () => {
  const validSurveyId = '11111111-1111-1111-1111-111111111111';

  function setup({ survey = null, quotas = [], responseCounts = {} } = {}) {
    Survey.findOne.mockResolvedValue(survey);
    SurveyorQuota.findAll.mockResolvedValue(quotas);
    stats.getSurveyorResponseCounts.mockResolvedValue(responseCounts);
  }

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for role surveyor', async () => {
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createSurveyorToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for role viewer', async () => {
    setup({ survey: { id: validSurveyId, title: 'Test' } });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createViewerToken()}`);
    expect(res.status).toBe(200);
  });

  it('returns 422 for invalid UUID format', async () => {
    const res = await request(app).get('/dashboard/survey-progress/not-a-uuid').set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Format surveyId tidak valid');
  });

  it('returns 404 when survey is not found', async () => {
    setup({ survey: null });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Survei tidak ditemukan');
  });

  it('returns 200 for admin with correct progress data', async () => {
    setup({
      survey: { id: validSurveyId, title: 'Survey A' },
      quotas: [
        { quota: 50, surveyor: { id: 'surveyor-1', name: 'Alice' } },
        { quota: 30, surveyor: { id: 'surveyor-2', name: 'Bob' } },
      ],
      responseCounts: { 'surveyor-1': 30, 'surveyor-2': 15 },
    });

    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.surveyId).toBe(validSurveyId);
    expect(res.body.surveyTitle).toBe('Survey A');
    expect(res.body.totalQuota).toBe(80);
    expect(res.body.totalCollected).toBe(45);
    expect(res.body.completionPercentage).toBe(56.3);
    expect(res.body.surveyors).toHaveLength(2);
    for (const s of res.body.surveyors) {
      expect(s).toHaveProperty('surveyorId');
      expect(s).toHaveProperty('surveyorName');
      expect(s).toHaveProperty('quota');
      expect(s).toHaveProperty('collected');
      expect(s).toHaveProperty('percentage');
      expect(s).toHaveProperty('remaining');
    }
  });

  it('returns 200 for supervisor', async () => {
    setup({
      survey: { id: validSurveyId, title: 'Survey B' },
      quotas: [{ quota: 20, surveyor: { id: 'surveyor-1', name: 'Alice' } }],
      responseCounts: { 'surveyor-1': 10 },
    });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createSupervisorToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.surveyTitle).toBe('Survey B');
  });

  it('completionPercentage is 0 when totalQuota is 0 (no quotas)', async () => {
    setup({ survey: { id: validSurveyId, title: 'Empty Survey' }, quotas: [], responseCounts: {} });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.totalQuota).toBe(0);
    expect(res.body.completionPercentage).toBe(0);
  });

  it('completionPercentage is capped at 100.0 when collected > quota', async () => {
    setup({
      survey: { id: validSurveyId, title: 'Over' },
      quotas: [{ quota: 10, surveyor: { id: 'surveyor-1', name: 'Alice' } }],
      responseCounts: { 'surveyor-1': 20 },
    });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.completionPercentage).toBe(100.0);
    expect(res.body.surveyors[0].percentage).toBe(100.0);
  });

  it('surveyors array is sorted by percentage descending', async () => {
    setup({
      survey: { id: validSurveyId, title: 'Sort' },
      quotas: [
        { quota: 100, surveyor: { id: 'low', name: 'Low' } },   // 10%
        { quota: 10, surveyor: { id: 'high', name: 'High' } },  // 100%
      ],
      responseCounts: { low: 10, high: 10 },
    });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    const pcts = res.body.surveyors.map((s) => s.percentage);
    expect(pcts[0]).toBeGreaterThanOrEqual(pcts[1]);
    expect(res.body.surveyors[0].surveyorId).toBe('high');
  });

  it('only surveyors with quotas appear in surveyors array', async () => {
    setup({
      survey: { id: validSurveyId, title: 'OnlyQuota' },
      quotas: [{ quota: 10, surveyor: { id: 'surveyor-1', name: 'Alice' } }],
      // Ada count untuk surveyor lain yang TAK punya kuota — tak boleh muncul.
      responseCounts: { 'surveyor-1': 5, 'surveyor-nokuota': 99 },
    });
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`).set('Authorization', `Bearer ${createAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.surveyors).toHaveLength(1);
    expect(res.body.surveyors[0].surveyorId).toBe('surveyor-1');
  });
});
