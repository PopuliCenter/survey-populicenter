'use strict';

/**
 * routes/rtSelection.js — Undian RT acak (pengganti FORM A + FORM B kertas).
 *
 * PRINSIP YANG MENENTUKAN SAH/TIDAKNYA FITUR INI:
 *
 * 1. SERVER yang mengundi, bukan perangkat TPD. TPD sama sekali tidak bisa
 *    memengaruhi hasil — hanya menyediakan jumlah RT (yang dibuktikan foto
 *    Form B ber-stempel).
 * 2. IDEMPOTEN / TIDAK BISA DIACAK ULANG. Permintaan kedua untuk kombinasi
 *    (survei, TPD, kelurahan) yang sama mengembalikan hasil yang SUDAH ADA.
 *    Tanpa aturan ini, TPD bisa mengundi berkali-kali sampai dapat RT yang
 *    mudah dijangkau — aplikasi justru jadi lebih lemah daripada kertas.
 * 3. DAPAT DIAUDIT. seed + algo_version disimpan, sehingga supervisor bisa
 *    menghitung ulang dan membuktikan hasil bukan angka karangan.
 *
 * Keterbatasan v1 (disengaja): langkah ini BUTUH koneksi. Undian dilakukan
 * sekali per kelurahan di kantor desa, jadi lebih baik menuntut sinyal daripada
 * membuka celah acak-ulang saat offline.
 */

const express = require('express');
const { Op } = require('sequelize');
const { Survey, RtSelection, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { drawRt, generateSeed, verifyDraw, ALGO_VERSION } = require('../utils/rtDraw');

const router = express.Router();

const DEFAULT_RT_COUNT = 2;

/** Ambil jumlah RT yang harus diundi dari pengaturan survei. */
function rtCountOf(survey) {
  const n = survey?.field_tools_settings?.rt_selection_count;
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : DEFAULT_RT_COUNT;
}

function isEnabled(survey) {
  return survey?.field_tools_settings?.rt_selection === 'enabled';
}

/** Rapikan teks isian agar konsisten (trim + batasi panjang). */
function clean(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function serialize(row) {
  return {
    id: row.id,
    survey_id: row.survey_id,
    province: row.province,
    city: row.city,
    district: row.district,
    village: row.village,
    total_rt: row.total_rt,
    selected: row.selected,
    rt_list: row.rt_list,
    seed: row.seed,
    algo_version: row.algo_version,
    official_name: row.official_name,
    official_position: row.official_position,
    official_phone: row.official_phone,
    form_b_photo_path: row.form_b_photo_path,
    locked_at: row.locked_at,
  };
}

// ── POST /rt-selection — undi RT (sekali saja per kelurahan) ─────────────────
router.post('/', authMiddleware, async (req, res) => {
  const {
    survey_id: surveyId,
    province, city, district, village,
    total_rt: totalRtRaw,
    rt_list: rtList,
    official_name: officialName,
    official_position: officialPosition,
    official_phone: officialPhone,
    form_b_photo_path: formBPhotoPath,
  } = req.body || {};

  if (!surveyId) return res.status(422).json({ error: 'Survei wajib dipilih.' });

  const prov = clean(province, 120);
  const kab = clean(city, 120);
  const kec = clean(district, 120);
  const kel = clean(village, 120);
  if (!prov || !kab || !kec || !kel) {
    return res.status(422).json({ error: 'Provinsi, kabupaten/kota, kecamatan, dan kelurahan/desa wajib diisi.' });
  }

  const totalRt = Number(totalRtRaw);
  if (!Number.isInteger(totalRt) || totalRt < 1) {
    return res.status(422).json({ error: 'Jumlah RT harus bilangan bulat minimal 1.' });
  }

  let survey;
  try {
    survey = await Survey.findByPk(surveyId);
  } catch {
    return res.status(500).json({ error: 'Gagal membaca survei.' });
  }
  if (!survey) return res.status(404).json({ error: 'Survei tidak ditemukan.' });
  if (!isEnabled(survey)) {
    return res.status(400).json({ error: 'Pemilihan RT tidak diaktifkan untuk survei ini.' });
  }

  const count = rtCountOf(survey);
  if (count > totalRt) {
    return res.status(422).json({
      error: `Survei ini memilih ${count} RT, tetapi kelurahan hanya punya ${totalRt} RT.`,
    });
  }

  // ANTI ACAK-ULANG: bila sudah pernah diundi, kembalikan hasil yang sama.
  const existing = await RtSelection.findOne({
    where: { survey_id: surveyId, surveyor_id: req.user.id, village: kel },
  });
  if (existing) {
    return res.status(200).json({
      selection: serialize(existing),
      already_locked: true,
      message: 'Undian RT untuk kelurahan ini sudah pernah dilakukan dan tidak dapat diulang.',
    });
  }

  const seed = generateSeed();
  let selected;
  try {
    selected = drawRt({ seed, totalRt, count });
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  try {
    const row = await RtSelection.create({
      survey_id: surveyId,
      surveyor_id: req.user.id,
      province: prov,
      city: kab,
      district: kec,
      village: kel,
      total_rt: totalRt,
      rt_list: Array.isArray(rtList) && rtList.length ? rtList : null,
      selected,
      seed,
      algo_version: ALGO_VERSION,
      official_name: clean(officialName, 150),
      official_position: clean(officialPosition, 150),
      official_phone: clean(officialPhone, 40),
      form_b_photo_path: clean(formBPhotoPath, 500),
      locked_at: new Date(),
    });
    return res.status(201).json({ selection: serialize(row), already_locked: false });
  } catch (err) {
    // Balapan dua permintaan bersamaan → indeks unik menang. Ambil yang tersimpan
    // supaya tetap satu hasil, bukan error ke TPD.
    if (err && (err.name === 'SequelizeUniqueConstraintError' || err.parent?.code === '23505')) {
      const row = await RtSelection.findOne({
        where: { survey_id: surveyId, surveyor_id: req.user.id, village: kel },
      });
      if (row) {
        return res.status(200).json({
          selection: serialize(row),
          already_locked: true,
          message: 'Undian RT untuk kelurahan ini sudah pernah dilakukan dan tidak dapat diulang.',
        });
      }
    }
    return res.status(500).json({ error: 'Gagal menyimpan hasil undian RT.' });
  }
});

// ── GET /rt-selection?survey_id= — daftar undian milik TPD sendiri ───────────
router.get('/', authMiddleware, async (req, res) => {
  const where = { surveyor_id: req.user.id };
  if (req.query.survey_id) where.survey_id = req.query.survey_id;
  try {
    const rows = await RtSelection.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
    return res.json({ selections: rows.map(serialize) });
  } catch {
    return res.status(500).json({ error: 'Gagal memuat daftar undian RT.' });
  }
});

// ── GET /rt-selection/survey/:surveyId — pengawasan admin/supervisor ─────────
// Menyertakan hasil verifikasi ulang: membuktikan `selected` memang keluaran
// algoritma dari seed tersimpan, bukan angka yang dikarang.
router.get('/survey/:surveyId', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res) => {
  const { surveyId } = req.params;
  const q = clean(req.query.q, 120);
  const where = { survey_id: surveyId };
  if (q) {
    where[Op.or] = [
      { village: { [Op.iLike]: `%${q}%` } },
      { district: { [Op.iLike]: `%${q}%` } },
    ];
  }
  try {
    const rows = await RtSelection.findAll({
      where,
      include: [{ model: User, as: 'surveyor', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    const selections = rows.map((row) => ({
      ...serialize(row),
      surveyor_name: row.surveyor?.name || null,
      // true = hasil cocok dengan hitung ulang dari seed → tidak dimanipulasi.
      verified: verifyDraw(
        { seed: row.seed, totalRt: row.total_rt, count: (row.selected || []).length },
        row.selected
      ),
    }));
    return res.json({ selections });
  } catch {
    return res.status(500).json({ error: 'Gagal memuat undian RT survei ini.' });
  }
});

module.exports = router;
