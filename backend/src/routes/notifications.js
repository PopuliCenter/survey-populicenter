'use strict';

/**
 * routes/notifications.js — pemberitahuan dashboard → aplikasi TPD.
 *
 * - POST /            : admin/SPV kirim pesan manual ke TPD terpilih.
 * - GET /             : TPD membaca pemberitahuan MILIKNYA (+ unread_count).
 * - PATCH /read-all   : tandai semua dibaca.
 * - PATCH /:id/read   : tandai satu dibaca (hanya miliknya).
 *
 * Pemberitahuan otomatis (review flagged, durasi singkat) TIDAK lewat rute ini
 * — dibuat langsung oleh routes/responses.js pada peristiwanya.
 */

const express = require('express');
const { Op } = require('sequelize');
const { TpdNotification, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const MAX_TITLE = 150;
const MAX_BODY = 2000;
const MAX_TARGETS = 200;

// ── POST /notifications — kirim manual (admin/SPV, asisten mewarisi) ─────────
router.post('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res) => {
  const { surveyor_ids: surveyorIds, survey_id: surveyId, title, body } = req.body || {};

  if (!Array.isArray(surveyorIds) || surveyorIds.length === 0) {
    return res.status(422).json({ error: 'Pilih minimal satu TPD tujuan.' });
  }
  if (surveyorIds.length > MAX_TARGETS) {
    return res.status(422).json({ error: `Maksimal ${MAX_TARGETS} TPD per pengiriman.` });
  }
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanTitle || cleanTitle.length > MAX_TITLE) {
    return res.status(422).json({ error: `Judul wajib diisi (maksimal ${MAX_TITLE} karakter).` });
  }
  if (!cleanBody || cleanBody.length > MAX_BODY) {
    return res.status(422).json({ error: `Isi pesan wajib diisi (maksimal ${MAX_BODY} karakter).` });
  }

  try {
    // Hanya ke akun TPD yang benar-benar ada — id asing dibuang diam-diam
    // supaya satu id salah tidak menggagalkan seluruh kiriman.
    const targets = await User.findAll({
      where: { id: surveyorIds, role: 'surveyor' },
      attributes: ['id'],
      raw: true,
    });
    if (targets.length === 0) {
      return res.status(422).json({ error: 'Tidak ada akun TPD yang cocok dengan tujuan.' });
    }

    const rows = await TpdNotification.bulkCreate(targets.map((t) => ({
      surveyor_id: t.id,
      survey_id: surveyId || null,
      type: 'manual',
      title: cleanTitle,
      body: cleanBody,
      created_by: req.user.id,
    })));

    return res.status(201).json({ sent: rows.length });
  } catch {
    return res.status(500).json({ error: 'Gagal mengirim pemberitahuan.' });
  }
});

// ── GET /notifications — daftar milik TPD sendiri + unread_count ─────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows, unread] = await Promise.all([
      TpdNotification.findAll({
        where: { surveyor_id: req.user.id },
        order: [['created_at', 'DESC']],
        limit: 100,
        attributes: ['id', 'survey_id', 'response_id', 'type', 'title', 'body', 'read_at', 'created_at'],
      }),
      TpdNotification.count({ where: { surveyor_id: req.user.id, read_at: null } }),
    ]);
    return res.json({ notifications: rows, unread_count: unread });
  } catch {
    return res.status(500).json({ error: 'Gagal memuat pemberitahuan.' });
  }
});

// ── PATCH /notifications/read-all ────────────────────────────────────────────
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    const [updated] = await TpdNotification.update(
      { read_at: new Date() },
      { where: { surveyor_id: req.user.id, read_at: null } }
    );
    return res.json({ marked: updated });
  } catch {
    return res.status(500).json({ error: 'Gagal menandai pemberitahuan.' });
  }
});

// ── PATCH /notifications/:id/read — hanya miliknya ───────────────────────────
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const [updated] = await TpdNotification.update(
      { read_at: new Date() },
      { where: { id: req.params.id, surveyor_id: req.user.id, read_at: { [Op.is]: null } } }
    );
    return res.json({ marked: updated });
  } catch {
    return res.status(500).json({ error: 'Gagal menandai pemberitahuan.' });
  }
});

module.exports = router;
