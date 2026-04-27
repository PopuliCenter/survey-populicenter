/**
 * Unit Tests for Survey Management Module
 * Tests: buat survei draft, aktivasi, deaktivasi, hapus draft,
 *        tolak hapus survei dengan responden, filter daftar berdasarkan role
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => {
  const mockSequelize = {
    fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
    col: jest.fn((col) => col),
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  };

  return {
    Survey: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    },
    Question: {
      findAll: jest.fn(),
      bulkCreate: jest.fn(),
    },
    Response: {
      findAll: jest.fn(),
      count: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    AuditLog: {
      create: jest.fn(),
    },
    sequelize: mockSequelize,
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
const { Survey, Question, Response, AuditLog, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper: create a valid admin JWT
function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: create a valid surveyor JWT
function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

// Helper: create a valid supervisor JWT
function createSupervisorToken(id = 'supervisor-uuid-001') {
  return jwt.sign({ id, role: 'supervisor', email: 'supervisor@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: create a valid viewer JWT
function createViewerToken(id = 'viewer-uuid-001') {
  return jwt.sign({ id, role: 'viewer', email: 'viewer@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: build a mock survey object with save() and destroy() methods
function mockSurvey(overrides = {}) {
  const base = {
    id: 'survey-uuid-001',
    title: 'Test Survey',
    description: 'Test description',
    status: 'draft',
    created_by: 'admin-uuid-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

// ─── GET /surveys ─────────────────────────────────────────────────────────────

describe('Survey Management Module - GET /surveys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
  });

  test('admin melihat semua survei (draft, active, inactive)', async () => {
    const token = createAdminToken();
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-uuid-001', status: 'draft' }),
      mockSurvey({ id: 'survey-uuid-002', status: 'active' }),
      mockSurvey({ id: 'survey-uuid-003', status: 'inactive' }),
    ]);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    // Admin sees all statuses
    const statuses = res.body.map((s) => s.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('active');
    expect(statuses).toContain('inactive');
  });

  test('surveyor hanya melihat survei aktif dengan minimal 1 pertanyaan', async () => {
    const token = createSurveyorToken();
    // findAll for surveyor only returns active surveys
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-uuid-002', status: 'active' }),
      mockSurvey({ id: 'survey-uuid-004', status: 'active' }),
    ]);
    // survey-uuid-002 has 2 questions, survey-uuid-004 has 0 questions
    Question.findAll.mockResolvedValue([
      { survey_id: 'survey-uuid-002', count: '2' },
    ]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Only survey-uuid-002 has questions, survey-uuid-004 should be filtered out
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('survey-uuid-002');
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/surveys');
    expect(res.status).toBe(401);
  });

  test('response berisi question_count dan response_count', async () => {
    const token = createAdminToken();
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-uuid-001', status: 'active' }),
    ]);
    Question.findAll.mockResolvedValue([
      { survey_id: 'survey-uuid-001', count: '3' },
    ]);
    Response.findAll.mockResolvedValue([
      { survey_id: 'survey-uuid-001', count: '10' },
    ]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('question_count');
    expect(res.body[0]).toHaveProperty('response_count');
  });

  test('supervisor melihat semua survei (draft, active, inactive)', async () => {
    const token = createSupervisorToken();
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-uuid-001', status: 'draft' }),
      mockSurvey({ id: 'survey-uuid-002', status: 'active' }),
      mockSurvey({ id: 'survey-uuid-003', status: 'inactive' }),
    ]);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
  });

  test('viewer hanya melihat survei aktif dan nonaktif (tidak termasuk draft)', async () => {
    const token = createViewerToken();
    // findAll for viewer returns active and inactive surveys only
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-uuid-002', status: 'active' }),
      mockSurvey({ id: 'survey-uuid-003', status: 'inactive' }),
    ]);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Viewer should not see draft surveys
    const statuses = res.body.map((s) => s.status);
    expect(statuses).not.toContain('draft');
  });
});

// ─── POST /surveys ────────────────────────────────────────────────────────────

describe('Survey Management Module - POST /surveys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('buat survei draft berhasil', async () => {
    const token = createAdminToken();
    const newSurvey = mockSurvey({
      id: 'new-survey-uuid',
      title: 'New Survey',
      description: 'A new survey',
      status: 'draft',
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Survey', description: 'A new survey' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'new-survey-uuid',
      title: 'New Survey',
      description: 'A new survey',
      status: 'draft',
    });
    // Verify status defaults to draft
    const createCall = Survey.create.mock.calls[0][0];
    expect(createCall.status).toBe('draft');
    // Verify audit log was created
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_SURVEY',
        entity_type: 'survey',
        entity_id: 'new-survey-uuid',
      })
    );
  });

  test('surveyor tidak bisa membuat survei - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Survey' });

    expect(res.status).toBe(403);
    expect(Survey.create).not.toHaveBeenCalled();
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app)
      .post('/surveys')
      .send({ title: 'New Survey' });

    expect(res.status).toBe(401);
  });

  test('supervisor dapat membuat survei draft - mengembalikan 201', async () => {
    const token = createSupervisorToken();
    const newSurvey = mockSurvey({
      id: 'new-survey-uuid',
      title: 'Supervisor Survey',
      description: 'Created by supervisor',
      status: 'draft',
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Supervisor Survey', description: 'Created by supervisor' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'new-survey-uuid',
      title: 'Supervisor Survey',
      status: 'draft',
    });
  });

  test('viewer tidak bisa membuat survei - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Survey' });

    expect(res.status).toBe(403);
    expect(Survey.create).not.toHaveBeenCalled();
  });
});

// ─── GET /surveys/:id ─────────────────────────────────────────────────────────

describe('Survey Management Module - GET /surveys/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('admin dapat melihat detail survei apapun statusnya', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'survey-uuid-001', status: 'draft' });
    expect(res.body).toHaveProperty('questions');
  });

  test('surveyor hanya bisa melihat survei aktif', async () => {
    const token = createSurveyorToken();
    // Surveyor tries to access a draft survey - findOne returns null (filtered by status=active)
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/surveys/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('supervisor dapat melihat detail survei apapun statusnya', async () => {
    const token = createSupervisorToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'survey-uuid-001', status: 'draft' });
    expect(res.body).toHaveProperty('questions');
  });

  test('viewer dapat melihat detail survei aktif', async () => {
    const token = createViewerToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'active' });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'survey-uuid-001', status: 'active' });
  });
});

// ─── PUT /surveys/:id ─────────────────────────────────────────────────────────

describe('Survey Management Module - PUT /surveys/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('update survei berhasil', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', title: 'Old Title' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title', description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(survey.save).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_SURVEY', entity_type: 'survey' })
    );
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/surveys/nonexistent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('surveyor tidak bisa update survei - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(403);
  });

  test('supervisor dapat mengupdate survei - mengembalikan 200', async () => {
    const token = createSupervisorToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', title: 'Old Title' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title', description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(survey.save).toHaveBeenCalled();
  });

  test('viewer tidak bisa mengupdate survei - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(403);
  });
});

// ─── PATCH /surveys/:id/activate ─────────────────────────────────────────────

describe('Survey Management Module - PATCH /surveys/:id/activate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
    sequelize.query.mockResolvedValue([]);
  });

  test('aktivasi survei berhasil', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(survey.status).toBe('active');
    expect(survey.save).toHaveBeenCalled();
    // Verify sequence creation was called
    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE SEQUENCE IF NOT EXISTS questionnaire_seq_')
    );
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACTIVATE_SURVEY',
        entity_type: 'survey',
        entity_id: 'survey-uuid-001',
      })
    );
  });

  test('aktivasi survei - sequence name menggunakan underscore bukan hyphen', async () => {
    const token = createAdminToken();
    const surveyId = 'abc12345-1234-1234-1234-abcdef123456';
    const survey = mockSurvey({ id: surveyId, status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);

    await request(app)
      .patch(`/surveys/${surveyId}/activate`)
      .set('Authorization', `Bearer ${token}`);

    const expectedSeqName = `questionnaire_seq_${surveyId.replace(/-/g, '_')}`;
    expect(sequelize.query).toHaveBeenCalledWith(
      `CREATE SEQUENCE IF NOT EXISTS ${expectedSeqName}`
    );
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/surveys/nonexistent-id/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('surveyor tidak bisa mengaktifkan survei - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('supervisor dapat mengaktifkan survei - mengembalikan 200', async () => {
    const token = createSupervisorToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(survey.status).toBe('active');
    expect(survey.save).toHaveBeenCalled();
  });

  test('viewer tidak bisa mengaktifkan survei - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── PATCH /surveys/:id/deactivate ───────────────────────────────────────────

describe('Survey Management Module - PATCH /surveys/:id/deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('deaktivasi survei berhasil', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'active' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(survey.status).toBe('inactive');
    expect(survey.save).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEACTIVATE_SURVEY',
        entity_type: 'survey',
        entity_id: 'survey-uuid-001',
      })
    );
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/surveys/nonexistent-id/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('surveyor tidak bisa menonaktifkan survei - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('supervisor dapat menonaktifkan survei - mengembalikan 200', async () => {
    const token = createSupervisorToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'active' });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(survey.status).toBe('inactive');
    expect(survey.save).toHaveBeenCalled();
  });

  test('viewer tidak bisa menonaktifkan survei - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .patch('/surveys/survey-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── DELETE /surveys/:id ──────────────────────────────────────────────────────

describe('Survey Management Module - DELETE /surveys/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('hapus survei draft berhasil', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);
    Response.count.mockResolvedValue(0); // no responses

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(survey.destroy).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE_SURVEY',
        entity_type: 'survey',
        entity_id: 'survey-uuid-001',
      })
    );
  });

  test('tolak hapus survei yang memiliki responden - mengembalikan 409', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);
    Response.count.mockResolvedValue(5); // has responses

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Survei memiliki data responden dan tidak dapat dihapus' });
    expect(survey.destroy).not.toHaveBeenCalled();
  });

  test('tolak hapus survei yang bukan draft (active) - mengembalikan 409', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'active' });
    Survey.findOne.mockResolvedValue(survey);
    Response.count.mockResolvedValue(0); // no responses

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Hanya survei berstatus draft yang dapat dihapus' });
    expect(survey.destroy).not.toHaveBeenCalled();
  });

  test('tolak hapus survei yang bukan draft (inactive) - mengembalikan 409', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'inactive' });
    Survey.findOne.mockResolvedValue(survey);
    Response.count.mockResolvedValue(0); // no responses

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Hanya survei berstatus draft yang dapat dihapus' });
    expect(survey.destroy).not.toHaveBeenCalled();
  });

  test('survei tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/surveys/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('surveyor tidak bisa menghapus survei - mengembalikan 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('supervisor dapat menghapus survei draft - mengembalikan 204', async () => {
    const token = createSupervisorToken();
    const survey = mockSurvey({ id: 'survey-uuid-001', status: 'draft' });
    Survey.findOne.mockResolvedValue(survey);
    Response.count.mockResolvedValue(0); // no responses

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(survey.destroy).toHaveBeenCalled();
  });

  test('viewer tidak bisa menghapus survei - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .delete('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /surveys/:id/clone ──────────────────────────────────────────────────

describe('Survey Management Module - POST /surveys/:id/clone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
    // Default: transaction executes callback with mock transaction object
    sequelize.transaction.mockImplementation(async (cb) => cb({}));
  });

  test('admin berhasil clone survei aktif → 201, judul mengandung "Salinan dari", status draft', async () => {
    const token = createAdminToken();
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei Kepuasan', status: 'active' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-001',
      title: 'Salinan dari Survei Kepuasan',
      status: 'draft',
      created_by: 'admin-uuid-001',
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.title).toContain('Salinan dari');
    expect(res.body.status).toBe('draft');
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('question_count');
  });

  test('supervisor berhasil clone survei → 201', async () => {
    const token = createSupervisorToken();
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei Supervisor', status: 'draft' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-002',
      title: 'Salinan dari Survei Supervisor',
      status: 'draft',
      created_by: 'supervisor-uuid-001',
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  test('clone survei dengan 3 pertanyaan → Question.bulkCreate dipanggil dengan 3 item, setiap item memiliki survey_id baru', async () => {
    const token = createAdminToken();
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei Dengan Pertanyaan', status: 'active' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-003',
      title: 'Salinan dari Survei Dengan Pertanyaan',
      status: 'draft',
    });

    const sourceQuestions = [
      { id: 'q-uuid-001', survey_id: 'source-uuid-001', text: 'Pertanyaan 1', type: 'text', order_index: 1, is_required: true, randomize_options: false, options: null, skip_logic: null },
      { id: 'q-uuid-002', survey_id: 'source-uuid-001', text: 'Pertanyaan 2', type: 'multiple_choice', order_index: 2, is_required: false, randomize_options: false, options: ['A', 'B'], skip_logic: null },
      { id: 'q-uuid-003', survey_id: 'source-uuid-001', text: 'Pertanyaan 3', type: 'rating', order_index: 3, is_required: true, randomize_options: false, options: null, skip_logic: null },
    ];

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue(sourceQuestions);
    Question.bulkCreate.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(Question.bulkCreate).toHaveBeenCalledTimes(1);
    const bulkCreateArgs = Question.bulkCreate.mock.calls[0][0];
    expect(bulkCreateArgs).toHaveLength(3);
    bulkCreateArgs.forEach((q) => {
      expect(q.survey_id).toBe('cloned-uuid-003');
      // ID harus berbeda dari source question IDs
      expect(['q-uuid-001', 'q-uuid-002', 'q-uuid-003']).not.toContain(q.id);
    });
  });

  test('clone survei tanpa pertanyaan → 201, question_count: 0, Question.bulkCreate tidak dipanggil', async () => {
    const token = createAdminToken();
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei Kosong', status: 'draft' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-004',
      title: 'Salinan dari Survei Kosong',
      status: 'draft',
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.question_count).toBe(0);
    expect(Question.bulkCreate).not.toHaveBeenCalled();
  });

  test('survei tidak ditemukan → 404, { error: "Survei tidak ditemukan" }', async () => {
    const token = createAdminToken();
    Survey.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/surveys/nonexistent-id/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Survei tidak ditemukan' });
  });

  test('viewer mencoba clone → 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(Survey.findOne).not.toHaveBeenCalled();
  });

  test('surveyor mencoba clone → 403', async () => {
    const token = createSurveyorToken();

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(Survey.findOne).not.toHaveBeenCalled();
  });

  test('request tanpa token → 401', async () => {
    const res = await request(app)
      .post('/surveys/source-uuid-001/clone');

    expect(res.status).toBe(401);
  });

  test('audit log dibuat dengan action: "CLONE_SURVEY", entity_type: "survey", entity_id = ID survei baru', async () => {
    const token = createAdminToken();
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei Audit', status: 'active' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-005',
      title: 'Salinan dari Survei Audit',
      status: 'draft',
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLONE_SURVEY',
        entity_type: 'survey',
        entity_id: 'cloned-uuid-005',
        user_id: 'admin-uuid-001',
      })
    );
  });

  test('created_by pada survei baru = ID user yang melakukan request', async () => {
    const adminId = 'admin-uuid-001';
    const token = createAdminToken(adminId);
    const sourceSurvey = mockSurvey({ id: 'source-uuid-001', title: 'Survei CreatedBy', status: 'draft' });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-006',
      title: 'Salinan dari Survei CreatedBy',
      status: 'draft',
      created_by: adminId,
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(Survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: adminId,
        status: 'draft',
      }),
      expect.anything()
    );
  });

  test('clone survei dengan start_date dan end_date → survei baru memiliki keduanya null', async () => {
    const token = createAdminToken();
    const sourceSurvey = mockSurvey({
      id: 'source-uuid-001',
      title: 'Survei Dengan Deadline',
      status: 'active',
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: '2025-12-31T00:00:00.000Z',
    });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-007',
      title: 'Salinan dari Survei Dengan Deadline',
      status: 'draft',
      start_date: null,
      end_date: null,
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    // Verify Survey.create was called with null dates
    expect(Survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: null,
        end_date: null,
      }),
      expect.anything()
    );
  });
});


// ─── Survey Deadline ──────────────────────────────────────────────────────────

describe('survey deadline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('POST /surveys dengan start_date dan end_date valid → 201, kedua field tersimpan', async () => {
    const token = createAdminToken();
    const startDate = '2025-06-01T00:00:00.000Z';
    const endDate = '2025-07-01T00:00:00.000Z';
    const newSurvey = mockSurvey({
      id: 'survey-deadline-001',
      title: 'Deadline Survey',
      start_date: startDate,
      end_date: endDate,
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Deadline Survey', start_date: startDate, end_date: endDate });

    expect(res.status).toBe(201);
    expect(res.body.start_date).toBe(startDate);
    expect(res.body.end_date).toBe(endDate);
    const createCall = Survey.create.mock.calls[0][0];
    expect(createCall.start_date).toBe(startDate);
    expect(createCall.end_date).toBe(endDate);
  });

  test('POST /surveys dengan end_date <= start_date → 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Invalid Dates',
        start_date: '2025-07-01T00:00:00.000Z',
        end_date: '2025-06-01T00:00:00.000Z',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Tanggal berakhir harus lebih besar dari tanggal mulai');
    expect(Survey.create).not.toHaveBeenCalled();
  });

  test('POST /surveys tanpa start_date dan end_date → 201, kedua field null', async () => {
    const token = createAdminToken();
    const newSurvey = mockSurvey({
      id: 'survey-no-dates',
      title: 'No Dates Survey',
      start_date: null,
      end_date: null,
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'No Dates Survey' });

    expect(res.status).toBe(201);
    const createCall = Survey.create.mock.calls[0][0];
    expect(createCall.start_date).toBeNull();
    expect(createCall.end_date).toBeNull();
  });

  test('POST /surveys dengan hanya start_date → 201', async () => {
    const token = createAdminToken();
    const startDate = '2025-06-01T00:00:00.000Z';
    const newSurvey = mockSurvey({
      id: 'survey-start-only',
      title: 'Start Only',
      start_date: startDate,
      end_date: null,
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Start Only', start_date: startDate });

    expect(res.status).toBe(201);
    const createCall = Survey.create.mock.calls[0][0];
    expect(createCall.start_date).toBe(startDate);
    expect(createCall.end_date).toBeNull();
  });

  test('POST /surveys dengan hanya end_date → 201', async () => {
    const token = createAdminToken();
    const endDate = '2025-07-01T00:00:00.000Z';
    const newSurvey = mockSurvey({
      id: 'survey-end-only',
      title: 'End Only',
      start_date: null,
      end_date: endDate,
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'End Only', end_date: endDate });

    expect(res.status).toBe(201);
    const createCall = Survey.create.mock.calls[0][0];
    expect(createCall.start_date).toBeNull();
    expect(createCall.end_date).toBe(endDate);
  });

  test('PUT /surveys/:id update start_date dan end_date → 200, field diperbarui', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      title: 'Old Title',
      start_date: null,
      end_date: null,
    });
    Survey.findOne.mockResolvedValue(survey);

    const startDate = '2025-06-01T00:00:00.000Z';
    const endDate = '2025-07-01T00:00:00.000Z';

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: startDate, end_date: endDate });

    expect(res.status).toBe(200);
    expect(survey.save).toHaveBeenCalled();
    expect(survey.start_date).toBe(startDate);
    expect(survey.end_date).toBe(endDate);
  });

  test('PUT /surveys/:id dengan end_date <= start_date → 422', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      title: 'Old Title',
      start_date: null,
      end_date: null,
    });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({
        start_date: '2025-07-01T00:00:00.000Z',
        end_date: '2025-06-01T00:00:00.000Z',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Tanggal berakhir harus lebih besar dari tanggal mulai');
    expect(survey.save).not.toHaveBeenCalled();
  });

  test('GET /surveys sebagai surveyor → hanya survei dalam periode aktif', async () => {
    const token = createSurveyorToken();
    const now = new Date();
    const pastDate = new Date(now.getTime() - 86400000).toISOString();
    const futureDate = new Date(now.getTime() + 86400000).toISOString();

    // Mock returns only surveys that pass the period filter (simulating DB filter)
    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-active-period', status: 'active', start_date: pastDate, end_date: futureDate }),
      mockSurvey({ id: 'survey-no-dates', status: 'active', start_date: null, end_date: null }),
    ]);
    Question.findAll.mockResolvedValue([
      { survey_id: 'survey-active-period', count: '1' },
      { survey_id: 'survey-no-dates', count: '1' },
    ]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Verify the findAll was called with Op.and filter for surveyor
    const findAllCall = Survey.findAll.mock.calls[0][0];
    expect(findAllCall.where).toHaveProperty('status', 'active');
    // Check that the where clause includes Op.and for date filtering
    const opAndKey = Object.getOwnPropertySymbols(findAllCall.where).find(
      (s) => s.toString() === 'Symbol(and)'
    );
    expect(opAndKey).toBeDefined();
  });

  test('GET /surveys sebagai admin → semua survei termasuk expired dan belum dimulai', async () => {
    const token = createAdminToken();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();

    Survey.findAll.mockResolvedValue([
      mockSurvey({ id: 'survey-expired', status: 'active', start_date: null, end_date: pastDate }),
      mockSurvey({ id: 'survey-future', status: 'active', start_date: futureDate, end_date: null }),
      mockSurvey({ id: 'survey-active', status: 'active', start_date: null, end_date: null }),
    ]);
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    // Admin query should NOT have Op.and date filter
    const findAllCall = Survey.findAll.mock.calls[0][0];
    expect(findAllCall.where).toBeUndefined();
    // Verify start_date and end_date are in attributes
    expect(findAllCall.attributes).toContain('start_date');
    expect(findAllCall.attributes).toContain('end_date');
  });

  test('GET /surveys/:id → response mengandung start_date, end_date, is_expired', async () => {
    const token = createAdminToken();
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: futureDate,
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('start_date');
    expect(res.body).toHaveProperty('end_date');
    expect(res.body).toHaveProperty('is_expired');
  });

  test('GET /surveys/:id dengan end_date di masa lalu → is_expired: true', async () => {
    const token = createAdminToken();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      start_date: null,
      end_date: pastDate,
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_expired).toBe(true);
  });

  test('GET /surveys/:id dengan end_date di masa depan → is_expired: false', async () => {
    const token = createAdminToken();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      start_date: null,
      end_date: futureDate,
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_expired).toBe(false);
  });

  test('GET /surveys/:id tanpa end_date → is_expired: false', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      start_date: null,
      end_date: null,
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_expired).toBe(false);
  });
});


// ─── Field Tools Settings ─────────────────────────────────────────────────────

describe('Survey Field Tools Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
    sequelize.transaction.mockImplementation(async (cb) => cb({}));
  });

  const defaultFieldToolsSettings = {
    signature_mode: 'required',
    audio_mode: 'required',
    photo_mode: 'required',
    gps_mode: 'required',
  };

  test('GET /surveys/:id → response mengandung field_tools_settings', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('field_tools_settings');
    expect(res.body.field_tools_settings).toEqual(defaultFieldToolsSettings);
  });

  test('GET /surveys/:id sebagai surveyor → response mengandung field_tools_settings', async () => {
    const token = createSurveyorToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      status: 'active',
      field_tools_settings: { signature_mode: 'optional', audio_mode: 'disabled', photo_mode: 'required', gps_mode: 'optional' },
    });
    Survey.findOne.mockResolvedValue(survey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.field_tools_settings).toEqual({
      signature_mode: 'optional',
      audio_mode: 'disabled',
      photo_mode: 'required',
      gps_mode: 'optional',
    });
  });

  test('PUT /surveys/:id dengan field_tools_settings valid → 200, settings diperbarui', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.findOne.mockResolvedValue(survey);

    const newSettings = {
      signature_mode: 'optional',
      audio_mode: 'disabled',
      photo_mode: 'required',
      gps_mode: 'optional',
    };

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ field_tools_settings: newSettings });

    expect(res.status).toBe(200);
    expect(survey.field_tools_settings).toEqual(newSettings);
    expect(survey.save).toHaveBeenCalled();
    expect(res.body.field_tools_settings).toEqual(newSettings);
  });

  test('PUT /surveys/:id dengan field_tools_settings invalid mode → 422', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({
        field_tools_settings: {
          signature_mode: 'invalid',
          audio_mode: 'required',
          photo_mode: 'required',
          gps_mode: 'required',
        },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Nilai field tool mode tidak valid');
    expect(survey.save).not.toHaveBeenCalled();
  });

  test('PUT /surveys/:id dengan field_tools_settings missing properties → 422', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({
        field_tools_settings: {
          signature_mode: 'required',
        },
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('harus memiliki properti');
    expect(survey.save).not.toHaveBeenCalled();
  });

  test('PUT /surveys/:id tanpa field_tools_settings → 200, settings tidak berubah', async () => {
    const token = createAdminToken();
    const survey = mockSurvey({
      id: 'survey-uuid-001',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.findOne.mockResolvedValue(survey);

    const res = await request(app)
      .put('/surveys/survey-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(survey.field_tools_settings).toEqual(defaultFieldToolsSettings);
    expect(survey.save).toHaveBeenCalled();
  });

  test('POST /surveys → response mengandung field_tools_settings', async () => {
    const token = createAdminToken();
    const newSurvey = mockSurvey({
      id: 'new-survey-uuid',
      title: 'New Survey',
      status: 'draft',
      field_tools_settings: defaultFieldToolsSettings,
    });
    Survey.create.mockResolvedValue(newSurvey);

    const res = await request(app)
      .post('/surveys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Survey' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('field_tools_settings');
    expect(res.body.field_tools_settings).toEqual(defaultFieldToolsSettings);
  });

  test('POST /surveys/:id/clone → survei baru menyalin field_tools_settings dari sumber', async () => {
    const token = createAdminToken();
    const customSettings = {
      signature_mode: 'optional',
      audio_mode: 'disabled',
      photo_mode: 'required',
      gps_mode: 'disabled',
    };
    const sourceSurvey = mockSurvey({
      id: 'source-uuid-001',
      title: 'Survei Sumber',
      status: 'active',
      field_tools_settings: customSettings,
    });
    const clonedSurvey = mockSurvey({
      id: 'cloned-uuid-001',
      title: 'Salinan dari Survei Sumber',
      status: 'draft',
      field_tools_settings: customSettings,
    });

    Survey.findOne.mockResolvedValue(sourceSurvey);
    Survey.create.mockResolvedValue(clonedSurvey);
    Question.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/surveys/source-uuid-001/clone')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.field_tools_settings).toEqual(customSettings);
    // Verify Survey.create was called with field_tools_settings from source
    expect(Survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        field_tools_settings: customSettings,
      }),
      expect.anything()
    );
  });
});
