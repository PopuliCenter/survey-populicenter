/**
 * Unit Tests for Response Module
 * Tests:
 *   - Save complete response
 *   - Validate required questions
 *   - Geolocation all statuses (available, denied, timeout, unsupported)
 *   - Rollback on failed questionnaire number generation
 *   - Surveyor only sees their own data
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
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
    },
  };

  const MockSequelize = {
    Op: {
      ne: Symbol('ne'),
      like: Symbol('like'),
      notLike: Symbol('notLike'),
    },
  };

  return {
    Response: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    Answer: {
      bulkCreate: jest.fn(),
      findOne: jest.fn(),
    },
    Question: {
      findAll: jest.fn(),
    },
    Survey: {
      findOne: jest.fn(),
    },
    User: {
      findOne: jest.fn(),
    },
    SurveyorQuota: {
      findOne: jest.fn(),
    },
    Sequelize: MockSequelize,
    sequelize: mockSequelize,
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
const { Response, Answer, Question, Survey, SurveyorQuota, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || JWT_SECRET;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSupervisorToken(id = 'supervisor-uuid-001') {
  return jwt.sign({ id, role: 'supervisor', email: 'supervisor@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createViewerToken(id = 'viewer-uuid-001') {
  return jwt.sign({ id, role: 'viewer', email: 'viewer@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSessionToken(payload) {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '24h' });
}

function mockResponseRecord(overrides = {}) {
  const base = {
    id: 'response-uuid-001',
    survey_id: 'survey-uuid-001',
    surveyor_id: 'surveyor-uuid-001',
    questionnaire_number: 'PENDING',
    start_time: new Date(Date.now() - 60000).toISOString(),
    end_time: null,
    duration_seconds: null,
    geo_status: 'available',
    latitude: null,
    longitude: null,
    created_at: new Date().toISOString(),
    update: jest.fn().mockResolvedValue(true),
    save: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

// ─── POST /responses/start ────────────────────────────────────────────────────

describe('Response Module - POST /responses/start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    // Default quota mocks — tests that need different behavior can override
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  test('mulai sesi pengisian berhasil - mengembalikan session_token dan start_time', async () => {
    const token = createSurveyorToken();
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', status: 'active', title: 'Test Survey' });
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
    Response.create.mockResolvedValue(mockResponseRecord());

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('session_token');
    expect(res.body).toHaveProperty('start_time');
    // Verify session_token is a valid JWT
    const decoded = jwt.verify(res.body.session_token, SESSION_SECRET);
    expect(decoded).toHaveProperty('response_id');
    expect(decoded).toHaveProperty('survey_id', 'survey-uuid-001');
    expect(decoded).toHaveProperty('surveyor_id', 'surveyor-uuid-001');
  });

  test('survei tidak aktif - mengembalikan 409', async () => {
    const token = createSurveyorToken();
    Survey.findOne.mockResolvedValue(null); // not found or not active

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Survei tidak lagi aktif' });
  });

  test('survey_id tidak diberikan - mengembalikan 422', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
  });

  test('admin tidak bisa memulai sesi - mengembalikan 403', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(403);
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app)
      .post('/responses/start')
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /responses/submit ───────────────────────────────────────────────────

describe('Response Module - POST /responses/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    // Default quota mocks — tests that need different behavior can override
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  const defaultFieldToolsSettings = {
    signature_mode: 'required',
    audio_mode: 'required',
    photo_mode: 'required',
    gps_mode: 'required',
  };

  const allOptionalFieldToolsSettings = {
    signature_mode: 'optional',
    audio_mode: 'optional',
    photo_mode: 'optional',
    gps_mode: 'optional',
  };

  // Default field tools data to satisfy required field tools validation
  const defaultFieldToolsData = {
    signature_path: '/uploads/signatures/sig.png',
    audio_path: '/uploads/audio/rec.mp3',
    photo_paths: ['/uploads/photos/photo1.jpg'],
    start_latitude: -6.2,
    start_longitude: 106.8,
  };

  function setupSuccessfulSubmit(geoOverrides = {}) {
    const startTime = new Date(Date.now() - 120000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    const pendingResponse = mockResponseRecord({ start_time: startTime });
    // Response.findOne is called twice: once for pending response, once for survey (via Survey.findOne)
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'SRV001 Test Survey', field_tools_settings: defaultFieldToolsSettings });

    // Quota check inside transaction
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);

    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', is_required: true },
      { id: 'q-uuid-002', is_required: false },
    ]);

    sequelize.query.mockResolvedValue([[{ nextval: '5' }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    return { sessionToken, pendingResponse };
  }

  test('simpan responden lengkap berhasil - mengembalikan questionnaire_number, end_time, duration_seconds', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupSuccessfulSubmit();

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [
          { question_id: 'q-uuid-001', answer_value: 'Ya' },
          { question_id: 'q-uuid-002', answer_value: 'Tidak' },
        ],
        geo: { status: 'available', lat: -6.200000, lng: 106.816666 },
        ...defaultFieldToolsData,
      });

    expect(res.status).toBe(201);
    // Format: {SURVEY_PREFIX}-{YYYYMMDD}-{SEQUENCE_NUMBER:04d}
    // Survey title 'SRV001 Test Survey' -> prefix 'SRV001'
    expect(res.body).toHaveProperty('questionnaire_number');
    expect(res.body.questionnaire_number).toMatch(/^SRV001-\d{8}-0005$/);
    expect(res.body).toHaveProperty('end_time');
    expect(res.body).toHaveProperty('duration_seconds');
    expect(typeof res.body.duration_seconds).toBe('number');
    expect(res.body.duration_seconds).toBeGreaterThanOrEqual(0);
  });

  test('format nomor kuesioner: {PREFIX}-{YYYYMMDD}-{SEQ:04d}', async () => {
    const token = createSurveyorToken();
    const startTime = new Date(Date.now() - 60000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    Response.findOne.mockResolvedValue(mockResponseRecord({ start_time: startTime }));
    // Survey title 'Survei Kesehatan' -> prefix 'SURVEI'
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Survei Kesehatan 2024', field_tools_settings: defaultFieldToolsSettings });
    Question.findAll.mockResolvedValue([{ id: 'q-uuid-001', is_required: false }]);
    sequelize.query.mockResolvedValue([[{ nextval: '42' }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
        ...defaultFieldToolsData,
      });

    expect(res.status).toBe(201);
    // Prefix from 'Survei Kesehatan 2024' -> 'SURVEI' (first 6 alphanumeric chars uppercase)
    expect(res.body.questionnaire_number).toMatch(/^SURVEI-\d{8}-0042$/);
  });

  test('validasi pertanyaan wajib - mengembalikan 422 dengan missing_questions', async () => {
    const token = createSurveyorToken();
    const startTime = new Date(Date.now() - 60000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    Response.findOne.mockResolvedValue(mockResponseRecord({ start_time: startTime }));
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Test Survey', field_tools_settings: allOptionalFieldToolsSettings });
    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', is_required: true },
      { id: 'q-uuid-002', is_required: true },
      { id: 'q-uuid-003', is_required: false },
    ]);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [
          // Only q-uuid-001 answered, q-uuid-002 is missing
          { question_id: 'q-uuid-001', answer_value: 'Ya' },
        ],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error', 'Pertanyaan wajib belum dijawab');
    expect(res.body).toHaveProperty('missing_questions');
    expect(res.body.missing_questions).toContain('q-uuid-002');
    expect(res.body.missing_questions).not.toContain('q-uuid-001');
    expect(res.body.missing_questions).not.toContain('q-uuid-003');
  });

  test('geolokasi status available - menyimpan lat dan lng', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupSuccessfulSubmit();

    await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-uuid-001', answer_value: 'Ya' }],
        geo: { status: 'available', lat: -6.200000, lng: 106.816666 },
        ...defaultFieldToolsData,
      });

    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'available',
        latitude: -6.200000,
        longitude: 106.816666,
      }),
      expect.any(Object)
    );
  });

  test('geolokasi status lokasi_tidak_tersedia - lat dan lng null', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupSuccessfulSubmit();

    await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-uuid-001', answer_value: 'Ya' }],
        geo: { status: 'lokasi_tidak_tersedia', lat: null, lng: null },
        ...defaultFieldToolsData,
      });

    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'lokasi_tidak_tersedia',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('geolokasi status tidak_didukung - lat dan lng null meskipun nilai diberikan', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupSuccessfulSubmit();

    await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-uuid-001', answer_value: 'Ya' }],
        // Even if lat/lng are provided, they should be null when status is not 'available'
        geo: { status: 'tidak_didukung', lat: -6.2, lng: 106.8 },
        ...defaultFieldToolsData,
      });

    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'tidak_didukung',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('geolokasi status timeout - lat dan lng null', async () => {
    const token = createSurveyorToken();
    const { sessionToken, pendingResponse } = setupSuccessfulSubmit();

    await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-uuid-001', answer_value: 'Ya' }],
        geo: { status: 'timeout', lat: null, lng: null },
        ...defaultFieldToolsData,
      });

    expect(pendingResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        geo_status: 'timeout',
        latitude: null,
        longitude: null,
      }),
      expect.any(Object)
    );
  });

  test('rollback saat gagal generate nomor kuesioner - mengembalikan 500', async () => {
    const token = createSurveyorToken();
    const startTime = new Date(Date.now() - 60000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    Response.findOne.mockResolvedValue(mockResponseRecord({ start_time: startTime }));
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Test Survey' });
    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', is_required: true },
    ]);

    // Simulate sequence query failure
    sequelize.query.mockRejectedValue(new Error('relation "questionnaire_seq_..." does not exist'));

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-uuid-001', answer_value: 'Ya' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Gagal menyimpan data. Silakan coba kembali' });

    // Verify rollback was called
    const mockTransaction = await sequelize.transaction();
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  test('session_token tidak valid - mengembalikan 401', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: 'invalid.token.here',
        answers: [],
        geo: { status: 'available' },
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('session_token tidak diberikan - mengembalikan 422', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [],
        geo: { status: 'available' },
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error', 'session_token wajib diisi');
  });

  test('admin tidak bisa submit - mengembalikan 403', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: 'some-token',
        answers: [],
        geo: {},
      });

    expect(res.status).toBe(403);
  });
});

// ─── Field Tools Validation on Submit ─────────────────────────────────────────

describe('Response Module - Field Tools Validation on Submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  function setupFieldToolsSubmit(fieldToolsSettings) {
    const startTime = new Date(Date.now() - 120000).toISOString();
    const sessionToken = createSessionToken({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    });

    const pendingResponse = mockResponseRecord({ start_time: startTime });
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      title: 'Test Survey',
      field_tools_settings: fieldToolsSettings,
    });

    Question.findAll.mockResolvedValue([
      { id: 'q-uuid-001', is_required: false },
    ]);

    sequelize.query.mockResolvedValue([[{ nextval: '1' }]]);
    Answer.bulkCreate.mockResolvedValue([]);

    return { sessionToken, pendingResponse };
  }

  // Requirement 5.1: Signature required → reject without signature_path
  test('signature_mode required tanpa signature_path → 422 "Tanda tangan wajib diisi"', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'required',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Tanda tangan wajib diisi');
  });

  // Requirement 5.2: Audio required → reject without audio_path
  test('audio_mode required tanpa audio_path → 422 "Rekaman audio wajib diisi"', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'required',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Rekaman audio wajib diisi');
  });

  // Requirement 5.3: Photo required → reject without photo_paths
  test('photo_mode required tanpa photo_paths → 422 "Foto wajib diisi"', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'required',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Foto wajib diisi');
  });

  // Requirement 5.3: Photo required → reject with empty photo_paths array
  test('photo_mode required dengan photo_paths kosong → 422 "Foto wajib diisi"', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'required',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
        photo_paths: [],
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Foto wajib diisi');
  });

  // Requirement 5.4: GPS required → reject without latitude/longitude
  test('gps_mode required tanpa latitude/longitude → 422 "Lokasi GPS wajib diisi"', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'required',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Lokasi GPS wajib diisi');
  });

  // Requirement 5.5: Optional field tools → accept without data
  test('semua field tools optional tanpa data → 201 (diterima)', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'optional',
      audio_mode: 'optional',
      photo_mode: 'optional',
      gps_mode: 'optional',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });

  // Requirement 5.5: Optional field tools → accept with data
  test('semua field tools optional dengan data → 201 (diterima)', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'optional',
      audio_mode: 'optional',
      photo_mode: 'optional',
      gps_mode: 'optional',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
        signature_path: '/uploads/signatures/sig.png',
        audio_path: '/uploads/audio/rec.mp3',
        photo_paths: ['/uploads/photos/photo1.jpg'],
        start_latitude: -6.2,
        start_longitude: 106.8,
      });

    expect(res.status).toBe(201);
  });

  // Requirement 5.6: Disabled field tools → ignore data, accept submission
  test('semua field tools disabled tanpa data → 201 (diterima)', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });

  // Requirement 5.6: Disabled field tools → ignore data even if provided
  test('semua field tools disabled dengan data → 201 (data diabaikan)', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
        signature_path: '/uploads/signatures/sig.png',
        audio_path: '/uploads/audio/rec.mp3',
        photo_paths: ['/uploads/photos/photo1.jpg'],
        start_latitude: -6.2,
        start_longitude: 106.8,
      });

    expect(res.status).toBe(201);
  });

  // Mixed modes: required fields provided, optional/disabled fields missing → accept
  test('campuran mode: required terpenuhi, optional/disabled kosong → 201', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit({
      signature_mode: 'required',
      audio_mode: 'optional',
      photo_mode: 'disabled',
      gps_mode: 'required',
    });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
        signature_path: '/uploads/signatures/sig.png',
        start_latitude: -6.2,
        start_longitude: 106.8,
      });

    expect(res.status).toBe(201);
  });

  // Survey without field_tools_settings (null) → accept (backward compatibility)
  test('survei tanpa field_tools_settings (null) → 201 (backward compatible)', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupFieldToolsSubmit(null);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });
});

// ─── GET /responses ───────────────────────────────────────────────────────────

describe('Response Module - GET /responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  function mockResponseList(surveyorId = 'surveyor-uuid-001') {
    return [
      {
        id: 'response-uuid-001',
        questionnaire_number: '0001',
        survey_id: 'survey-uuid-001',
        surveyor_id: surveyorId,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 120,
        geo_status: 'available',
        created_at: new Date().toISOString(),
        survey: { id: 'survey-uuid-001', title: 'Test Survey' },
        surveyor: { id: surveyorId, name: 'Test Surveyor' },
      },
    ];
  }

  test('admin melihat semua responden', async () => {
    const token = createAdminToken();
    Response.findAll.mockResolvedValue(mockResponseList());

    const res = await request(app)
      .get('/responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Admin query should not filter by surveyor_id
    const findAllCall = Response.findAll.mock.calls[0][0];
    expect(findAllCall.where).not.toHaveProperty('surveyor_id');
  });

  test('surveyor hanya melihat data milik sendiri', async () => {
    const token = createSurveyorToken('surveyor-uuid-001');
    Response.findAll.mockResolvedValue(mockResponseList('surveyor-uuid-001'));

    const res = await request(app)
      .get('/responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Surveyor query should filter by surveyor_id
    const findAllCall = Response.findAll.mock.calls[0][0];
    expect(findAllCall.where).toHaveProperty('surveyor_id', 'surveyor-uuid-001');
  });

  test('response berisi field yang diperlukan', async () => {
    const token = createAdminToken();
    Response.findAll.mockResolvedValue(mockResponseList());

    const res = await request(app)
      .get('/responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('questionnaire_number');
    expect(res.body[0]).toHaveProperty('survey_title');
    expect(res.body[0]).toHaveProperty('surveyor_name');
    expect(res.body[0]).toHaveProperty('start_time');
    expect(res.body[0]).toHaveProperty('end_time');
    expect(res.body[0]).toHaveProperty('duration_seconds');
    expect(res.body[0]).toHaveProperty('geo_status');
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/responses');
    expect(res.status).toBe(401);
  });

  test('supervisor dapat melihat semua responden', async () => {
    const token = createSupervisorToken();
    Response.findAll.mockResolvedValue(mockResponseList());

    const res = await request(app)
      .get('/responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Supervisor query should not filter by surveyor_id
    const findAllCall = Response.findAll.mock.calls[0][0];
    expect(findAllCall.where).not.toHaveProperty('surveyor_id');
  });

  test('viewer dapat melihat semua responden', async () => {
    const token = createViewerToken();
    Response.findAll.mockResolvedValue(mockResponseList());

    const res = await request(app)
      .get('/responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Viewer query should not filter by surveyor_id
    const findAllCall = Response.findAll.mock.calls[0][0];
    expect(findAllCall.where).not.toHaveProperty('surveyor_id');
  });
});

// ─── GET /responses/:id ───────────────────────────────────────────────────────

describe('Response Module - GET /responses/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  function mockResponseDetail(surveyorId = 'surveyor-uuid-001') {
    return {
      id: 'response-uuid-001',
      questionnaire_number: '0001',
      survey_id: 'survey-uuid-001',
      surveyor_id: surveyorId,
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      duration_seconds: 120,
      latitude: -6.200000,
      longitude: 106.816666,
      geo_status: 'available',
      created_at: new Date().toISOString(),
      survey: { id: 'survey-uuid-001', title: 'Test Survey' },
      surveyor: { id: surveyorId, name: 'Test Surveyor' },
      answers: [
        {
          id: 'answer-uuid-001',
          question_id: 'q-uuid-001',
          answer_value: 'Ya',
          answer_json: null,
          photo_path: null,
          created_at: new Date().toISOString(),
          question: { id: 'q-uuid-001', text: 'Pertanyaan 1', type: 'single_choice', order_index: 1 },
        },
      ],
    };
  }

  test('admin dapat melihat detail responden apapun', async () => {
    const token = createAdminToken();
    Response.findOne.mockResolvedValue(mockResponseDetail());

    const res = await request(app)
      .get('/responses/response-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'response-uuid-001');
    expect(res.body).toHaveProperty('questionnaire_number', '0001');
    expect(res.body).toHaveProperty('answers');
    expect(Array.isArray(res.body.answers)).toBe(true);
    // Admin query should not filter by surveyor_id
    const findOneCall = Response.findOne.mock.calls[0][0];
    expect(findOneCall.where).not.toHaveProperty('surveyor_id');
  });

  test('surveyor hanya bisa melihat data milik sendiri', async () => {
    const token = createSurveyorToken('surveyor-uuid-001');
    Response.findOne.mockResolvedValue(mockResponseDetail('surveyor-uuid-001'));

    const res = await request(app)
      .get('/responses/response-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Surveyor query should filter by surveyor_id
    const findOneCall = Response.findOne.mock.calls[0][0];
    expect(findOneCall.where).toHaveProperty('surveyor_id', 'surveyor-uuid-001');
  });

  test('surveyor tidak bisa melihat data surveyor lain - mengembalikan 404', async () => {
    const token = createSurveyorToken('surveyor-uuid-001');
    // findOne returns null because surveyor_id doesn't match
    Response.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/responses/response-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Data responden tidak ditemukan' });
  });

  test('responden tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Response.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/responses/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Data responden tidak ditemukan' });
  });

  test('detail responden berisi semua field metadata', async () => {
    const token = createAdminToken();
    Response.findOne.mockResolvedValue(mockResponseDetail());

    const res = await request(app)
      .get('/responses/response-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('questionnaire_number');
    expect(res.body).toHaveProperty('survey_title');
    expect(res.body).toHaveProperty('surveyor_name');
    expect(res.body).toHaveProperty('start_time');
    expect(res.body).toHaveProperty('end_time');
    expect(res.body).toHaveProperty('duration_seconds');
    expect(res.body).toHaveProperty('latitude');
    expect(res.body).toHaveProperty('longitude');
    expect(res.body).toHaveProperty('geo_status');
    expect(res.body).toHaveProperty('answers');
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/responses/response-uuid-001');
    expect(res.status).toBe(401);
  });

  test('supervisor dapat melihat detail responden apapun', async () => {
    const token = createSupervisorToken();
    Response.findOne.mockResolvedValue(mockResponseDetail());

    const res = await request(app)
      .get('/responses/response-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'response-uuid-001');
    expect(res.body).toHaveProperty('answers');
    // Supervisor query should not filter by surveyor_id
    const findOneCall = Response.findOne.mock.calls[0][0];
    expect(findOneCall.where).not.toHaveProperty('surveyor_id');
  });

  test('viewer dapat melihat detail responden apapun', async () => {
    const token = createViewerToken();
    Response.findOne.mockResolvedValue(mockResponseDetail());

    const res = await request(app)
      .get('/responses/response-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'response-uuid-001');
    expect(res.body).toHaveProperty('answers');
    // Viewer query should not filter by surveyor_id
    const findOneCall = Response.findOne.mock.calls[0][0];
    expect(findOneCall.where).not.toHaveProperty('surveyor_id');
  });
});

// ─── Phone Number Answer Validation ───────────────────────────────────────────

describe('phone_number answer validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  function setupPhoneSubmit(answerValue) {
    const startTime = new Date(Date.now() - 120000).toISOString();
    const sessionToken = jwt.sign({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    }, SESSION_SECRET, { expiresIn: '24h' });

    const pendingResponse = mockResponseRecord({ start_time: startTime });
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Test Survey' });

    Question.findAll.mockResolvedValue([
      { id: 'q-phone-001', is_required: true, type: 'phone_number', options: { min_length: 10, max_length: 13 } },
    ]);

    sequelize.query.mockResolvedValue([[{ nextval: '1' }]]);
    Answer.bulkCreate.mockResolvedValue([]);
    Answer.findOne.mockResolvedValue(null);

    return { sessionToken, pendingResponse, answerValue };
  }

  test('submit jawaban phone_number dengan angka valid → 201', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupPhoneSubmit('08123456789');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-phone-001', answer_value: '08123456789' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });

  test('submit jawaban phone_number dengan karakter non-digit → 422', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupPhoneSubmit('0812-345-6789');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-phone-001', answer_value: '0812-345-6789' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nomor telepon hanya boleh berisi angka');
  });

  test('submit jawaban phone_number dengan panjang kurang dari min_length → 422', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupPhoneSubmit('08123');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-phone-001', answer_value: '08123' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang nomor telepon harus antara 10 dan 13 digit');
  });

  test('submit jawaban phone_number dengan panjang lebih dari max_length → 422', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupPhoneSubmit('08123456789012345');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-phone-001', answer_value: '08123456789012345' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Panjang nomor telepon harus antara 10 dan 13 digit');
  });
});

// ─── Unique ID Answer Validation ──────────────────────────────────────────────

describe('unique_id answer validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  function setupUniqueIdSubmit(answerValue, existingAnswer = null) {
    const startTime = new Date(Date.now() - 120000).toISOString();
    const sessionToken = jwt.sign({
      response_id: 'response-uuid-001',
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      start_time: startTime,
    }, SESSION_SECRET, { expiresIn: '24h' });

    const pendingResponse = mockResponseRecord({ start_time: startTime });
    Response.findOne.mockResolvedValue(pendingResponse);
    Survey.findOne.mockResolvedValue({ id: 'survey-uuid-001', title: 'Test Survey' });

    Question.findAll.mockResolvedValue([
      { id: 'q-unique-001', is_required: true, type: 'unique_id', options: { min_length: 1, max_length: 20 } },
    ]);

    sequelize.query.mockResolvedValue([[{ nextval: '1' }]]);
    Answer.bulkCreate.mockResolvedValue([]);
    Answer.findOne.mockResolvedValue(existingAnswer);

    return { sessionToken, pendingResponse };
  }

  test('submit jawaban unique_id dengan angka valid → 201', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupUniqueIdSubmit('12345');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-unique-001', answer_value: '12345' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });

  test('submit jawaban unique_id dengan karakter non-digit → 422', async () => {
    const token = createSurveyorToken();
    const { sessionToken } = setupUniqueIdSubmit('abc123');

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-unique-001', answer_value: 'abc123' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nomor kuesioner hanya boleh berisi angka');
  });

  test('submit jawaban unique_id duplikat dalam survei yang sama → 422', async () => {
    const token = createSurveyorToken();
    // Simulate existing answer found
    const { sessionToken } = setupUniqueIdSubmit('12345', { id: 'existing-answer-001', answer_value: '12345' });

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-unique-001', answer_value: '12345' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Nomor kuesioner sudah digunakan dalam survei ini');
  });

  test('submit jawaban unique_id yang sama di survei berbeda → 201', async () => {
    const token = createSurveyorToken();
    // No existing answer in this survey (findOne returns null)
    const { sessionToken } = setupUniqueIdSubmit('12345', null);

    const res = await request(app)
      .post('/responses/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_token: sessionToken,
        answers: [{ question_id: 'q-unique-001', answer_value: '12345' }],
        geo: { status: 'available', lat: -6.2, lng: 106.8 },
      });

    expect(res.status).toBe(201);
  });
});

// ─── POST /responses/check-unique ─────────────────────────────────────────────

describe('POST /responses/check-unique', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('cek nilai yang belum ada → { available: true }', async () => {
    const token = createSurveyorToken();
    Answer.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/responses/check-unique')
      .set('Authorization', `Bearer ${token}`)
      .send({
        survey_id: 'survey-uuid-001',
        question_id: 'q-unique-001',
        value: '12345',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  test('cek nilai yang sudah ada → { available: false }', async () => {
    const token = createSurveyorToken();
    Answer.findOne.mockResolvedValue({ id: 'existing-answer-001', answer_value: '12345' });

    const res = await request(app)
      .post('/responses/check-unique')
      .set('Authorization', `Bearer ${token}`)
      .send({
        survey_id: 'survey-uuid-001',
        question_id: 'q-unique-001',
        value: '12345',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
  });

  test('tanpa parameter lengkap → 422', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/responses/check-unique')
      .set('Authorization', `Bearer ${token}`)
      .send({
        survey_id: 'survey-uuid-001',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Parameter survey_id, question_id, dan value wajib diisi');
  });
});


// ─── Survey Deadline Enforcement ──────────────────────────────────────────────

describe('survey deadline enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    SurveyorQuota.findOne.mockResolvedValue({ survey_id: 'survey-uuid-001', surveyor_id: 'surveyor-uuid-001', quota: 10 });
    Response.count.mockResolvedValue(0);
  });

  test('POST /responses/start untuk survei dengan end_date di masa lalu → 409 "Survei sudah berakhir"', async () => {
    const token = createSurveyorToken();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      status: 'active',
      title: 'Expired Survey',
      start_date: null,
      end_date: pastDate,
    });

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Survei sudah berakhir');
  });

  test('POST /responses/start untuk survei dengan start_date di masa depan → 409 "Survei belum dimulai"', async () => {
    const token = createSurveyorToken();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      status: 'active',
      title: 'Future Survey',
      start_date: futureDate,
      end_date: null,
    });

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Survei belum dimulai');
  });

  test('POST /responses/start untuk survei dalam periode aktif → 201', async () => {
    const token = createSurveyorToken();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      status: 'active',
      title: 'Active Period Survey',
      start_date: pastDate,
      end_date: futureDate,
    });
    Response.create.mockResolvedValue(mockResponseRecord());

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('session_token');
  });

  test('POST /responses/start untuk survei tanpa start_date/end_date → 201', async () => {
    const token = createSurveyorToken();
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      status: 'active',
      title: 'No Dates Survey',
      start_date: null,
      end_date: null,
    });
    Response.create.mockResolvedValue(mockResponseRecord());

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('session_token');
  });

  test('POST /responses/start untuk survei aktif tapi expired → 409 (periode lebih prioritas)', async () => {
    const token = createSurveyorToken();
    const pastStart = new Date(Date.now() - 86400000 * 30).toISOString();
    const pastEnd = new Date(Date.now() - 86400000).toISOString();
    Survey.findOne.mockResolvedValue({
      id: 'survey-uuid-001',
      status: 'active',
      title: 'Active But Expired',
      start_date: pastStart,
      end_date: pastEnd,
    });

    const res = await request(app)
      .post('/responses/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Survei sudah berakhir');
  });
});
