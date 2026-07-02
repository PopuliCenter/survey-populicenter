const express = require('express');
const { sequelize, Survey, User } = require('../models');
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

module.exports = router;
