/**
 * Unit Tests for Map Module
 * Tests: GET /map/points - returns geolocation points with filters
 * Requirements: 16.7, 16.8, 16.9, 16.10
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('../../src/models', () => {
  return {
    Response: {
      findAll: jest.fn(),
    },
    User: {
      findOne: jest.fn(),
    },
    Survey: {
      findByPk: jest.fn(),
    },
    Answer: {},
    Question: {},
    SurveyorQuota: {},
    AuditLog: {},
    ExportJob: {},
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
const { Response, User, Survey } = require('../../src/models');
const redis = require('../../src/config/redis');
const { Op } = require('sequelize'); // simbol Op nyata (map.js pakai sequelize langsung)

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function createAdminToken(id = 'admin-uuid-001') {
  return jwt.sign({ id, role: 'admin', email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '8h' });
}

function createSurveyorToken(id = 'surveyor-uuid-001') {
  return jwt.sign({ id, role: 'surveyor', email: 'surveyor@example.com' }, JWT_SECRET, { expiresIn: '12h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  redis.get.mockResolvedValue(null); // token not blacklisted
});

// ===========================================================================
// GET /map/points
// ===========================================================================
describe('GET /map/points', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/map/points');
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessed by a surveyor', async () => {
    const token = createSurveyorToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns empty array when no responses with available geo_status exist', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns array of points with correct structure', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const point = res.body[0];
    expect(point).toHaveProperty('id');
    expect(point).toHaveProperty('latitude');
    expect(point).toHaveProperty('longitude');
    expect(point).toHaveProperty('surveyor_name');
    expect(point).toHaveProperty('questionnaire_number');
    expect(point).toHaveProperty('end_time');
  });

  it('returns points with correct data types', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const point = res.body[0];
    
    expect(typeof point.id).toBe('string');
    expect(typeof point.latitude).toBe('number');
    expect(typeof point.longitude).toBe('number');
    expect(typeof point.surveyor_name).toBe('string');
    expect(typeof point.questionnaire_number).toBe('string');
    expect(typeof point.end_time).toBe('string'); // ISO timestamp
  });

  it('TIDAK memfilter geo_status (semua titik dgn koordinat tampil)', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.findAll).toHaveBeenCalled();
    const callArgs = Response.findAll.mock.calls[0][0];
    // Perilaku terkini: map menampilkan semua titik ber-koordinat, tak lagi
    // menyaring berdasarkan geo_status.
    expect(callArgs.where.geo_status).toBeUndefined();
  });

  it('memfilter response yang punya koordinat (Op.or end/start-location)', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.findAll).toHaveBeenCalled();
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where[Op.or]).toBeDefined();
    expect(Array.isArray(callArgs.where[Op.or])).toBe(true);
  });

  it('includes surveyor association in query', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.findAll).toHaveBeenCalled();
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.include).toBeDefined();
    expect(Array.isArray(callArgs.include)).toBe(true);
    expect(callArgs.include[0].model).toBe(User);
    expect(callArgs.include[0].as).toBe('surveyor');
  });

  it('returns multiple points when multiple responses exist', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
      {
        id: 'resp-uuid-002',
        latitude: '-6.300000',
        longitude: '106.900000',
        questionnaire_number: 'SRV001-20240101-0002',
        end_time: new Date('2024-01-01T09:15:00.000Z'),
        surveyor: { name: 'Siti Aminah' },
      },
      {
        id: 'resp-uuid-003',
        latitude: '-6.400000',
        longitude: '107.000000',
        questionnaire_number: 'SRV001-20240101-0003',
        end_time: new Date('2024-01-01T10:20:00.000Z'),
        surveyor: { name: 'Ahmad Yani' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].surveyor_name).toBe('Budi Santoso');
    expect(res.body[1].surveyor_name).toBe('Siti Aminah');
    expect(res.body[2].surveyor_name).toBe('Ahmad Yani');
  });

  it('handles null surveyor gracefully', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: null,
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].surveyor_name).toBeNull();
  });

  it('handles null end_time gracefully', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: null,
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].end_time).toBeNull();
  });

  it('converts latitude and longitude to numbers', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].latitude).toBe(-6.2);
    expect(res.body[0].longitude).toBe(106.816666);
  });

  it('converts end_time to ISO string', async () => {
    const testDate = new Date('2024-01-01T08:10:00.000Z');
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: testDate,
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].end_time).toBe(testDate.toISOString());
  });
});

// ===========================================================================
// GET /map/points - Filter by survey_id
// ===========================================================================
describe('GET /map/points - Filter by survey_id', () => {
  it('returns 404 when survey does not exist', async () => {
    Survey.findByPk.mockResolvedValue(null);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?survey_id=non-existent-uuid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('filters responses by survey_id when survey exists', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001' });
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?survey_id=survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Survey.findByPk).toHaveBeenCalledWith('survey-uuid-001', { attributes: ['id'] });
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.survey_id).toBe('survey-uuid-001');
  });

  it('returns empty array when no responses match survey filter', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001' });
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?survey_id=survey-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ===========================================================================
// GET /map/points - Filter by surveyor_id
// ===========================================================================
describe('GET /map/points - Filter by surveyor_id', () => {
  it('returns 404 when surveyor does not exist', async () => {
    User.findOne.mockResolvedValue(null);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?surveyor_id=non-existent-uuid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('filters responses by surveyor_id when surveyor exists', async () => {
    User.findOne.mockResolvedValue({ id: 'surveyor-uuid-001', role: 'surveyor' });
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?surveyor_id=surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({
      where: { id: 'surveyor-uuid-001', role: 'surveyor' },
      attributes: ['id'],
    });
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.surveyor_id).toBe('surveyor-uuid-001');
  });

  it('returns empty array when no responses match surveyor filter', async () => {
    User.findOne.mockResolvedValue({ id: 'surveyor-uuid-001', role: 'surveyor' });
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?surveyor_id=surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ===========================================================================
// GET /map/points - Filter by date range
// ===========================================================================
describe('GET /map/points - Filter by date range', () => {
  it('returns 422 for invalid start_date format', async () => {
    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?start_date=not-a-date')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/start_date/);
  });

  it('returns 422 for invalid end_date format', async () => {
    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?end_date=not-a-date')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/end_date/);
  });

  it('filters responses by start_date', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?start_date=2024-01-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.end_time).toBeDefined();
  });

  it('filters responses by end_date', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?end_date=2024-12-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.end_time).toBeDefined();
  });

  it('filters responses by both start_date and end_date', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?start_date=2024-01-01&end_date=2024-12-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.end_time).toBeDefined();
  });

  it('returns empty array when no responses match date filter', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?start_date=2024-01-01&end_date=2024-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ===========================================================================
// GET /map/points - Combined filters
// ===========================================================================
describe('GET /map/points - Combined filters', () => {
  it('applies all filters when all query params are provided', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001' });
    User.findOne.mockResolvedValue({ id: 'surveyor-uuid-001', role: 'surveyor' });
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?survey_id=survey-uuid-001&surveyor_id=surveyor-uuid-001&start_date=2024-01-01&end_date=2024-12-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.where.survey_id).toBe('survey-uuid-001');
    expect(callArgs.where.surveyor_id).toBe('surveyor-uuid-001');
    expect(callArgs.where.end_time).toBeDefined();
  });

  it('returns correct data when multiple filters match', async () => {
    Survey.findByPk.mockResolvedValue({ id: 'survey-uuid-001' });
    User.findOne.mockResolvedValue({ id: 'surveyor-uuid-001', role: 'surveyor' });
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
      {
        id: 'resp-uuid-002',
        latitude: '-6.300000',
        longitude: '106.900000',
        questionnaire_number: 'SRV001-20240101-0002',
        end_time: new Date('2024-01-02T09:15:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points?survey_id=survey-uuid-001&surveyor_id=surveyor-uuid-001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ===========================================================================
// GET /map/points - Data completeness (Requirements 16.9, 16.10)
// ===========================================================================
describe('GET /map/points - Data completeness', () => {
  it('includes all required popup information (Requirement 16.9)', async () => {
    Response.findAll.mockResolvedValue([
      {
        id: 'resp-uuid-001',
        latitude: '-6.200000',
        longitude: '106.816666',
        questionnaire_number: 'SRV001-20240101-0001',
        end_time: new Date('2024-01-01T08:10:00.000Z'),
        surveyor: { name: 'Budi Santoso' },
      },
    ]);

    const token = createAdminToken();
    const res = await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const point = res.body[0];
    
    // Requirement 16.9: nama surveyor, Nomor Kuesioner, Timestamp Selesai
    expect(point.surveyor_name).toBe('Budi Santoso');
    expect(point.questionnaire_number).toBe('SRV001-20240101-0001');
    expect(point.end_time).toBe('2024-01-01T08:10:00.000Z');
  });

  it('menampilkan titik tanpa menyaring geo_status (perilaku terkini)', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.findAll).toHaveBeenCalled();
    const callArgs = Response.findAll.mock.calls[0][0];
    // Semua titik ber-koordinat tampil; tak ada filter geo_status.
    expect(callArgs.where.geo_status).toBeUndefined();
  });

  it('orders results by end_time DESC', async () => {
    Response.findAll.mockResolvedValue([]);

    const token = createAdminToken();
    await request(app)
      .get('/map/points')
      .set('Authorization', `Bearer ${token}`);

    expect(Response.findAll).toHaveBeenCalled();
    const callArgs = Response.findAll.mock.calls[0][0];
    expect(callArgs.order).toEqual([['end_time', 'DESC']]);
  });
});
