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
const { Op } = require('sequelize');
const { sequelize, Survey, Response, Answer, AuditLog, ExportJob } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { recomputeSurveyStats } = require('../utils/statisticsUpdater');
const { collectMediaPaths, deleteMediaFiles, UPLOADS_ROOT, PROJECT_ROOT } = require('../utils/mediaFiles');
const { cacheGet, cacheSet, cacheDel } = require('../utils/cache');
const { dirSizeBytes } = require('../utils/diskUsage');
const { chunk } = require('../utils/chunk');
const { buildSurveyArchive } = require('../utils/archiveBuilder');
const { queue: exportQueue } = require('../config/queue');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');

// Ukuran folder uploads berubah lambat & mahal dihitung (walk rekursif seluruh
// disk), jadi di-cache singkat. Di-invalidasi saat purge agar disk yang lega
// langsung tercermin.
const UPLOADS_SIZE_KEY = 'storage:uploads_bytes';
const UPLOADS_SIZE_TTL = 300; // detik

// Di atas ambang ini, arsip dibangun di worker (async) — hindari lonjakan
// memori (JSON.stringify seluruh respons) & timeout di request admin.
const ARCHIVE_ASYNC_THRESHOLD = 5000;

// ─── GET /storage/overview ─────────────────────────────────────────────────────
router.get('/overview', async (req, res, next) => {
  try {
    const surveys = await Survey.findAll({ attributes: ['id', 'title', 'status'], raw: true });

    const [respRows] = await sequelize.query(`
      SELECT survey_id,
             COUNT(*)::int AS responses,
             COUNT(*) FILTER (WHERE audio_path IS NOT NULL)::int AS audio,
             COUNT(*) FILTER (WHERE signature_path IS NOT NULL)::int AS signatures,
             COALESCE(SUM(CASE WHEN jsonb_typeof(photo_paths) = 'array' THEN jsonb_array_length(photo_paths) ELSE 0 END), 0)::int AS resp_photos
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

    // Ukuran disk: pakai cache bila ada (hitung ulang async saat miss agar tidak
    // memblokir event loop / mengulang walk mahal saat banyak akses).
    let uploadsBytes = await cacheGet(UPLOADS_SIZE_KEY);
    const uploadsCached = uploadsBytes != null;
    if (!uploadsCached) {
      uploadsBytes = await dirSizeBytes(UPLOADS_ROOT);
      await cacheSet(UPLOADS_SIZE_KEY, uploadsBytes, UPLOADS_SIZE_TTL);
    }

    res.json({
      surveys: items,
      uploads_bytes: uploadsBytes,
      uploads_cached: uploadsCached,
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
      for (const part of chunk(ids)) {
        await Answer.destroy({ where: { response_id: { [Op.in]: part } }, transaction: t });
      }
      for (const part of chunk(ids)) {
        await Response.destroy({ where: { id: { [Op.in]: part } }, transaction: t });
      }
    });

    const filesDeleted = await deleteMediaFiles(mediaPaths);
    await cacheDel(UPLOADS_SIZE_KEY); // disk berubah → paksa hitung ulang berikutnya
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
// Survei kecil (≤ ambang): dibangun sinkron ke file temp lalu langsung diunduh.
// Survei besar (> ambang): dikerjakan worker (202 + jobId) → klien polling
// /archive-jobs/:jobId lalu unduh saat 'completed'.
router.get('/survey/:id/archive', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(422).json({ error: 'Format id tidak valid' });

    const survey = await Survey.findByPk(id, { attributes: ['id', 'title'] });
    if (!survey) return res.status(404).json({ error: 'Survei tidak ditemukan' });

    const count = await Response.count({
      where: { survey_id: id, questionnaire_number: { [Op.notLike]: 'PENDING-%' } },
    });

    // Survei besar → antre ke worker (hindari lonjakan memori & timeout).
    if (count > ARCHIVE_ASYNC_THRESHOLD) {
      const job = await ExportJob.create({
        survey_id: id, requested_by: req.user.id, status: 'pending', format: 'zip',
      });
      await exportQueue.add('archive', { jobId: job.id, survey_id: id });
      return res.status(202).json({
        async: true,
        jobId: job.id,
        count,
        message: `Survei besar (${count.toLocaleString('id-ID')} respons) — arsip diproses di latar belakang.`,
      });
    }

    // Survei kecil → bangun sinkron ke FILE SEMENTARA (Content-Length pasti →
    // klien/nginx/Cloudflare tahu kapan selesai; cegah unduhan "menggantung").
    const safe = (survey.title || 'survei').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 40);
    const stamp = new Date().toISOString().slice(0, 10);
    const downloadName = `arsip-${safe}-${stamp}.zip`;
    const tmpFile = path.join(os.tmpdir(), `arsip-${id}-${Date.now()}.zip`);

    await buildSurveyArchive(id, tmpFile);

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

// ─── GET /storage/archive-jobs/:jobId ──────────────────────────────────────────
// Status job arsip async (untuk polling frontend).
router.get('/archive-jobs/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!isUUID(jobId)) return res.status(422).json({ error: 'Format jobId tidak valid' });
    const job = await ExportJob.findByPk(jobId, {
      attributes: ['id', 'status', 'format', 'created_at', 'completed_at'],
    });
    if (!job || job.format !== 'zip') return res.status(404).json({ error: 'Job arsip tidak ditemukan' });
    res.json({ id: job.id, status: job.status, created_at: job.created_at, completed_at: job.completed_at });
  } catch (error) {
    next(error);
  }
});

// ─── GET /storage/archive-jobs/:jobId/download ─────────────────────────────────
// Unduh file arsip yang sudah selesai (dari uploads/exports).
router.get('/archive-jobs/:jobId/download', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!isUUID(jobId)) return res.status(422).json({ error: 'Format jobId tidak valid' });
    const job = await ExportJob.findByPk(jobId, {
      attributes: ['id', 'status', 'format', 'file_path'],
    });
    if (!job || job.format !== 'zip') return res.status(404).json({ error: 'Job arsip tidak ditemukan' });
    if (job.status !== 'completed') return res.status(409).json({ error: 'Arsip belum selesai', status: job.status });
    if (!job.file_path) return res.status(404).json({ error: 'File arsip tidak tersedia' });

    const filePath = path.resolve(PROJECT_ROOT, job.file_path);
    // Guard: file wajib di dalam uploads/ (cegah path traversal).
    if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) return res.status(400).json({ error: 'Path tidak valid' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File arsip sudah kedaluwarsa' });

    res.download(filePath, `arsip-${jobId}.zip`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
