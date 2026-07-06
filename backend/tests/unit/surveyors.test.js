/**
 * Unit Tests for Surveyor Management Module
 * Tests: buat surveyor, email duplikat, nonaktifkan/aktifkan,
 *        ringkasan aktivitas, simpan kuota valid, tolak kuota tidak valid
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => {
  const mockSequelize = {
    fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
    col: jest.fn((col) => col),
  };

  return {
    User: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      sequelize: mockSequelize,
    },
    AuditLog: {
      create: jest.fn(),
    },
    SurveyorQuota: {
      findAll: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Response: {
      findAll: jest.fn(),
      sequelize: mockSequelize,
    },
    Survey: {
      findAll: jest.fn(),
      findOne: jest.fn(),
    },
    Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike'), in: Symbol('in') } },
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
const { User, AuditLog, SurveyorQuota, Response, Survey } = require('../../src/models');
const redis = require('../../src/config/redis');
const { Op } = require('sequelize'); // simbol Op nyata (surveyors.js pakai sequelize langsung)

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper: create a valid admin JWT
function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: build a mock surveyor user object with a save() method
function mockSurveyorUser(overrides = {}) {
  const base = {
    id: 'surveyor-uuid-001',
    name: 'Test Surveyor',
    email: 'surveyor@example.com',
    password_hash: '$2b$12$hashedpassword',
    role: 'surveyor',
    is_active: true,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

// Helper: build a mock quota record with a save() method
function mockQuotaRecord(overrides = {}) {
  const base = {
    id: 'quota-uuid-001',
    survey_id: 'survey-uuid-001',
    surveyor_id: 'surveyor-uuid-001',
    quota: 10,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

// Helper: create a valid supervisor JWT
function createSupervisorToken(id = 'supervisor-uuid-001') {
  return jwt.sign({ id, role: 'supervisor', email: 'supervisor@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: create a valid viewer JWT
function createViewerToken(id = 'viewer-uuid-001') {
  return jwt.sign({ id, role: 'viewer', email: 'viewer@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// ─── GET /surveyors ───────────────────────────────────────────────────────────

describe('Surveyor Management Module - GET /surveyors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    // List kini juga mengambil kuota per-TPD (grouping per survei) — default []
    // agar tak "allQuotas is not iterable"; tes tertentu boleh menimpanya.
    SurveyorQuota.findAll.mockResolvedValue([]);
  });

  test('daftar surveyor berhasil dikembalikan dengan response_count', async () => {
    const token = createAdminToken();
    User.findAll.mockResolvedValue([
      { id: 'surveyor-uuid-001', name: 'Surveyor One', email: 's1@example.com', is_active: true, created_at: new Date().toISOString() },
      { id: 'surveyor-uuid-002', name: 'Surveyor Two', email: 's2@example.com', is_active: false, created_at: new Date().toISOString() },
    ]);
    Survey.findAll.mockResolvedValue([{ id: 'survey-active-001' }]);
    Response.findAll.mockResolvedValue([
      { surveyor_id: 'surveyor-uuid-001', count: '5' },
    ]);

    const res = await request(app)
      .get('/surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('response_count');
    expect(res.body[1]).toHaveProperty('response_count', 0);
  });

  test('hanya menghitung respons dari survei aktif', async () => {
    const token = createAdminToken();
    User.findAll.mockResolvedValue([
      { id: 'surveyor-uuid-001', name: 'Surveyor Active', email: 'active@example.com', is_active: true, created_at: new Date().toISOString() },
    ]);
    Survey.findAll.mockResolvedValue([{ id: 'survey-active-001' }]);
    Response.findAll.mockResolvedValue([{ surveyor_id: 'surveyor-uuid-001', count: '3' }]);

    const res = await request(app)
      .get('/surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('response_count', 3);
    // Query hitung memfilter hanya survei aktif (pakai Op nyata).
    const firstWhere = Response.findAll.mock.calls[0][0].where;
    expect(firstWhere.survey_id[Op.in]).toEqual(['survey-active-001']);
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/surveyors');
    expect(res.status).toBe(401);
  });

  test('surveyor tidak bisa mengakses endpoint ini - mengembalikan 403', async () => {
    const surveyorToken = jwt.sign(
      { id: 'surveyor-uuid', role: 'surveyor', email: 'surveyor@example.com' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    const res = await request(app)
      .get('/surveyors')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });

  test('supervisor dapat mengakses daftar surveyor - mengembalikan 200', async () => {
    const token = createSupervisorToken();
    User.findAll.mockResolvedValue([
      { id: 'surveyor-uuid-001', name: 'Surveyor One', email: 's1@example.com', is_active: true, created_at: new Date().toISOString() },
    ]);
    Survey.findAll.mockResolvedValue([{ id: 'survey-active-001' }]);
    Response.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Survey.findAll).toHaveBeenCalledWith({
      where: { status: 'active' },
      attributes: ['id'],
      raw: true,
    });
  });

  test('viewer tidak bisa mengakses daftar surveyor - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .get('/surveyors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /surveyors ──────────────────────────────────────────────────────────

describe('Surveyor Management Module - POST /surveyors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('buat surveyor baru berhasil', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(null); // no duplicate email

    const newSurveyor = {
      id: 'new-surveyor-uuid',
      name: 'New Surveyor',
      email: 'newsurveyor@example.com',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    User.create.mockResolvedValue(newSurveyor);

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Surveyor', email: 'newsurveyor@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'new-surveyor-uuid',
      name: 'New Surveyor',
      email: 'newsurveyor@example.com',
      is_active: true,
    });
    // Verify bcrypt was used (password_hash should not be plain text)
    const createCall = User.create.mock.calls[0][0];
    expect(createCall.password_hash).toBeDefined();
    expect(createCall.password_hash).not.toBe('ValidPass1');
    expect(createCall.role).toBe('surveyor');
    // Verify audit log was created
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'new-surveyor-uuid',
      })
    );
  });

  test('email duplikat - mengembalikan 409', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ email: 'duplicate@example.com' }));

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Another Surveyor', email: 'duplicate@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email sudah terdaftar' });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('password tidak valid (terlalu pendek) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Surveyor', email: 'surveyor@example.com', password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('password tidak valid (tanpa huruf besar) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Surveyor', email: 'surveyor@example.com', password: 'nouppercase1' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
  });

  test('password tidak valid (tanpa angka) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Surveyor', email: 'surveyor@example.com', password: 'NoNumbers' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
  });

  test('supervisor dapat membuat surveyor baru - mengembalikan 201', async () => {
    const token = createSupervisorToken();
    User.findOne.mockResolvedValue(null); // no duplicate email

    const newSurveyor = {
      id: 'new-surveyor-uuid',
      name: 'New Surveyor',
      email: 'newsurveyor2@example.com',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    User.create.mockResolvedValue(newSurveyor);

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Surveyor', email: 'newsurveyor2@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'new-surveyor-uuid',
      name: 'New Surveyor',
      email: 'newsurveyor2@example.com',
    });
  });

  test('viewer tidak bisa membuat surveyor - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .post('/surveyors')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Surveyor', email: 'newsurveyor@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(403);
    expect(User.create).not.toHaveBeenCalled();
  });
});

// ─── PUT /surveyors/:id ───────────────────────────────────────────────────────

describe('Surveyor Management Module - PUT /surveyors/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('update surveyor berhasil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', name: 'Old Name', email: 'old@example.com' });
    User.findOne
      .mockResolvedValueOnce(existingSurveyor) // find surveyor by id
      .mockResolvedValueOnce(null);            // no duplicate email

    const res = await request(app)
      .put('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(existingSurveyor.save).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_SURVEYOR', entity_type: 'surveyor' })
    );
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/surveyors/nonexistent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Name' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });

  test('email duplikat saat update - mengembalikan 409', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', email: 'current@example.com' });
    const anotherUser = mockSurveyorUser({ id: 'surveyor-uuid-002', email: 'taken@example.com' });

    User.findOne
      .mockResolvedValueOnce(existingSurveyor) // find surveyor by id
      .mockResolvedValueOnce(anotherUser);     // duplicate email check

    const res = await request(app)
      .put('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email sudah terdaftar' });
  });

  test('supervisor dapat mengupdate surveyor - mengembalikan 200', async () => {
    const token = createSupervisorToken('supervisor-uuid-001');
    const existingSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', name: 'Old Name', email: 'old@example.com' });
    User.findOne
      .mockResolvedValueOnce(existingSurveyor) // find surveyor by id
      .mockResolvedValueOnce(null);            // no duplicate email

    const res = await request(app)
      .put('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(existingSurveyor.save).toHaveBeenCalled();
  });

  test('viewer tidak bisa mengupdate surveyor - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .put('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
  });
});

// ─── PATCH /surveyors/:id/deactivate ─────────────────────────────────────────

describe('Surveyor Management Module - PATCH /surveyors/:id/deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('nonaktifkan surveyor berhasil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', is_active: true });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(targetSurveyor.is_active).toBe(false);
    expect(targetSurveyor.save).toHaveBeenCalled();
    expect(res.body.is_active).toBe(false);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEACTIVATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'surveyor-uuid-001',
      })
    );
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/surveyors/nonexistent-id/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });

  test('supervisor dapat menonaktifkan surveyor - mengembalikan 200', async () => {
    const token = createSupervisorToken('supervisor-uuid-001');
    const targetSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', is_active: true });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(targetSurveyor.is_active).toBe(false);
    expect(res.body.is_active).toBe(false);
  });

  test('viewer tidak bisa menonaktifkan surveyor - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── PATCH /surveyors/:id/activate ───────────────────────────────────────────

describe('Surveyor Management Module - PATCH /surveyors/:id/activate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('aktifkan surveyor berhasil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', is_active: false });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(targetSurveyor.is_active).toBe(true);
    expect(targetSurveyor.save).toHaveBeenCalled();
    expect(res.body.is_active).toBe(true);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACTIVATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'surveyor-uuid-001',
      })
    );
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/surveyors/nonexistent-id/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });

  test('supervisor dapat mengaktifkan surveyor - mengembalikan 200', async () => {
    const token = createSupervisorToken('supervisor-uuid-001');
    const targetSurveyor = mockSurveyorUser({ id: 'surveyor-uuid-001', is_active: false });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(targetSurveyor.is_active).toBe(true);
    expect(res.body.is_active).toBe(true);
  });

  test('viewer tidak bisa mengaktifkan surveyor - mengembalikan 403', async () => {
    const token = createViewerToken();

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── GET /surveyors/:id/quota ─────────────────────────────────────────────────

describe('Surveyor Management Module - GET /surveyors/:id/quota (ringkasan aktivitas)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('ringkasan kuota surveyor berhasil dikembalikan dengan filled', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));
    SurveyorQuota.findAll.mockResolvedValue([
      {
        id: 'quota-uuid-001',
        survey_id: 'survey-uuid-001',
        surveyor_id: 'surveyor-uuid-001',
        quota: 20,
        survey: { id: 'survey-uuid-001', title: 'Survey A' },
      },
    ]);
    // Handler memanggil Response.findAll dua kali: (1) hitung 'filled', lalu
    // (2) ambil nomor kuesioner terkirim. Beri return berbeda per panggilan.
    Response.findAll
      .mockResolvedValueOnce([{ survey_id: 'survey-uuid-001', count: '7' }])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      survey_id: 'survey-uuid-001',
      survey_title: 'Survey A',
      quota: 20,
      filled: 7,
    });
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/surveyors/nonexistent-id/quota')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });
});

// ─── DELETE /surveyors/:id ────────────────────────────────────────────────────

describe('Surveyor Management Module - DELETE /surveyors/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    AuditLog.create.mockResolvedValue({});
  });

  test('admin berhasil menghapus surveyor - mengembalikan 200', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockSurveyorUser({
      id: 'surveyor-uuid-001',
      name: 'Target Surveyor',
      email: 'target@example.com',
      role: 'surveyor',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .delete('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Akun Target Surveyor berhasil dihapus' });
    expect(targetSurveyor.destroy).toHaveBeenCalled();
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/surveyors/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });

  test('supervisor mencoba delete surveyor - mengembalikan 403 (override requireRole)', async () => {
    const supervisorToken = jwt.sign(
      { id: 'supervisor-uuid', role: 'supervisor', email: 'supervisor@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/surveyors/some-id')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(403);
  });

  test('viewer mencoba delete surveyor - mengembalikan 403', async () => {
    const viewerToken = jwt.sign(
      { id: 'viewer-uuid', role: 'viewer', email: 'viewer@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/surveyors/some-id')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });

  test('surveyor mencoba delete - mengembalikan 403', async () => {
    const surveyorToken = jwt.sign(
      { id: 'surveyor-uuid-other', role: 'surveyor', email: 'other@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/surveyors/some-id')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });

  test('request tanpa token - mengembalikan 401', async () => {
    const res = await request(app).delete('/surveyors/some-id');
    expect(res.status).toBe(401);
  });

  test('audit log dibuat dengan action DELETE_SURVEYOR sebelum delete', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockSurveyorUser({
      id: 'surveyor-uuid-001',
      name: 'Target Surveyor',
      email: 'target@example.com',
      role: 'surveyor',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetSurveyor);

    await request(app)
      .delete('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DELETE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'surveyor-uuid-001',
        old_value: {
          name: 'Target Surveyor',
          email: 'target@example.com',
          role: 'surveyor',
          is_active: true,
        },
        new_value: null,
      })
    );
    // Audit log must be created before destroy
    const auditCallOrder = AuditLog.create.mock.invocationCallOrder[0];
    const destroyCallOrder = targetSurveyor.destroy.mock.invocationCallOrder[0];
    expect(auditCallOrder).toBeLessThan(destroyCallOrder);
  });

  test('AuditLog.create gagal - mengembalikan 500, User.destroy tidak dipanggil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockSurveyorUser({
      id: 'surveyor-uuid-001',
      name: 'Target Surveyor',
      email: 'target@example.com',
      role: 'surveyor',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetSurveyor);
    AuditLog.create.mockRejectedValue(new Error('DB connection error'));

    const res = await request(app)
      .delete('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Terjadi kesalahan internal' });
    expect(targetSurveyor.destroy).not.toHaveBeenCalled();
  });
});

// ─── POST /surveyors/:id/quota ────────────────────────────────────────────────

describe('Surveyor Management Module - POST /surveyors/:id/quota', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  test('simpan kuota valid berhasil (create)', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));
    const newQuota = mockQuotaRecord({ quota: 15 });
    SurveyorQuota.findOrCreate.mockResolvedValue([newQuota, true]);

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 15 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      survey_id: 'survey-uuid-001',
      surveyor_id: 'surveyor-uuid-001',
      quota: 15,
    });
  });

  test('update kuota yang sudah ada berhasil (update)', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));
    const existingQuota = mockQuotaRecord({ quota: 10 });
    SurveyorQuota.findOrCreate.mockResolvedValue([existingQuota, false]);

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 25 });

    expect(res.status).toBe(200);
    expect(existingQuota.quota).toBe(25);
    expect(existingQuota.save).toHaveBeenCalled();
  });

  test('tolak kuota = 0 - mengembalikan 422', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 0 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Kuota harus berupa bilangan bulat positif lebih dari 0' });
    expect(SurveyorQuota.findOrCreate).not.toHaveBeenCalled();
  });

  test('tolak kuota negatif - mengembalikan 422', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: -5 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Kuota harus berupa bilangan bulat positif lebih dari 0' });
  });

  test('tolak kuota float - mengembalikan 422', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 3.5 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Kuota harus berupa bilangan bulat positif lebih dari 0' });
  });

  test('tolak kuota string - mengembalikan 422', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(mockSurveyorUser({ id: 'surveyor-uuid-001' }));

    const res = await request(app)
      .post('/surveyors/surveyor-uuid-001/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 'sepuluh' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Kuota harus berupa bilangan bulat positif lebih dari 0' });
  });

  test('surveyor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/surveyors/nonexistent-id/quota')
      .set('Authorization', `Bearer ${token}`)
      .send({ survey_id: 'survey-uuid-001', quota: 10 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'TPD tidak ditemukan' });
  });
});
