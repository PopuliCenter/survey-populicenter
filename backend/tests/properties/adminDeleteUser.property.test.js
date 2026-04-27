/**
 * Property-Based Tests for Admin Delete User Feature
 *
 * Property 2: Self-delete selalu ditolak
 * Validates: Requirements 2.1, 2.2
 *
 * Property 5: Non-admin selalu ditolak di semua endpoint delete
 * Validates: Requirements 5.1, 5.2, 5.3, 8.1, 8.2
 */

const fc = require('fast-check');
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

// Helper: create a JWT token for a given id and role
function createToken(id, role) {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET, { expiresIn: '8h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null); // token not blacklisted
  AuditLog.create.mockResolvedValue({});
});

// ─── Property 2: Self-delete selalu ditolak ──────────────────────────────────

describe('Property 2: Self-delete selalu ditolak', () => {
  /**
   * Feature: admin-delete-user, Property 2: Self-delete selalu ditolak
   * Validates: Requirements 2.1, 2.2
   *
   * For any admin data, attempting to delete one's own account via
   * DELETE /admins/:id must always return HTTP 403, regardless of the
   * admin's name or email.
   */
  test('DELETE /admins/:id dengan token admin yang sama selalu mengembalikan 403', async () => {
    // Use a fixed admin ID so the JWT subject matches the path parameter.
    // We vary only the name/email data via fast-check.
    const FIXED_ADMIN_ID = 'admin-self-delete-test';

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          email: fc.emailAddress(),
        }),
        async (adminData) => {
          jest.clearAllMocks();
          redis.get.mockResolvedValue(null);
          AuditLog.create.mockResolvedValue({});

          // Mock User.findOne to return a mock admin with the fixed ID
          User.findOne.mockResolvedValue({
            id: FIXED_ADMIN_ID,
            name: adminData.name,
            email: adminData.email,
            role: 'admin',
            is_active: true,
            destroy: jest.fn().mockResolvedValue(true),
          });

          // Create a JWT token for the same admin ID (self-delete attempt)
          const token = createToken(FIXED_ADMIN_ID, 'admin');

          const res = await request(app)
            .delete(`/admins/${FIXED_ADMIN_ID}`)
            .set('Authorization', `Bearer ${token}`);

          return res.status === 403;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Non-admin selalu ditolak di semua endpoint delete ────────────

describe('Property 5: Non-admin selalu ditolak di semua endpoint delete', () => {
  /**
   * Feature: admin-delete-user, Property 5: Non-admin selalu ditolak
   * Validates: Requirements 5.1, 5.2, 5.3, 8.1, 8.2
   *
   * For any combination of non-admin role (supervisor, viewer, surveyor),
   * delete endpoint (/admins, /supervisors, /viewers, /surveyors), and
   * target ID, the response must always be HTTP 403.
   */
  test('DELETE {endpoint}/{targetId} dengan token non-admin selalu mengembalikan 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          role: fc.constantFrom('supervisor', 'viewer', 'surveyor'),
          endpoint: fc.constantFrom('/admins', '/supervisors', '/viewers', '/surveyors'),
          targetId: fc.uuid(),
        }),
        async ({ role, endpoint, targetId }) => {
          jest.clearAllMocks();
          redis.get.mockResolvedValue(null);
          AuditLog.create.mockResolvedValue({});

          // Create a JWT token for the non-admin role
          const nonAdminId = `${role}-test-id`;
          const token = createToken(nonAdminId, role);

          const res = await request(app)
            .delete(`${endpoint}/${targetId}`)
            .set('Authorization', `Bearer ${token}`);

          return res.status === 403;
        }
      ),
      { numRuns: 100 }
    );
  });
});
