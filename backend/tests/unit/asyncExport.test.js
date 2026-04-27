'use strict';

/**
 * Unit Tests for Async Export Endpoints
 *
 * Tests:
 *   GET  /reports/exports/:jobId          - check export job status
 *   GET  /reports/exports/:jobId/download - download completed export file
 *
 * Requirements: 11.5
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock models
jest.mock('../../src/models', () => ({
  ExportJob: {
    findByPk: jest.fn(),
  },
  Survey: {},
  Response: {},
  Answer: {},
  Question: {},
  User: {},
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
  add: jest.fn(),
  process: jest.fn(),
  empty: jest.fn(),
  close: jest.fn(),
}));

const app = require('../../src/app');
const { ExportJob } = require('../../src/models');
const redis = require('../../src/config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null);
});

// ===========================================================================
// GET /reports/exports/:jobId
// ===========================================================================
describe('GET /reports/exports/:jobId', () => {
  const JOB_ID = 'job-uuid-001';

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`/reports/exports/${JOB_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when job does not exist', async () => {
    ExportJob.findByPk.mockResolvedValue(null);
    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Job ekspor tidak ditemukan');
  });

  it('returns job status for pending job', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'pending',
      format: 'xlsx',
      created_at: new Date('2024-01-01T10:00:00.000Z'),
      completed_at: null,
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(JOB_ID);
    expect(res.body.status).toBe('pending');
    expect(res.body.format).toBe('xlsx');
    expect(res.body.created_at).toBeDefined();
    expect(res.body.completed_at).toBeNull();
  });

  it('returns job status for processing job', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'processing',
      format: 'csv',
      created_at: new Date('2024-01-01T10:00:00.000Z'),
      completed_at: null,
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
  });

  it('returns job status for completed job', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'completed',
      format: 'xlsx',
      created_at: new Date('2024-01-01T10:00:00.000Z'),
      completed_at: new Date('2024-01-01T10:05:00.000Z'),
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completed_at).toBeDefined();
  });

  it('returns job status for failed job', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'failed',
      format: 'xlsx',
      created_at: new Date('2024-01-01T10:00:00.000Z'),
      completed_at: new Date('2024-01-01T10:05:00.000Z'),
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
  });
});

// ===========================================================================
// GET /reports/exports/:jobId/download
// ===========================================================================
describe('GET /reports/exports/:jobId/download', () => {
  const JOB_ID = 'job-uuid-002';

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`/reports/exports/${JOB_ID}/download`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when job does not exist', async () => {
    ExportJob.findByPk.mockResolvedValue(null);
    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Job ekspor tidak ditemukan');
  });

  it('returns 409 when job is pending', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'pending',
      format: 'xlsx',
      file_path: null,
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ekspor belum selesai');
    expect(res.body.status).toBe('pending');
  });

  it('returns 409 when job is processing', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'processing',
      format: 'xlsx',
      file_path: null,
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ekspor belum selesai');
    expect(res.body.status).toBe('processing');
  });

  it('returns 404 when job is completed but file_path is null', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'completed',
      format: 'xlsx',
      file_path: null,
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File ekspor tidak ditemukan');
  });

  it('returns 404 when job is completed but file does not exist', async () => {
    const mockJob = {
      id: JOB_ID,
      status: 'completed',
      format: 'xlsx',
      file_path: 'uploads/exports/nonexistent-file.xlsx',
    };
    ExportJob.findByPk.mockResolvedValue(mockJob);

    const token = createAdminToken();
    const res = await request(app)
      .get(`/reports/exports/${JOB_ID}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File ekspor tidak ditemukan atau sudah kedaluwarsa');
  });
});
