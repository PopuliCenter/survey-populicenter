const express = require('express');
const { Op } = require('sequelize');
const { sequelize, Response, Answer, AuditLog, ExportJob, Survey, Question, SurveyorQuota, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { recomputeSurveyStats } = require('../utils/statisticsUpdater');

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

    const [pendingResponses, oldExportJobs, totalAuditLogs, totalResponses, inactiveSurveys, inactiveTPD] = await Promise.all([
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
      Survey.count({ where: { status: 'inactive' } }),
      User.count({ where: { role: 'surveyor', is_active: false } }),
    ]);

    res.json({
      pending_responses: pendingResponses,
      old_export_jobs: oldExportJobs,
      total_audit_logs: totalAuditLogs,
      total_committed_responses: totalResponses,
      inactive_surveys: inactiveSurveys,
      inactive_tpd: inactiveTPD,
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

    // Get IDs + survey_id for cascading delete & rekonsiliasi statistik
    const responseIds = await Response.findAll({
      where,
      attributes: ['id', 'survey_id'],
      raw: true,
    });
    const ids = responseIds.map((r) => r.id);
    const affectedSurveyIds = [...new Set(responseIds.map((r) => r.survey_id))];

    await sequelize.transaction(async (t) => {
      await Answer.destroy({ where: { response_id: { [Op.in]: ids } }, transaction: t });
      await Response.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    });

    // Hitung ulang statistik pra-hitung untuk survei terdampak agar dashboard
    // tidak "drift" (best-effort; kegagalan tidak membatalkan penghapusan).
    await Promise.allSettled(affectedSurveyIds.map((sid) => recomputeSurveyStats(sid)));

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

// ─── POST /cleanup/survey/:id ─────────────────────────────────────────────────
// Hapus survei beserta SEMUA data terkait (questions, responses, answers, quotas, export jobs)
// Hanya survei dengan status 'inactive' yang bisa dihapus
router.post('/survey/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const survey = await Survey.findByPk(id, { attributes: ['id', 'title', 'status'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    if (survey.status !== 'inactive') {
      return res.status(422).json({
        error: 'Hanya survei dengan status "Nonaktif" yang bisa dihapus. Nonaktifkan survei terlebih dahulu.',
      });
    }

    // Count related data for audit log
    const [responseCount, questionCount, quotaCount] = await Promise.all([
      Response.count({ where: { survey_id: id } }),
      Question.count({ where: { survey_id: id } }),
      SurveyorQuota.count({ where: { survey_id: id } }),
    ]);

    // Cascade delete in transaction
    await sequelize.transaction(async (t) => {
      // 1. Delete answers (via response IDs)
      const responseIds = await Response.findAll({
        where: { survey_id: id },
        attributes: ['id'],
        raw: true,
        transaction: t,
      });
      if (responseIds.length > 0) {
        await Answer.destroy({
          where: { response_id: { [Op.in]: responseIds.map((r) => r.id) } },
          transaction: t,
        });
      }

      // 2. Delete responses
      await Response.destroy({ where: { survey_id: id }, transaction: t });

      // 3. Delete export jobs
      await ExportJob.destroy({ where: { survey_id: id }, transaction: t });

      // 4. Delete quotas
      await SurveyorQuota.destroy({ where: { survey_id: id }, transaction: t });

      // 5. Delete questions
      await Question.destroy({ where: { survey_id: id }, transaction: t });

      // 6. Delete survey
      await Survey.destroy({ where: { id }, transaction: t });

      // 7. Drop questionnaire sequence if exists
      try {
        const seqName = `questionnaire_seq_${id.replace(/-/g, '_')}`;
        await sequelize.query(`DROP SEQUENCE IF EXISTS "${seqName}"`, { transaction: t });
      } catch {
        // Non-critical — sequence might not exist
      }
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_SURVEY',
      entity_type: 'survey',
      entity_id: id,
      old_value: {
        title: survey.title,
        responses_deleted: responseCount,
        questions_deleted: questionCount,
        quotas_deleted: quotaCount,
      },
      new_value: null,
      ip_address: req.ip,
    });

    res.json({
      message: `Survei "${survey.title}" beserta ${responseCount} respons, ${questionCount} pertanyaan, dan ${quotaCount} kuota berhasil dihapus.`,
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /cleanup/inactive-tpd ──────────────────────────────────────────────
// Hapus semua TPD yang sudah dinonaktifkan (is_active = false)
// Hanya TPD yang TIDAK punya respons committed yang bisa dihapus
router.post('/inactive-tpd', async (req, res, next) => {
  try {
    // Find inactive TPD
    const inactiveTPD = await User.findAll({
      where: { role: 'surveyor', is_active: false },
      attributes: ['id', 'name', 'email'],
      raw: true,
    });

    if (inactiveTPD.length === 0) {
      return res.json({ deleted_count: 0, skipped_count: 0, message: 'Tidak ada TPD nonaktif' });
    }

    // Check which ones have committed responses
    const tpdIds = inactiveTPD.map((t) => t.id);
    const tpdWithResponses = await Response.findAll({
      where: {
        surveyor_id: { [Op.in]: tpdIds },
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
      attributes: ['surveyor_id'],
      group: ['surveyor_id'],
      raw: true,
    });
    const hasResponseSet = new Set(tpdWithResponses.map((r) => r.surveyor_id));

    // Split: deletable (no responses) vs skipped (has responses)
    const deletable = inactiveTPD.filter((t) => !hasResponseSet.has(t.id));
    const skipped = inactiveTPD.filter((t) => hasResponseSet.has(t.id));

    if (deletable.length > 0) {
      const deleteIds = deletable.map((t) => t.id);
      await sequelize.transaction(async (t) => {
        // Delete pending responses
        const pendingResponseIds = await Response.findAll({
          where: { surveyor_id: { [Op.in]: deleteIds } },
          attributes: ['id'],
          raw: true,
          transaction: t,
        });
        if (pendingResponseIds.length > 0) {
          await Answer.destroy({
            where: { response_id: { [Op.in]: pendingResponseIds.map((r) => r.id) } },
            transaction: t,
          });
          await Response.destroy({
            where: { surveyor_id: { [Op.in]: deleteIds } },
            transaction: t,
          });
        }

        // Delete quotas
        await SurveyorQuota.destroy({ where: { surveyor_id: { [Op.in]: deleteIds } }, transaction: t });

        // Delete users
        await User.destroy({ where: { id: { [Op.in]: deleteIds } }, transaction: t });
      });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLEANUP_INACTIVE_TPD',
      entity_type: 'user',
      old_value: {
        deleted: deletable.map((t) => ({ name: t.name, email: t.email })),
        skipped: skipped.map((t) => ({ name: t.name, email: t.email, reason: 'has_responses' })),
      },
      new_value: null,
      ip_address: req.ip,
    });

    let message = `${deletable.length} TPD nonaktif berhasil dihapus.`;
    if (skipped.length > 0) {
      message += ` ${skipped.length} TPD dilewati karena masih memiliki data respons.`;
    }

    res.json({
      deleted_count: deletable.length,
      skipped_count: skipped.length,
      message,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
