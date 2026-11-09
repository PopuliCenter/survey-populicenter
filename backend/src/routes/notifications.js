'use strict';

/**
 * routes/notifications.js — pemberitahuan dashboard → aplikasi TPD.
 *
 * - POST /            : admin/SPV kirim pesan manual ke TPD terpilih.
 * - GET /             : TPD membaca pemberitahuan MILIKNYA (+ unread_count).
 * - PATCH /read-all   : tandai semua dibaca.
 * - PATCH /:id/read   : tandai satu dibaca (hanya miliknya).
 * - DELETE /:id                    : admin hapus satu pesan dari riwayat.
 * - DELETE /surveyor/:surveyorId   : admin hapus SELURUH riwayat seorang TPD.
 *   Keduanya tercatat di audit_logs (isi pesan disimpan di old_value) dan
 *   ikut hilang dari aplikasi TPD pada pengambilan berikutnya.
 *
 * Pemberitahuan otomatis (review flagged, durasi singkat) TIDAK lewat rute ini
 * — dibuat langsung oleh routes/responses.js pada peristiwanya.
 */

const express = require('express');
const { Op } = require('sequelize');
const { TpdNotification, User, FcmToken, Survey, AuditLog, sequelize } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendPushToUser } = require('../utils/push');

const router = express.Router();

const MAX_TITLE = 150;
const MAX_BODY = 2000;
const MAX_TARGETS = 200;
// id = UUID. Teks lain langsung 404 — tanpa ini Postgres melempar 22P02
// ("invalid input syntax for type uuid") dan klien menerima 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ── GET /notifications/surveyor/:surveyorId — riwayat peringatan seorang TPD ──
// Untuk admin/SPV (asisten mewarisi): bahan pembinaan — apakah TPD ini
// mengulang kesalahan yang sama, sudah berapa kali ditegur, dan apakah
// tegurannya SUDAH DIBACA (read_at). Baris tpd_notifications sengaja tidak
// pernah dihapus otomatis — inilah riwayatnya.
router.get('/surveyor/:surveyorId', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res) => {
  try {
    const { surveyorId } = req.params;
    const surveyor = await User.findOne({
      where: { id: surveyorId, role: 'surveyor' },
      attributes: ['id', 'name'],
    });
    if (!surveyor) {
      return res.status(404).json({ error: 'Akun TPD tidak ditemukan' });
    }

    const [rows, countRows] = await Promise.all([
      TpdNotification.findAll({
        where: { surveyor_id: surveyorId },
        order: [['created_at', 'DESC']],
        limit: 200,
        attributes: ['id', 'survey_id', 'response_id', 'type', 'title', 'body', 'read_at', 'created_at'],
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name'] },
          { model: Survey, as: 'survey', attributes: ['id', 'title'] },
        ],
      }),
      // Rekap AKURAT seluruh riwayat (bukan hanya 200 terbaru).
      TpdNotification.findAll({
        where: { surveyor_id: surveyorId },
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN read_at IS NULL THEN 1 END')), 'unread'],
        ],
        group: ['type'],
        raw: true,
      }),
    ]);

    const counts = { manual: 0, review: 0, quality: 0, unread: 0 };
    for (const c of countRows) {
      counts[c.type] = parseInt(c.count, 10) || 0;
      counts.unread += parseInt(c.unread, 10) || 0;
    }

    return res.json({
      surveyor: { id: surveyor.id, name: surveyor.name },
      counts,
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read_at: n.read_at,
        created_at: n.created_at,
        survey_title: n.survey ? n.survey.title : null,
        sender_name: n.sender ? n.sender.name : null,
      })),
    });
  } catch {
    return res.status(500).json({ error: 'Gagal memuat riwayat pemberitahuan.' });
  }
});

// ── DELETE /notifications/surveyor/:surveyorId — hapus seluruh riwayat (admin) ─
// Khusus admin (SPV & asisten tidak): riwayat ini bahan pembinaan, jadi yang
// boleh menghapusnya sama dengan yang boleh menghapus data lain. Penghapusan &
// catatan auditnya satu transaksi — tak ada hapus tanpa jejak.
router.delete('/surveyor/:surveyorId', authMiddleware, requireRole('admin'), async (req, res) => {
  const { surveyorId } = req.params;
  if (!UUID_RE.test(surveyorId)) {
    return res.status(404).json({ error: 'Akun TPD tidak ditemukan' });
  }
  try {
    const surveyor = await User.findOne({
      where: { id: surveyorId, role: 'surveyor' },
      attributes: ['id', 'name'],
    });
    if (!surveyor) {
      return res.status(404).json({ error: 'Akun TPD tidak ditemukan' });
    }

    const deleted = await sequelize.transaction(async (transaction) => {
      const count = await TpdNotification.destroy({ where: { surveyor_id: surveyorId }, transaction });
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_TPD_NOTIFICATIONS',
        entity_type: 'surveyor',
        entity_id: surveyorId,
        old_value: { surveyor_name: surveyor.name, deleted: count },
        new_value: null,
        ip_address: req.ip,
      }, { transaction });
      return count;
    });

    return res.json({ deleted });
  } catch {
    return res.status(500).json({ error: 'Gagal menghapus riwayat pesan.' });
  }
});

// ── DELETE /notifications/:id — hapus satu pesan dari riwayat (admin) ─────────
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: 'Pesan tidak ditemukan' });
  }
  try {
    const row = await TpdNotification.findByPk(id);
    if (!row) {
      return res.status(404).json({ error: 'Pesan tidak ditemukan' });
    }

    await sequelize.transaction(async (transaction) => {
      await row.destroy({ transaction });
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_TPD_NOTIFICATION',
        entity_type: 'tpd_notification',
        entity_id: row.id,
        old_value: {
          surveyor_id: row.surveyor_id,
          type: row.type,
          title: row.title,
          body: row.body,
          read_at: row.read_at,
          created_at: row.created_at,
        },
        new_value: null,
        ip_address: req.ip,
      }, { transaction });
    });

    return res.json({ deleted: 1 });
  } catch {
    return res.status(500).json({ error: 'Gagal menghapus pesan.' });
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
