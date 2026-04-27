'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Response, User, Survey } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /map/points
 * Returns geolocation points for displaying on an interactive map.
 * Only returns responses with geo_status='available'.
 * 
 * Query params:
 *   - survey_id: filter by specific survey UUID (optional)
 *   - surveyor_id: filter by specific surveyor UUID (optional)
 *   - start_date (YYYY-MM-DD): filter responses created on or after this date (optional)
 *   - end_date (YYYY-MM-DD): filter responses created on or before this date (optional)
 * 
 * Returns array of points:
 * [
 *   {
 *     id: response UUID,
 *     latitude: decimal,
 *     longitude: decimal,
 *     surveyor_name: string,
 *     questionnaire_number: string,
 *     end_time: ISO timestamp
 *   }
 * ]
 * 
 * Requires: authMiddleware + requireRole('admin')
 * Requirements: 16.7, 16.8, 16.9, 16.10
 */
router.get('/points', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { survey_id, surveyor_id, start_date, end_date } = req.query;

    // Build where clause
    const whereClause = {
      geo_status: 'available',
      latitude: { [Op.ne]: null },
      longitude: { [Op.ne]: null },
    };

    // Filter by survey
    if (survey_id) {
      // Verify survey exists
      const survey = await Survey.findByPk(survey_id, { attributes: ['id'] });
      if (!survey) {
        return res.status(404).json({ error: 'Survei tidak ditemukan' });
      }
      whereClause.survey_id = survey_id;
    }

    // Filter by surveyor
    if (surveyor_id) {
      // Verify surveyor exists
      const surveyor = await User.findOne({
        where: { id: surveyor_id, role: 'surveyor' },
        attributes: ['id'],
      });
      if (!surveyor) {
        return res.status(404).json({ error: 'Surveyor tidak ditemukan' });
      }
      whereClause.surveyor_id = surveyor_id;
    }

    // Filter by date range
    if (start_date || end_date) {
      whereClause.created_at = {};

      if (start_date) {
        const start = new Date(`${start_date}T00:00:00.000Z`);
        if (isNaN(start.getTime())) {
          return res.status(422).json({ error: 'Format start_date tidak valid. Gunakan YYYY-MM-DD' });
        }
        whereClause.created_at[Op.gte] = start;
      }

      if (end_date) {
        const end = new Date(`${end_date}T23:59:59.999Z`);
        if (isNaN(end.getTime())) {
          return res.status(422).json({ error: 'Format end_date tidak valid. Gunakan YYYY-MM-DD' });
        }
        whereClause.created_at[Op.lte] = end;
      }
    }

    // Fetch responses with available geolocation
    const responses = await Response.findAll({
      where: whereClause,
      attributes: [
        'id',
        'latitude',
        'longitude',
        'questionnaire_number',
        'end_time',
      ],
      include: [
        {
          model: User,
          as: 'surveyor',
          attributes: ['name'],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    // Format response
    const points = responses.map((r) => ({
      id: r.id,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      surveyor_name: r.surveyor ? r.surveyor.name : null,
      questionnaire_number: r.questionnaire_number,
      end_time: r.end_time ? r.end_time.toISOString() : null,
    }));

    res.json(points);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
