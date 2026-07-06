'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Response, User, Survey } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { WIB_OFFSET_MS } = require('../utils/time');

const router = express.Router();

/**
 * GET /map/points
 * Returns geolocation points for displaying on an interactive map.
 * Menampilkan semua response yang punya koordinat (latitude & longitude tidak null).
 * Tidak lagi filter berdasarkan geo_status agar semua titik tampil.
 * 
 * Query params:
 *   - survey_id: filter by specific survey UUID (optional)
 *   - surveyor_id: filter by specific surveyor UUID (optional)
 *   - start_date (YYYY-MM-DD): filter responses ended on or after this date (optional)
 *   - end_date (YYYY-MM-DD): filter responses ended on or before this date (optional)
 */
router.get('/points', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id, surveyor_id, start_date, end_date } = req.query;

    // Build where clause — tampilkan semua response yang punya koordinat
    const whereClause = {
      questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      // Minimal salah satu koordinat harus ada (latitude ATAU start_latitude)
      [Op.or]: [
        {
          latitude: { [Op.ne]: null },
          longitude: { [Op.ne]: null },
        },
        {
          start_latitude: { [Op.ne]: null },
          start_longitude: { [Op.ne]: null },
        },
      ],
    };

    // Filter by survey
    if (survey_id) {
      const survey = await Survey.findByPk(survey_id, { attributes: ['id'] });
      if (!survey) {
        return res.status(404).json({ error: 'Survei tidak ditemukan' });
      }
      whereClause.survey_id = survey_id;
    }

    // Filter by surveyor/TPD
    if (surveyor_id) {
      const surveyor = await User.findOne({
        where: { id: surveyor_id, role: 'surveyor' },
        attributes: ['id'],
      });
      if (!surveyor) {
        return res.status(404).json({ error: 'TPD tidak ditemukan' });
      }
      whereClause.surveyor_id = surveyor_id;
    }

    // Filter by date range (berdasarkan end_time, bukan created_at).
    // M5: batas hari dihitung dalam WIB (bukan UTC) — konsisten dengan dashboard
    // (time.js). Tanpa ini, titik peta bisa masuk/keluar bucket tanggal salah
    // hingga 7 jam. WIB tengah malam = UTC midnight − 7 jam.
    if (start_date || end_date) {
      whereClause.end_time = {};

      if (start_date) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start_date);
        if (!m) {
          return res.status(422).json({ error: 'Format start_date tidak valid. Gunakan YYYY-MM-DD' });
        }
        whereClause.end_time[Op.gte] = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0) - WIB_OFFSET_MS);
      }

      if (end_date) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end_date);
        if (!m) {
          return res.status(422).json({ error: 'Format end_date tidak valid. Gunakan YYYY-MM-DD' });
        }
        whereClause.end_time[Op.lte] = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999) - WIB_OFFSET_MS);
      }
    }

    // Fetch responses
    const responses = await Response.findAll({
      where: whereClause,
      attributes: [
        'id',
        'latitude',
        'longitude',
        'start_latitude',
        'start_longitude',
        'geo_status',
        'questionnaire_number',
        'end_time',
        'survey_id',
      ],
      include: [
        {
          model: User,
          as: 'surveyor',
          attributes: ['name'],
        },
        {
          model: Survey,
          as: 'survey',
          attributes: ['title'],
        },
      ],
      order: [['end_time', 'DESC']],
    });

    // Format response — gunakan end-location jika ada, fallback ke start-location
    const points = responses.map((r) => {
      const lat = r.latitude != null ? parseFloat(r.latitude) : (r.start_latitude != null ? parseFloat(r.start_latitude) : null);
      const lng = r.longitude != null ? parseFloat(r.longitude) : (r.start_longitude != null ? parseFloat(r.start_longitude) : null);

      return {
        id: r.id,
        latitude: lat,
        longitude: lng,
        surveyor_name: r.surveyor ? r.surveyor.name : null,
        survey_title: r.survey ? r.survey.title : null,
        questionnaire_number: r.questionnaire_number,
        end_time: r.end_time ? r.end_time.toISOString() : null,
        geo_status: r.geo_status,
      };
    }).filter((p) => p.latitude != null && p.longitude != null);

    res.json(points);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
