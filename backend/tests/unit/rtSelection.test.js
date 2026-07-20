/**
 * Unit Tests — routes/rtSelection.js (undian RT, pengganti FORM A + FORM B)
 *
 * Yang paling penting diuji di sini adalah JAMINAN ANTI ACAK-ULANG. Kalau TPD
 * bisa mengundi berkali-kali sampai dapat RT yang mudah dijangkau, fitur ini
 * membuat metodologi LEBIH LEMAH daripada lembar kertas. Karena itu:
 *   - permintaan kedua mengembalikan hasil tersimpan, TIDAK mengundi lagi
 *   - balapan dua permintaan (indeks unik kena) tetap menghasilkan satu hasil
 *   - hasil hanya dibuat bila survei benar-benar mengaktifkan fitur ini
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'tpd-1', role: 'surveyor' }; next(); },
  requireRole: () => (req, res, next) => next(),
}));

jest.mock('../../src/models', () => ({
  Survey: { findByPk: jest.fn() },
  RtSelection: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn() },
  User: {},
}));

const { Survey, RtSelection } = require('../../src/models');
const rtRouter = require('../../src/routes/rtSelection');
const { verifyDraw } = require('../../src/utils/rtDraw');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/rt-selection', rtRouter);
  return app;
}

const LOKASI = {
  province: 'DKI JAKARTA',
  city: 'KOTA JAKARTA SELATAN',
  district: 'MAMPANG PRAPATAN',
  village: 'TEGAL PARANG',
};
const BODY = { survey_id: 'srv-1', ...LOKASI, total_rt: 25 };

function surveyWith(settings) {
  return { id: 'srv-1', field_tools_settings: settings };
}

beforeEach(() => {
  jest.clearAllMocks();
  Survey.findByPk.mockResolvedValue(surveyWith({ rt_selection: 'enabled', rt_selection_count: 2 }));
  RtSelection.findOne.mockResolvedValue(null);
  RtSelection.create.mockImplementation(async (row) => ({ ...row, id: 'sel-1' }));
});

describe('POST /rt-selection — undian pertama', () => {
  test('mengundi RT dan mengunci hasilnya', async () => {
    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.status).toBe(201);
    expect(res.body.already_locked).toBe(false);

    const sel = res.body.selection;
    expect(sel.selected).toHaveLength(2);
    expect(new Set(sel.selected).size).toBe(2);
    sel.selected.forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(25);
    });
    expect(sel.locked_at).toBeTruthy();
  });

  test('hasil tersimpan dapat diverifikasi ulang dari seed (auditable)', async () => {
    const res = await request(makeApp()).post('/rt-selection').send(BODY);
    const { seed, selected, total_rt: totalRt } = res.body.selection;

    expect(verifyDraw({ seed, totalRt, count: selected.length }, selected)).toBe(true);
  });

  test('menghormati rt_selection_count dari pengaturan survei', async () => {
    Survey.findByPk.mockResolvedValue(surveyWith({ rt_selection: 'enabled', rt_selection_count: 4 }));

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.body.selection.selected).toHaveLength(4);
  });

  test('tanpa rt_selection_count memakai standar Populi = 2 RT', async () => {
    Survey.findByPk.mockResolvedValue(surveyWith({ rt_selection: 'enabled' }));

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.body.selection.selected).toHaveLength(2);
  });
});

describe('POST /rt-selection — ANTI ACAK-ULANG', () => {
  test('permintaan kedua mengembalikan hasil tersimpan tanpa mengundi lagi', async () => {
    const tersimpan = {
      id: 'sel-1', survey_id: 'srv-1', ...LOKASI, total_rt: 25,
      selected: [1, 3], seed: 'seed-lama', algo_version: 1, locked_at: new Date(),
    };
    RtSelection.findOne.mockResolvedValue(tersimpan);

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.already_locked).toBe(true);
    expect(res.body.selection.selected).toEqual([1, 3]);
    expect(res.body.selection.seed).toBe('seed-lama');
    // Inti jaminan: tidak ada baris baru yang dibuat.
    expect(RtSelection.create).not.toHaveBeenCalled();
  });

  test('balapan dua permintaan (indeks unik kena) tetap satu hasil, bukan error', async () => {
    const err = new Error('duplicate key');
    err.name = 'SequelizeUniqueConstraintError';
    RtSelection.create.mockRejectedValue(err);
    RtSelection.findOne
      .mockResolvedValueOnce(null) // cek awal: belum ada
      .mockResolvedValueOnce({     // setelah bentrok: ambil milik pemenang
        id: 'sel-1', survey_id: 'srv-1', ...LOKASI, total_rt: 25,
        selected: [2, 7], seed: 's', algo_version: 1, locked_at: new Date(),
      });

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.already_locked).toBe(true);
    expect(res.body.selection.selected).toEqual([2, 7]);
  });
});

describe('POST /rt-selection — penolakan', () => {
  test('survei tanpa rt_selection aktif ditolak', async () => {
    Survey.findByPk.mockResolvedValue(surveyWith({ rt_selection: 'off' }));

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.status).toBe(400);
    expect(RtSelection.create).not.toHaveBeenCalled();
  });

  test('survei tidak ditemukan → 404', async () => {
    Survey.findByPk.mockResolvedValue(null);

    const res = await request(makeApp()).post('/rt-selection').send(BODY);

    expect(res.status).toBe(404);
  });

  test('lokasi tidak lengkap → 422', async () => {
    const res = await request(makeApp())
      .post('/rt-selection')
      .send({ survey_id: 'srv-1', province: 'DKI JAKARTA', total_rt: 25 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/kecamatan|kelurahan/i);
  });

  test('jumlah RT tidak valid → 422', async () => {
    const res = await request(makeApp()).post('/rt-selection').send({ ...BODY, total_rt: 0 });

    expect(res.status).toBe(422);
  });

  test('RT di kelurahan lebih sedikit dari yang harus dipilih → 422 dengan pesan jelas', async () => {
    const res = await request(makeApp()).post('/rt-selection').send({ ...BODY, total_rt: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/hanya punya 1 RT/i);
    expect(RtSelection.create).not.toHaveBeenCalled();
  });
});

describe('GET /rt-selection/survey/:id — pengawasan', () => {
  test('menandai hasil yang cocok sebagai verified', async () => {
    const { drawRt } = require('../../src/utils/rtDraw');
    const seed = 'audit-seed';
    const selected = drawRt({ seed, totalRt: 25, count: 2 });
    RtSelection.findAll.mockResolvedValue([
      { id: 'a', survey_id: 'srv-1', ...LOKASI, total_rt: 25, selected, seed, algo_version: 1,
        locked_at: new Date(), surveyor: { id: 'tpd-1', name: 'SAEFUDIN' } },
    ]);

    const res = await request(makeApp()).get('/rt-selection/survey/srv-1');

    expect(res.status).toBe(200);
    expect(res.body.selections[0].verified).toBe(true);
    expect(res.body.selections[0].surveyor_name).toBe('SAEFUDIN');
  });

  test('menandai hasil yang dimanipulasi sebagai TIDAK verified', async () => {
    RtSelection.findAll.mockResolvedValue([
      { id: 'a', survey_id: 'srv-1', ...LOKASI, total_rt: 25,
        selected: [1, 2], seed: 'seed-lain', algo_version: 1, locked_at: new Date(), surveyor: null },
    ]);

    const res = await request(makeApp()).get('/rt-selection/survey/srv-1');

    expect(res.body.selections[0].verified).toBe(false);
  });
});
