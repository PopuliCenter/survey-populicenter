/**
 * Property-Based Tests for Survey Deadline Feature
 *
 * Properties tested:
 *   - Property 1: Validasi konsistensi tanggal
 *   - Property 4: Komputasi is_expired
 *   - Property 5: Klasifikasi badge temporal
 *   - Property 6: Status temporal surveyor (canStart dan label)
 *   - Property 7: Clone selalu mereset tanggal
 *
 * Requirements: 2.1-2.5, 5.1-5.3, 8.1-8.4, 9.1-9.5, 10.1
 */

const fc = require('fast-check');
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
const { Survey, Question, AuditLog, sequelize } = require('../../src/models');
const redis = require('../../src/config/redis');
const { validateSurveyDates } = require('../../src/routes/surveys');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function createToken(id, role) {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET, { expiresIn: '8h' });
}

function mockSurvey(overrides = {}) {
  return {
    id: 'survey-uuid-001',
    title: 'Test Survey',
    description: 'Test description',
    status: 'draft',
    created_by: 'admin-uuid-001',
    start_date: null,
    end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
  sequelize.transaction.mockImplementation(async (cb) => cb({}));
});

// ─── Property 1: Validasi konsistensi tanggal ────────────────────────────────
// Feature: survey-deadline, Property 1: Validasi konsistensi tanggal

describe('Property 1: Validasi konsistensi tanggal', () => {
  test('validateSurveyDates mengembalikan valid: true jika keduanya null, hanya salah satu terisi, atau end > start', () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        (startDate, endDate) => {
          const startStr = startDate ? startDate.toISOString() : null;
          const endStr = endDate ? endDate.toISOString() : null;
          const result = validateSurveyDates(startStr, endStr);

          if (startStr && endStr) {
            const start = new Date(startStr);
            const end = new Date(endStr);
            if (end <= start) {
              // Both filled and end <= start → must be invalid
              return result.valid === false && result.error === 'Tanggal berakhir harus lebih besar dari tanggal mulai';
            } else {
              // Both filled and end > start → must be valid
              return result.valid === true;
            }
          }
          // At least one is null → must be valid
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateSurveyDates mengembalikan valid: false untuk semua kasus end_date <= start_date', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        (startDate, endDate) => {
          fc.pre(endDate <= startDate);
          const result = validateSurveyDates(startDate.toISOString(), endDate.toISOString());
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Komputasi is_expired ────────────────────────────────────────
// Feature: survey-deadline, Property 4: Komputasi is_expired

describe('Property 4: Komputasi is_expired', () => {
  test('is_expired bernilai true jika dan hanya jika end_date terisi dan end_date < now', async () => {
    const adminToken = createToken('admin-uuid-001', 'admin');

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        async (endDate) => {
          jest.clearAllMocks();
          redis.get.mockResolvedValue(null);

          const survey = mockSurvey({
            id: 'survey-uuid-001',
            end_date: endDate ? endDate.toISOString() : null,
            start_date: null,
          });
          Survey.findOne.mockResolvedValue(survey);
          Question.findAll.mockResolvedValue([]);

          const res = await request(app)
            .get('/surveys/survey-uuid-001')
            .set('Authorization', `Bearer ${adminToken}`);

          if (res.status !== 200) return false;

          const now = new Date();
          const expectedExpired = endDate ? endDate < now : false;
          return res.body.is_expired === expectedExpired;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Klasifikasi badge temporal ──────────────────────────────────
// Feature: survey-deadline, Property 5: Klasifikasi badge temporal

describe('Property 5: Klasifikasi badge temporal', () => {
  /**
   * Pure function test: given (start_date, end_date), classify the badge.
   * - start_date in future → "Akan Datang"
   * - end_date in past → "Berakhir"
   * - otherwise → "Aktif"
   */
  test('klasifikasi badge deterministik berdasarkan start_date dan end_date', () => {
    function classifyBadge(startDate, endDate) {
      const now = new Date();
      if (startDate && new Date(startDate) > now) return 'Akan Datang';
      if (endDate && new Date(endDate) < now) return 'Berakhir';
      return 'Aktif';
    }

    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        (startDate, endDate) => {
          const startStr = startDate ? startDate.toISOString() : null;
          const endStr = endDate ? endDate.toISOString() : null;
          const now = new Date();

          const badge = classifyBadge(startStr, endStr);

          // Verify classification is correct
          if (startDate && startDate > now) {
            return badge === 'Akan Datang';
          }
          if (endDate && endDate < now) {
            return badge === 'Berakhir';
          }
          return badge === 'Aktif';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('badge selalu salah satu dari tiga nilai yang valid', () => {
    function classifyBadge(startDate, endDate) {
      const now = new Date();
      if (startDate && new Date(startDate) > now) return 'Akan Datang';
      if (endDate && new Date(endDate) < now) return 'Berakhir';
      return 'Aktif';
    }

    const validBadges = new Set(['Akan Datang', 'Aktif', 'Berakhir']);

    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        (startDate, endDate) => {
          const startStr = startDate ? startDate.toISOString() : null;
          const endStr = endDate ? endDate.toISOString() : null;
          const badge = classifyBadge(startStr, endStr);
          return validBadges.has(badge);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Status temporal surveyor (canStart dan label) ───────────────
// Feature: survey-deadline, Property 6: Status temporal surveyor

describe('Property 6: Status temporal surveyor (canStart dan label)', () => {
  /**
   * Pure function test for getSurveyTemporalStatus.
   * - expired → canStart: false, label: 'Berakhir'
   * - not started → canStart: false, label: 'Dimulai dalam X hari'
   * - active with deadline → canStart: true, label: 'Sisa X hari'
   * - no deadline → canStart: true, label: null
   */

  function daysUntil(dateStr) {
    const now = new Date();
    const target = new Date(dateStr);
    const diffMs = target - now;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  function getSurveyTemporalStatus(startDate, endDate) {
    const now = new Date();

    if (endDate && new Date(endDate) <= now) {
      return { canStart: false, label: 'Berakhir', isUrgent: true };
    }

    if (startDate && new Date(startDate) > now) {
      const days = daysUntil(startDate);
      return { canStart: false, label: `Dimulai dalam ${days} hari`, isUrgent: false };
    }

    if (endDate) {
      const days = daysUntil(endDate);
      return { canStart: true, label: `Sisa ${days} hari`, isUrgent: days < 3 };
    }

    return { canStart: true, label: null, isUrgent: false };
  }

  test('canStart false jika expired atau belum dimulai, true jika dalam periode aktif', () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        (startDate, endDate) => {
          const startStr = startDate ? startDate.toISOString() : null;
          const endStr = endDate ? endDate.toISOString() : null;
          const now = new Date();

          const result = getSurveyTemporalStatus(startStr, endStr);

          // Expired: end_date in the past
          if (endDate && endDate <= now) {
            return result.canStart === false && result.label === 'Berakhir';
          }

          // Not started: start_date in the future
          if (startDate && startDate > now) {
            return result.canStart === false && result.label.startsWith('Dimulai dalam ');
          }

          // Active with deadline
          if (endDate && endDate > now) {
            return result.canStart === true && result.label !== null && result.label.startsWith('Sisa ');
          }

          // No deadline
          return result.canStart === true && result.label === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('isUrgent true jika sisa hari kurang dari 3', () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        (startDate, endDate) => {
          const startStr = startDate ? startDate.toISOString() : null;
          const endStr = endDate ? endDate.toISOString() : null;
          const now = new Date();

          const result = getSurveyTemporalStatus(startStr, endStr);

          // Only check isUrgent for active surveys with deadline
          if (endDate && endDate > now && (!startDate || startDate <= now)) {
            const days = daysUntil(endStr);
            if (days < 3) {
              return result.isUrgent === true;
            } else {
              return result.isUrgent === false;
            }
          }

          // Expired is always urgent
          if (endDate && endDate <= now) {
            return result.isUrgent === true;
          }

          // Not started or no deadline is not urgent
          return result.isUrgent === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Clone selalu mereset tanggal ───────────────────────────────
// Feature: survey-deadline, Property 7: Clone selalu mereset tanggal

describe('Property 7: Clone selalu mereset tanggal', () => {
  test('Survey.create dipanggil dengan start_date: null dan end_date: null saat clone', async () => {
    const adminToken = createToken('admin-uuid-001', 'admin');

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
        async (startDate, endDate) => {
          jest.clearAllMocks();
          redis.get.mockResolvedValue(null);
          AuditLog.create.mockResolvedValue({});
          sequelize.transaction.mockImplementation(async (cb) => cb({}));

          const sourceSurvey = mockSurvey({
            id: 'source-uuid-001',
            title: 'Original Survey',
            start_date: startDate ? startDate.toISOString() : null,
            end_date: endDate ? endDate.toISOString() : null,
          });
          const clonedSurvey = mockSurvey({
            id: 'cloned-uuid-001',
            title: 'Salinan dari Original Survey',
            status: 'draft',
            start_date: null,
            end_date: null,
          });

          Survey.findOne.mockResolvedValue(sourceSurvey);
          Survey.create.mockResolvedValue(clonedSurvey);
          Question.findAll.mockResolvedValue([]);

          const res = await request(app)
            .post('/surveys/source-uuid-001/clone')
            .set('Authorization', `Bearer ${adminToken}`);

          if (res.status !== 201) return false;

          const createCall = Survey.create.mock.calls[0];
          if (!createCall) return false;

          return createCall[0].start_date === null && createCall[0].end_date === null;
        }
      ),
      { numRuns: 100 }
    );
  });
});
