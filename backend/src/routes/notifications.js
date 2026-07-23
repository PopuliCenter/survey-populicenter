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
const { TpdNotification, User, FcmToken } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendPushToUser } = require('../utils/push');

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

    // Push FCM ke HP tiap target — fire-and-forget: lonceng dalam-aplikasi
    // sudah tersimpan; push hanya membangunkan HP yang aplikasinya tertutup.
    Promise.allSettled(targets.map((t) => sendPushToUser(t.id, {
      title: cleanTitle,
      body: cleanBody,
      data: { type: 'manual', survey_id: surveyId || '' },
    }))).catch(() => {});

    return res.status(201).json({ sent: rows.length });
  } catch {
    return res.status(500).json({ error: 'Gagal mengirim pemberitahuan.' });
  }
});

// ── POST /notifications/fcm-token — registrasi token push perangkat TPD ──────
// Dipanggil aplikasi tiap kali dapat token dari FCM (login / token dirotasi).
// Token unik global: bila perangkat pindah akun, kepemilikan token ikut pindah
// ke akun yang terakhir login (selaras kunci 1-user-1-device).
router.post('/fcm-token', authMiddleware, requireRole('surveyor'), async (req, res) => {
  const token = String((req.body || {}).token || '').trim();
  const platform = String((req.body || {}).platform || 'android').slice(0, 20);
  if (!token || token.length > 512) {
    return res.status(422).json({ error: 'Token tidak valid.' });
  }
  try {
    const existing = await FcmToken.findOne({ where: { token } });
    if (existing) {
      await existing.update({ user_id: req.user.id, platform });
    } else {
      await FcmToken.create({ user_id: req.user.id, token, platform });
    }
    return res.json({ registered: true });
  } catch {
    return res.status(500).json({ error: 'Gagal mendaftarkan token.' });
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
