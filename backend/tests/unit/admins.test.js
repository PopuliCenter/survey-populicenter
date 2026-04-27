/**
 * Unit Tests for Admin Management Module
 * Tests: buat admin baru, email duplikat, password tidak valid,
 *        nonaktifkan admin lain, cegah nonaktifkan diri sendiri
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
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

// Helper: build a mock admin user object with a save() method
function mockAdminUser(overrides = {}) {
  const base = {
    id: 'admin-uuid-002',
    name: 'Test Admin',
    email: 'testadmin@example.com',
    password_hash: '$2b$12$hashedpassword',
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
  };
  return { ...base, ...overrides };
}

describe('Admin Management Module - GET /admins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
  });

  test('daftar admin berhasil dikembalikan', async () => {
    const token = createAdminToken();
    User.findAll.mockResolvedValue([
      { id: 'admin-uuid-001', name: 'Admin One', email: 'admin1@example.com', is_active: true, created_at: new Date().toISOString() },
      { id: 'admin-uuid-002', name: 'Admin Two', email: 'admin2@example.com', is_active: true, created_at: new Date().toISOString() },
    ]);

    const res = await request(app)
      .get('/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('tanpa token - mengembalikan 401', async () => {
    const res = await request(app).get('/admins');
    expect(res.status).toBe(401);
  });
});

describe('Admin Management Module - POST /admins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    AuditLog.create.mockResolvedValue({});
  });

  test('buat admin baru berhasil', async () => {
    const token = createAdminToken();
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
    expect(res.body).toMatchObject({
      id: 'new-admin-uuid',
      name: 'New Admin',
      email: 'newadmin@example.com',
      is_active: true,
    });
    // Verify bcrypt was used (password_hash should not be plain text)
    const createCall = User.create.mock.calls[0][0];
    expect(createCall.password_hash).toBeDefined();
    expect(createCall.password_hash).not.toBe('ValidPass1');
    expect(createCall.role).toBe('admin');
    // Verify audit log was created
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE_ADMIN',
        entity_type: 'admin',
        entity_id: 'new-admin-uuid',
      })
    );
  });

  test('email duplikat - mengembalikan 409', async () => {
    const token = createAdminToken();
    // Simulate existing user with same email
    User.findOne.mockResolvedValue(mockAdminUser({ email: 'duplicate@example.com' }));

    const res = await request(app)
      .post('/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Another Admin', email: 'duplicate@example.com', password: 'ValidPass1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email sudah terdaftar' });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('password tidak valid (terlalu pendek) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Admin', email: 'admin@example.com', password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('password tidak valid (tanpa huruf besar) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Admin', email: 'admin@example.com', password: 'nouppercase1' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
  });

  test('password tidak valid (tanpa angka) - mengembalikan 422', async () => {
    const token = createAdminToken();

    const res = await request(app)
      .post('/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Admin', email: 'admin@example.com', password: 'NoNumbers' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
  });
});

describe('Admin Management Module - PUT /admins/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('update admin berhasil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingAdmin = mockAdminUser({ id: 'admin-uuid-002', name: 'Old Name', email: 'old@example.com' });
    User.findOne.mockResolvedValueOnce(existingAdmin) // find admin by id
                .mockResolvedValueOnce(null);          // no duplicate email

    const res = await request(app)
      .put('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(existingAdmin.save).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_ADMIN', entity_type: 'admin' })
    );
  });

  test('admin tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken();
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/admins/nonexistent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Name' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Admin tidak ditemukan' });
  });

  test('email duplikat saat update - mengembalikan 409', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingAdmin = mockAdminUser({ id: 'admin-uuid-002', email: 'current@example.com' });
    const anotherAdmin = mockAdminUser({ id: 'admin-uuid-003', email: 'taken@example.com' });

    User.findOne
      .mockResolvedValueOnce(existingAdmin)  // find admin by id
      .mockResolvedValueOnce(anotherAdmin);  // duplicate email check

    const res = await request(app)
      .put('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email sudah terdaftar' });
  });

  test('update password tidak valid - mengembalikan 422', async () => {
    const token = createAdminToken('admin-uuid-001');
    const existingAdmin = mockAdminUser({ id: 'admin-uuid-002' });
    User.findOne.mockResolvedValue(existingAdmin);

    const res = await request(app)
      .put('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'weak' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
    });
  });
});

describe('Admin Management Module - PATCH /admins/:id/deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    AuditLog.create.mockResolvedValue({});
  });

  test('nonaktifkan admin lain berhasil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetAdmin = mockAdminUser({ id: 'admin-uuid-002', is_active: true });
    User.findOne.mockResolvedValue(targetAdmin);

    const res = await request(app)
      .patch('/admins/admin-uuid-002/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(targetAdmin.is_active).toBe(false);
    expect(targetAdmin.save).toHaveBeenCalled();
    expect(res.body.is_active).toBe(false);
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEACTIVATE_ADMIN',
        entity_type: 'admin',
        entity_id: 'admin-uuid-002',
      })
    );
  });

  test('cegah nonaktifkan diri sendiri - mengembalikan 403', async () => {
    const myId = 'admin-uuid-001';
    const token = createAdminToken(myId);

    const res = await request(app)
      .patch(`/admins/${myId}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Tidak dapat menonaktifkan akun sendiri' });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('admin tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/admins/nonexistent-id/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Admin tidak ditemukan' });
  });

  test('surveyor tidak bisa mengakses endpoint admin - mengembalikan 403', async () => {
    const surveyorToken = jwt.sign(
      { id: 'surveyor-uuid', role: 'surveyor', email: 'surveyor@example.com' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    const res = await request(app)
      .patch('/admins/some-id/deactivate')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Admin Management Module - DELETE /admins/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null); // token not blacklisted
    AuditLog.create.mockResolvedValue({});
  });

  test('admin berhasil menghapus admin lain - mengembalikan 200, User.destroy dipanggil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetAdmin = mockAdminUser({
      id: 'admin-uuid-002',
      name: 'Target Admin',
      email: 'target@example.com',
      role: 'admin',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetAdmin);

    const res = await request(app)
      .delete('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Akun Target Admin berhasil dihapus' });
    expect(targetAdmin.destroy).toHaveBeenCalled();
  });

  test('self-delete - mengembalikan 403, User.destroy tidak dipanggil', async () => {
    const myId = 'admin-uuid-001';
    const token = createAdminToken(myId);

    const res = await request(app)
      .delete(`/admins/${myId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Tidak dapat menghapus akun sendiri' });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('admin tidak ditemukan - mengembalikan 404', async () => {
    const token = createAdminToken('admin-uuid-001');
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/admins/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Admin tidak ditemukan' });
  });

  test('supervisor mencoba delete - mengembalikan 403', async () => {
    const supervisorToken = jwt.sign(
      { id: 'supervisor-uuid', role: 'supervisor', email: 'supervisor@example.com' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .delete('/admins/some-id')
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
      .delete('/admins/some-id')
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
      .delete('/admins/some-id')
      .set('Authorization', `Bearer ${surveyorToken}`);

    expect(res.status).toBe(403);
  });

  test('request tanpa token - mengembalikan 401', async () => {
    const res = await request(app).delete('/admins/some-id');
    expect(res.status).toBe(401);
  });

  test('audit log dibuat dengan field yang benar sebelum delete', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetAdmin = mockAdminUser({
      id: 'admin-uuid-002',
      name: 'Target Admin',
      email: 'target@example.com',
      role: 'admin',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetAdmin);

    await request(app)
      .delete('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'admin-uuid-001',
        action: 'DELETE_ADMIN',
        entity_type: 'admin',
        entity_id: 'admin-uuid-002',
        old_value: {
          name: 'Target Admin',
          email: 'target@example.com',
          role: 'admin',
          is_active: true,
        },
        new_value: null,
      })
    );
    // Audit log must be created before destroy
    const auditCallOrder = AuditLog.create.mock.invocationCallOrder[0];
    const destroyCallOrder = targetAdmin.destroy.mock.invocationCallOrder[0];
    expect(auditCallOrder).toBeLessThan(destroyCallOrder);
  });

  test('AuditLog.create gagal - mengembalikan 500, User.destroy tidak dipanggil', async () => {
    const token = createAdminToken('admin-uuid-001');
    const targetAdmin = mockAdminUser({
      id: 'admin-uuid-002',
      name: 'Target Admin',
      email: 'target@example.com',
      role: 'admin',
      is_active: true,
      destroy: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockResolvedValue(targetAdmin);
    AuditLog.create.mockRejectedValue(new Error('DB connection error'));

    const res = await request(app)
      .delete('/admins/admin-uuid-002')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Terjadi kesalahan internal' });
    expect(targetAdmin.destroy).not.toHaveBeenCalled();
  });
});
