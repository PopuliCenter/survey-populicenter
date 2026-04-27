const express = require('express');
const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// All audit log routes require authentication + admin role
router.use(authMiddleware, requireRole('admin'));

/**
 * GET /audit-logs
 * Return paginated list of audit log entries with optional filters.
 *
 * Query params:
 *   user_id      - filter by user UUID
 *   action       - filter by action string (e.g. 'LOGIN')
 *   entity_type  - filter by entity type (e.g. 'admin', 'surveyor', 'survey')
 *   start_date   - ISO date string, inclusive lower bound on created_at
 *   end_date     - ISO date string, inclusive upper bound on created_at
 *   page         - page number (default: 1)
 *   limit        - items per page (default: 50, max: 200)
 */
router.get('/', async (req, res, next) => {
  try {
    const { user_id, action, entity_type, start_date, end_date } = req.query;
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;

    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const where = {};

    if (user_id) {
      where.user_id = user_id;
    }

    if (action) {
      where.action = action;
    }

    if (entity_type) {
      where.entity_type = entity_type;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at[Op.gte] = new Date(start_date);
      }
      if (end_date) {
        // Include the entire end_date day
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        where.created_at[Op.lte] = end;
      }
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const logs = rows.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      user_name: log.user ? log.user.name : null,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      old_value: log.old_value,
      new_value: log.new_value,
      ip_address: log.ip_address,
      created_at: log.created_at,
    }));

    res.json({
      data: logs,
      pagination: {
        total: count,
        page,
        limit,
        total_pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
