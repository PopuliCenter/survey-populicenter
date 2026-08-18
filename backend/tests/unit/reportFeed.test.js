/**
 * Unit Tests — Tarik ke Spreadsheet (feed CSV bertoken)
 *
 * Cakupan:
 *   utils/reportFeedCsv  — serialisasi agregat & monitoring ke tabel CSV
 *   PUT  /reports/surveys/:id/feed        — aktif/nonaktif + buat token
 *   POST /reports/surveys/:id/feed/rotate — putar token
 *   GET  /public/feed/:token/rekap.csv        — agregat (publik)
 *   GET  /public/feed/:token/monitoring.csv   — monitoring (publik)
 *   GET  /public/feed/:token/mentah.csv       — gating data mentah (404 bila mati)
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  Survey: { findByPk: jest.fn(), findOne: jest.fn() },
  Response: { findAll: jest.fn(), count: jest.fn() },
  Answer: {},
  Question: { findAll: jest.fn() },
  User: {},
  ExportJob: { create: jest.fn() },
  PublishedResult: { findAll: jest.fn(), findOne: jest.fn() },
  MonitoringReport: { findOne: jest.fn() },
  Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike'), and: Symbol('and'), or: Symbol('or'), eq: Symbol('eq'), gte: Symbol('gte'), lte: Symbol('lte'), in: Symbol('in') } },
}));

// Agregat/monitoring engine di-mock → snapshot kalengan (uji serialisasi, bukan query).
jest.mock('../../src/utils/aggregateResults', () => ({
  buildSnapshot: jest.fn(),
  buildMonitoringSnapshot: jest.fn(),
  aggregateQuestion: jest.fn(),
  AGGREGATABLE_TYPES: new Set(),
}));

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(), set: jest.fn(), setex: jest.fn(), incr: jest.fn(), expire: jest.fn(), del: jest.fn(),
  call: jest.fn(),
}));
jest.mock('../../src/config/queue', () => ({ queue: { add: jest.fn() } }));

const app = require('../../src/app');
const { Survey, Question, Response } = require('../../src/models');
const { buildSnapshot, buildMonitoringSnapshot } = require('../../src/utils/aggregateResults');
const { aggregateToCsv, monitoringToCsv } = require('../../src/utils/reportFeedCsv');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const adminToken = jwt.sign({ id: 'a1', role: 'admin', email: 'a@b.c' }, JWT_SECRET, { expiresIn: '8h' });
const viewerToken = jwt.sign({ id: 'v1', role: 'viewer', email: 'v@b.c' }, JWT_SECRET, { expiresIn: '8h' });

function makeSurvey(init) {
  const s = { ...init };
  s.update = jest.fn(async (patch) => { Object.assign(s, patch); return s; });
  return s;
}

beforeEach(() => jest.clearAllMocks());

// ── util: reportFeedCsv ──────────────────────────────────────────────────────
describe('reportFeedCsv', () => {
  test('aggregateToCsv: single_choice + matrix + distribusi kosong', () => {
    const snap = {
      questions: [
        { id: 'q1', text: 'Puas?', type: 'single_choice', distribution: [
          { value: 'ya', label: 'Ya', count: 3, pct: 75 },
          { value: 'no', label: 'Tidak', count: 1, pct: 25 },
        ] },
        { id: 'q2', text: 'Seberapa sering', type: 'matrix', rows: [
          { row: 'Baris A', distribution: [{ value: '1', label: 'Tidak pernah', count: 2, pct: 100 }] },
          { row: 'Baris B', distribution: [] },
        ] },
        { id: 'q3', text: 'Kosong', type: 'single_choice', distribution: [] },
      ],
    };
    const { headers, rows } = aggregateToCsv(snap);
    expect(headers).toEqual(['NO', 'PERTANYAAN', 'TIPE', 'BARIS', 'OPSI', 'JUMLAH', 'PERSEN']);
    expect(rows).toEqual([
      [1, 'Puas?', 'single_choice', '', 'Ya', 3, 75],
      [1, 'Puas?', 'single_choice', '', 'Tidak', 1, 25],
      [2, 'Seberapa sering', 'matrix', 'Baris A', 'Tidak pernah', 2, 100],
      [2, 'Seberapa sering', 'matrix', 'Baris B', '', 0, 0],
      [3, 'Kosong', 'single_choice', '', '', 0, 0],
    ]);
  });

  test('monitoringToCsv: baris TOTAL lalu provinsi', () => {
    const { headers, rows } = monitoringToCsv({
      total: { target: 100, achieved: 40, pct: 40 },
      regions: [{ province: 'JAWA BARAT', target: 60, actual: 30, pct: 50 }],
    });
    expect(headers).toEqual(['PROVINSI', 'TARGET', 'CAPAIAN', 'PERSEN']);
    expect(rows[0]).toEqual(['TOTAL', 100, 40, 40]);
    expect(rows[1]).toEqual(['JAWA BARAT', 60, 30, 50]);
  });
});

// ── kelola feed (admin/supervisor) ───────────────────────────────────────────
describe('PUT /reports/surveys/:id/feed', () => {
  test('mengaktifkan feed membuat token & mengembalikan paths', async () => {
    const survey = makeSurvey({ id: 's1', report_feed_token: null, report_feed_enabled: false, report_feed_include_raw: false });
    Survey.findByPk.mockResolvedValue(survey);

    const res = await request(app)
      .put('/reports/surveys/s1/feed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.paths.rekap).toBe(`/public/feed/${res.body.token}/rekap.csv`);
    expect(res.body.paths.mentah).toContain('/mentah.csv');
  });

  test('viewer ditolak (403)', async () => {
    const res = await request(app)
      .put('/reports/surveys/s1/feed')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ enabled: true });
    expect(res.status).toBe(403);
  });

  test('rotate mengganti token', async () => {
    const survey = makeSurvey({ id: 's1', report_feed_token: 'lama', report_feed_enabled: true, report_feed_include_raw: false });
    Survey.findByPk.mockResolvedValue(survey);
    const res = await request(app)
      .post('/reports/surveys/s1/feed/rotate')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.token).not.toBe('lama');
  });
});

// ── feed publik (tanpa login) ────────────────────────────────────────────────
describe('GET /public/feed/:token/*.csv', () => {
  test('rekap.csv mengembalikan CSV agregat', async () => {
    Survey.findOne.mockResolvedValue({ id: 's1', report_feed_include_raw: false });
    buildSnapshot.mockResolvedValue({
      questions: [{ id: 'q1', text: 'Puas?', type: 'single_choice', distribution: [
        { value: 'ya', label: 'Ya', count: 3, pct: 75 },
      ] }],
    });
    const res = await request(app).get('/public/feed/tok123/rekap.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('NO,PERTANYAAN,TIPE,BARIS,OPSI,JUMLAH,PERSEN');
    expect(res.text).toContain('Ya');
  });

  test('monitoring.csv mengembalikan CSV capaian', async () => {
    Survey.findOne.mockResolvedValue({ id: 's1', report_feed_include_raw: false });
    buildMonitoringSnapshot.mockResolvedValue({
      total: { target: 100, achieved: 40, pct: 40 },
      regions: [{ province: 'JAWA BARAT', target: 60, actual: 30, pct: 50 }],
    });
    const res = await request(app).get('/public/feed/tok123/monitoring.csv');
    expect(res.status).toBe(200);
    expect(res.text).toContain('PROVINSI,TARGET,CAPAIAN,PERSEN');
    expect(res.text).toContain('JAWA BARAT');
  });

  test('feed nonaktif / token salah → 404', async () => {
    Survey.findOne.mockResolvedValue(null);
    const res = await request(app).get('/public/feed/salah/rekap.csv');
    expect(res.status).toBe(404);
  });

  test('mentah.csv ditolak (404) bila include_raw mati', async () => {
    Survey.findOne.mockResolvedValue({ id: 's1', report_feed_include_raw: false });
    const res = await request(app).get('/public/feed/tok123/mentah.csv');
    expect(res.status).toBe(404);
  });

  test('mentah.csv jalan bila include_raw aktif', async () => {
    Survey.findOne.mockResolvedValue({ id: 's1', report_feed_include_raw: true });
    Question.findAll.mockResolvedValue([]);
    Response.findAll.mockResolvedValue([]);
    const res = await request(app).get('/public/feed/tok123/mentah.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    // Header metadata ekspor mentah selalu ada walau nol responden.
    expect(res.text).toContain('ID Responden');
  });
});
