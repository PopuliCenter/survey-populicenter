const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { Survey, Question, Response, AuditLog, sequelize } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validateFieldToolsSettings } = require('../utils/fieldToolsValidator');

const router = express.Router();

/**
 * Validasi konsistensi start_date dan end_date.
 * @param {string|null} startDate - ISO 8601 string atau null
 * @param {string|null} endDate - ISO 8601 string atau null
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSurveyDates(startDate, endDate) {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return { valid: false, error: 'Tanggal berakhir harus lebih besar dari tanggal mulai' };
    }
  }
  return { valid: true };
}

/**
 * remapSkipLogic - Memperbarui referensi question_id di dalam skip_logic
 * dari UUID pertanyaan lama ke UUID pertanyaan baru.
 *
 * @param {Array|null} skipLogic - Array skip logic dari pertanyaan sumber
 * @param {Object} idMap - Peta { oldQuestionId: newQuestionId }
 * @returns {Array|null}
 */
function remapSkipLogic(skipLogic, idMap) {
  if (!skipLogic || !Array.isArray(skipLogic)) return skipLogic;
  return skipLogic.map((rule) => ({
    ...rule,
    condition: rule.condition
      ? {
          ...rule.condition,
          question_id: idMap[rule.condition.question_id] ?? rule.condition.question_id,
        }
      : rule.condition,
    target_question_id: idMap[rule.target_question_id] ?? rule.target_question_id,
  }));
}

/**
 * GET /surveys
 * List surveys with role-based filter:
 *   - Admin/Supervisor: all surveys (draft, active, inactive)
 *   - Viewer: only active and inactive surveys (not draft)
 *   - Surveyor: only active surveys with at least 1 question
 */
router.get('/', authMiddleware, requireRole(['admin', 'supervisor', 'viewer', 'surveyor']), async (req, res, next) => {
  try {
    const { role } = req.user;

    let surveys;

    if (role === 'admin' || role === 'supervisor') {
      // Admin and supervisor see all surveys
      surveys = await Survey.findAll({
        attributes: ['id', 'title', 'description', 'status', 'start_date', 'end_date', 'created_at'],
        order: [['created_at', 'DESC']],
      });
    } else if (role === 'viewer') {
      // Viewer sees active and inactive surveys (not draft)
      surveys = await Survey.findAll({
        where: { status: ['active', 'inactive'] },
        attributes: ['id', 'title', 'description', 'status', 'start_date', 'end_date', 'created_at'],
        order: [['created_at', 'DESC']],
      });
    } else {
      // Surveyor sees only active surveys within active period
      const now = new Date();
      surveys = await Survey.findAll({
        where: {
          status: 'active',
          [Op.and]: [
            {
              [Op.or]: [
                { start_date: null },
                { start_date: { [Op.lte]: now } },
              ],
            },
            {
              [Op.or]: [
                { end_date: null },
                { end_date: { [Op.gt]: now } },
              ],
            },
          ],
        },
        attributes: ['id', 'title', 'description', 'status', 'start_date', 'end_date', 'created_at'],
        order: [['created_at', 'DESC']],
      });
    }

    // Get question counts per survey
    const surveyIds = surveys.map((s) => s.id);

    let questionCounts = [];
    let responseCounts = [];

    if (surveyIds.length > 0) {
      questionCounts = await Question.findAll({
        where: { survey_id: surveyIds },
        attributes: [
          'survey_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        group: ['survey_id'],
        raw: true,
      });

      responseCounts = await Response.findAll({
        where: {
          survey_id: surveyIds,
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
        attributes: [
          'survey_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        group: ['survey_id'],
        raw: true,
      });
    }

    const questionCountMap = {};
    questionCounts.forEach((row) => {
      questionCountMap[row.survey_id] = parseInt(row.count, 10);
    });

    const responseCountMap = {};
    responseCounts.forEach((row) => {
      responseCountMap[row.survey_id] = parseInt(row.count, 10);
    });

    // For surveyor: filter out surveys with 0 questions
    let result = surveys.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      question_count: questionCountMap[s.id] || 0,
      response_count: responseCountMap[s.id] || 0,
      start_date: s.start_date,
      end_date: s.end_date,
      created_at: s.created_at,
    }));

    if (role === 'surveyor') {
      result = result.filter((s) => s.question_count >= 1);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveys
 * Create new survey (admin only)
 * Body: { title, description }
 * Status defaults to 'draft'
 */
router.post('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { title, description, start_date, end_date } = req.body;

    // Validasi tanggal
    const dateValidation = validateSurveyDates(start_date || null, end_date || null);
    if (!dateValidation.valid) {
      return res.status(422).json({ error: dateValidation.error });
    }

    const survey = await Survey.create({
      title,
      description: description || null,
      status: 'draft',
      created_by: req.user.id,
      start_date: start_date || null,
      end_date: end_date || null,
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_SURVEY',
      entity_type: 'survey',
      entity_id: survey.id,
      old_value: null,
      new_value: { title: survey.title, description: survey.description, status: survey.status, start_date: survey.start_date, end_date: survey.end_date },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      start_date: survey.start_date,
      end_date: survey.end_date,
      field_tools_settings: survey.field_tools_settings,
      created_at: survey.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /surveys/:id
 * Get survey detail with questions
 *   - Admin/Supervisor: any survey
 *   - Viewer: any survey (active or inactive)
 *   - Surveyor: only active surveys
 */
router.get('/:id', authMiddleware, requireRole(['admin', 'supervisor', 'viewer', 'surveyor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.user;

    const whereClause = { id };
    if (role === 'surveyor') {
      whereClause.status = 'active';
    }

    const survey = await Survey.findOne({
      where: whereClause,
      attributes: ['id', 'title', 'description', 'status', 'start_date', 'end_date', 'field_tools_settings', 'form_mode', 'created_at', 'updated_at'],
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const questions = await Question.findAll({
      where: { survey_id: id },
      attributes: [
        'id', 'text', 'type', 'order_index', 'is_required',
        'randomize_options', 'allow_other', 'options', 'skip_logic', 'created_at',
      ],
      order: [['order_index', 'ASC']],
    });

    const is_expired = survey.end_date ? new Date(survey.end_date) < new Date() : false;

    res.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      start_date: survey.start_date,
      end_date: survey.end_date,
      field_tools_settings: survey.field_tools_settings,
      form_mode: survey.form_mode || 'wizard',
      is_expired,
      created_at: survey.created_at,
      updated_at: survey.updated_at,
      questions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /surveys/:id
 * Update survey (admin only)
 * Body: { title, description }
 */
router.put('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, start_date, end_date, field_tools_settings, form_mode } = req.body;

    const survey = await Survey.findOne({ where: { id } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // Validasi field_tools_settings jika dikirim
    if (field_tools_settings !== undefined) {
      const ftsValidation = validateFieldToolsSettings(field_tools_settings);
      if (!ftsValidation.valid) {
        return res.status(422).json({ error: ftsValidation.error });
      }
    }

    // Tentukan nilai final untuk validasi
    const finalStartDate = start_date !== undefined ? (start_date || null) : survey.start_date;
    const finalEndDate = end_date !== undefined ? (end_date || null) : survey.end_date;

    const dateValidation = validateSurveyDates(finalStartDate, finalEndDate);
    if (!dateValidation.valid) {
      return res.status(422).json({ error: dateValidation.error });
    }

    const oldValue = { title: survey.title, description: survey.description, status: survey.status, start_date: survey.start_date, end_date: survey.end_date, field_tools_settings: survey.field_tools_settings };

    if (title !== undefined) survey.title = title;
    if (description !== undefined) survey.description = description;
    if (start_date !== undefined) survey.start_date = start_date || null;
    if (end_date !== undefined) survey.end_date = end_date || null;
    if (field_tools_settings !== undefined) survey.field_tools_settings = field_tools_settings;
    if (form_mode !== undefined) survey.form_mode = form_mode;

    await survey.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SURVEY',
      entity_type: 'survey',
      entity_id: survey.id,
      old_value: oldValue,
      new_value: { title: survey.title, description: survey.description, status: survey.status, start_date: survey.start_date, end_date: survey.end_date, field_tools_settings: survey.field_tools_settings },
      ip_address: req.ip,
    });

    res.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      start_date: survey.start_date,
      end_date: survey.end_date,
      field_tools_settings: survey.field_tools_settings,
      form_mode: survey.form_mode,
      created_at: survey.created_at,
      updated_at: survey.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /surveys/:id/activate
 * Activate survey (admin only)
 * Change status from draft/inactive to active
 * Create PostgreSQL sequence questionnaire_seq_{survey_id_underscored}
 */
router.patch('/:id/activate', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const survey = await Survey.findOne({ where: { id } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const oldValue = { status: survey.status };

    survey.status = 'active';
    await survey.save({ fields: ['status'] });

    // Create PostgreSQL sequence for questionnaire numbering
    // Replace hyphens with underscores in survey_id
    const seqName = `questionnaire_seq_${id.replace(/-/g, '_')}`;
    await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName}`);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'ACTIVATE_SURVEY',
      entity_type: 'survey',
      entity_id: survey.id,
      old_value: oldValue,
      new_value: { status: survey.status },
      ip_address: req.ip,
    });

    res.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      created_at: survey.created_at,
      updated_at: survey.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /surveys/:id/deactivate
 * Deactivate survey (admin only)
 * Change status from active to inactive
 */
router.patch('/:id/deactivate', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const survey = await Survey.findOne({ where: { id } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const oldValue = { status: survey.status };

    survey.status = 'inactive';
    await survey.save({ fields: ['status'] });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_SURVEY',
      entity_type: 'survey',
      entity_id: survey.id,
      old_value: oldValue,
      new_value: { status: survey.status },
      ip_address: req.ip,
    });

    res.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      created_at: survey.created_at,
      updated_at: survey.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /surveys/:id
 * Delete survey (admin only)
 * Only allow deletion of draft surveys
 * Reject if survey has any responses (409)
 * Reject if survey is not draft (409)
 */
router.delete('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const survey = await Survey.findOne({ where: { id } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // Check if survey has any responses (exclude PENDING)
    const responseCount = await Response.count({
      where: {
        survey_id: id,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
    });
    if (responseCount > 0) {
      return res.status(409).json({ error: 'Survei memiliki data responden dan tidak dapat dihapus' });
    }

    // Only draft surveys can be deleted
    if (survey.status !== 'draft') {
      return res.status(409).json({ error: 'Hanya survei berstatus draft yang dapat dihapus' });
    }

    const oldValue = { title: survey.title, description: survey.description, status: survey.status };

    // Delete any stale PENDING response records for this survey before deleting the survey
    await Response.destroy({
      where: {
        survey_id: id,
        questionnaire_number: { [Op.like]: 'PENDING-%' },
      },
    });

    await survey.destroy();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_SURVEY',
      entity_type: 'survey',
      entity_id: id,
      old_value: oldValue,
      new_value: null,
      ip_address: req.ip,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveys/:id/clone
 * Clone/duplikasi survei (admin dan supervisor)
 * Membuat survei baru berstatus draft dengan semua pertanyaan dari survei sumber.
 * Skip logic di-remap agar referensi question_id menunjuk ke UUID pertanyaan baru.
 */
router.post('/:id/clone', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  const { id } = req.params;

  try {
    const result = await sequelize.transaction(async (t) => {
      // 1. Ambil survei sumber
      const source = await Survey.findOne({ where: { id }, transaction: t });
      if (!source) return null; // sinyal 404

      // 2. Buat survei baru
      const cloned = await Survey.create(
        {
          title: `Salinan dari ${source.title}`,
          description: source.description,
          status: 'draft',
          created_by: req.user.id,
          start_date: null,
          end_date: null,
          field_tools_settings: source.field_tools_settings,
        },
        { transaction: t }
      );

      // 3. Ambil semua pertanyaan sumber
      const sourceQuestions = await Question.findAll({
        where: { survey_id: id },
        order: [['order_index', 'ASC']],
        transaction: t,
      });

      // 4. Bangun peta ID lama → ID baru
      const idMap = {};
      sourceQuestions.forEach((q) => {
        idMap[q.id] = uuidv4();
      });

      // 5. Remap skip_logic dan buat pertanyaan baru
      const clonedQuestions = sourceQuestions.map((q) => ({
        id: idMap[q.id],
        survey_id: cloned.id,
        text: q.text,
        type: q.type,
        order_index: q.order_index,
        is_required: q.is_required,
        randomize_options: q.randomize_options,
        options: q.options,
        skip_logic: remapSkipLogic(q.skip_logic, idMap),
      }));

      if (clonedQuestions.length > 0) {
        await Question.bulkCreate(clonedQuestions, { transaction: t });
      }

      return { cloned, questionCount: clonedQuestions.length };
    });

    if (!result) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // 6. Audit log (di luar transaksi — setelah commit berhasil)
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CLONE_SURVEY',
      entity_type: 'survey',
      entity_id: result.cloned.id,
      old_value: {
        source_survey_id: id,
        source_survey_title: result.cloned.title.replace('Salinan dari ', ''),
      },
      new_value: {
        id: result.cloned.id,
        title: result.cloned.title,
        status: 'draft',
        question_count: result.questionCount,
      },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: result.cloned.id,
      title: result.cloned.title,
      description: result.cloned.description,
      status: result.cloned.status,
      field_tools_settings: result.cloned.field_tools_settings,
      created_at: result.cloned.created_at,
      question_count: result.questionCount,
    });
  } catch (error) {
    next(error);
  }
});

router.validateSurveyDates = validateSurveyDates;
module.exports = router;
