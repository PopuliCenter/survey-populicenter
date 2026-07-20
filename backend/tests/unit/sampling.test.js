/**
 * Unit Tests — routes/sampling.js (proxy ke layanan Random Sampling Python)
 *
 * Router ini tipis tapi kritis: ia satu-satunya gerbang auth ke layanan Python
 * yang TIDAK punya auth sendiri. Yang diuji:
 *   - hanya admin/supervisor yang boleh (role diteruskan ke requireRole)
 *   - /preview dan /run meneruskan MFD + config ke path upstream yang benar
 *   - MFD / config yang hilang → 422 (bukan 500 dari upstream)
 *   - error FastAPI ({detail}) dipetakan ke {error} dengan status asli
 *   - layanan mati → 503 ramah, bukan crash
 */

const express = require('express');
const request = require('supertest');

// Auth dilewati; kita hanya merekam role apa yang diminta router.
const requiredRoles = [];
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => next(),
  requireRole: (roles) => {
    requiredRoles.push(roles);
    return (req, res, next) => next();
  },
}));

const samplingRouter = require('../../src/routes/sampling');

const SERVICE = 'http://sampling:8000';
const CONFIG = JSON.stringify({ scope: 'NASIONAL', n_total: 1200 });

function makeApp() {
  const app = express();
  app.use('/sampling', samplingRouter);
  return app;
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('sampling proxy — kontrol akses', () => {
  test('semua rute dibatasi ke admin & supervisor', () => {
    expect(requiredRoles.length).toBeGreaterThan(0);
    requiredRoles.forEach((roles) => expect(roles).toEqual(['admin', 'supervisor']));
  });
});

describe('POST /sampling/preview', () => {
  test('meneruskan MFD + config ke /preview upstream dan mengembalikan hasilnya', async () => {
    const upstreamBody = { preview: [{ Provinsi: 'ACEH', Total_Titik: 3 }], total: { Total_Titik: 120 }, wilayah: 38, warnings: [] };
    global.fetch.mockResolvedValue(jsonResponse(upstreamBody));

    const res = await request(makeApp())
      .post('/sampling/preview')
      .field('config', CONFIG)
      .attach('mfd', Buffer.from('fake-xlsx'), 'mfd.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(upstreamBody);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(`${SERVICE}/preview`);
    expect(opts.method).toBe('POST');
    expect(opts.body.get('config')).toBe(CONFIG);
    expect(opts.body.get('mfd')).toBeTruthy();
  });

  test('tanpa file MFD → 422 tanpa memanggil layanan', async () => {
    const res = await request(makeApp()).post('/sampling/preview').field('config', CONFIG);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/MFD/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('tanpa config → 422 tanpa memanggil layanan', async () => {
    const res = await request(makeApp())
      .post('/sampling/preview')
      .attach('mfd', Buffer.from('fake-xlsx'), 'mfd.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/config/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('error 422 FastAPI ({detail}) dipetakan ke {error}', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ detail: 'Data kosong setelah filter wilayah.' }, false, 422));

    const res = await request(makeApp())
      .post('/sampling/preview')
      .field('config', CONFIG)
      .attach('mfd', Buffer.from('fake-xlsx'), 'mfd.xlsx');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Data kosong setelah filter wilayah.');
  });

  test('layanan sampling mati → 503 ramah', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(makeApp())
      .post('/sampling/preview')
      .field('config', CONFIG)
      .attach('mfd', Buffer.from('fake-xlsx'), 'mfd.xlsx');

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/tidak tersedia/i);
  });
});

describe('POST /sampling/run', () => {
  test('meneruskan MFD + config + referensi ke /run upstream', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ sampleTotal: 120, files: { hasil: 'AAA' } }));

    const res = await request(makeApp())
      .post('/sampling/run')
      .field('config', CONFIG)
      .attach('mfd', Buffer.from('fake-xlsx'), 'mfd.xlsx')
      .attach('reference', Buffer.from('prov,dpt'), 'ref.csv');

    expect(res.status).toBe(200);
    expect(res.body.sampleTotal).toBe(120);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(`${SERVICE}/run`);
    expect(opts.body.get('config')).toBe(CONFIG);
    expect(opts.body.get('reference')).toBeTruthy();
  });

  test('tanpa file MFD → 422', async () => {
    const res = await request(makeApp()).post('/sampling/run').field('config', CONFIG);

    expect(res.status).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /sampling/template/:kind', () => {
  test('kind tak dikenal jatuh ke template mfd (input tak diteruskan mentah ke URL upstream)', async () => {
    global.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('xlsx').buffer });

    const res = await request(makeApp()).get('/sampling/template/etc%2Fpasswd');

    expect(res.status).toBe(200);
    expect(global.fetch.mock.calls[0][0]).toBe(`${SERVICE}/template/mfd`);
  });

  test('kind "reference" diteruskan apa adanya', async () => {
    global.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('xlsx').buffer });

    const res = await request(makeApp()).get('/sampling/template/reference');

    expect(res.status).toBe(200);
    expect(global.fetch.mock.calls[0][0]).toBe(`${SERVICE}/template/reference`);
  });
});
