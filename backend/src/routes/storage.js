'use strict';

/**
 * storage.js — manajemen penyimpanan (admin):
 *  - GET  /storage/overview          ringkasan per survei + total disk uploads
 *  - POST /storage/purge             hapus respons + media untuk survei terpilih
 *  - GET  /storage/survey/:id/archive  unduh ZIP (data + media) satu survei
 */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { Op } = require('sequelize');
const { sequelize, Survey, Response, Answer, AuditLog } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { recomputeSurveyStats } = require('../utils/statisticsUpdater');
const { collectMediaPaths, deleteMediaFiles, UPLOADS_ROOT, PROJECT_ROOT } = require('../utils/mediaFiles');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');

/** Jumlah total byte semua file di sebuah folder (rekursif). Aman-gagal. */
function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSizeBytes(full);
    else {
      try { total += fs.statSync(full).size; } catch { /* abaikan */ }
    }
  }
  return total;
}

// ─── GET /storage/overview ─────────────────────────────────────────────────────
router.get('/overview', async (req, res, next) => {
  try {
    const surveys = await Survey.findAll({ attributes: ['id', 'title', 'status'], raw: true });

    const [respRows] = await sequelize.query(`
      SELECT survey_id,
             COUNT(*)::int AS responses,
             COUNT(*) FILTER (WHERE audio_path IS NOT NULL)::int AS audio,
             COUNT(*) FILTER (WHERE signature_path IS NOT NULL)::int AS signatures,
             COALESCE(SUM(CASE WHEN photo_paths IS NOT NULL THEN jsonb_array_length(photo_paths) ELSE 0 END), 0)::int AS resp_photos
      FROM responses
      WHERE questionnaire_number NOT LIKE 'PENDING-%'
      GROUP BY survey_id
    `);
    const [ansRows] = await sequelize.query(`
      SELECT q.survey_id, COUNT(*)::int AS ans_photos
      FROM answers a JOIN questions q ON q.id = a.question_id
      WHERE a.photo_path IS NOT NULL
      GROUP BY q.survey_id
    `);

    const respMap = {};
    for (const r of respRows) respMap[r.survey_id] = r;
    const ansMap = {};
    for (const a of ansRows) ansMap[a.survey_id] = a.ans_photos;

    const items = surveys.map((s) => {
      const r = respMap[s.id] || { responses: 0, audio: 0, signatures: 0, resp_photos: 0 };
      const mediaCount = (r.audio || 0) + (r.signatures || 0) + (r.resp_photos || 0) + (ansMap[s.id] || 0);
      return {
        id: s.id,
        title: s.title,
        status: s.status,
        responses: r.responses || 0,
        media_count: mediaCount,
      };
    }).sort((a, b) => b.media_count - a.media_count);

    res.json({
      surveys: items,
      uploads_bytes: dirSizeBytes(UPLOADS_ROOT),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /storage/purge ───────────────────────────────────────────────────────
// Hapus respons committed + file media untuk survei terpilih (definisi survei &
// pertanyaan TETAP ada). Untuk melegakan disk pada survei yang sudah selesai.
router.post('/purge', async (req, res, next) => {
  try {
    const { survey_ids } = req.body;
    if (!Array.isArray(survey_ids) || survey_ids.length === 0) {
      return res.status(422).json({ error: 'survey_ids (array) wajib diisi' });
    }
    if (!survey_ids.every(isUUID)) {
      return res.status(422).json({ error: 'Terdapat survey_id dengan format tidak valid' });
    }

    const where = {
      survey_id: { [Op.in]: survey_ids },
      questionnaire_number: { [Op.and]: [{ [Op.ne]: 'PENDING' }, { [Op.notLike]: 'PENDING-%' }] },
    };
    const rows = await Response.findAll({ where, attributes: ['id'], raw: true });
    const ids = rows.map((r) => r.id);

    if (ids.length === 0) {
      return res.json({ deleted_responses: 0, files_deleted: 0, message: 'Tidak ada respons untuk dihapus' });
    }

    const mediaPaths = await collectMediaPaths(sequelize, ids);

    await sequelize.transaction(async (t) => {
      await Answer.destroy({ where: { response_id: { [Op.in]: ids } }, transaction: t });
      await Response.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    });

    const filesDeleted = deleteMediaFiles(mediaPaths);
    await Promise.allSettled(survey_ids.map((sid) => recomputeSurveyStats(sid)));

    await AuditLog.create({
      user_id: req.user.id,
      action: 'STORAGE_PURGE',
      entity_type: 'response',
      old_value: { survey_ids, deleted_responses: ids.length, files_deleted: filesDeleted },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({
      deleted_responses: ids.length,
      files_deleted: filesDeleted,
      message: `${ids.length} respons & ${filesDeleted} file media dihapus dari ${survey_ids.length} survei`,
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /storage/survey/:id/archive ───────────────────────────────────────────
// Unduh ZIP: responses.json (data + jawaban) + folder media/ (foto/audio/ttd).
// Streamed (cocok untuk ukuran wajar). Untuk dataset sangat besar, gunakan
// backup server (lihat docs/ops/backup.md).
router.get('/survey/:id/archive', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(422).json({ error: 'Format id tidak valid' });

    const survey = await Survey.findByPk(id, { attributes: ['id', 'title'] });
    if (!survey) return res.status(404).json({ error: 'Survei tidak ditemukan' });

    // Ambil data RAW (tanpa hidrasi ORM/include) — jauh lebih ringan & tahan
    // survei besar. Gabung jawaban ke tiap respons di JS.
    const [respRows] = await sequelize.query(
      `SELECT id, questionnaire_number, surveyor_id, created_at, latitude, longitude,
              review_status, audio_path, signature_path, photo_paths
       FROM responses
       WHERE survey_id = :sid AND questionnaire_number NOT LIKE 'PENDING-%'
       ORDER BY created_at ASC`,
      { replacements: { sid: id } }
    );
    const respIds = respRows.map((r) => r.id);

    let ansRows = [];
    if (respIds.length > 0) {
      [ansRows] = await sequelize.query(
        `SELECT response_id, question_id, answer_value, answer_json, photo_path
         FROM answers WHERE response_id IN (:ids)`,
        { replacements: { ids: respIds } }
      );
    }
    const ansByResp = {};
    const mediaSet = new Set();
    for (const a of ansRows) {
      if (!ansByResp[a.response_id]) ansByResp[a.response_id] = [];
      ansByResp[a.response_id].push({
        question_id: a.question_id, answer_value: a.answer_value,
        answer_json: a.answer_json, photo_path: a.photo_path,
      });
      if (a.photo_path) mediaSet.add(a.photo_path);
    }
    for (const r of respRows) {
      if (r.audio_path) mediaSet.add(r.audio_path);
      if (r.signature_path) mediaSet.add(r.signature_path);
      if (Array.isArray(r.photo_paths)) for (const p of r.photo_paths) if (p) mediaSet.add(p);
    }
    const mediaPaths = [...mediaSet];

    const safe = (survey.title || 'survei').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 40);
    const stamp = new Date().toISOString().slice(0, 10);
    const downloadName = `arsip-${safe}-${stamp}.zip`;

    const data = respRows.map((r) => ({
      id: r.id,
      questionnaire_number: r.questionnaire_number,
      surveyor_id: r.surveyor_id,
      created_at: r.created_at,
      latitude: r.latitude,
      longitude: r.longitude,
      review_status: r.review_status,
      answers: ansByResp[r.id] || [],
    }));

    // Bangun ZIP ke FILE SEMENTARA dulu → dapat Content-Length pasti → klien
    // (browser/nginx/Cloudflare) tahu kapan selesai (mencegah unduhan "menggantung").
    const tmpFile = path.join(os.tmpdir(), `arsip-${req.params.id}-${Date.now()}.zip`);
    const output = fs.createWriteStream(tmpFile);
    const archive = archiver('zip', { zlib: { level: 6 } });

    const zipDone = new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    archive.pipe(output);
    archive.append(JSON.stringify({ survey: { id: survey.id, title: survey.title }, count: data.length, responses: data }, null, 2), { name: 'responses.json' });
    for (const rel of mediaPaths) {
      const full = path.resolve(PROJECT_ROOT, rel);
      if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) continue;
      if (fs.existsSync(full)) archive.file(full, { name: `media/${rel.replace(/^uploads\//, '')}` });
    }
    archive.finalize();
    await zipDone;

    // Kirim file dengan Content-Length, lalu bersihkan file sementara.
    res.download(tmpFile, downloadName, (err) => {
      fs.unlink(tmpFile, () => {});
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    console.error('[storage/archive] gagal untuk survey', req.params.id, ':', error && (error.stack || error.message));
    if (!res.headersSent) return next(error);
    try { res.destroy(error); } catch { /* noop */ }
  }
});

module.exports = router;
