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
const { wibDateString } = require('./time');
const redis = require('../config/redis');

// M6: set Redis berisi survey_id yang statistiknya perlu dihitung ulang karena
// increment fire-and-forget gagal. Maintenance men-drain-nya (heal terarah &
// cepat), selain reconcile berkala penuh.
const STATS_DIRTY_KEY = 'stats:dirty';

/** Tandai survei perlu recompute (gagal-aman bila Redis mati). */
async function markStatsDirty(surveyId) {
  if (!surveyId) return;
  try { await redis.sadd(STATS_DIRTY_KEY, String(surveyId)); } catch { /* abaikan */ }
}

/**
 * Increment statistik setelah response baru berhasil disimpan.
 *
 * @param {string} surveyId
 * @param {string} surveyorId
 */
async function incrementResponseStats(surveyId, surveyorId) {
  const today = wibDateString(); // tanggal WIB (YYYY-MM-DD)

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
 * Hitung ulang (reconcile) statistik sebuah survei dari tabel `responses`.
 * Dipakai setelah penghapusan massal (cleanup) agar statistik pra-hitung tidak
 * "drift" (membengkak). Idempoten & menyembuhkan drift yang mungkin sudah ada.
 *
 * @param {string} surveyId
 */
async function recomputeSurveyStats(surveyId) {
  const today = wibDateString();

  await sequelize.transaction(async (t) => {
    // survey_statistics: total + today (hari WIB) dari data nyata
    await sequelize.query(`
      INSERT INTO survey_statistics (survey_id, total_responses, today_responses, today_date, last_response_at, updated_at)
      SELECT
        :surveyId,
        COUNT(*) FILTER (WHERE questionnaire_number NOT LIKE 'PENDING-%'),
        COUNT(*) FILTER (
          WHERE questionnaire_number NOT LIKE 'PENDING-%'
            AND to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = :today
        ),
        :today,
        MAX(created_at) FILTER (WHERE questionnaire_number NOT LIKE 'PENDING-%'),
        NOW()
      FROM responses
      WHERE survey_id = :surveyId
      ON CONFLICT (survey_id) DO UPDATE SET
        total_responses = EXCLUDED.total_responses,
        today_responses = EXCLUDED.today_responses,
        today_date = EXCLUDED.today_date,
        last_response_at = EXCLUDED.last_response_at,
        updated_at = NOW();
    `, { replacements: { surveyId, today }, type: sequelize.QueryTypes.RAW, transaction: t });

    // surveyor_statistics: ganti seluruh baris survei ini dengan agregat nyata
    await sequelize.query(
      `DELETE FROM surveyor_statistics WHERE survey_id = :surveyId;`,
      { replacements: { surveyId }, type: sequelize.QueryTypes.RAW, transaction: t }
    );
    await sequelize.query(`
      INSERT INTO surveyor_statistics (survey_id, surveyor_id, total_responses, today_responses, today_date, updated_at)
      SELECT
        :surveyId,
        surveyor_id,
        COUNT(*),
        COUNT(*) FILTER (WHERE to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = :today),
        :today,
        NOW()
      FROM responses
      WHERE survey_id = :surveyId AND questionnaire_number NOT LIKE 'PENDING-%'
      GROUP BY surveyor_id;
    `, { replacements: { surveyId, today }, type: sequelize.QueryTypes.RAW, transaction: t });
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

  const today = wibDateString();

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

/**
 * M6: proses semua survei "dirty" — recompute statistiknya lalu buang dari set.
 * Yang gagal recompute dibiarkan di set untuk siklus berikutnya. Gagal-aman.
 * @returns {Promise<number>} jumlah survei yang berhasil di-recompute
 */
async function drainDirtyStats() {
  let ids = [];
  try { ids = await redis.smembers(STATS_DIRTY_KEY); } catch { return 0; }
  let ok = 0;
  for (const id of ids) {
    try {
      await recomputeSurveyStats(id);
      await redis.srem(STATS_DIRTY_KEY, id);
      ok += 1;
    } catch (err) {
      console.error('[Stats] drain recompute gagal untuk survey', id, ':', err.message);
    }
  }
  return ok;
}

module.exports = {
  incrementResponseStats,
  recomputeSurveyStats,
  getDashboardStats,
  getSurveyorResponseCounts,
  markStatsDirty,
  drainDirtyStats,
};
