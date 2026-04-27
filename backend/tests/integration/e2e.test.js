/**
 * Integration Tests - End-to-End Flows
 *
 * Covers:
 *   1. Full E2E: login → select survey → fill response → submit → verify unique questionnaire number
 *   2. Export data with date and surveyor filters
 *   3. Rate limiting: 5 failed attempts block IP for 15 minutes
 *   4. Geolocation: all scenarios (available, denied, timeout, unsupported) stored correctly
 *
 * Requirements: 1.6, 9.1, 9.3, 13.1, 13.2, 11.2, 16.2, 16.3, 16.4, 16.5
 *
 * NOTE: These tests use mocked external dependencies (DB, Redis) to run without
 * a live database, following the same pattern as the unit tests in this project.
 * The tests exercise the full HTTP request/response cycle through the Express app.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ─── Mock external dependencies ───────────────────────────────────────────────

jest.mock('../../src/models', () => {
  const mockTransaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };

  const mockSequelize = {
    fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
    col: jest.fn((col) => col),
    query: jest.fn(),
    transaction: jest.fn().mockResolvedValue(mockTransaction),
    Op: {
      ne: Symbol('ne'),
      gte: Symbol('gte'),
      lte: Symbol('lte'),
    },
  };

  return {
    User: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
    },
    Survey: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
    },
    Question: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    },
    Response: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    Answer: {
      bulkCreate: jest.fn(),
    },
    AuditLog: {
      create: jest.fn(),
    },
    ExportJob: {
      findByPk: jest.fn(),
      create: jest.fn(),
    },
    SurveyorQuota: {
      findOne: jest.fn(),
    },
    sequelize: mockSequelize,
    Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike'), gte: Symbol('gte'), lte: Symbol('lte') } },
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

jest.mock('../../src/config/queue', () => ({
  add: jest.fn().mockResolvedValue({ id: 'bull-job-id' }),
}));

const app = require('../../src/app');
const { User, Survey, Question, Response, Answer, AuditLog, ExportJob, SurveyorQuota, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || JWT_SECRET;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

function createSessionToken(payload) {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '24h' });
}

function makePendingResponse(overrides = {}) {
  return {
    id: 'response-uuid-001',
    survey_id: 'survey-uuid-001',
    surveyor_id: 'surveyor-uuid-001',
    questionnaire_number: 'PENDING',
    start_time: new Date(Date.now() - 120000).toISOString(),
    end_time: null,
    duration_seconds: null,
    geo_status: 'available',
    latitude: null,
    longitude: null,
    created_at: new Date().toISOString(),
    update: jest.fn().mockResolvedValue(true),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Suite 1: Full E2E Flow ────────────────────────────────────────────────────
// Requirements: 1.6, 9.1, 9.3, 13.1, 13.2

describe('E2E Flow 1: Login → Pilih Survei → Isi Responden → Simpan → Verifikasi Nomor Kuesioner Unik', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
    AuditLog.create.mockResolvedValue({});
    // Default quota mocks for response start/submit tests
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  test('Step 1: Login surveyor berhasil dan mendapatkan JWT', async () => {
    const passwordHash = await hashPassword('SurveyorPass1');
    User.findOne.mockResolvedValue({
      id: 'surveyor-uuid-001',
      name: 'Budi Santoso',
      email: 'budi@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'budi@example.com', password: 'SurveyorPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('surveyor');

    // Verify JWT payload
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('surveyor');
    expect(decoded.id).toBe('surveyor-uuid-001');
    // Surveyor token expires in 12 hours
    const expectedExp = Math.floor(Date.now() / 1000) + 43200;
    expect(decoded.exp).toBeGreaterThan(expectedExp - 30);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 30);
  });

  test('Step 2: Surveyor melihat daftar survei aktif', async () => {
    const token = createSurveyorToken();
    Survey.findAll.mockResolvedValue([
      { id: 'survey-uuid-001', title: 'Survei Kepuasan Pelanggan', description: 'Deskripsi', status: 'active', created_at: new Date() },
    ]);
    Question.findAll.mockResolvedValue([
      { survey_id: 'survey-uuid-001', count: '3' },
    ]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Surveyor only sees active surveys
    const surveyIds = res.body.map((s) => s.id);
    expect(surveyIds).toContain('survey-uuid-001');
  });

  test('Step 3: Surveyor memulai sesi pengisian (POST /responses/start)', async () => {
    const token = createSurveyorToken();
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', status: 'active', title: 'Survei Kepuasan' });
    Response.create.mockResolvedValue(makePendingResponse());

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('session_token');
    expect(res.body).toHaveProperty('start_time');

    // Verify session token contains correct payload
    const decoded = jwt.verify(res.body.session_token, SESSION_SECRET);
    expect(decoded.survey_id).toBe('survey-uuid-001');
    expect(decoded.surveyor_id).toBe('surveyor-uuid-001');
    expect(decoded).toHaveProperty('response_id');
    expect(decoded).toHaveProperty('start_time');
  });

  test('Step 4: Surveyor submit responden dan mendapatkan nomor kuesioner', async () => {
    const token = createSurveyorToken();
    const startTime = new Date(Date.now() - 300000).toISOString(); // 5 minutes ago
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    Response.findOne.mockResolvedValue(makePendingResponse({ start_time: startTime }));
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Kepuasan' });
    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', is_required: true },
      { id: 'q-uuid-002', is_required: false },
    ]);
    sequelize.query.mockResolvedValue([[{ nextval: '1' }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [
          { question_id: 'q-uuid-001', answer_value: 'Sangat Puas' },
          { question_id: 'q-uuid-002', answer_value: 'Tidak ada komentar' },
        ],
        geo: { status: 'available', lat: -6.200000, lng: 106.816666 },
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('questionnaire_number');
    expect(res.body).toHaveProperty('end_time');
    expect(res.body).toHaveProperty('duration_seconds');
    // Duration should be positive (started 5 minutes ago)
    expect(res.body.duration_seconds).toBeGreaterThan(0);
    // Questionnaire number format: {PREFIX}-{YYYYMMDD}-{SEQ:04d}
    expect(res.body.questionnaire_number).toMatch(/^[A-Z0-9]+-\d{8}-\d{4}$/);
  });

  test('Step 5: Nomor kuesioner unik per survei - dua submit menghasilkan nomor berbeda', async () => {
    const token = createSurveyorToken();

    // First submission
    const startTime1 = new Date(Date.now() - 120000).toISOString();
    const sessionToken1 = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime1,
    });

    Response.findOne.mockResolvedValueOnce(makePendingResponse({ id: 'response-uuid-001', start_time: startTime1 }));
    Survey.findOne.mockResolvedValueOnce({ id: 'survey-uuid-001', title: 'Survei Kepuasan' });
    Question.findAll.mockResolvedValueOnce([{ id: 'q-uuid-001', is_required: false }]);
    sequelize.query.mockResolvedValueOnce([[{ nextval: '1' }]]);
    Answer.bulkCreate.mockResolvedValueOnce([]);

    const res1 = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken1,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res1.status).toBe(201);
    const qNum1 = res1.body.questionnaire_number;

    // Second submission
    const startTime2 = new Date(Date.now() - 60000).toISOString();
    const sessionToken2 = createSessionToken({
      response_id: 'response-uuid-002',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime2,
    });

    Response.findOne.mockResolvedValueOnce(makePendingResponse({ id: 'response-uuid-002', start_time: startTime2 }));
    Survey.findOne.mockResolvedValueOnce({ id: 'survey-uuid-001', title: 'Survei Kepuasan' });
    Question.findAll.mockResolvedValueOnce([{ id: 'q-uuid-001', is_required: false }]);
    // Sequence increments: nextval = 2 for second submission
    sequelize.query.mockResolvedValueOnce([[{ nextval: '2' }]]);
    Answer.bulkCreate.mockResolvedValueOnce([]);

    const res2 = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken2,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res2.status).toBe(201);
    const qNum2 = res2.body.questionnaire_number;

    // Verify questionnaire numbers are unique
    expect(qNum1).not.toBe(qNum2);
    // Both should match the format
    expect(qNum1).toMatch(/^[A-Z0-9]+-\d{8}-\d{4}$/);
    expect(qNum2).toMatch(/^[A-Z0-9]+-\d{8}-\d{4}$/);
    // Sequence numbers should differ (0001 vs 0002)
    expect(qNum1).toMatch(/-0001$/);
    expect(qNum2).toMatch(/-0002$/);
  });

  test('Alur lengkap: login admin → buat survei → aktifkan → surveyor login → isi → submit', async () => {
    // 1. Admin login
    const adminPasswordHash = await hashPassword('AdminPass1');
    User.findOne.mockResolvedValueOnce({
      id: 'admin-uuid-001',
      name: 'Admin',
      email: 'admin@example.com',
      password_hash: adminPasswordHash,
      role: 'admin',
      is_active: true,
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass1' });

    expect(loginRes.status).toBe(200);
    const adminToken = loginRes.body.token;

    // 2. Admin creates survey
    Survey.create.mockResolvedValueOnce({
      id: 'survey-uuid-new',
      title: 'Survei Baru',
      description: null,
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const createSurveyRes = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Survei Baru' });

    expect(createSurveyRes.status).toBe(201);
    expect(createSurveyRes.body.status).toBe('draft');

    // 3. Surveyor login
    const surveyorPasswordHash = await hashPassword('SurveyorPass1');
    User.findOne.mockResolvedValueOnce({
      id: 'surveyor-uuid-001',
      name: 'Surveyor',
      email: 'surveyor@example.com',
      password_hash: surveyorPasswordHash,
      role: 'surveyor',
      is_active: true,
    });

    const surveyorLoginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'surveyor@example.com', password: 'SurveyorPass1' });

    expect(surveyorLoginRes.status).toBe(200);
    const surveyorToken = surveyorLoginRes.body.token;

    // 4. Surveyor starts a response session
    Survey.findOne.mockResolvedValueOnce({ id: 'survey-uuid-001', status: 'active', title: 'Survei Aktif' });
    Response.create.mockResolvedValueOnce(makePendingResponse());

    const startRes = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${surveyorToken}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(startRes.status).toBe(201);
    const sessionToken = startRes.body.session_token;

    // 5. Surveyor submits response
    const startTime = new Date(Date.now() - 180000).toISOString();
    const sessionTokenWithTime = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    Response.findOne.mockResolvedValueOnce(makePendingResponse({ start_time: startTime }));
    Survey.findOne.mockResolvedValueOnce({ id: 'survey-uuid-001', title: 'Survei Aktif' });
    Question.findAll.mockResolvedValueOnce([]);
    sequelize.query.mockResolvedValueOnce([[{ nextval: '7' }]]);
    Answer.bulkCreate.mockResolvedValueOnce([]);

    const submitRes = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${surveyorToken}`)
      .send({
        session_token: sessionTokenWithTime,
        answers: [],
        geo: { status: 'available', lat: -7.250445, lng: 112.768845 },
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body).toHaveProperty('questionnaire_number');
    expect(submitRes.body.questionnaire_number).toMatch(/^[A-Z0-9]+-\d{8}-0007$/);
  });
});


// ─── Suite 2: Export Data dengan Filter Tanggal dan Surveyor ──────────────────
// Requirements: 11.2

describe('E2E Flow 2: Ekspor Data dengan Filter Tanggal dan Surveyor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  function mockSurveyForExport() {
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Ekspor' });
  }

  function mockQuestionsForExport() {
    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', text: 'Pertanyaan 1', order_index: 1, type: 'short_text' },
      { id: 'q-uuid-002', text: 'Pertanyaan 2', order_index: 2, type: 'single_choice' },
    ]);
  }

  function mockResponsesForExport(surveyorId = 'surveyor-uuid-001') {
    const now = new Date();
    const startTime = new Date(now.getTime() - 300000);
    return [
      {
        id: 'response-uuid-001',
        questionnaire_number: 'SRVEXP-20240115-0001',
        surveyor_id: surveyorId,
        start_time: startTime,
        end_time: now,
        duration_seconds: 300,
        latitude: -6.200000,
        longitude: 106.816666,
        geo_status: 'available',
        created_at: now,
        surveyor: { id: surveyorId, name: 'Budi Santoso', email: 'budi@example.com' },
        answers: [
          {
            id: 'answer-uuid-001',
            question_id: 'q-uuid-001',
            answer_value: 'Jawaban 1',
            answer_json: null,
            photo_path: null,
            question: { id: 'q-uuid-001', text: 'Pertanyaan 1', order_index: 1, type: 'short_text' },
          },
        ],
      },
    ];
  }

  test('Ekspor XLSX dengan filter tanggal - mengembalikan file xlsx', async () => {
    const token = createAdminToken();
    mockSurveyForExport();
    Response.count.mockResolvedValue(1); // sync export (<=1000)
    mockQuestionsForExport();
    Response.findAll.mockResolvedValue(mockResponsesForExport());

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx')
      .set('Authorization', `Bearer ${token}`)
      .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.xlsx');
  });

  test('Ekspor CSV dengan filter surveyor - mengembalikan file csv', async () => {
    const token = createAdminToken();
    mockSurveyForExport();
    Response.count.mockResolvedValue(1); // sync export
    mockQuestionsForExport();
    Response.findAll.mockResolvedValue(mockResponsesForExport('surveyor-uuid-001'));

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/csv')
      .set('Authorization', `Bearer ${token}`)
      .query({ surveyor_id: 'surveyor-uuid-001' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');
  });

  test('Ekspor XLSX dengan filter tanggal DAN surveyor sekaligus', async () => {
    const token = createAdminToken();
    mockSurveyForExport();
    Response.count.mockResolvedValue(2);
    mockQuestionsForExport();
    Response.findAll.mockResolvedValue(mockResponsesForExport('surveyor-uuid-002'));

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx')
      .set('Authorization', `Bearer ${token}`)
      .query({
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        surveyor_id: 'surveyor-uuid-002',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  test('Ekspor CSV dengan filter tanggal DAN surveyor sekaligus', async () => {
    const token = createAdminToken();
    mockSurveyForExport();
    Response.count.mockResolvedValue(1);
    mockQuestionsForExport();
    Response.findAll.mockResolvedValue(mockResponsesForExport('surveyor-uuid-002'));

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/csv')
      .set('Authorization', `Bearer ${token}`)
      .query({
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        surveyor_id: 'surveyor-uuid-002',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  test('Ekspor dengan format tanggal tidak valid - mengembalikan 422', async () => {
    const token = createAdminToken();
    mockSurveyForExport();

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx')
      .set('Authorization', `Bearer ${token}`)
      .query({ start_date: 'bukan-tanggal' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('start_date');
  });

  test('Ekspor survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .post('/reports/surveys/nonexistent-survey/export/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('Ekspor >1000 responden - trigger async job dan kembalikan jobId', async () => {
    const token = createAdminToken();
    mockSurveyForExport();
    Response.count.mockResolvedValue(1500); // async export (>1000)
    ExportJob.create.mockResolvedValue({ id: 'export-job-uuid-001' });

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('jobId', 'export-job-uuid-001');
    expect(res.body).toHaveProperty('message');
  });

  test('GET laporan survei dengan filter tanggal dan surveyor', async () => {
    const token = createAdminToken();
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Ekspor' });
    Response.findAll.mockResolvedValue(mockResponsesForExport('surveyor-uuid-001'));

    const res = await request(app)
      .get('/reports/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .query({
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        surveyor_id: 'surveyor-uuid-001',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Each response should have metadata fields
    if (res.body.length > 0) {
      const r = res.body[0];
      expect(r).toHaveProperty('questionnaire_number');
      expect(r).toHaveProperty('surveyor_name');
      expect(r).toHaveProperty('start_time');
      expect(r).toHaveProperty('end_time');
      expect(r).toHaveProperty('duration_seconds');
      expect(r).toHaveProperty('latitude');
      expect(r).toHaveProperty('longitude');
      expect(r).toHaveProperty('geo_status');
      expect(r).toHaveProperty('answers');
    }
  });

  test('Ekspor hanya bisa diakses admin - surveyor mendapat 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('Ekspor tanpa token - mengembalikan 401', async () => {
    const res = await request(app)
      .post('/reports/surveys/survey-uuid-001/export/xlsx');

    expect(res.status).toBe(401);
  });
});

// ─── Suite 3: Rate Limiting ────────────────────────────────────────────────────
// Requirements: 1.6

describe('E2E Flow 3: Rate Limiting - 5 Kali Gagal Memblokir IP Selama 15 Menit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.create.mockResolvedValue({});
  });

  test('IP diblokir setelah 5 kali gagal login - mengembalikan 429', async () => {
    // Simulate IP already has 5 failed attempts (count >= 5)
    redis.get.mockResolvedValue('5');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'attacker@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('15 menit');
  });

  test('IP dengan 4 percobaan gagal belum diblokir - masih bisa mencoba', async () => {
    // 4 previous failures - not yet blocked
    redis.get.mockResolvedValue('4');
    redis.incr.mockResolvedValue(5);
    redis.expire.mockResolvedValue(1);
    User.findOne.mockResolvedValue(null); // user not found

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    // Should get 401 (wrong credentials), not 429 (rate limited)
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email atau password tidak valid');
    // Rate limit counter should be incremented
    expect(redis.incr).toHaveBeenCalled();
  });

  test('Percobaan ke-5 yang gagal menginkremen counter ke 5', async () => {
    // 4 previous failures
    redis.get.mockResolvedValue('4');
    redis.incr.mockResolvedValue(5);
    redis.expire.mockResolvedValue(1);

    const passwordHash = await hashPassword('CorrectPass1');
    User.findOne.mockResolvedValue({
      id: 'user-uuid',
      email: 'user@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: true,
    });

    // 5th attempt with wrong password
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    // Counter should now be at 5
    expect(redis.incr).toHaveBeenCalledWith('rate_limit:login:::ffff:127.0.0.1');
  });

  test('Login berhasil setelah blokir berakhir - counter di-reset', async () => {
    // No rate limit (block expired)
    redis.get.mockResolvedValue(null);
    redis.del.mockResolvedValue(1);

    const passwordHash = await hashPassword('CorrectPass1');
    User.findOne.mockResolvedValue({
      id: 'user-uuid',
      name: 'User',
      email: 'user@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'CorrectPass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    // Rate limit counter should be cleared on successful login
    expect(redis.del).toHaveBeenCalled();
  });

  test('Rate limit counter di-set dengan TTL 15 menit (900 detik) pada percobaan pertama', async () => {
    redis.get.mockResolvedValue(null); // no previous failures
    redis.incr.mockResolvedValue(1); // first failure
    redis.expire.mockResolvedValue(1);
    User.findOne.mockResolvedValue(null); // user not found

    await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    // On first failure, TTL should be set to 900 seconds (15 minutes)
    expect(redis.expire).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit:login:'),
      900
    );
  });

  test('IP yang berbeda tidak saling mempengaruhi rate limit', async () => {
    // First IP is blocked
    redis.get
      .mockResolvedValueOnce('5') // first request: blocked
      .mockResolvedValueOnce(null); // second request: not blocked

    // First IP - blocked
    const res1 = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '192.168.1.100')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res1.status).toBe(429);

    // Second IP - not blocked (different IP, different Redis key)
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    User.findOne.mockResolvedValue(null);

    const res2 = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '192.168.1.200')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    // Second IP should get 401 (wrong credentials), not 429
    expect(res2.status).toBe(401);
  });

  test('Kredensial salah dengan email tidak ada - counter diinkremen', async () => {
    redis.get.mockResolvedValue(null);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'notexist@example.com', password: 'AnyPass1' });

    expect(res.status).toBe(401);
    expect(redis.incr).toHaveBeenCalled();
  });

  test('Kredensial salah dengan password salah - counter diinkremen', async () => {
    redis.get.mockResolvedValue(null);
    redis.incr.mockResolvedValue(2);
    redis.expire.mockResolvedValue(1);

    const passwordHash = await hashPassword('CorrectPass1');
    User.findOne.mockResolvedValue({
      id: 'user-uuid',
      email: 'user@example.com',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(redis.incr).toHaveBeenCalled();
  });
});

// ─── Suite 4: Geolokasi - Semua Skenario Tersimpan dengan Benar ───────────────
// Requirements: 16.2, 16.3, 16.4, 16.5

describe('E2E Flow 4: Geolokasi - Semua Skenario Tersimpan dengan Benar di Database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
    // Default quota mocks for response submit tests
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  function setupGeoSubmit(geoStatus, lat, lng, seqVal = '1') {
    const startTime = new Date(Date.now() - 60000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-geo',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    const pendingResponse = makePendingResponse({ start_time: startTime });
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Geo' });
    Question.findAll.mockResolvedValue([]);
    sequelize.query.mockResolvedValue([[{ nextval: seqVal }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    return { sessionToken, pendingResponse };
  }

  test('Skenario available: lat dan lng tersimpan dengan benar', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupGeoSubmit('available', -6.200000, 106.816666);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.200000, lng: 106.816666 },
      });

    expect(res.status).toBe(201);
    // Verify geo data was saved correctly
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'available',
        latitude: -6.200000,
        longitude: 106.816666,
      }),
      expect.any(Object)
    );
  });

  test('Skenario lokasi_tidak_tersedia: lat dan lng null', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupGeoSubmit('lokasi_tidak_tersedia', null, null, '2');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'lokasi_tidak_tersedia', lat: null, lng: null },
      });

    expect(res.status).toBe(201);
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'lokasi_tidak_tersedia',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('Skenario tidak_didukung: lat dan lng null meskipun nilai diberikan', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupGeoSubmit('tidak_didukung', null, null, '3');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        // Even if lat/lng are provided, they must be null when status != 'available'
        geo: { status: 'tidak_didukung', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'tidak_didukung',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('Skenario timeout: lat dan lng null', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupGeoSubmit('timeout', null, null, '4');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'timeout', lat: null, lng: null },
      });

    expect(res.status).toBe(201);
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'timeout',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('Skenario available: koordinat dengan presisi tinggi tersimpan', async () => {
    const token = createSurveyorToken();
    // High-precision coordinates (6+ decimal places)
    const lat = -6.175392;
    const lng = 106.827153;
    const { sessionToken, pendingResponse } = setupGeoSubmit('available', lat, lng, '5');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat, lng },
      });

    expect(res.status).toBe(201);
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'available',
        latitude: lat,
        longitude: lng,
      }),
      expect.any(Object)
    );
  });

  test('Semua 4 skenario geo_status menghasilkan respons 201', async () => {
    const token = createSurveyorToken();
    const geoScenarios = [
      { status: 'available', lat: -6.2, lng: 106.8 },
      { status: 'lokasi_tidak_tersedia', lat: null, lng: null },
      { status: 'tidak_didukung', lat: null, lng: null },
      { status: 'timeout', lat: null, lng: null },
    ];

    for (let i = 0; i < geoScenarios.length; i++) {
      const scenario = geoScenarios[i];
      const startTime = new Date(Date.now() - 60000).toISOString();
      const sessionToken = createSessionToken({
        response_id: `response-uuid-geo-${i}`,
        survey_id: 'survey-uuid-001',
        surveyor_id: 'surveyor-uuid-001',
        start_time: startTime,
      });

      Response.findOne.mockResolvedValueOnce(makePendingResponse({
        id: `response-uuid-geo-${i}`,
        start_time: startTime,
      }));
      Survey.findOne.mockResolvedValueOnce({ id: 'survey-uuid-001', title: 'Survei Geo' });
      Question.findAll.mockResolvedValueOnce([]);
      sequelize.query.mockResolvedValueOnce([[{ nextval: String(i + 10) }]]);
      Answer.bulkCreate.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/responses/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          session_token: sessionToken,
          answers: [],
          geo: scenario,
        });

      expect(res.status).toBe(201);
    }
  });

  test('Geo status default adalah available jika tidak diberikan', async () => {
    const token = createSurveyorToken();
    const startTime = new Date(Date.now() - 60000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-geo-default',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    const pendingResponse = makePendingResponse({ start_time: startTime });
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Geo' });
    Question.findAll.mockResolvedValue([]);
    sequelize.query.mockResolvedValue([[{ nextval: '99' }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: {}, // empty geo object - status defaults to 'available'
      });

    expect(res.status).toBe(201);
    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'available',
      }),
      expect.any(Object)
    );
  });

  test('Verifikasi data geo tersimpan di database melalui GET /responses/:id', async () => {
    const token = createAdminToken();
    const responseId = 'response-uuid-geo-verify';

    Response.findOne.mockResolvedValue({
      id: responseId,
      questionnaire_number: 'SRVGEO-20240115-0001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: new Date(Date.now() - 300000),
      end_time: new Date(),
      duration_seconds: 300,
      latitude: -6.175392,
      longitude: 106.827153,
      geo_status: 'available',
      created_at: new Date(),
      survey: { id: 'survey-uuid-001', title: 'Survei Geo' },
      surveyor: { id: 'surveyor-uuid-001', name: 'Budi' },
      answers: [],
    });

    const res = await request(app)
      .get(`/responses/${responseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.geo_status).toBe('available');
    expect(res.body.latitude).toBe(-6.175392);
    expect(res.body.longitude).toBe(106.827153);
  });

  test('Verifikasi data geo lokasi_tidak_tersedia tersimpan di database', async () => {
    const token = createAdminToken();
    const responseId = 'response-uuid-geo-denied';

    Response.findOne.mockResolvedValue({
      id: responseId,
      questionnaire_number: 'SRVGEO-20240115-0002',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: new Date(Date.now() - 300000),
      end_time: new Date(),
      duration_seconds: 300,
      latitude: null,
      longitude: null,
      geo_status: 'lokasi_tidak_tersedia',
      created_at: new Date(),
      survey: { id: 'survey-uuid-001', title: 'Survei Geo' },
      surveyor: { id: 'surveyor-uuid-001', name: 'Budi' },
      answers: [],
    });

    const res = await request(app)
      .get(`/responses/${responseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.geo_status).toBe('lokasi_tidak_tersedia');
    expect(res.body.latitude).toBeNull();
    expect(res.body.longitude).toBeNull();
  });
});
