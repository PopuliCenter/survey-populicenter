'use strict';

/**
 * statisticsUpdater.js
 *
 * Utility untuk update tabel survey_statistics dan surveyor_statistics
 * secara inkremental setiap ada response baru atau dihapus.
 *
 * Dipanggil dari routes/responses.js setelah submit/delete berhasil.
 * Menggunakan UPSERT (INSERT ON CONFLICT UPDATE) agar atomic dan race-safe.
 */

const { sequelize } = require('../models');

/**
 * Increment statistik setelah response baru berhasil disimpan.
 *
 * @param {string} surveyId
 * @param {string} surveyorId
 */
async function incrementResponseStats(surveyId, surveyorId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Update survey_statistics (upsert)
  await sequelize.query(`
    INSERT INTO survey_statistics (survey_id, total_responses, today_responses, today_date, last_response_at, updated_at)
    VALUES (:surveyId, 1, 1, :today, NOW(), NOW())
    ON CONFLICT (survey_id) DO UPDATE SET
      total_responses = survey_statistics.total_responses + 1,
      today_responses = CASE
        WHEN survey_statistics.today_date = :today THEN survey_statistics.today_responses + 1
        ELSE 1
      END,
      today_date = :today,
      last_response_at = NOW(),
      updated_at = NOW();
  `, {
    replacements: { surveyId, today },
    type: sequelize.QueryTypes.RAW,
  });

  // Update surveyor_statistics (upsert)
  await sequelize.query(`
    INSERT INTO surveyor_statistics (survey_id, surveyor_id, total_responses, today_responses, today_date, updated_at)
    VALUES (:surveyId, :surveyorId, 1, 1, :today, NOW())
    ON CONFLICT ON CONSTRAINT uq_surveyor_statistics_survey_surveyor DO UPDATE SET
      total_responses = surveyor_statistics.total_responses + 1,
      today_responses = CASE
        WHEN surveyor_statistics.today_date = :today THEN surveyor_statistics.today_responses + 1
        ELSE 1
      END,
      today_date = :today,
      updated_at = NOW();
  `, {
    replacements: { surveyId, surveyorId, today },
    type: sequelize.QueryTypes.RAW,
  });
}

/**
 * Decrement statistik setelah response dihapus.
 *
 * @param {string} surveyId
 * @param {string} surveyorId
 */
async function decrementResponseStats(surveyId, surveyorId) {
  await sequelize.query(`
    UPDATE survey_statistics
    SET total_responses = GREATEST(0, total_responses - 1),
        updated_at = NOW()
    WHERE survey_id = :surveyId;
  `, {
    replacements: { surveyId },
    type: sequelize.QueryTypes.RAW,
  });

  await sequelize.query(`
    UPDATE surveyor_statistics
    SET total_responses = GREATEST(0, total_responses - 1),
        updated_at = NOW()
    WHERE survey_id = :surveyId AND surveyor_id = :surveyorId;
  `, {
    replacements: { surveyId, surveyorId },
    type: sequelize.QueryTypes.RAW,
  });
}

/**
 * Get pre-computed stats for dashboard (menggantikan COUNT query berat).
 *
 * @param {string[]} surveyIds - Array of survey UUIDs
 * @returns {{ totalResponses: number, todayResponses: number }}
 */
async function getDashboardStats(surveyIds) {
  if (!surveyIds || surveyIds.length === 0) {
    return { totalResponses: 0, todayResponses: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [rows] = await sequelize.query(`
    SELECT
      COALESCE(SUM(total_responses), 0) as total,
      COALESCE(SUM(CASE WHEN today_date = :today THEN today_responses ELSE 0 END), 0) as today
    FROM survey_statistics
    WHERE survey_id IN (:surveyIds);
  `, {
    replacements: { surveyIds, today },
    type: sequelize.QueryTypes.SELECT,
  });

  return {
    totalResponses: parseInt(rows?.total || 0, 10),
    todayResponses: parseInt(rows?.today || 0, 10),
  };
}

/**
 * Get per-surveyor response counts for a survey (menggantikan GROUP BY query).
 *
 * @param {string} surveyId
 * @returns {Object.<string, number>} Map of surveyor_id → total_responses
 */
async function getSurveyorResponseCounts(surveyId) {
  const rows = await sequelize.query(`
    SELECT surveyor_id, total_responses
    FROM surveyor_statistics
    WHERE survey_id = :surveyId;
  `, {
    replacements: { surveyId },
    type: sequelize.QueryTypes.SELECT,
  });

  const map = {};
  for (const row of rows) {
    map[row.surveyor_id] = parseInt(row.total_responses, 10);
  }
  return map;
}

module.exports = {
  incrementResponseStats,
  decrementResponseStats,
  getDashboardStats,
  getSurveyorResponseCounts,
};
