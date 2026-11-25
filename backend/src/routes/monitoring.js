const express = require('express');
const { sequelize, Survey, User, AppRelease, FcmToken, AuditLog } = require('../models');
const { validateRelease, toPublicRelease } = require('../utils/appRelease');
const { sendPushToUser } = require('../utils/push');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getDashboardStats } = require('../utils/statisticsUpdater');
const redis = require('../config/redis');

let appVersion = '';
try { appVersion = require('../../package.json').version || ''; } catch { /* abaikan */ }

const router = express.Router();

/** Ukur waktu (ms) sebuah promise; kembalikan {ok, latency_ms, error?}. */
async function timed(fn) {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message };
  }
}

/**
 * GET /monitoring/status — ringkasan kesehatan sistem (admin).
 * Ringan & aman-gagal: tiap komponen dicek terpisah, kegagalan satu tak
 * menggagalkan seluruh respons.
 */
router.get('/status', authMiddleware, requireRole(['admin'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    // DB & Redis dicek paralel.
    const [db, redisCheck] = await Promise.all([
      timed(() => sequelize.authenticate()),
      timed(() => redis.ping()),
    ]);

    // Antrean ekspor (BullMQ) — opsional, aman bila tak tersedia.
    let queue = null;
    try {
      const { queue: exportQueue } = require('../config/queue');
      if (exportQueue && typeof exportQueue.getJobCounts === 'function') {
        const counts = await exportQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        queue = { name: 'export-jobs', counts };
      }
    } catch (e) {
      queue = { name: 'export-jobs', error: e.message };
    }

    // Ringkasan operasional (aman-gagal).
    let summary = null;
    try {
      const [activeSurveys, activeSurveyors, activeIds] = await Promise.all([
        Survey.count({ where: { status: 'active' } }),
        User.count({ where: { role: 'surveyor', is_active: true } }),
        Survey.findAll({ where: { status: 'active' }, attributes: ['id'], raw: true }),
      ]);
      const { totalResponses, todayResponses } = await getDashboardStats(activeIds.map((s) => s.id));
      summary = { activeSurveys, activeSurveyors, totalResponses, todayResponses };
    } catch (e) {
      summary = { error: e.message };
    }

    res.json({
      app: {
        version: appVersion,
        env: process.env.NODE_ENV || 'development',
        node: process.version,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1048576),
      },
      db,
      redis: { ...redisCheck, status: redis.status },
      queue,
      summary,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ─── Rilis aplikasi TPD (APK Android) ────────────────────────────────────────
// Admin mengumumkan versi terbaru: aplikasi membacanya lewat /public/app-version
// (banner "versi baru" / wajib update) dan TPD mendapat push saat versi naik.

/** Push "versi baru tersedia" ke semua TPD aktif yang punya token. Tak melempar. */
async function announceRelease(release) {
  try {
    const users = await User.findAll({
      where: { role: 'surveyor', is_active: true },
      attributes: ['id'],
      include: [{ model: FcmToken, as: 'fcmTokens', attributes: [], required: true }],
    });
    const ids = [...new Set(users.map((u) => u.id))];
    const title = `Versi baru aplikasi tersedia${release.version_name ? ` (${release.version_name})` : ''}`;
    const body = release.min_version_code >= release.version_code
      ? 'Pembaruan WAJIB. Ketuk untuk memperbarui aplikasi.'
      : 'Ketuk untuk melihat dan memperbarui aplikasi.';
    // Bertahap (20 per gelombang) agar FCM & DB tak dibanjiri sekaligus.
    for (let i = 0; i < ids.length; i += 20) {
      await Promise.allSettled(ids.slice(i, i + 20).map((id) => sendPushToUser(id, {
        title,
        body,
        data: { type: 'app_update', version_code: String(release.version_code) },
      })));
    }
    console.log(`[AppRelease] versi ${release.version_code} diumumkan ke ${ids.length} TPD.`);
  } catch (e) {
    console.warn('[AppRelease] gagal mengirim pengumuman:', e.message);
  }
}

/** GET /monitoring/app-releases — rilis terbaru + riwayat (admin). */
router.get('/app-releases', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await AppRelease.findAll({
      where: { platform: 'android' },
      order: [['created_at', 'DESC']],
      limit: 20,
      include: [{ model: User, as: 'publisher', attributes: ['id', 'name'] }],
    });
    res.json({
      latest: toPublicRelease(rows[0] || null),
      history: rows.map((r) => ({
        ...toPublicRelease(r),
        id: r.id,
        publisher_name: r.publisher ? r.publisher.name : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /monitoring/app-releases — umumkan rilis baru (admin).
 * Kode versi naik → push ke semua TPD. Kode sama → koreksi tautan/catatan/versi
 * minimum tanpa push ulang.
 */
router.post('/app-releases', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const latest = await AppRelease.findOne({ where: { platform: 'android' }, order: [['created_at', 'DESC']] });
    const { errors, value } = validateRelease(req.body, latest);
    if (errors.length) return res.status(422).json({ error: errors[0], errors });

    const row = await AppRelease.create({ ...value, created_by: req.user.id });
    await AuditLog.create({
      user_id: req.user.id,
      action: 'PUBLISH_APP_RELEASE',
      entity_type: 'app_release',
      entity_id: row.id,
      old_value: latest ? toPublicRelease(latest) : null,
      new_value: toPublicRelease(row),
      ip_address: req.ip,
    });

    const isNewVersion = !latest || value.version_code > latest.version_code;
    if (isNewVersion) announceRelease(row).catch(() => {}); // fire-and-forget

    res.status(201).json({ release: toPublicRelease(row), announced: isNewVersion });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
