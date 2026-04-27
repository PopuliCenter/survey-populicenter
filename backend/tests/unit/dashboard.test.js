/**
 * Unit Tests for Dashboard Stats Endpoint
 * Tests: GET /dashboard/stats - admin only, returns correct counts
 *        GET /dashboard/trend - admin only, returns 7-day response trend
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => {
  return {
    Survey: {
      count: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
    },
    User: {
      count: jest.fn(),
      findAll: jest.fn(),
    },
    Response: {
      count: jest.fn(),
      findAll: jest.fn(),
    },
    SurveyorQuota: {
      findAll: jest.fn(),
    },
    Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike') } },
  };
});

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
}));

const app = require('../../src/app');
const { Survey, User, Response, SurveyorQuota } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

function createSupervisorToken(id = 'supervisor-uuid-001') {
  return jwt.sign({ id, role: 'supervisor', email: 'supervisor@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createViewerToken(id = 'viewer-uuid-001') {
  return jwt.sign({ id, role: 'viewer', email: 'viewer@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null); // token not blacklisted
});

describe('GET /dashboard/stats', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns correct stats for admin', async () => {
    Survey.count.mockResolvedValue(5);
    User.count.mockResolvedValue(12);
    // todayResponses then totalResponses
    Response.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(100);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeSurveys: 5,
      activeSurveyors: 12,
      todayResponses: 3,
      totalResponses: 100,
    });
  });

  it('queries Survey.count with status active', async () => {
    Survey.count.mockResolvedValue(2);
    User.count.mockResolvedValue(4);
    Response.count.mockResolvedValue(0);

    const token = createAdminToken();
    await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(Survey.count).toHaveBeenCalledWith({ where: { status: 'active' } });
  });

  it('queries User.count with role surveyor and is_active true', async () => {
    Survey.count.mockResolvedValue(0);
    User.count.mockResolvedValue(7);
    Response.count.mockResolvedValue(0);

    const token = createAdminToken();
    await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(User.count).toHaveBeenCalledWith({
      where: { role: 'surveyor', is_active: true },
    });
  });

  it('queries Response.count twice (today and total)', async () => {
    Survey.count.mockResolvedValue(0);
    User.count.mockResolvedValue(0);
    Response.count.mockResolvedValue(0);

    const token = createAdminToken();
    await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.count).toHaveBeenCalledTimes(2);
  });

  it('returns zeros when there is no data', async () => {
    Survey.count.mockResolvedValue(0);
    User.count.mockResolvedValue(0);
    Response.count.mockResolvedValue(0);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeSurveys: 0,
      activeSurveyors: 0,
      todayResponses: 0,
      totalResponses: 0,
    });
  });

  it('supervisor dapat mengakses dashboard stats - mengembalikan 200', async () => {
    Survey.count.mockResolvedValue(3);
    User.count.mockResolvedValue(5);
    Response.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(50);

    const token = createSupervisorToken();
    const res = await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeSurveys');
    expect(res.body).toHaveProperty('activeSurveyors');
    expect(res.body).toHaveProperty('todayResponses');
    expect(res.body).toHaveProperty('totalResponses');
  });

  it('viewer dapat mengakses dashboard stats - mengembalikan 200', async () => {
    const token = createViewerToken();
    const res = await request(app)
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /dashboard/trend', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/trend');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns an array of 7 items with correct shape', async () => {
    // Simulate DB returning counts for 2 of the 7 days
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const todayStr = today.toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    Response.findAll.mockResolvedValue([
      { date: todayStr, count: '5' },
      { date: yesterdayStr, count: '3' },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);

    // Each item must have date (YYYY-MM-DD) and count (number)
    for (const item of res.body) {
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('count');
      expect(typeof item.date).toBe('string');
      expect(/^\d{4}-\d{2}-\d{2}$/.test(item.date)).toBe(true);
      expect(typeof item.count).toBe('number');
    }

    // Verify the two days with data have correct counts
    const todayItem = res.body.find((d) => d.date === todayStr);
    const yesterdayItem = res.body.find((d) => d.date === yesterdayStr);
    expect(todayItem.count).toBe(5);
    expect(yesterdayItem.count).toBe(3);
  });

  it('returns zeros for days with no data', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    for (const item of res.body) {
      expect(item.count).toBe(0);
    }
  });

  it('returns dates in ascending order covering the last 7 days', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Build expected dates (oldest first)
    const expectedDates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      expectedDates.push(d.toISOString().slice(0, 10));
    }

    const returnedDates = res.body.map((item) => item.date);
    expect(returnedDates).toEqual(expectedDates);
  });

  it('supervisor dapat mengakses dashboard trend - mengembalikan 200', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createSupervisorToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
  });

  it('viewer dapat mengakses dashboard trend - mengembalikan 200', async () => {
    const token = createViewerToken();
    const res = await request(app)
      .get('/dashboard/trend')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});


describe('GET /dashboard/top-surveyors', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/dashboard/top-surveyors');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get('/dashboard/top-surveyors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns an array of up to 5 items with correct shape', async () => {
    Response.findAll.mockResolvedValue([
      { surveyor_id: 'u1', responseCount: '10', surveyor: { id: 'u1', name: 'Alice', email: 'alice@example.com' } },
      { surveyor_id: 'u2', responseCount: '8',  surveyor: { id: 'u2', name: 'Bob',   email: 'bob@example.com'   } },
      { surveyor_id: 'u3', responseCount: '5',  surveyor: { id: 'u3', name: 'Carol', email: 'carol@example.com' } },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/top-surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(5);
    expect(res.body).toHaveLength(3);

    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('email');
      expect(item).toHaveProperty('responseCount');
      expect(typeof item.id).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.email).toBe('string');
      expect(typeof item.responseCount).toBe('number');
    }

    // Verify first item has highest count
    expect(res.body[0]).toEqual({ id: 'u1', name: 'Alice', email: 'alice@example.com', responseCount: 10 });
  });

  it('returns empty array when no data', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/top-surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('supervisor dapat mengakses top-surveyors - mengembalikan 200', async () => {
    Response.findAll.mockResolvedValue([
      { surveyor_id: 'u1', responseCount: '5', surveyor: { id: 'u1', name: 'Alice', email: 'alice@example.com' } },
    ]);

    const token = createSupervisorToken();
    const res = await request(app)
      .get('/dashboard/top-surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('viewer dapat mengakses top-surveyors - mengembalikan 200', async () => {
    const token = createViewerToken();
    const res = await request(app)
      .get('/dashboard/top-surveyors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});


describe('GET /dashboard/survey-progress/:surveyId', () => {
  const validSurveyId = '11111111-1111-1111-1111-111111111111';

  function setupMocks({ survey = null, quotas = [], responseCount = 0, responseCounts = [] } = {}) {
    Survey.findOne.mockResolvedValue(survey);
    SurveyorQuota.findAll.mockResolvedValue(quotas);
    Response.count.mockResolvedValue(responseCount);
    // Response.findAll is used for both trend and response counts per surveyor
    // We need to handle it carefully — for survey-progress it returns grouped counts
    Response.findAll.mockResolvedValue(responseCounts);
  }

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`/dashboard/survey-progress/${validSurveyId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for role surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for role viewer', async () => {
    const token = createViewerToken();
    Survey.findOne.mockResolvedValue({ id: validSurveyId, title: 'Test' });
    SurveyorQuota.findAll.mockResolvedValue([]);
    Response.count.mockResolvedValue(0);
    Response.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 422 for invalid UUID format', async () => {
    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/survey-progress/not-a-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Format surveyId tidak valid');
  });

  it('returns 404 when survey is not found', async () => {
    setupMocks({ survey: null });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Survei tidak ditemukan');
  });

  it('returns 200 for admin with correct progress data', async () => {
    setupMocks({
      survey: { id: validSurveyId, title: 'Survey A' },
      quotas: [
        { quota: 50, surveyor: { id: 'surveyor-1', name: 'Alice' } },
        { quota: 30, surveyor: { id: 'surveyor-2', name: 'Bob' } },
      ],
      responseCount: 45,
      responseCounts: [
        { surveyor_id: 'surveyor-1', count: '30' },
        { surveyor_id: 'surveyor-2', count: '15' },
      ],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.surveyId).toBe(validSurveyId);
    expect(res.body.surveyTitle).toBe('Survey A');
    expect(res.body.totalQuota).toBe(80);
    expect(res.body.totalCollected).toBe(45);
    expect(res.body.completionPercentage).toBe(56.3);
    expect(res.body.surveyors).toHaveLength(2);
    expect(res.body.surveyors[0]).toHaveProperty('surveyorId');
    expect(res.body.surveyors[0]).toHaveProperty('surveyorName');
    expect(res.body.surveyors[0]).toHaveProperty('quota');
    expect(res.body.surveyors[0]).toHaveProperty('collected');
    expect(res.body.surveyors[0]).toHaveProperty('percentage');
    expect(res.body.surveyors[0]).toHaveProperty('remaining');
  });

  it('returns 200 for supervisor', async () => {
    setupMocks({
      survey: { id: validSurveyId, title: 'Survey B' },
      quotas: [
        { quota: 20, surveyor: { id: 'surveyor-1', name: 'Alice' } },
      ],
      responseCount: 10,
      responseCounts: [
        { surveyor_id: 'surveyor-1', count: '10' },
      ],
    });

    const token = createSupervisorToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.surveyTitle).toBe('Survey B');
  });

  it('completionPercentage is 0 when totalQuota is 0 (no quotas)', async () => {
    setupMocks({
      survey: { id: validSurveyId, title: 'Empty Survey' },
      quotas: [],
      responseCount: 0,
      responseCounts: [],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalQuota).toBe(0);
    expect(res.body.completionPercentage).toBe(0);
    expect(res.body.surveyors).toHaveLength(0);
  });

  it('completionPercentage is capped at 100.0 when collected > quota', async () => {
    setupMocks({
      survey: { id: validSurveyId, title: 'Over Survey' },
      quotas: [
        { quota: 10, surveyor: { id: 'surveyor-1', name: 'Alice' } },
      ],
      responseCount: 20,
      responseCounts: [
        { surveyor_id: 'surveyor-1', count: '20' },
      ],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.completionPercentage).toBe(100.0);
    expect(res.body.surveyors[0].percentage).toBe(100.0);
  });

  it('surveyors array is sorted by percentage descending', async () => {
    setupMocks({
      survey: { id: validSurveyId, title: 'Sort Survey' },
      quotas: [
        { quota: 100, surveyor: { id: 'surveyor-1', name: 'Alice' } },
        { quota: 50, surveyor: { id: 'surveyor-2', name: 'Bob' } },
        { quota: 80, surveyor: { id: 'surveyor-3', name: 'Carol' } },
      ],
      responseCount: 105,
      responseCounts: [
        { surveyor_id: 'surveyor-1', count: '20' },   // 20%
        { surveyor_id: 'surveyor-2', count: '45' },   // 90%
        { surveyor_id: 'surveyor-3', count: '40' },   // 50%
      ],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const percentages = res.body.surveyors.map((s) => s.percentage);
    for (let i = 0; i < percentages.length - 1; i++) {
      expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i + 1]);
    }
    // Bob (90%) > Carol (50%) > Alice (20%)
    expect(res.body.surveyors[0].surveyorName).toBe('Bob');
    expect(res.body.surveyors[1].surveyorName).toBe('Carol');
    expect(res.body.surveyors[2].surveyorName).toBe('Alice');
  });

  it('only surveyors with quotas appear in surveyors array', async () => {
    // Only surveyor-1 has a quota; surveyor-2 has responses but no quota
    setupMocks({
      survey: { id: validSurveyId, title: 'Quota Survey' },
      quotas: [
        { quota: 30, surveyor: { id: 'surveyor-1', name: 'Alice' } },
      ],
      responseCount: 25,
      responseCounts: [
        { surveyor_id: 'surveyor-1', count: '15' },
        { surveyor_id: 'surveyor-2', count: '10' },
      ],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get(`/dashboard/survey-progress/${validSurveyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.surveyors).toHaveLength(1);
    expect(res.body.surveyors[0].surveyorId).toBe('surveyor-1');
  });
});

describe('GET /dashboard/surveyor-summary', () => {
  /**
   * Setup mocks for the surveyor-summary endpoint.
   * The endpoint calls:
   *   1. User.findAll — active surveyors
   *   2. Survey.findAll — active surveys
   *   3. SurveyorQuota.findAll — quotas per surveyor in active surveys
   *   4. Response.findAll — responses per surveyor in active surveys (grouped by surveyor_id, filtered by survey_id)
   *   5. Response.findAll — today's responses per surveyor (grouped by surveyor_id, filtered by created_at)
   *
   * We use mockImplementation to distinguish the two Response.findAll calls
   * based on their where clause (survey_id vs created_at).
   */
  function setupSummaryMocks({
    surveyors = [],
    activeSurveys = [],
    quotaRows = [],
    responseRows = [],
    todayRows = [],
  } = {}) {
    User.findAll.mockResolvedValue(surveyors);
    Survey.findAll.mockResolvedValue(activeSurveys);
    SurveyorQuota.findAll.mockResolvedValue(quotaRows);
    Response.findAll.mockImplementation((opts) => {
      if (opts && opts.where && opts.where.created_at) {
        return Promise.resolve(todayRows);
      }
      return Promise.resolve(responseRows);
    });
  }

  it('returns 401 without token', async () => {
    const res = await request(app).get('/dashboard/surveyor-summary');
    expect(res.status).toBe(401);
  });

  it('returns 403 for role surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for role viewer', async () => {
    const token = createViewerToken();
    User.findAll.mockResolvedValue([]);
    Survey.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for admin with correct summary data', async () => {
    setupSummaryMocks({
      surveyors: [
        { id: 'surveyor-1', name: 'Alice' },
        { id: 'surveyor-2', name: 'Bob' },
      ],
      activeSurveys: [
        { id: 'survey-1' },
        { id: 'survey-2' },
      ],
      quotaRows: [
        { surveyor_id: 'surveyor-1', survey_id: 'survey-1', quota: 50 },
        { surveyor_id: 'surveyor-1', survey_id: 'survey-2', quota: 30 },
        { surveyor_id: 'surveyor-2', survey_id: 'survey-1', quota: 40 },
      ],
      responseRows: [
        { surveyor_id: 'surveyor-1', count: '60' },
        { surveyor_id: 'surveyor-2', count: '15' },
      ],
      todayRows: [
        { surveyor_id: 'surveyor-1', count: '5' },
        { surveyor_id: 'surveyor-2', count: '3' },
      ],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const alice = res.body.find((s) => s.surveyorId === 'surveyor-1');
    expect(alice).toBeDefined();
    expect(alice.surveyorName).toBe('Alice');
    expect(alice.activeSurveyCount).toBe(2);
    expect(alice.responsesToday).toBe(5);
    expect(alice.status).toBe('on-track'); // 60/80 = 0.75 >= 0.5

    const bob = res.body.find((s) => s.surveyorId === 'surveyor-2');
    expect(bob).toBeDefined();
    expect(bob.surveyorName).toBe('Bob');
    expect(bob.activeSurveyCount).toBe(1);
    expect(bob.responsesToday).toBe(3);
    expect(bob.status).toBe('behind'); // 15/40 = 0.375 < 0.5
  });

  it('returns 200 for supervisor', async () => {
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Alice' }],
      activeSurveys: [{ id: 'survey-1' }],
      quotaRows: [{ surveyor_id: 'surveyor-1', survey_id: 'survey-1', quota: 20 }],
      responseRows: [{ surveyor_id: 'surveyor-1', count: '10' }],
      todayRows: [{ surveyor_id: 'surveyor-1', count: '2' }],
    });

    const token = createSupervisorToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('only includes active surveyors (is_active = true)', async () => {
    // User.findAll is called with { role: 'surveyor', is_active: true }
    // We mock it to return only active surveyors — inactive ones are filtered by the query
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Active Alice' }],
      activeSurveys: [],
      quotaRows: [],
      responseRows: [],
      todayRows: [],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].surveyorName).toBe('Active Alice');

    // Verify User.findAll was called with the correct filter
    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'surveyor', is_active: true },
      })
    );
  });

  it('status "completed" when collected >= quota', async () => {
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Alice' }],
      activeSurveys: [{ id: 'survey-1' }],
      quotaRows: [{ surveyor_id: 'surveyor-1', survey_id: 'survey-1', quota: 30 }],
      responseRows: [{ surveyor_id: 'surveyor-1', count: '35' }], // 35 >= 30
      todayRows: [{ surveyor_id: 'surveyor-1', count: '5' }],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('completed');
  });

  it('status "on-track" when ratio >= 0.5', async () => {
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Alice' }],
      activeSurveys: [{ id: 'survey-1' }],
      quotaRows: [{ surveyor_id: 'surveyor-1', survey_id: 'survey-1', quota: 100 }],
      responseRows: [{ surveyor_id: 'surveyor-1', count: '60' }], // 60/100 = 0.6 >= 0.5
      todayRows: [{ surveyor_id: 'surveyor-1', count: '10' }],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('on-track');
  });

  it('status "behind" when ratio < 0.5', async () => {
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Alice' }],
      activeSurveys: [{ id: 'survey-1' }],
      quotaRows: [{ surveyor_id: 'surveyor-1', survey_id: 'survey-1', quota: 100 }],
      responseRows: [{ surveyor_id: 'surveyor-1', count: '20' }], // 20/100 = 0.2 < 0.5
      todayRows: [{ surveyor_id: 'surveyor-1', count: '2' }],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('behind');
  });

  it('status "on-track" when surveyor has no quota in active surveys', async () => {
    setupSummaryMocks({
      surveyors: [{ id: 'surveyor-1', name: 'Alice' }],
      activeSurveys: [{ id: 'survey-1' }],
      quotaRows: [], // no quotas for this surveyor
      responseRows: [],
      todayRows: [{ surveyor_id: 'surveyor-1', count: '3' }],
    });

    const token = createAdminToken();
    const res = await request(app)
      .get('/dashboard/surveyor-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].activeSurveyCount).toBe(0);
    expect(res.body[0].status).toBe('on-track');
  });
});
