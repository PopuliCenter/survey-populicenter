'use strict';

/**
 * Public routes — API read-only TANPA login untuk menayangkan hasil survei
 * (agregat) di website publik (populicenter.org).
 *
 * Hanya membaca artefak snapshot yang sudah di-publish admin. Tidak pernah
 * menyentuh data response mentah. Aman diekspos ke internet.
 */

const express = require('express');
const { PublishedResult, MonitoringReport } = require('../models');
const { buildMonitoringSnapshot } = require('../utils/aggregateResults');

const router = express.Router();

// "Snapshot berkala": hitung ulang monitoring bila snapshot lebih tua dari TTL ini.
const MONITORING_TTL_MS = 15 * 60 * 1000;

// CORS terbuka khusus endpoint publik ini (data agregat, non-sensitif, tanpa
// kredensial) — agar bisa di-fetch dari WordPress/Elementor maupun server-side.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  next();
});

/**
 * GET /public/results
 * Daftar survei yang hasilnya dipublikasikan (ringkas, untuk index/listing).
 */
router.get('/results', async (req, res, next) => {
  try {
    const rows = await PublishedResult.findAll({
      where: { is_published: true },
      attributes: ['slug', 'title', 'survey_type', 'summary', 'response_count', 'published_at'],
      order: [['published_at', 'DESC']],
    });
    res.json(
      rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        type: r.survey_type,
        summary: r.summary,
        response_count: r.response_count,
        published_at: r.published_at,
      }))
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /public/results/:slug
 * Snapshot agregat lengkap satu survei untuk dirender (grafik + peta).
 */
router.get('/results/:slug', async (req, res, next) => {
  try {
    const row = await PublishedResult.findOne({
      where: { slug: req.params.slug, is_published: true },
    });
    if (!row) {
      return res.status(404).json({ error: 'Hasil survei tidak ditemukan' });
    }
    res.json({
      slug: row.slug,
      title: row.title,
      type: row.survey_type,
      summary: row.summary,
      response_count: row.response_count,
      published_at: row.published_at,
      ...row.snapshot,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /public/monitor/:token
 * Snapshot MONITORING klien (capaian vs target) via link bertoken rahasia.
 * Dihitung ulang secara lazy bila sudah melewati TTL ("snapshot berkala").
 */
router.get('/monitor/:token', async (req, res, next) => {
  try {
    const mon = await MonitoringReport.findOne({
      where: { token: req.params.token, is_enabled: true },
    });
    if (!mon) {
      return res.status(404).json({ error: 'Monitoring tidak ditemukan atau dinonaktifkan' });
    }

    let snapshot = mon.snapshot;
    const stale =
      !mon.snapshot_at || Date.now() - new Date(mon.snapshot_at).getTime() > MONITORING_TTL_MS;

    if (stale || !snapshot) {
      try {
        snapshot = await buildMonitoringSnapshot(mon.survey_id);
        await mon.update({ snapshot, snapshot_at: new Date() });
      } catch (e) {
        // Bila recompute gagal namun ada snapshot lama, sajikan yang lama.
        if (!snapshot) throw e;
      }
    }

    res.json({ ...snapshot, snapshot_at: mon.snapshot_at });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
