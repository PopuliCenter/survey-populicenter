const express = require('express');
const { Op, fn, col } = require('sequelize');
const { Survey, User, Response, SurveyorQuota, sequelize } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getDashboardStats, getSurveyorResponseCounts } = require('../utils/statisticsUpdater');
const { wibDateString, wibDayRangeUTC } = require('../utils/time');
const { normalizeProvince } = require('../utils/province');
const { cacheGet, cacheSet } = require('../utils/cache');

const router = express.Router();

// TTL pendek untuk endpoint inti: tahan beban query identik saat banyak akses
// berbarengan (mis. banyak orang buka dashboard ketika TPD input deras),
// tetap cukup segar (≤60 dtk basi).
const CORE_TTL = 60;

/** Bangun suffix cache key dari daftar surveyId (urut & gabung). */
function idsKey(surveyIds) {
  return [...surveyIds].sort().join(',');
}

/**
 * Validate UUID v4 format.
 * @param {string} str
 * @returns {boolean}
 */
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Calculate completion percentage rounded to 1 decimal, capped at 100.0.
 * @param {number} collected
 * @param {number} quota
 * @returns {number}
 */
function calculatePercentage(collected, quota) {
  if (quota <= 0) return 0;
  const raw = (collected / quota) * 100;
  return Math.min(100.0, Math.round(raw * 10) / 10);
}

/**
 * Calculate remaining quota with minimum 0.
 * @param {number} quota
 * @param {number} collected
 * @returns {number}
 */
function calculateRemaining(quota, collected) {
  return Math.max(0, quota - collected);
}

/**
 * Resolve surveyor status based on collected/quota ratio.
 * @param {number} totalCollected
 * @param {number} totalQuota
 * @returns {'completed' | 'on-track' | 'behind'}
 */
function resolveSurveyorStatus(totalCollected, totalQuota) {
  if (totalQuota === 0) return 'on-track';
  if (totalCollected >= totalQuota) return 'completed';
  const ratio = totalCollected / totalQuota;
  return ratio >= 0.5 ? 'on-track' : 'behind';
}

/**
 * Resolve survey filter IDs for dashboard queries.
 * If `survey_id` is provided, validate and use that survey.
 * Otherwise, use all currently active surveys.
 */
async function resolveDashboardSurveyIds(surveyId) {
  if (surveyId) {
    if (!isValidUUID(surveyId)) {
      const error = new Error('Format survey_id tidak valid');
      error.status = 422;
      throw error;
    }
    const survey = await Survey.findOne({ where: { id: surveyId }, attributes: ['id'] });
    if (!survey) {
      const error = new Error('Survei tidak ditemukan');
      error.status = 404;
      throw error;
    }
    return [survey.id];
  }

  const activeSurveys = await Survey.findAll({ where: { status: 'active' }, attributes: ['id'], raw: true });
  return activeSurveys.map((s) => s.id);
}

/**
 * GET /dashboard/stats
 * Returns summary statistics for the admin dashboard:
 *   - activeSurveys: count of surveys with status = 'active'
 *   - activeSurveyors: count of users with role = 'surveyor' and is_active = true
 *   - todayResponses: count of responses submitted today (UTC date)
 *   - totalResponses: total count of all responses
 */
router.get('/stats', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;

    const surveyIds = await resolveDashboardSurveyIds(surveyId);

    const cacheKey = `dash:stats:${idsKey(surveyIds)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [activeSurveys, activeSurveyors] = await Promise.all([
      Survey.count({ where: { status: 'active' } }),
      User.count({ where: { role: 'surveyor', is_active: true } }),
    ]);

    // Use pre-computed statistics (fast, no COUNT(*) on responses table)
    const { totalResponses, todayResponses } = await getDashboardStats(surveyIds);

    const payload = {
      activeSurveys,
      activeSurveyors,
      todayResponses,
      totalResponses,
    };
    await cacheSet(cacheKey, payload, CORE_TTL);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/trend
 * Returns response submission trend for the last 7 days (including today).
 * Each entry contains:
 *   - date: ISO date string (YYYY-MM-DD, UTC)
 *   - count: number of responses created on that day
 */
router.get('/trend', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;

    // 7 hari WIB terakhir (hari ini & 6 hari sebelumnya), sebagai 'YYYY-MM-DD' WIB
    const now = new Date();
    const dayStrings = [];
    for (let i = 6; i >= 0; i--) {
      dayStrings.push(wibDateString(new Date(now.getTime() - i * 86400000)));
    }
    // Rentang UTC: dari awal hari WIB 6 hari lalu sampai akhir hari WIB ini
    const rangeStart = wibDayRangeUTC(new Date(now.getTime() - 6 * 86400000)).start;
    const rangeEnd = wibDayRangeUTC(now).end;

    const surveyIds = await resolveDashboardSurveyIds(surveyId);

    const cacheKey = `dash:trend:${idsKey(surveyIds)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    let rows = [];
    if (surveyIds.length > 0) {
      // Group berdasarkan TANGGAL WIB (created_at disimpan UTC → konversi ke Asia/Jakarta)
      rows = await sequelize.query(
        `SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS date,
                COUNT(id)::int AS count
         FROM responses
         WHERE created_at BETWEEN :start AND :end
           AND questionnaire_number NOT LIKE 'PENDING-%'
           AND survey_id IN (:surveyIds)
         GROUP BY 1`,
        {
          replacements: { start: rangeStart, end: rangeEnd, surveyIds },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    }

    // Lookup: 'YYYY-MM-DD' (WIB) -> count
    const countMap = {};
    for (const row of rows) {
      countMap[row.date] = parseInt(row.count, 10);
    }

    // Pastikan semua 7 hari hadir (0 untuk hari tanpa data)
    const trend = dayStrings.map((dateStr) => ({
      date: dateStr,
      count: countMap[dateStr] || 0,
    }));

    await cacheSet(cacheKey, trend, CORE_TTL);
    res.json(trend);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/top-surveyors
 * Returns up to 5 surveyors with the most responses, ordered by responseCount descending.
 * Each entry contains:
 *   - id: surveyor UUID
 *   - name: surveyor name
 *   - email: surveyor email
 *   - responseCount: number of responses submitted by this surveyor
 */
router.get('/top-surveyors', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;
    const surveyIds = await resolveDashboardSurveyIds(surveyId);

    if (surveyIds.length === 0) {
      return res.json([]);
    }

    const cacheKey = `dash:top:${idsKey(surveyIds)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const responseWhere = {
      questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      survey_id: surveyIds,
    };

    const rows = await Response.findAll({
      attributes: [
        'surveyor_id',
        [fn('COUNT', col('Response.id')), 'responseCount'],
      ],
      where: responseWhere,
      include: [
        {
          model: User,
          as: 'surveyor',
          attributes: ['id', 'name', 'email'],
          required: true,
        },
      ],
      group: ['surveyor_id', 'surveyor.id'],
      order: [[fn('COUNT', col('Response.id')), 'DESC']],
      limit: 5,
      raw: true,
      nest: true,
    });

    const topSurveyors = rows.map((row) => ({
      id: row.surveyor.id,
      name: row.surveyor.name,
      email: row.surveyor.email,
      responseCount: parseInt(row.responseCount, 10),
    }));

    await cacheSet(cacheKey, topSurveyors, CORE_TTL);
    res.json(topSurveyors);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/survey-progress/:surveyId
 * Returns progress data for a specific survey including breakdown per surveyor.
 */
router.get('/survey-progress/:surveyId', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { surveyId } = req.params;

    // Validate UUID format
    if (!isValidUUID(surveyId)) {
      return res.status(422).json({ error: 'Format surveyId tidak valid' });
    }

    // Cache per survei: meredam fan-out (1 panggilan/survei aktif tiap buka dashboard)
    // saat banyak akses berbarengan.
    const cacheKey = `dash:progress:${surveyId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // Check survey exists
    const survey = await Survey.findOne({ where: { id: surveyId }, attributes: ['id', 'title'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // Get all surveyor quotas for this survey
    const quotas = await SurveyorQuota.findAll({
      where: { survey_id: surveyId },
      include: [{ model: User, as: 'surveyor', attributes: ['id', 'name'] }],
      raw: true,
      nest: true,
    });

    // Calculate total quota
    const totalQuota = quotas.reduce((sum, q) => sum + q.quota, 0);

    // Count total responses for this survey (from pre-computed stats)
    const responseMap = await getSurveyorResponseCounts(surveyId);
    const totalCollected = Object.values(responseMap).reduce((sum, c) => sum + c, 0);

    // Build breakdown per surveyor
    const surveyors = quotas.map((q) => {
      const collected = responseMap[q.surveyor.id] || 0;
      return {
        surveyorId: q.surveyor.id,
        surveyorName: q.surveyor.name,
        quota: q.quota,
        collected,
        percentage: calculatePercentage(collected, q.quota),
        remaining: calculateRemaining(q.quota, collected),
      };
    });

    // Sort by percentage descending
    surveyors.sort((a, b) => b.percentage - a.percentage);

    const completionPercentage = calculatePercentage(totalCollected, totalQuota);

    const payload = {
      surveyId: survey.id,
      surveyTitle: survey.title,
      totalQuota,
      totalCollected,
      completionPercentage,
      surveyors,
    };
    await cacheSet(cacheKey, payload, CORE_TTL);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/surveyor-summary
 * Returns a summary of all active surveyors including active survey count,
 * today's responses, and status (completed/on-track/behind).
 */
router.get('/surveyor-summary', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    // Batas "hari ini" dalam WIB (bukan UTC) agar konsisten dengan dashboard.
    const { start: todayStart, end: todayEnd } = wibDayRangeUTC();

    // Get all active surveyors
    const surveyors = await User.findAll({
      where: { role: 'surveyor', is_active: true },
      attributes: ['id', 'name'],
      raw: true,
    });

    // Get active surveys
    const activeSurveys = await Survey.findAll({
      where: { status: 'active' },
      attributes: ['id'],
      raw: true,
    });
    const activeSurveyIds = activeSurveys.map((s) => s.id);

    // Get quotas per surveyor in active surveys
    let quotaRows = [];
    if (activeSurveyIds.length > 0) {
      quotaRows = await SurveyorQuota.findAll({
        where: { survey_id: activeSurveyIds },
        attributes: ['surveyor_id', 'survey_id', 'quota'],
        raw: true,
      });
    }

    // Count responses per surveyor in active surveys (exclude PENDING)
    let responseRows = [];
    if (activeSurveyIds.length > 0) {
      responseRows = await Response.findAll({
        attributes: ['surveyor_id', [fn('COUNT', col('id')), 'count']],
        where: {
          survey_id: activeSurveyIds,
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
        group: ['surveyor_id'],
        raw: true,
      });
    }

    // Count today's responses per surveyor (exclude PENDING).
    // H3: WAJIB difilter ke survei aktif — sama seperti responseRows. Tanpa ini,
    // "responsesToday" ikut menghitung survei non-aktif/arsip → angka menggelembung
    // & tak konsisten dengan /stats.
    let todayRows = [];
    if (activeSurveyIds.length > 0) {
      todayRows = await Response.findAll({
        attributes: ['surveyor_id', [fn('COUNT', col('id')), 'count']],
        where: {
          survey_id: activeSurveyIds,
          created_at: { [Op.between]: [todayStart, todayEnd] },
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
        group: ['surveyor_id'],
        raw: true,
      });
    }

    // Build lookup maps
    const quotaMap = {};
    quotaRows.forEach((q) => {
      if (!quotaMap[q.surveyor_id]) {
        quotaMap[q.surveyor_id] = { totalQuota: 0, surveyIds: new Set() };
      }
      quotaMap[q.surveyor_id].totalQuota += q.quota;
      quotaMap[q.surveyor_id].surveyIds.add(q.survey_id);
    });

    const responseMap = {};
    responseRows.forEach((r) => { responseMap[r.surveyor_id] = parseInt(r.count, 10); });

    const todayMap = {};
    todayRows.forEach((r) => { todayMap[r.surveyor_id] = parseInt(r.count, 10); });

    // Build result
    const result = surveyors.map((s) => {
      const qData = quotaMap[s.id];
      const activeSurveyCount = qData ? qData.surveyIds.size : 0;
      const totalQuota = qData ? qData.totalQuota : 0;
      const totalCollected = responseMap[s.id] || 0;
      const responsesToday = todayMap[s.id] || 0;
      const status = resolveSurveyorStatus(totalCollected, totalQuota);

      return {
        surveyorId: s.id,
        surveyorName: s.name,
        activeSurveyCount,
        responsesToday,
        status,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/responses-by-province
 * Sebaran responden (committed) per provinsi, dari jawaban pertanyaan wilayah.
 * Dimuat MANUAL (tombol) + di-cache 10 menit agar tidak membebani server.
 */
router.get('/responses-by-province', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;
    const surveyIds = await resolveDashboardSurveyIds(surveyId);
    if (surveyIds.length === 0) {
      return res.json({ regions: [], generated_at: new Date().toISOString(), cached: false });
    }

    const cacheKey = `dash:prov:${[...surveyIds].sort().join(',')}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const rows = await sequelize.query(
      `SELECT a.answer_json->>'province_name' AS province, COUNT(*)::int AS count
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       JOIN questions q ON q.id = a.question_id
       WHERE q.survey_id IN (:surveyIds)
         AND r.survey_id IN (:surveyIds)
         AND q.type = 'indonesia_region'
         AND r.questionnaire_number NOT LIKE 'PENDING-%'
         AND a.answer_json->>'province_name' IS NOT NULL
       GROUP BY 1`,
      { replacements: { surveyIds }, type: sequelize.QueryTypes.SELECT }
    );

    const merged = new Map();
    for (const row of rows) {
      const key = normalizeProvince(row.province);
      if (!key) continue;
      merged.set(key, (merged.get(key) || 0) + Number(row.count));
    }
    const regions = Array.from(merged, ([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count);

    const payload = { regions, generated_at: new Date().toISOString() };
    await cacheSet(cacheKey, payload, 600);
    res.json({ ...payload, cached: false });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/time-pattern
 * Pola waktu responden masuk (WIB): per hari-dalam-minggu & per jam (committed).
 */
router.get('/time-pattern', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;
    const surveyIds = await resolveDashboardSurveyIds(surveyId);
    const emptyWeekday = Array.from({ length: 7 }, (_, dow) => ({ dow, count: 0 }));
    const emptyHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    if (surveyIds.length === 0) return res.json({ by_weekday: emptyWeekday, by_hour: emptyHour });

    const cacheKey = `dash:time:${[...surveyIds].sort().join(',')}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const rows = await sequelize.query(
      `SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Jakarta')::int AS dow,
              EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta')::int AS hour,
              COUNT(*)::int AS count
       FROM responses
       WHERE survey_id IN (:surveyIds) AND questionnaire_number NOT LIKE 'PENDING-%'
       GROUP BY 1, 2`,
      { replacements: { surveyIds }, type: sequelize.QueryTypes.SELECT }
    );

    const byWeekday = emptyWeekday.map((d) => ({ ...d }));
    const byHour = emptyHour.map((h) => ({ ...h }));
    for (const r of rows) {
      const c = Number(r.count);
      if (r.dow >= 0 && r.dow <= 6) byWeekday[r.dow].count += c;
      if (r.hour >= 0 && r.hour <= 23) byHour[r.hour].count += c;
    }

    const payload = { by_weekday: byWeekday, by_hour: byHour };
    await cacheSet(cacheKey, payload, 300);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dashboard/data-quality
 * Kualitas data: status review (committed), cakupan GPS, & jumlah sesi pending.
 */
router.get('/data-quality', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id: surveyId } = req.query;
    const surveyIds = await resolveDashboardSurveyIds(surveyId);
    const empty = {
      total: 0,
      by_review: { unreviewed: 0, flagged: 0, verified: 0 },
      gps: { with: 0, without: 0, pct: null },
      pending: 0,
    };
    if (surveyIds.length === 0) return res.json(empty);

    const cacheKey = `dash:quality:${[...surveyIds].sort().join(',')}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [reviewRows, pendingRow] = await Promise.all([
      sequelize.query(
        `SELECT review_status,
                COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int AS with_gps
         FROM responses
         WHERE survey_id IN (:surveyIds) AND questionnaire_number NOT LIKE 'PENDING-%'
         GROUP BY review_status`,
        { replacements: { surveyIds }, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS pending FROM responses
         WHERE survey_id IN (:surveyIds) AND questionnaire_number LIKE 'PENDING-%'`,
        { replacements: { surveyIds }, type: sequelize.QueryTypes.SELECT }
      ),
    ]);

    const byReview = { unreviewed: 0, flagged: 0, verified: 0 };
    let total = 0;
    let withGps = 0;
    for (const r of reviewRows) {
      const c = Number(r.count);
      total += c;
      withGps += Number(r.with_gps);
      if (byReview[r.review_status] != null) byReview[r.review_status] += c;
    }

    const payload = {
      total,
      by_review: byReview,
      gps: {
        with: withGps,
        without: total - withGps,
        pct: total > 0 ? Math.round((withGps / total) * 1000) / 10 : null,
      },
      pending: Number((pendingRow[0] && pendingRow[0].pending) || 0),
    };
    await cacheSet(cacheKey, payload, 300);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.calculatePercentage = calculatePercentage;
module.exports.calculateRemaining = calculateRemaining;
module.exports.resolveSurveyorStatus = resolveSurveyorStatus;
