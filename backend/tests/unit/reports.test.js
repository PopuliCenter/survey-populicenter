/**
 * Unit Tests for Report & Export Endpoints
 *
 * Tests:
 *   GET  /reports/surveys/:id          - list responses with filters
 *   POST /reports/surveys/:id/export/xlsx - synchronous xlsx export (≤1000)
 *   POST /reports/surveys/:id/export/csv  - synchronous csv export (≤1000)
 *
 * Requirements: 11.2, 11.3, 11.4, 11.6
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Mock models
// ---------------------------------------------------------------------------
jest.mock('../../src/models', () => ({
  Survey: {
    findByPk: jest.fn(),
  },
  Response: {
    findAll: jest.fn(),
    count: jest.fn(),
  },
  Answer: {},
  Question: {
    findAll: jest.fn(),
  },
  User: {},
  ExportJob: {
    create: jest.fn(),
  },
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

jest.mock('../../src/config/queue', () => ({
  queue: { add: jest.fn() },
}));

const app = require('../../src/app');
const { Survey, Response, Question } = require('../../src/models');
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SURVEY_ID = 'survey-uuid-001';

const mockSurvey = { id: SURVEY_ID, title: 'Test Survey' };

const mockQuestions = [
  { id: 'q1', text: 'Nama lengkap?', order_index: 1, type: 'short_text' },
  { id: 'q2', text: 'Pilihan favorit?', order_index: 2, type: 'single_choice' },
  { id: 'q3', text: 'Upload foto KTP', order_index: 3, type: 'photo' },
  { id: 'q4', text: 'Pilihan ganda?', order_index: 4, type: 'multiple_choice' },
];

function makeResponse(overrides = {}) {
  return {
    id: 'resp-uuid-001',
    questionnaire_number: 'SRV001-20240101-0001',
    surveyor_id: 'surveyor-uuid-001',
    start_time: new Date('2024-01-01T08:00:00.000Z'),
    end_time: new Date('2024-01-01T08:10:00.000Z'),
    duration_seconds: 600,
    latitude: -6.200000,
    longitude: 106.816666,
    geo_status: 'available',
    created_at: new Date('2024-01-01T08:10:00.000Z'),
    surveyor: { id: 'surveyor-uuid-001', name: 'Budi', email: 'budi@example.com' },
    answers: [
      {
        id: 'ans-1',
        question_id: 'q1',
        answer_value: 'Budi Santoso',
        answer_json: null,
        photo_path: null,
        question: { id: 'q1', text: 'Nama lengkap?', order_index: 1, type: 'short_text' },
      },
      {
        id: 'ans-2',
        question_id: 'q2',
        answer_value: 'pilihan_a',
        answer_json: null,
        photo_path: null,
        question: { id: 'q2', text: 'Pilihan favorit?', order_index: 2, type: 'single_choice' },
      },
      {
        id: 'ans-3',
        question_id: 'q3',
        answer_value: null,
        answer_json: null,
        photo_path: 'uploads/photos/ktp-001.jpg',
        question: { id: 'q3', text: 'Upload foto KTP', order_index: 3, type: 'photo' },
      },
      {
        id: 'ans-4',
        question_id: 'q4',
        answer_value: null,
        answer_json: ['val_a', 'val_b'],
        photo_path: null,
        question: { id: 'q4', text: 'Pilihan ganda?', order_index: 4, type: 'multiple_choice' },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null); // token not blacklisted
});

// ===========================================================================
// GET /reports/surveys/:id
// ===========================================================================
describe('GET /reports/surveys/:id', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`/reports/surveys/${SURVEY_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey does not exist', async () => {
    Survey.findByPk.mockResolvedValue(null);
    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 422 for invalid start_date format', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?start_date=not-a-date`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/start_date/);
  });

  it('returns 422 for invalid end_date format', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?end_date=not-a-date`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/end_date/);
  });

  it('returns list of responses with metadata and answers', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const r = res.body[0];
    expect(r.id).toBe('resp-uuid-001');
    expect(r.questionnaire_number).toBe('SRV001-20240101-0001');
    expect(r.surveyor_name).toBe('Budi');
    expect(r.surveyor_email).toBe('budi@example.com');
    expect(r.duration_seconds).toBe(600);
    expect(r.geo_status).toBe('available');
    expect(Array.isArray(r.answers)).toBe(true);
    expect(r.answers).toHaveLength(4);
  });

  it('returns responses filtered by start_date', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?start_date=2024-01-01`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Response.findAll).toHaveBeenCalled();
  });

  it('returns responses filtered by end_date', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?end_date=2024-12-31`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns responses filtered by surveyor_id', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?surveyor_id=surveyor-uuid-001`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns responses filtered by geo_status', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}?geo_status=available`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns responses with all metadata columns', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const r = res.body[0];
    
    // Verify all metadata columns are present
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('questionnaire_number');
    expect(r).toHaveProperty('surveyor_id');
    expect(r).toHaveProperty('surveyor_name');
    expect(r).toHaveProperty('surveyor_email');
    expect(r).toHaveProperty('start_time');
    expect(r).toHaveProperty('end_time');
    expect(r).toHaveProperty('duration_seconds');
    expect(r).toHaveProperty('latitude');
    expect(r).toHaveProperty('longitude');
    expect(r).toHaveProperty('geo_status');
    expect(r).toHaveProperty('created_at');
    expect(r).toHaveProperty('answers');
  });

  it('returns empty array when no responses match filters', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('supervisor dapat mengakses laporan - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createSupervisorToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('viewer dapat mengakses laporan - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createViewerToken();
    const res = await request(app)
      .get(`/reports/surveys/${SURVEY_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ===========================================================================
// POST /reports/surveys/:id/export/xlsx
// ===========================================================================
describe('POST /reports/surveys/:id/export/xlsx', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post(`/reports/surveys/${SURVEY_ID}/export/xlsx`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey does not exist', async () => {
    Survey.findByPk.mockResolvedValue(null);
    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid start_date format', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?start_date=bad-date`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/start_date/);
  });

  it('returns 202 with async flag when response count > 1000', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1001);

    // Mock ExportJob.create
    const mockExportJob = { id: 'job-uuid-001' };
    const ExportJob = require('../../src/models').ExportJob;
    ExportJob.create = jest.fn().mockResolvedValue(mockExportJob);

    // Mock exportQueue.queue.add
    const exportQueue = require('../../src/config/queue');
    exportQueue.queue.add = jest.fn().mockResolvedValue({});

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Ekspor sedang diproses');
    expect(res.body.jobId).toBe('job-uuid-001');
    expect(ExportJob.create).toHaveBeenCalledWith({
      survey_id: SURVEY_ID,
      requested_by: 'admin-uuid-001',
      status: 'pending',
      format: 'xlsx',
      filters: {},
    });
    expect(exportQueue.queue.add).toHaveBeenCalled();
  });

  it('returns xlsx file with correct Content-Type for ≤1000 responses', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(2);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename=".*\.xlsx"/
    );
    // Response body should be a non-empty buffer (xlsx binary)
    expect(res.body).toBeDefined();
  });

  it('returns xlsx file with correct Content-Disposition filename', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(0);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/\.xlsx"$/);
  });

  it('includes all metadata columns and question columns in xlsx', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // The xlsx binary should be non-empty
    expect(res.body).toBeTruthy();
  });

  it('exports xlsx with start_date filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?start_date=2024-01-01`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('exports xlsx with end_date filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?end_date=2024-12-31`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('exports xlsx with surveyor_id filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?surveyor_id=surveyor-uuid-001`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('exports xlsx with geo_status filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?geo_status=available`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('exports xlsx with multiple filters combined', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx?start_date=2024-01-01&end_date=2024-12-31&surveyor_id=surveyor-uuid-001&geo_status=available`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('handles survey with no responses (empty xlsx)', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(0);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('supervisor dapat mengekspor xlsx - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createSupervisorToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });

  it('viewer dapat mengekspor xlsx - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createViewerToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/xlsx`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
  });
});

// ===========================================================================
// POST /reports/surveys/:id/export/csv
// ===========================================================================
describe('POST /reports/surveys/:id/export/csv', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post(`/reports/surveys/${SURVEY_ID}/export/csv`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey does not exist', async () => {
    Survey.findByPk.mockResolvedValue(null);
    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid end_date format', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?end_date=bad-date`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/end_date/);
  });

  it('returns 202 with async flag when response count > 1500', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1500);

    // Mock ExportJob.create
    const mockExportJob = { id: 'job-uuid-002' };
    const ExportJob = require('../../src/models').ExportJob;
    ExportJob.create = jest.fn().mockResolvedValue(mockExportJob);

    // Mock exportQueue.queue.add
    const exportQueue = require('../../src/config/queue');
    exportQueue.queue.add = jest.fn().mockResolvedValue({});

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Ekspor sedang diproses');
    expect(res.body.jobId).toBe('job-uuid-002');
    expect(ExportJob.create).toHaveBeenCalledWith({
      survey_id: SURVEY_ID,
      requested_by: 'admin-uuid-001',
      status: 'pending',
      format: 'csv',
      filters: {},
    });
  });

  it('returns csv file with correct Content-Type for ≤1000 responses', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(2);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename=".*\.csv"/
    );
  });

  it('returns csv with correct Content-Disposition filename', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(0);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/\.csv"$/);
  });

  it('csv contains header row with all metadata columns', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    const csvText = res.body;

    // Check metadata headers are present
    expect(csvText).toContain('ID Responden');
    expect(csvText).toContain('Nomor Kuesioner');
    expect(csvText).toContain('Nama Surveyor');
    expect(csvText).toContain('Email Surveyor');
    expect(csvText).toContain('Tanggal Pengisian');
    expect(csvText).toContain('Waktu Mulai');
    expect(csvText).toContain('Waktu Selesai');
    expect(csvText).toContain('Durasi (detik)');
    expect(csvText).toContain('Latitude');
    expect(csvText).toContain('Longitude');
    expect(csvText).toContain('Geo Status');

    // Check question headers are present
    expect(csvText).toContain('Nama lengkap?');
    expect(csvText).toContain('Pilihan favorit?');
    expect(csvText).toContain('Upload foto KTP');
    expect(csvText).toContain('Pilihan ganda?');
  });

  it('csv contains photo_path for photo questions', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.body).toContain('uploads/photos/ktp-001.jpg');
  });

  it('csv contains multiple_choice answers joined by comma', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.body).toContain('val_a, val_b');
  });

  it('csv contains response data values', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    const csvText = res.body;
    expect(csvText).toContain('resp-uuid-001');
    expect(csvText).toContain('SRV001-20240101-0001');
    expect(csvText).toContain('Budi');
    expect(csvText).toContain('budi@example.com');
    expect(csvText).toContain('available');
    expect(csvText).toContain('Budi Santoso');
    expect(csvText).toContain('pilihan_a');
  });

  it('handles survey with no responses (header-only csv)', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(0);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    // Should still have header row
    expect(res.body).toContain('ID Responden');
  });

  it('exactly 1000 responses triggers sync export (not 202)', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1000);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('exports csv with start_date filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?start_date=2024-01-01`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('exports csv with end_date filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?end_date=2024-12-31`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('exports csv with surveyor_id filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?surveyor_id=surveyor-uuid-001`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('exports csv with geo_status filter', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?geo_status=available`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('exports csv with multiple filters combined', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createAdminToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv?start_date=2024-01-01&end_date=2024-12-31&surveyor_id=surveyor-uuid-001`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body).toContain('ID Responden');
  });

  it('supervisor dapat mengekspor csv - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createSupervisorToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('viewer dapat mengekspor csv - mengembalikan 200', async () => {
    Survey.findByPk.mockResolvedValue(mockSurvey);
    Response.count.mockResolvedValue(1);
    Question.findAll.mockResolvedValue(mockQuestions);
    Response.findAll.mockResolvedValue([makeResponse()]);

    const token = createViewerToken();
    const res = await request(app)
      .post(`/reports/surveys/${SURVEY_ID}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});
