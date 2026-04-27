/**
 * Unit Tests for Audit Log
 * Tests: login tercatat, logout tercatat, perubahan data admin tercatat,
 *        perubahan data surveyor tercatat
 * Requirements: 12.6
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => ({
  User: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  AuditLog: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  SurveyorQuota: {
    findAll: jest.fn(),
    findOrCreate: jest.fn(),
  },
  Response: {
    findAll: jest.fn(),
    sequelize: {
      fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
      col: jest.fn((col) => col),
    },
  },
  Survey: {
    findOne: jest.fn(),
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

const app = require('../../src/app');
const { User, AuditLog } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function mockUserWithSave(overrides = {}) {
  return {
    id: 'user-uuid-001',
    name: 'Test User',
    email: 'test@example.com',
    password_hash: '$2b$10$hashedpassword',
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Login audit log ──────────────────────────────────────────────────────────

describe('Audit Log - Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);   // not rate-limited
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
    AuditLog.create.mockResolvedValue({});
  });

  test('login berhasil mencatat audit log dengan action LOGIN', async () => {
    const passwordHash = await hashPassword('AdminPass1');
    User.findOne.mockResolvedValue({
      id: 'admin-uuid-001',
      name: 'Admin User',
      email: 'admin@example.com',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass1' });

    expect(res.status).toBe(200);

    // Verify audit log was created with LOGIN action
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'LOGIN',
        entity_type: 'user',
        entity_id: 'admin-uuid-001',
      })
    );
  });

  test('login surveyor berhasil mencatat audit log dengan action LOGIN', async () => {
    const passwordHash = await hashPassword('SurveyorPass1');
    User.findOne.mockResolvedValue({
      id: 'surveyor-uuid-001',
      name: 'Surveyor User',
      email: 'surveyor@example.com',
      password_hash: passwordHash,
      role: 'surveyor',
      is_active: true,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'surveyor@example.com', password: 'SurveyorPass1' });

    expect(res.status).toBe(200);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'surveyor-uuid-001',
        action: 'LOGIN',
        entity_type: 'user',
        entity_id: 'surveyor-uuid-001',
      })
    );
  });

  test('login gagal tidak mencatat audit log', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'notfound@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});

// ─── Logout audit log ─────────────────────────────────────────────────────────

describe('Audit Log - Logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);   // token not blacklisted
    redis.setex.mockResolvedValue('OK');
    AuditLog.create.mockResolvedValue({});
  });

  test('logout berhasil mencatat audit log dengan action LOGOUT', async () => {
    const token = createAdminToken('admin-uuid-001');

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Verify audit log was created with LOGOUT action
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'LOGOUT',
        entity_type: 'user',
        entity_id: 'admin-uuid-001',
      })
    );
  });

  test('logout tanpa token tidak mencatat audit log', async () => {
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(401);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});

// ─── Admin data change audit log ──────────────────────────────────────────────

describe('Audit Log - Perubahan Data Admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('buat admin baru mencatat audit log dengan action CREATE_ADMIN', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null); // no duplicate email

    const newAdmin = {
      id: 'new-admin-uuid',
      name: 'New Admin',
      email: 'newadmin@example.com',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    User.create.mockResolvedValue(newAdmin);

    const res = await request(app)
      .post('/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Admin', email: 'newadmin@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(201);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'CREATE_ADMIN',
        entity_type: 'admin',
        entity_id: 'new-admin-uuid',
      })
    );
  });

  test('update admin mencatat audit log dengan action UPDATE_ADMIN', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingAdmin = mockUserWithSave({
      id: 'admin-uuid-002',
      role: 'admin',
      name: 'Old Name',
      email: 'old@example.com',
    });
    User.findOne
      .mockResolvedValueOnce(existingAdmin) // find admin by id
      .mockResolvedValueOnce(null);          // no duplicate email

    const res = await request(app)
      .put('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'UPDATE_ADMIN',
        entity_type: 'admin',
        entity_id: 'admin-uuid-002',
      })
    );
  });

  test('nonaktifkan admin mencatat audit log dengan action DEACTIVATE_ADMIN', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetAdmin = mockUserWithSave({
      id: 'admin-uuid-002',
      role: 'admin',
      is_active: true,
    });
    // Reset and set mock to ensure clean state
    User.findOne.mockReset();
    User.findOne.mockResolvedValue(targetAdmin);

    const res = await request(app)
      .patch('/admins/admin-uuid-002/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DEACTIVATE_ADMIN',
        entity_type: 'admin',
        entity_id: 'admin-uuid-002',
      })
    );
  });
});

// ─── Surveyor data change audit log ──────────────────────────────────────────

describe('Audit Log - Perubahan Data Surveyor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('buat surveyor baru mencatat audit log dengan action CREATE_SURVEYOR', async () => {
    const token = createAdminToken('admin-uuid-001');
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

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'CREATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'new-surveyor-uuid',
      })
    );
  });

  test('nonaktifkan surveyor mencatat audit log dengan action DEACTIVATE_SURVEYOR', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSurveyor = mockUserWithSave({
      id: 'surveyor-uuid-001',
      role: 'surveyor',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetSurveyor);

    const res = await request(app)
      .patch('/surveyors/surveyor-uuid-001/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DEACTIVATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'surveyor-uuid-001',
      })
    );
  });

  test('update surveyor mencatat audit log dengan action UPDATE_SURVEYOR', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingSurveyor = mockUserWithSave({
      id: 'surveyor-uuid-001',
      role: 'surveyor',
      name: 'Old Name',
      email: 'old@example.com',
    });
    User.findOne
      .mockResolvedValueOnce(existingSurveyor) // find surveyor by id
      .mockResolvedValueOnce(null);             // no duplicate email

    const res = await request(app)
      .put('/surveyors/surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'UPDATE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: 'surveyor-uuid-001',
      })
    );
  });
});
