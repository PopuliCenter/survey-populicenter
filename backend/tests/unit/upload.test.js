/**
 * Unit Tests for Upload Module
 * Tests: upload JPEG valid, upload PNG valid, upload WEBP valid,
 *        tolak format tidak didukung, tolak file > 5 MB
 * Requirements: 6.2, 6.3
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock Redis before requiring app
jest.mock('../../src/config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
}));

// Mock fs.existsSync and fs.mkdirSync to avoid creating directories during tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
  };
});

// Mock multer to control behavior per test
// Variables must be prefixed with 'mock' to be accessible inside jest.mock() factory
let mockMulterBehavior = 'success';
let mockMulterMimeType = 'image/jpeg';

jest.mock('multer', () => {
  const multerMock = jest.fn().mockImplementation(() => ({
    single: jest.fn().mockReturnValue((req, res, next) => {
      if (mockMulterBehavior === 'success') {
        req.file = {
          filename: `photo-123456789.${mockMulterMimeType === 'image/jpeg' ? 'jpg' : mockMulterMimeType === 'image/png' ? 'png' : 'webp'}`,
          mimetype: mockMulterMimeType,
          size: 1024,
        };
        next();
      } else if (mockMulterBehavior === 'size_error') {
        const err = new Error('File too large');
        err.code = 'LIMIT_FILE_SIZE';
        next(err);
      } else if (mockMulterBehavior === 'format_error') {
        const err = new Error('FORMAT_NOT_SUPPORTED');
        next(err);
      } else if (mockMulterBehavior === 'no_file') {
        // No file attached
        next();
      }
    }),
  }));
  multerMock.diskStorage = jest.fn().mockReturnValue({});
  multerMock.memoryStorage = jest.fn().mockReturnValue({});
  return multerMock;
});

// Require app after mocks are set up
const app = require('../../src/app');

// JWT_SECRET must be read AFTER app is required so dotenv has loaded the .env file
function createToken(role = 'surveyor') {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign(
    { id: 'user-uuid-123', role, email: 'user@example.com' },
    secret,
    { expiresIn: '8h' }
  );
}

describe('Upload Module - POST /upload/photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset redis mock to not blacklist tokens
    const redis = require('../../src/config/redis');
    redis.get.mockResolvedValue(null);
    // Reset multer behavior
    mockMulterBehavior = 'success';
    mockMulterMimeType = 'image/jpeg';
  });

  test('upload JPEG valid - mengembalikan 201 dengan path file', async () => {
    mockMulterBehavior = 'success';
    mockMulterMimeType = 'image/jpeg';
    const token = createToken('surveyor');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-jpeg-content'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('path');
    expect(res.body.path).toMatch(/^uploads\/photos\//);
    expect(res.body.path).toMatch(/\.jpg$/);
  });

  test('upload PNG valid - mengembalikan 201 dengan path file', async () => {
    mockMulterBehavior = 'success';
    mockMulterMimeType = 'image/png';
    const token = createToken('surveyor');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-png-content'), {
        filename: 'test.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('path');
    expect(res.body.path).toMatch(/^uploads\/photos\//);
    expect(res.body.path).toMatch(/\.png$/);
  });

  test('upload WEBP valid - mengembalikan 201 dengan path file', async () => {
    mockMulterBehavior = 'success';
    mockMulterMimeType = 'image/webp';
    const token = createToken('admin');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-webp-content'), {
        filename: 'test.webp',
        contentType: 'image/webp',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('path');
    expect(res.body.path).toMatch(/^uploads\/photos\//);
    expect(res.body.path).toMatch(/\.webp$/);
  });

  test('tolak format tidak didukung - mengembalikan 422', async () => {
    mockMulterBehavior = 'format_error';
    const token = createToken('surveyor');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-gif-content'), {
        filename: 'test.gif',
        contentType: 'image/gif',
      });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Format file tidak didukung. Gunakan JPEG, PNG, atau WEBP',
    });
  });

  test('tolak file > 5 MB - mengembalikan 413', async () => {
    mockMulterBehavior = 'size_error';
    const token = createToken('surveyor');

    // Use a small buffer - the mock simulates the size error regardless of actual size
    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-large-file'), {
        filename: 'large.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: 'Ukuran file melebihi batas maksimal 5 MB',
    });
  });

  test('tanpa autentikasi - mengembalikan 401', async () => {
    mockMulterBehavior = 'success';

    const res = await request(app)
      .post('/upload/photo')
      .attach('photo', Buffer.from('fake-jpeg-content'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(401);
  });

  test('tanpa file - mengembalikan 422', async () => {
    mockMulterBehavior = 'no_file';
    const token = createToken('surveyor');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'File tidak ditemukan dalam request' });
  });

  test('admin juga dapat upload foto - mengembalikan 201', async () => {
    mockMulterBehavior = 'success';
    mockMulterMimeType = 'image/jpeg';
    const token = createToken('admin');

    const res = await request(app)
      .post('/upload/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('fake-jpeg-content'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('path');
  });
});
