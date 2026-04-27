const express = require('express');
const { Op, fn, col } = require('sequelize');
const { Survey, User, Response, SurveyorQuota } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

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
 * GET /dashboard/stats
 * Returns summary statistics for the admin dashboard:
 *   - activeSurveys: count of surveys with status = 'active'
 *   - activeSurveyors: count of users with role = 'surveyor' and is_active = true
 *   - todayResponses: count of responses submitted today (UTC date)
 *   - totalResponses: total count of all responses
 */
router.get('/stats', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    // Start of today in UTC
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // End of today in UTC
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const [activeSurveys, activeSurveyors, todayResponses, totalResponses] = await Promise.all([
      Survey.count({ where: { status: 'active' } }),
      User.count({ where: { role: 'surveyor', is_active: true } }),
      Response.count({
        where: {
          created_at: {
            [Op.between]: [todayStart, todayEnd],
          },
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
      }),
      Response.count({
        where: { questionnaire_number: { [Op.notLike]: 'PENDING-%' } },
      }),
    ]);

    res.json({
      activeSurveys,
      activeSurveyors,
      todayResponses,
      totalResponses,
    });
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
    // Build the 7-day date range (today and 6 days before), all in UTC
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      days.push(d);
    }

    const rangeStart = days[0];
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setUTCHours(23, 59, 59, 999);

    // Aggregate response counts grouped by UTC date (exclude PENDING)
    const rows = await Response.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        created_at: {
          [Op.between]: [rangeStart, rangeEnd],
        },
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
      group: [fn('DATE', col('created_at'))],
      raw: true,
    });

    // Build a lookup map: 'YYYY-MM-DD' -> count
    const countMap = {};
    for (const row of rows) {
      countMap[row.date] = parseInt(row.count, 10);
    }

    // Build the result array ensuring all 7 days are present (zeros for missing days)
    const trend = days.map((d) => {
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        count: countMap[dateStr] || 0,
      };
    });

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
    const rows = await Response.findAll({
      attributes: [
        'surveyor_id',
        [fn('COUNT', col('Response.id')), 'responseCount'],
      ],
      where: { questionnaire_number: { [Op.notLike]: 'PENDING-%' } },
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

    // Count total responses for this survey (exclude PENDING)
    const totalCollected = await Response.count({
      where: {
        survey_id: surveyId,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
    });

    // Count responses per surveyor (exclude PENDING)
    const responseCounts = await Response.findAll({
      attributes: ['surveyor_id', [fn('COUNT', col('id')), 'count']],
      where: {
        survey_id: surveyId,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
      group: ['surveyor_id'],
      raw: true,
    });

    const responseMap = {};
    responseCounts.forEach((r) => { responseMap[r.surveyor_id] = parseInt(r.count, 10); });

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

    res.json({
      surveyId: survey.id,
      surveyTitle: survey.title,
      totalQuota,
      totalCollected,
      completionPercentage,
      surveyors,
    });
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
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

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

    // Count today's responses per surveyor (exclude PENDING)
    const todayRows = await Response.findAll({
      attributes: ['surveyor_id', [fn('COUNT', col('id')), 'count']],
      where: {
        created_at: { [Op.between]: [todayStart, todayEnd] },
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
      group: ['surveyor_id'],
      raw: true,
    });

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

module.exports = router;
module.exports.calculatePercentage = calculatePercentage;
module.exports.calculateRemaining = calculateRemaining;
module.exports.resolveSurveyorStatus = resolveSurveyorStatus;
