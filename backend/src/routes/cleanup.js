const express = require('express');
const { Op } = require('sequelize');
const { sequelize, Response, Answer, AuditLog, ExportJob, Survey } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// All cleanup routes require admin role
router.use(authMiddleware, requireRole('admin'));

// ─── Helper: build date range filter ──────────────────────────────────────────
function buildDateFilter(field, { year, month, before_date }) {
  const conditions = {};

  if (year && month) {
    const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const end = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
    conditions[field] = { [Op.between]: [start, end] };
  } else if (year) {
    const start = new Date(Date.UTC(Number(year), 0, 1));
    const end = new Date(Date.UTC(Number(year), 11, 31, 23, 59, 59, 999));
    conditions[field] = { [Op.between]: [start, end] };
  } else if (before_date) {
    const cutoff = new Date(`${before_date}T23:59:59.999Z`);
    if (isNaN(cutoff.getTime())) {
      return { error: 'Format before_date tidak valid. Gunakan YYYY-MM-DD' };
    }
    conditions[field] = { [Op.lte]: cutoff };
  }

  return { conditions };
}

// ─── GET /cleanup/stats ───────────────────────────────────────────────────────
// Returns counts of cleanable data for preview
router.get('/stats', async (req, res, next) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [pendingResponses, oldExportJobs, totalAuditLogs, totalResponses] = await Promise.all([
      Response.count({
        where: {
          questionnaire_number: { [Op.or]: [{ [Op.eq]: 'PENDING' }, { [Op.like]: 'PENDING-%' }] },
          created_at: { [Op.lte]: oneDayAgo },
        },
      }),
      ExportJob.count({
        where: {
          created_at: { [Op.lte]: sevenDaysAgo },
        },
      }),
      AuditLog.count(),
      Response.count({
        where: {
          questionnaire_number: { [Op.and]: [{ [Op.ne]: 'PENDING' }, { [Op.notLike]: 'PENDING-%' }] },
        },
      }),
    ]);

    res.json({
      pending_responses: pendingResponses,
      old_export_jobs: oldExportJobs,
      total_audit_logs: totalAuditLogs,
      total_committed_responses: totalResponses,
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/pending-responses ──────────────────────────────────────────
// Auto cleanup: delete PENDING responses older than 24 hours
router.post('/pending-responses', async (req, res, next) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pendingWhere = {
      questionnaire_number: { [Op.or]: [{ [Op.eq]: 'PENDING' }, { [Op.like]: 'PENDING-%' }] },
      created_at: { [Op.lte]: oneDayAgo },
    };

    // Delete answers first (FK constraint), then responses
    const pendingIds = await Response.findAll({
      where: pendingWhere,
      attributes: ['id'],
      raw: true,
    });

    const ids = pendingIds.map((r) => r.id);

    if (ids.length === 0) {
      return res.json({ deleted_count: 0, message: 'Tidak ada respons pending yang perlu dibersihkan' });
    }

    await sequelize.transaction(async (t) => {
      await Answer.destroy({ where: { response_id: { [Op.in]: ids } }, transaction: t });
      await Response.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    });

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_PENDING_RESPONSES',
      entity_type: 'response',
      old_value: { count: ids.length },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({ deleted_count: ids.length, message: `${ids.length} respons pending berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/export-jobs ────────────────────────────────────────────────
// Auto cleanup: delete export jobs older than 7 days
router.post('/export-jobs', async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const deleted = await ExportJob.destroy({
      where: { created_at: { [Op.lte]: sevenDaysAgo } },
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_EXPORT_JOBS',
      entity_type: 'export_job',
      old_value: { count: deleted },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({ deleted_count: deleted, message: `${deleted} job ekspor lama berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/audit-logs ─────────────────────────────────────────────────
// Manual cleanup: delete audit logs with filters (year, month, before_date)
router.post('/audit-logs', async (req, res, next) => {
  try {
    const { year, month, before_date } = req.body;

    if (!year && !before_date) {
      return res.status(422).json({ error: 'Tentukan tahun (year) atau tanggal batas (before_date)' });
    }

    const { conditions, error: dateError } = buildDateFilter('created_at', { year, month, before_date });
    if (dateError) return res.status(422).json({ error: dateError });

    const deleted = await AuditLog.destroy({ where: conditions });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_AUDIT_LOGS',
      entity_type: 'audit_log',
      old_value: { count: deleted, filters: { year, month, before_date } },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({ deleted_count: deleted, message: `${deleted} log audit berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/responses ──────────────────────────────────────────────────
// Manual cleanup: delete committed responses with filters (survey_id, year, month, before_date)
router.post('/responses', async (req, res, next) => {
  try {
    const { survey_id, year, month, before_date } = req.body;

    if (!survey_id && !year && !before_date) {
      return res.status(422).json({ error: 'Tentukan minimal satu filter: survey_id, year, atau before_date' });
    }

    const where = {
      // Only committed responses
      questionnaire_number: { [Op.and]: [{ [Op.ne]: 'PENDING' }, { [Op.notLike]: 'PENDING-%' }] },
    };

    if (survey_id) {
      where.survey_id = survey_id;
    }

    if (year || before_date) {
      const { conditions, error: dateError } = buildDateFilter('created_at', { year, month, before_date });
      if (dateError) return res.status(422).json({ error: dateError });
      Object.assign(where, conditions);
    }

    // Count first for confirmation
    const count = await Response.count({ where });

    if (count === 0) {
      return res.json({ deleted_count: 0, message: 'Tidak ada respons yang cocok dengan filter' });
    }

    // Get IDs for cascading delete
    const responseIds = await Response.findAll({
      where,
      attributes: ['id'],
      raw: true,
    });
    const ids = responseIds.map((r) => r.id);

    await sequelize.transaction(async (t) => {
      await Answer.destroy({ where: { response_id: { [Op.in]: ids } }, transaction: t });
      await Response.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_RESPONSES',
      entity_type: 'response',
      old_value: { count: ids.length, filters: { survey_id, year, month, before_date } },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({ deleted_count: ids.length, message: `${ids.length} respons berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/responses/preview ──────────────────────────────────────────
// Preview: count how many responses match the filter before deleting
router.post('/responses/preview', async (req, res, next) => {
  try {
    const { survey_id, year, month, before_date } = req.body;

    const where = {
      questionnaire_number: { [Op.and]: [{ [Op.ne]: 'PENDING' }, { [Op.notLike]: 'PENDING-%' }] },
    };

    if (survey_id) where.survey_id = survey_id;

    if (year || before_date) {
      const { conditions, error: dateError } = buildDateFilter('created_at', { year, month, before_date });
      if (dateError) return res.status(422).json({ error: dateError });
      Object.assign(where, conditions);
    }

    const count = await Response.count({ where });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
