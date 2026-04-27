/**
 * Unit Tests for Supervisor Management Module - DELETE /supervisors/:id
 * Tests: admin berhasil menghapus supervisor, supervisor tidak ditemukan,
 *        non-admin ditolak, request tanpa token, audit log, AuditLog.create gagal
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => ({
  User: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  AuditLog: {
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

const app = require('../../src/app');
const { User, AuditLog } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper: create a valid admin JWT
function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

// Helper: build a mock supervisor user object
function mockSupervisorUser(overrides = {}) {
  const base = {
    id: 'supervisor-uuid-001',
    name: 'Test Supervisor',
    email: 'supervisor@example.com',
    password_hash: '$2b$12$hashedpassword',
    role: 'supervisor',
    is_active: true,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

describe('Supervisor Management Module - DELETE /supervisors/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    AuditLog.create.mockResolvedValue({});
  });

  test('admin berhasil menghapus supervisor - mengembalikan 200', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSupervisor = mockSupervisorUser({
      id: 'supervisor-uuid-001',
      name: 'Target Supervisor',
      email: 'target@example.com',
      role: 'supervisor',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetSupervisor);

    const res = await request(app)
      .delete('/supervisors/supervisor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Akun Target Supervisor berhasil dihapus' });
    expect(targetSupervisor.destroy).toHaveBeenCalled();
  });

  test('supervisor tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/supervisors/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Supervisor tidak ditemukan' });
  });

  test('supervisor mencoba delete - mengembalikan 403', async () => {
    const supervisorToken = jwt.sign(
      { id: 'supervisor-uuid', role: 'supervisor', email: 'supervisor@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/supervisors/some-id')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(403);
  });

  test('viewer mencoba delete - mengembalikan 403', async () => {
    const viewerToken = jwt.sign(
      { id: 'viewer-uuid', role: 'viewer', email: 'viewer@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/supervisors/some-id')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });

  test('surveyor mencoba delete - mengembalikan 403', async () => {
    const surveyorToken = jwt.sign(
      { id: 'surveyor-uuid', role: 'surveyor', email: 'surveyor@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/supervisors/some-id')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });

  test('request tanpa token - mengembalikan 401', async () => {
    const res = await request(app).delete('/supervisors/some-id');
    expect(res.status).toBe(401);
  });

  test('audit log dibuat dengan action DELETE_SUPERVISOR sebelum delete', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSupervisor = mockSupervisorUser({
      id: 'supervisor-uuid-001',
      name: 'Target Supervisor',
      email: 'target@example.com',
      role: 'supervisor',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetSupervisor);

    await request(app)
      .delete('/supervisors/supervisor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DELETE_SUPERVISOR',
        entity_type: 'supervisor',
        entity_id: 'supervisor-uuid-001',
        old_value: {
          name: 'Target Supervisor',
          email: 'target@example.com',
          role: 'supervisor',
          is_active: true,
        },
        new_value: null,
      })
    );
    // Audit log must be created before destroy
    const auditCallOrder = AuditLog.create.mock.invocationCallOrder[0];
    const destroyCallOrder = targetSupervisor.destroy.mock.invocationCallOrder[0];
    expect(auditCallOrder).toBeLessThan(destroyCallOrder);
  });

  test('AuditLog.create gagal - mengembalikan 500, User.destroy tidak dipanggil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetSupervisor = mockSupervisorUser({
      id: 'supervisor-uuid-001',
      name: 'Target Supervisor',
      email: 'target@example.com',
      role: 'supervisor',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetSupervisor);
    AuditLog.create.mockRejectedValue(new Error('DB connection error'));

    const res = await request(app)
      .delete('/supervisors/supervisor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Terjadi kesalahan internal' });
    expect(targetSupervisor.destroy).not.toHaveBeenCalled();
  });
});
