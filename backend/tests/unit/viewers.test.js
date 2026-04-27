/**
 * Unit Tests for Viewer Management Module - DELETE /viewers/:id
 * Tests: hapus viewer, viewer tidak ditemukan, non-admin ditolak,
 *        tanpa token, audit log, AuditLog.create gagal
 *
 * Requirements: 1.3, 1.5, 1.6, 1.7, 3.1, 3.4, 3.6, 3.7, 5.1, 6.3
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

// Helper: build a mock viewer user object with a destroy() method
function mockViewerUser(overrides = {}) {
  const base = {
    id: 'viewer-uuid-001',
    name: 'Test Viewer',
    email: 'testviewer@example.com',
    role: 'viewer',
    is_active: true,
    created_at: new Date().toISOString(),
    destroy: jest.fn().mockResolvedValue(true),
    save: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

describe('Viewer Management Module - DELETE /viewers/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    AuditLog.create.mockResolvedValue({});
  });

  test('admin berhasil menghapus viewer - mengembalikan 200', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetViewer = mockViewerUser({
      id: 'viewer-uuid-002',
      name: 'Target Viewer',
      email: 'target@example.com',
      role: 'viewer',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetViewer);

    const res = await request(app)
      .delete('/viewers/viewer-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Akun Target Viewer berhasil dihapus' });
    expect(targetViewer.destroy).toHaveBeenCalled();
  });

  test('viewer tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/viewers/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Viewer tidak ditemukan' });
  });

  test('supervisor mencoba delete viewer - mengembalikan 403', async () => {
    const supervisorToken = jwt.sign(
      { id: 'supervisor-uuid', role: 'supervisor', email: 'supervisor@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/viewers/some-id')
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
      .delete('/viewers/some-id')
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
      .delete('/viewers/some-id')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });

  test('request tanpa token - mengembalikan 401', async () => {
    const res = await request(app).delete('/viewers/some-id');
    expect(res.status).toBe(401);
  });

  test('audit log dibuat dengan action DELETE_VIEWER sebelum delete', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetViewer = mockViewerUser({
      id: 'viewer-uuid-002',
      name: 'Target Viewer',
      email: 'target@example.com',
      role: 'viewer',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetViewer);

    await request(app)
      .delete('/viewers/viewer-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DELETE_VIEWER',
        entity_type: 'viewer',
        entity_id: 'viewer-uuid-002',
        old_value: {
          name: 'Target Viewer',
          email: 'target@example.com',
          role: 'viewer',
          is_active: true,
        },
        new_value: null,
      })
    );
    // Audit log must be created before destroy
    const auditCallOrder = AuditLog.create.mock.invocationCallOrder[0];
    const destroyCallOrder = targetViewer.destroy.mock.invocationCallOrder[0];
    expect(auditCallOrder).toBeLessThan(destroyCallOrder);
  });

  test('AuditLog.create gagal - mengembalikan 500, User.destroy tidak dipanggil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetViewer = mockViewerUser({
      id: 'viewer-uuid-002',
      name: 'Target Viewer',
      email: 'target@example.com',
      role: 'viewer',
      is_active: true,
    });
    User.findOne.mockResolvedValue(targetViewer);
    AuditLog.create.mockRejectedValue(new Error('DB connection error'));

    const res = await request(app)
      .delete('/viewers/viewer-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Terjadi kesalahan internal' });
    expect(targetViewer.destroy).not.toHaveBeenCalled();
  });
});
