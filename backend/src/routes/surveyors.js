const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { Op } = require('sequelize');
const { sequelize, User, AuditLog, SurveyorQuota, Response, Survey } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePassword, validateQuota, validateEmail, validateBulkSurveyorRow, validateBulkAssignRow } = require('../utils/validators');
const { parseUploadFile } = require('../utils/fileParser');

const router = express.Router();

const SALT_ROUNDS = 12;

// Multer configuration for CSV/Excel file uploads (memory storage)
const ALLOWED_UPLOAD_MIMETYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_BULK_ROWS = 500;

const bulkUploadStorage = multer.memoryStorage();

const bulkFileFilter = (req, file, cb) => {
  if (ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('FORMAT_NOT_SUPPORTED'), false);
  }
};

const bulkUpload = multer({
  storage: bulkUploadStorage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: bulkFileFilter,
});

/**
 * GET /surveyors/:id/quota
 * Get quota summary for a TPD.
 * - Admin/Supervisor: can access any TPD's quota
 * - TPD: can only access their own quota
 */
router.get('/:id/quota', authMiddleware, requireRole(['admin', 'supervisor', 'surveyor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    // TPD can only access their own quota
    if (req.user.role === 'surveyor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
    }

    const surveyor = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!surveyor) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    // Get all quotas for this TPD, including only active surveys
    const quotas = await SurveyorQuota.findAll({
      where: { surveyor_id: id },
      include: [
        {
          model: Survey,
          as: 'survey',
          attributes: ['id', 'title', 'status'],
          where: { status: 'active' },
        },
      ],
    });

    // Get response counts per survey for this TPD (only committed, exclude PENDING)
    const surveyIds = quotas.map((q) => q.survey_id);
    let responseCounts = {};
    if (surveyIds.length > 0) {
      const counts = await Response.findAll({
        where: {
          surveyor_id: id,
          survey_id: { [Op.in]: surveyIds },
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
        attributes: [
          'survey_id',
          [Response.sequelize.fn('COUNT', Response.sequelize.col('id')), 'count'],
        ],
        group: ['survey_id'],
        raw: true,
      });
      counts.forEach((row) => {
        responseCounts[row.survey_id] = parseInt(row.count, 10);
      });
    }

    // Get submitted questionnaire numbers per survey
    // Extract suffix (unique_id part) agar cocok dengan assigned_numbers
    let submittedNumbers = {};
    if (surveyIds.length > 0) {
      const submitted = await Response.findAll({
        where: {
          surveyor_id: id,
          survey_id: { [Op.in]: surveyIds },
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        },
        attributes: ['survey_id', 'questionnaire_number'],
        raw: true,
      });
      submitted.forEach((r) => {
        if (!submittedNumbers[r.survey_id]) submittedNumbers[r.survey_id] = [];
        // Extract suffix dari format PREFIX-YYYYMMDD-SUFFIX
        const parts = r.questionnaire_number.split('-');
        const suffix = parts.length >= 3 ? parts.slice(2).join('-') : r.questionnaire_number;
        submittedNumbers[r.survey_id].push(suffix);
      });
    }

    const result = quotas.map((q) => ({
      survey_id: q.survey_id,
      survey_title: q.survey ? q.survey.title : null,
      quota: q.quota,
      filled: responseCounts[q.survey_id] || 0,
      assigned_numbers: q.assigned_numbers || null,
      submitted_numbers: submittedNumbers[q.survey_id] || [],
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /surveyors/:id/questionnaire-numbers
 * Get questionnaire numbers submitted by a TPD, grouped by survey.
 * - TPD: can only access their own data
 * - Admin/Supervisor: can access any TPD's data
 * Returns: { [survey_id]: string[] }
 */
router.get('/:id/questionnaire-numbers', authMiddleware, requireRole(['admin', 'supervisor', 'surveyor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    // TPD can only access their own data
    if (req.user.role === 'surveyor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
    }

    // Only include responses from active surveys
    const activeSurveys = await Survey.findAll({
      where: { status: 'active' },
      attributes: ['id'],
      raw: true,
    });
    const activeSurveyIds = activeSurveys.map((s) => s.id);

    const responses = await Response.findAll({
      where: {
        surveyor_id: id,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
        ...(activeSurveyIds.length > 0 ? { survey_id: { [Op.in]: activeSurveyIds } } : { survey_id: null }),
      },
      attributes: ['survey_id', 'questionnaire_number'],
      order: [['created_at', 'ASC']],
      raw: true,
    });

    // Group by survey_id
    const grouped = {};
    for (const r of responses) {
      if (!grouped[r.survey_id]) grouped[r.survey_id] = [];
      grouped[r.survey_id].push(r.questionnaire_number);
    }

    res.json(grouped);
  } catch (error) {
    next(error);
  }
});

// All remaining TPD management routes require authentication + admin or supervisor role
router.use(authMiddleware, requireRole(['admin', 'supervisor']));

/**
 * GET /surveyors
 * List all TPD (role='surveyor'), include response count per TPD
 */
router.get('/', async (req, res, next) => {
  try {
    const surveyors = await User.findAll({
      where: { role: 'surveyor' },
      attributes: ['id', 'name', 'email', 'is_active', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    // Get response counts for each TPD
    // Bug #6: hanya hitung response yang sudah selesai (bukan PENDING/sesi belum selesai)
    const surveyorIds = surveyors.map((s) => s.id);

    // Only count responses from active surveys for the surveyor management list.
    const activeSurveys = await Survey.findAll({
      where: { status: 'active' },
      attributes: ['id'],
      raw: true,
    });
    const activeSurveyIds = activeSurveys.map((survey) => survey.id);

    let responseCounts = {};
    if (surveyorIds.length > 0) {
      const counts = await Response.findAll({
        where: {
          surveyor_id: { [Op.in]: surveyorIds },
          // Hanya hitung response yang sudah selesai (end_time tidak null)
          end_time: { [Op.ne]: null },
          // Exclude sesi PENDING yang belum selesai
          questionnaire_number: { [Op.notLike]: 'PENDING-%' },
          ...(activeSurveyIds.length > 0
            ? { survey_id: { [Op.in]: activeSurveyIds } }
            : { survey_id: null }),
        },
        attributes: [
          'surveyor_id',
          [Response.sequelize.fn('COUNT', Response.sequelize.col('id')), 'count'],
        ],
        group: ['surveyor_id'],
        raw: true,
      });
      counts.forEach((row) => {
        responseCounts[row.surveyor_id] = parseInt(row.count, 10);
      });
    }

    // Ambil penugasan survei (kuota) tiap TPD agar frontend bisa mengelompokkan
    // / menyaring TPD per survei dan menghitung jumlah TPD per survei.
    let quotasBySurveyor = {};
    if (surveyorIds.length > 0) {
      const allQuotas = await SurveyorQuota.findAll({
        where: { surveyor_id: { [Op.in]: surveyorIds } },
        attributes: ['surveyor_id', 'survey_id', 'quota'],
        raw: true,
      });
      for (const q of allQuotas) {
        if (!quotasBySurveyor[q.surveyor_id]) quotasBySurveyor[q.surveyor_id] = [];
        quotasBySurveyor[q.surveyor_id].push({ survey_id: q.survey_id, quota: q.quota });
      }
    }

    const result = surveyors.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      is_active: s.is_active,
      created_at: s.created_at,
      response_count: responseCounts[s.id] || 0,
      quotas: quotasBySurveyor[s.id] || [],
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveyors
 * Create a new TPD account
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, survey_id, quota } = req.body;

    // Validate password
    if (!validatePassword(password)) {
      return res.status(422).json({
        error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
      });
    }

    // Validate quota if provided
    if (survey_id && quota !== undefined) {
      const q = Number(quota);
      if (!Number.isInteger(q) || q <= 0) {
        return res.status(422).json({
          error: 'Kuota harus berupa bilangan bulat positif lebih dari 0',
        });
      }
    }

    // Check for duplicate email
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    // If survey_id provided, verify it exists
    if (survey_id) {
      const survey = await Survey.findByPk(survey_id);
      if (!survey) {
        return res.status(404).json({ error: 'Survei tidak ditemukan' });
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create TPD
    const surveyor = await User.create({
      name,
      email,
      password_hash,
      role: 'surveyor',
      is_active: true,
    });

    // If survey_id and quota provided, create TPDQuota record
    if (survey_id && quota) {
      await SurveyorQuota.create({
        survey_id,
        surveyor_id: surveyor.id,
        quota: Number(quota),
      });
    }

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_SURVEYOR',
      entity_type: 'surveyor',
      entity_id: surveyor.id,
      old_value: null,
      new_value: { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: surveyor.id,
      name: surveyor.name,
      email: surveyor.email,
      is_active: surveyor.is_active,
      created_at: surveyor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /surveyors/:id
 * Update surveyor data (name, email, optionally password)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const surveyor = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!surveyor) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    // Save old values for audit log
    const oldValue = { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active };

    // Check for duplicate email (exclude current surveyor)
    if (email && email !== surveyor.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'Email sudah terdaftar' });
      }
    }

    // Validate and hash new password if provided
    if (password !== undefined && password !== null && password !== '') {
      if (!validatePassword(password)) {
        return res.status(422).json({
          error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
        });
      }
      surveyor.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Update fields
    if (name !== undefined) surveyor.name = name;
    if (email !== undefined) surveyor.email = email;

    await surveyor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SURVEYOR',
      entity_type: 'surveyor',
      entity_id: surveyor.id,
      old_value: oldValue,
      new_value: { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: surveyor.id,
      name: surveyor.name,
      email: surveyor.email,
      is_active: surveyor.is_active,
      created_at: surveyor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /surveyors/:id/deactivate
 * Deactivate a surveyor account
 */
router.patch('/:id/deactivate', async (req, res, next) => {
  try {
    const { id } = req.params;

    const surveyor = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!surveyor) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    const oldValue = { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active };

    surveyor.is_active = false;
    await surveyor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_SURVEYOR',
      entity_type: 'surveyor',
      entity_id: surveyor.id,
      old_value: oldValue,
      new_value: { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: surveyor.id,
      name: surveyor.name,
      email: surveyor.email,
      is_active: surveyor.is_active,
      created_at: surveyor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /surveyors/:id/activate
 * Activate a surveyor account
 */
router.patch('/:id/activate', async (req, res, next) => {
  try {
    const { id } = req.params;

    const surveyor = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!surveyor) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    const oldValue = { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active };

    surveyor.is_active = true;
    await surveyor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'ACTIVATE_SURVEYOR',
      entity_type: 'surveyor',
      entity_id: surveyor.id,
      old_value: oldValue,
      new_value: { name: surveyor.name, email: surveyor.email, is_active: surveyor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: surveyor.id,
      name: surveyor.name,
      email: surveyor.email,
      is_active: surveyor.is_active,
      created_at: surveyor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /surveyors/:id
 * Permanently delete a surveyor account (admin only)
 */
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Self-delete guard
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menghapus akun sendiri' });
    }

    const user = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!user) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    // Snapshot old value before deletion
    const old_value = {
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    };

    // Create audit log BEFORE deletion — if this fails, do NOT delete
    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_SURVEYOR',
        entity_type: 'surveyor',
        entity_id: user.id,
        old_value,
        new_value: null,
        ip_address: req.ip,
      });
    } catch (auditError) {
      return res.status(500).json({ error: 'Terjadi kesalahan internal' });
    }

    // Permanently delete the user (surveyor_quotas cascade deleted automatically)
    try {
      await user.destroy();
    } catch (destroyError) {
      // Constraint violation — check by error name or PostgreSQL error code
      const pgCode = destroyError.parent?.code || destroyError.original?.code;
      const isFkError =
        destroyError.name === 'SequelizeForeignKeyConstraintError' ||
        pgCode === '23503' ||
        pgCode === '23001';
      if (isFkError) {
        return res.status(409).json({ error: 'Akun tidak dapat dihapus karena masih memiliki data terkait' });
      }
      throw destroyError;
    }

    res.json({ message: `Akun ${old_value.name} berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveyors/:id/quota
 * Create or update quota for a surveyor on a specific survey (upsert)
 * Body: { survey_id, quota, assigned_numbers? }
 * assigned_numbers: array of string nomor kuesioner yang ditugaskan, e.g. ["001","002"]
 */
router.post('/:id/quota', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { survey_id, quota, assigned_numbers } = req.body;

    const surveyor = await User.findOne({ where: { id, role: 'surveyor' } });
    if (!surveyor) {
      return res.status(404).json({ error: 'TPD tidak ditemukan' });
    }

    // Validate quota: must be a positive integer > 0
    if (!validateQuota(quota)) {
      return res.status(422).json({
        error: 'Kuota harus berupa bilangan bulat positif lebih dari 0',
      });
    }

    // Validate assigned_numbers if provided
    if (assigned_numbers !== undefined && assigned_numbers !== null) {
      if (!Array.isArray(assigned_numbers)) {
        return res.status(422).json({ error: 'assigned_numbers harus berupa array' });
      }
      for (const num of assigned_numbers) {
        if (typeof num !== 'string' || num.trim() === '') {
          return res.status(422).json({ error: 'Setiap nomor kuesioner harus berupa string tidak kosong' });
        }
      }
      // Check for duplicates
      const unique = new Set(assigned_numbers.map((n) => n.trim()));
      if (unique.size !== assigned_numbers.length) {
        return res.status(422).json({ error: 'Nomor kuesioner tidak boleh duplikat' });
      }
    }

    // Upsert: create or update quota record
    const [quotaRecord, created] = await SurveyorQuota.findOrCreate({
      where: { survey_id, surveyor_id: id },
      defaults: {
        survey_id,
        surveyor_id: id,
        quota,
        assigned_numbers: assigned_numbers || null,
      },
    });

    if (!created) {
      quotaRecord.quota = quota;
      if (assigned_numbers !== undefined) {
        quotaRecord.assigned_numbers = assigned_numbers && assigned_numbers.length > 0
          ? assigned_numbers.map((n) => n.trim())
          : null;
      }
      await quotaRecord.save();
    }

    res.status(created ? 201 : 200).json({
      id: quotaRecord.id,
      survey_id: quotaRecord.survey_id,
      surveyor_id: quotaRecord.surveyor_id,
      quota: quotaRecord.quota,
      assigned_numbers: quotaRecord.assigned_numbers,
      created_at: quotaRecord.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveyors/bulk-upload
 * Bulk create surveyor accounts from CSV/Excel file.
 * Requires admin or supervisor role.
 * File columns: nama, email, password
 * Max 500 rows. Atomic: all-or-nothing.
 */
router.post('/bulk-upload', (req, res, next) => {
  bulkUpload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(422).json({ error: 'Ukuran file melebihi batas maksimal' });
      }
      if (err.message === 'FORMAT_NOT_SUPPORTED') {
        return res.status(422).json({ error: 'Format file tidak didukung. Gunakan file CSV (.csv) atau Excel (.xlsx)' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(422).json({ error: 'File tidak ditemukan dalam request' });
    }

    try {
      // Parse file
      const { rows, errors: parseErrors } = await parseUploadFile(
        req.file.buffer,
        req.file.mimetype,
        ['nama', 'email', 'password']
      );

      if (parseErrors.length > 0) {
        return res.status(422).json({ errors: parseErrors.map((msg) => ({ row: 0, message: msg })) });
      }

      if (rows.length === 0) {
        return res.status(422).json({ error: 'File tidak mengandung data' });
      }

      if (rows.length > MAX_BULK_ROWS) {
        return res.status(422).json({ error: `Jumlah baris melebihi batas maksimal ${MAX_BULK_ROWS}` });
      }

      // Validate each row
      const rowErrors = [];
      const emailsInFile = new Set();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2

        const { valid, errors: fieldErrors } = validateBulkSurveyorRow(row);

        if (!valid) {
          fieldErrors.forEach((msg) => rowErrors.push({ row: rowNum, message: msg }));
        }

        // Check for duplicate emails within the file
        if (row.email) {
          const emailLower = row.email.trim().toLowerCase();
          if (emailsInFile.has(emailLower)) {
            rowErrors.push({ row: rowNum, message: 'Email duplikat dalam file' });
          } else {
            emailsInFile.add(emailLower);
          }
        }
      }

      // Check for existing emails in database
      const allEmails = rows
        .filter((r) => r.email && validateEmail(r.email))
        .map((r) => r.email.trim().toLowerCase());

      if (allEmails.length > 0) {
        const existingUsers = await User.findAll({
          where: { email: { [Op.in]: allEmails } },
          attributes: ['email'],
          raw: true,
        });

        const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

        for (let i = 0; i < rows.length; i++) {
          if (rows[i].email && existingEmailSet.has(rows[i].email.trim().toLowerCase())) {
            rowErrors.push({ row: i + 2, message: 'Email sudah terdaftar' });
          }
        }
      }

      if (rowErrors.length > 0) {
        return res.status(422).json({ errors: rowErrors });
      }

      // All valid — create all accounts in a single transaction
      const createdEmails = [];
      await sequelize.transaction(async (t) => {
        for (const row of rows) {
          const password_hash = await bcrypt.hash(row.password, SALT_ROUNDS);
          await User.create(
            {
              name: row.nama.trim(),
              email: row.email.trim().toLowerCase(),
              password_hash,
              role: 'surveyor',
              is_active: true,
            },
            { transaction: t }
          );
          createdEmails.push(row.email.trim().toLowerCase());
        }
      });

      res.status(201).json({
        created_count: createdEmails.length,
        emails: createdEmails,
      });
    } catch (error) {
      next(error);
    }
  });
});

/**
 * POST /surveyors/bulk-assign/:surveyId
 * Bulk assign surveyors to a survey with quotas from CSV/Excel file.
 * Requires admin or supervisor role.
 * File columns: email_surveyor, kuota
 * Atomic: all-or-nothing.
 */
router.post('/bulk-assign/:surveyId', (req, res, next) => {
  bulkUpload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(422).json({ error: 'Ukuran file melebihi batas maksimal' });
      }
      if (err.message === 'FORMAT_NOT_SUPPORTED') {
        return res.status(422).json({ error: 'Format file tidak didukung. Gunakan file CSV (.csv) atau Excel (.xlsx)' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(422).json({ error: 'File tidak ditemukan dalam request' });
    }

    try {
      const { surveyId } = req.params;

      // Verify survey exists
      const survey = await Survey.findOne({ where: { id: surveyId } });
      if (!survey) {
        return res.status(404).json({ error: 'Survei tidak ditemukan' });
      }

      // Parse file
      const { rows, errors: parseErrors } = await parseUploadFile(
        req.file.buffer,
        req.file.mimetype,
        ['email_surveyor', 'kuota']
      );

      if (parseErrors.length > 0) {
        return res.status(422).json({ errors: parseErrors.map((msg) => ({ row: 0, message: msg })) });
      }

      if (rows.length === 0) {
        return res.status(422).json({ error: 'File tidak mengandung data' });
      }

      if (rows.length > MAX_BULK_ROWS) {
        return res.status(422).json({ error: `Jumlah baris melebihi batas maksimal ${MAX_BULK_ROWS}` });
      }

      // Validate each row
      const rowErrors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const { valid, errors: fieldErrors } = validateBulkAssignRow(row);

        if (!valid) {
          fieldErrors.forEach((msg) => rowErrors.push({ row: rowNum, message: msg }));
        }
      }

      // Verify all emails exist as active surveyors
      const allEmails = rows
        .filter((r) => r.email_surveyor && r.email_surveyor.trim() !== '')
        .map((r) => r.email_surveyor.trim().toLowerCase());

      let surveyorMap = {};
      if (allEmails.length > 0) {
        const existingSurveyors = await User.findAll({
          where: {
            email: { [Op.in]: allEmails },
            role: 'surveyor',
            is_active: true,
          },
          attributes: ['id', 'email'],
          raw: true,
        });

        existingSurveyors.forEach((s) => {
          surveyorMap[s.email.toLowerCase()] = s.id;
        });

        for (let i = 0; i < rows.length; i++) {
          const email = rows[i].email_surveyor ? rows[i].email_surveyor.trim().toLowerCase() : '';
          if (email && !surveyorMap[email]) {
            rowErrors.push({ row: i + 2, message: 'Surveyor dengan email ini tidak ditemukan atau tidak aktif' });
          }
        }
      }

      if (rowErrors.length > 0) {
        return res.status(422).json({ errors: rowErrors });
      }

      // All valid — upsert all quotas in a single transaction
      let assignedCount = 0;
      await sequelize.transaction(async (t) => {
        for (const row of rows) {
          const email = row.email_surveyor.trim().toLowerCase();
          const surveyorId = surveyorMap[email];
          const kuotaValue = parseInt(row.kuota, 10);

          const [quotaRecord, created] = await SurveyorQuota.findOrCreate({
            where: { survey_id: surveyId, surveyor_id: surveyorId },
            defaults: { survey_id: surveyId, surveyor_id: surveyorId, quota: kuotaValue },
            transaction: t,
          });

          if (!created) {
            quotaRecord.quota = kuotaValue;
            await quotaRecord.save({ transaction: t });
          }

          assignedCount++;
        }
      });

      res.status(201).json({ assigned_count: assignedCount });
    } catch (error) {
      next(error);
    }
  });
});

module.exports = router;
