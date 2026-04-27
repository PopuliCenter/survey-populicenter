'use strict';

const express = require('express');
const path = require('path');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const { stringify } = require('csv-stringify');
const { Response, Answer, Question, User, Survey, ExportJob } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const exportQueue = require('../config/queue');

const router = express.Router();

// ---------------------------------------------------------------------------
// Shared helper: build the where clause for Response queries
// ---------------------------------------------------------------------------
function buildResponseWhereClause(survey_id, { start_date, end_date, surveyor_id, geo_status, response_status }) {
  const whereClause = {
    survey_id,
  };

  // Filter by response status (committed vs pending)
  if (response_status === 'committed') {
    // Only committed responses (questionnaire_number does NOT start with 'PENDING')
    whereClause.questionnaire_number = {
      [Op.and]: [
        { [Op.ne]: 'PENDING' },
        { [Op.notLike]: 'PENDING-%' },
      ],
    };
  } else if (response_status === 'pending') {
    // Only pending responses
    whereClause.questionnaire_number = {
      [Op.or]: [
        { [Op.eq]: 'PENDING' },
        { [Op.like]: 'PENDING-%' },
      ],
    };
  } else {
    // Default: exclude all PENDING responses
    whereClause.questionnaire_number = { [Op.notLike]: 'PENDING-%' };
  }

  if (start_date || end_date) {
    whereClause.created_at = {};

    if (start_date) {
      const start = new Date(`${start_date}T00:00:00.000Z`);
      if (isNaN(start.getTime())) {
        return { error: 'Format start_date tidak valid. Gunakan YYYY-MM-DD' };
      }
      whereClause.created_at[Op.gte] = start;
    }

    if (end_date) {
      const end = new Date(`${end_date}T23:59:59.999Z`);
      if (isNaN(end.getTime())) {
        return { error: 'Format end_date tidak valid. Gunakan YYYY-MM-DD' };
      }
      whereClause.created_at[Op.lte] = end;
    }
  }

  if (surveyor_id) {
    whereClause.surveyor_id = surveyor_id;
  }

  if (geo_status) {
    whereClause.geo_status = geo_status;
  }

  return { whereClause };
}

// ---------------------------------------------------------------------------
// Shared helper: fetch responses with answers for a survey
// ---------------------------------------------------------------------------
async function fetchResponses(whereClause) {
  return Response.findAll({
    where: whereClause,
    attributes: [
      'id',
      'questionnaire_number',
      'surveyor_id',
      'start_time',
      'end_time',
      'duration_seconds',
      'latitude',
      'longitude',
      'geo_status',
      'created_at',
    ],
    include: [
      {
        model: User,
        as: 'surveyor',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: Answer,
        as: 'answers',
        attributes: ['id', 'question_id', 'answer_value', 'answer_json', 'photo_path'],
        include: [
          {
            model: Question,
            as: 'question',
            attributes: ['id', 'text', 'order_index', 'type', 'options'],
          },
        ],
      },
    ],
    order: [['created_at', 'ASC']],
  });
}

// ---------------------------------------------------------------------------
// Shared helper: build export rows from responses + ordered questions
// Returns { headers, rows }
//   headers: array of column header strings
//   rows:    array of arrays (one per response)
// ---------------------------------------------------------------------------
function buildExportData(responses, questions) {
  // Fixed metadata headers
  const metaHeaders = [
    'ID Responden',
    'Nomor Kuesioner',
    'Nama Surveyor',
    'Email Surveyor',
    'Tanggal Pengisian',
    'Waktu Mulai',
    'Waktu Selesai',
    'Durasi (detik)',
    'Latitude',
    'Longitude',
    'Geo Status',
  ];

  // Dynamic question headers (ordered by order_index)
  // For matrix questions: one column per row with header "{question.text} - {rowName}"
  const questionHeaders = [];
  for (const q of questions) {
    if (q.type === 'matrix' && q.options && Array.isArray(q.options.rows)) {
      for (const row of q.options.rows) {
        questionHeaders.push(`${q.text} - ${row}`);
      }
    } else {
      questionHeaders.push(q.text);
    }
  }
  const headers = [...metaHeaders, ...questionHeaders];

  const rows = responses.map((r) => {
    // Build a map of question_id -> answer for this response
    const answerMap = {};
    for (const a of r.answers || []) {
      if (a.question_id) {
        answerMap[a.question_id] = a;
      }
    }

    const metaValues = [
      r.id,
      r.questionnaire_number,
      r.surveyor ? r.surveyor.name : '',
      r.surveyor ? r.surveyor.email : '',
      r.created_at ? r.created_at.toISOString() : '',
      r.start_time ? r.start_time.toISOString() : '',
      r.end_time ? r.end_time.toISOString() : '',
      r.duration_seconds !== null && r.duration_seconds !== undefined ? r.duration_seconds : '',
      r.latitude !== null && r.latitude !== undefined ? parseFloat(r.latitude) : '',
      r.longitude !== null && r.longitude !== undefined ? parseFloat(r.longitude) : '',
      r.geo_status || '',
    ];

    const questionValues = [];
    for (const q of questions) {
      const answer = answerMap[q.id];

      if (q.type === 'matrix' && q.options && Array.isArray(q.options.rows)) {
        // Matrix: one value per row
        const json = answer && answer.answer_json ? answer.answer_json : {};
        for (const row of q.options.rows) {
          questionValues.push(json[row] || '');
        }
      } else if (!answer) {
        questionValues.push('');
      } else if (q.type === 'photo') {
        questionValues.push(answer.photo_path || '');
      } else if (answer.answer_json !== null && answer.answer_json !== undefined) {
        questionValues.push(
          Array.isArray(answer.answer_json)
            ? answer.answer_json.join(', ')
            : JSON.stringify(answer.answer_json)
        );
      } else {
        questionValues.push(
          answer.answer_value !== null && answer.answer_value !== undefined
            ? answer.answer_value
            : ''
        );
      }
    }

    return [...metaValues, ...questionValues];
  });

  return { headers, rows };
}

/**
 * GET /reports/surveys/:id
 * Returns a detailed report of all responses for a given survey.
 * Supports filtering by date range, surveyor, and geo_status.
 *
 * Query params:
 *   - start_date (YYYY-MM-DD): filter responses created on or after this date
 *   - end_date   (YYYY-MM-DD): filter responses created on or before this date
 *   - surveyor_id: filter by specific surveyor UUID
 *   - geo_status: filter by geo_status value
 *
 * Each response object includes:
 *   id, questionnaire_number, surveyor_id, surveyor_name, surveyor_email,
 *   start_time, end_time, duration_seconds, latitude, longitude, geo_status,
 *   created_at, answers[]
 *
 * Requires: authMiddleware + requireRole(['admin', 'supervisor', 'viewer'])
 * Requirements: 11.1, 11.7, 13.4, 15.4, 16.6
 */
router.get('/surveys/:id', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { id: survey_id } = req.params;

    // Verify the survey exists
    const survey = await Survey.findByPk(survey_id, { attributes: ['id', 'title'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const result = buildResponseWhereClause(survey_id, req.query);
    if (result.error) {
      return res.status(422).json({ error: result.error });
    }

    const responses = await fetchResponses(result.whereClause);

    const data = responses.map((r) => ({
      id: r.id,
      questionnaire_number: r.questionnaire_number,
      surveyor_id: r.surveyor_id,
      surveyor_name: r.surveyor ? r.surveyor.name : null,
      surveyor_email: r.surveyor ? r.surveyor.email : null,
      start_time: r.start_time ? r.start_time.toISOString() : null,
      end_time: r.end_time ? r.end_time.toISOString() : null,
      duration_seconds: r.duration_seconds,
      latitude: r.latitude !== null ? parseFloat(r.latitude) : null,
      longitude: r.longitude !== null ? parseFloat(r.longitude) : null,
      geo_status: r.geo_status,
      created_at: r.created_at,
      answers: (r.answers || []).map((a) => ({
        question_id: a.question_id,
        question_text: a.question ? a.question.text : null,
        answer_value: a.answer_value,
        answer_json: a.answer_json,
        photo_path: a.photo_path,
      })),
    }));

    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reports/surveys/:id/export/xlsx
 * Excel export endpoint that handles both sync (≤1000) and async (>1000) exports.
 * For ≤1000 responses: returns file immediately
 * For >1000 responses: creates async job and returns jobId
 *
 * Query params (same as GET /reports/surveys/:id):
 *   - start_date, end_date, surveyor_id, geo_status
 *
 * Columns: metadata fields + one column per question (photo questions use photo_path)
 *
 * Requires: authMiddleware + requireRole(['admin', 'supervisor', 'viewer'])
 * Requirements: 11.2, 11.3, 11.4, 11.5, 11.6
 */
router.post('/surveys/:id/export/xlsx', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { id: survey_id } = req.params;

    // Verify the survey exists
    const survey = await Survey.findByPk(survey_id, { attributes: ['id', 'title'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const whereResult = buildResponseWhereClause(survey_id, req.query);
    if (whereResult.error) {
      return res.status(422).json({ error: whereResult.error });
    }

    // Count responses first to decide sync vs async
    const count = await Response.count({ where: whereResult.whereClause });

    if (count > 1000) {
      // Create export job record
      const exportJob = await ExportJob.create({
        survey_id,
        requested_by: req.user.id,
        status: 'pending',
        format: 'xlsx',
        filters: req.query,
      });

      // Add job to Bull queue
      await exportQueue.add({
        jobId: exportJob.id,
        survey_id,
        format: 'xlsx',
        filters: req.query,
      });

      return res.status(202).json({
        message: 'Ekspor sedang diproses',
        jobId: exportJob.id,
      });
    }

    // Synchronous export for ≤1000 responses
    const questions = await Question.findAll({
      where: { survey_id },
      attributes: ['id', 'text', 'order_index', 'type', 'options'],
      order: [['order_index', 'ASC']],
    });

    const responses = await fetchResponses(whereResult.whereClause);
    const { headers, rows } = buildExportData(responses, questions);

    // Build xlsx using exceljs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan');

    // Header row with bold styling
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };

    // Data rows
    for (const row of rows) {
      worksheet.addRow(row);
    }

    // Auto-fit column widths (approximate)
    worksheet.columns.forEach((col, idx) => {
      let maxLen = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const cellLen = cell.value ? String(cell.value).length : 0;
        if (cellLen > maxLen) maxLen = cellLen;
      });
      col.width = Math.min(maxLen + 2, 60);
    });

    // Generate filename from survey title and current date
    const safeTitle = (survey.title || 'laporan').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const dateStr = new Date().toISOString().slice(0, 10);
    const exportFileName = `${safeTitle}_${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFileName}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reports/surveys/:id/export/csv
 * CSV export endpoint that handles both sync (≤1000) and async (>1000) exports.
 * For ≤1000 responses: returns file immediately
 * For >1000 responses: creates async job and returns jobId
 *
 * Query params (same as GET /reports/surveys/:id):
 *   - start_date, end_date, surveyor_id, geo_status
 *
 * Columns: metadata fields + one column per question (photo questions use photo_path)
 *
 * Requires: authMiddleware + requireRole(['admin', 'supervisor', 'viewer'])
 * Requirements: 11.2, 11.3, 11.4, 11.5, 11.6
 */
router.post('/surveys/:id/export/csv', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { id: survey_id } = req.params;

    // Verify the survey exists
    const survey = await Survey.findByPk(survey_id, { attributes: ['id', 'title'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const whereResult = buildResponseWhereClause(survey_id, req.query);
    if (whereResult.error) {
      return res.status(422).json({ error: whereResult.error });
    }

    // Count responses first to decide sync vs async
    const count = await Response.count({ where: whereResult.whereClause });

    if (count > 1000) {
      // Create export job record
      const exportJob = await ExportJob.create({
        survey_id,
        requested_by: req.user.id,
        status: 'pending',
        format: 'csv',
        filters: req.query,
      });

      // Add job to Bull queue
      await exportQueue.add({
        jobId: exportJob.id,
        survey_id,
        format: 'csv',
        filters: req.query,
      });

      return res.status(202).json({
        message: 'Ekspor sedang diproses',
        jobId: exportJob.id,
      });
    }

    // Synchronous export for ≤1000 responses
    const questions = await Question.findAll({
      where: { survey_id },
      attributes: ['id', 'text', 'order_index', 'type', 'options'],
      order: [['order_index', 'ASC']],
    });

    const responses = await fetchResponses(whereResult.whereClause);
    const { headers, rows } = buildExportData(responses, questions);

    // Generate filename from survey title and current date
    const safeTitle = (survey.title || 'laporan').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const dateStr = new Date().toISOString().slice(0, 10);
    const exportFileName = `${safeTitle}_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFileName}"`
    );

    // Use csv-stringify to stream the CSV output
    const stringifier = stringify({ header: false });
    stringifier.pipe(res);

    // Write header row first
    stringifier.write(headers);

    // Write data rows
    for (const row of rows) {
      stringifier.write(row);
    }

    stringifier.end();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reports/exports/:jobId
 * Check the status of an async export job
 * 
 * Returns:
 * {
 *   id: UUID,
 *   status: 'pending' | 'processing' | 'completed' | 'failed',
 *   format: 'xlsx' | 'csv',
 *   created_at: ISO timestamp,
 *   completed_at: ISO timestamp | null
 * }
 *
 * Requires: authMiddleware + requireRole(['admin', 'supervisor', 'viewer'])
 * Requirements: 11.5
 */
router.get('/exports/:jobId', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const exportJob = await ExportJob.findByPk(jobId, {
      attributes: ['id', 'status', 'format', 'created_at', 'completed_at'],
    });

    if (!exportJob) {
      return res.status(404).json({ error: 'Job ekspor tidak ditemukan' });
    }

    res.json({
      id: exportJob.id,
      status: exportJob.status,
      format: exportJob.format,
      created_at: exportJob.created_at,
      completed_at: exportJob.completed_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reports/exports/:jobId/download
 * Download the completed export file
 * 
 * Returns the file as attachment if status is 'completed'
 * Returns 404 if job not found or file not available
 * Returns 409 if job is not yet completed
 *
 * Requires: authMiddleware + requireRole(['admin', 'supervisor', 'viewer'])
 * Requirements: 11.5
 */
router.get('/exports/:jobId/download', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const exportJob = await ExportJob.findByPk(jobId, {
      attributes: ['id', 'status', 'format', 'file_path'],
    });

    if (!exportJob) {
      return res.status(404).json({ error: 'Job ekspor tidak ditemukan' });
    }

    if (exportJob.status !== 'completed') {
      return res.status(409).json({
        error: 'Ekspor belum selesai',
        status: exportJob.status,
      });
    }

    if (!exportJob.file_path) {
      return res.status(404).json({ error: 'File ekspor tidak ditemukan' });
    }

    const filePath = path.join(__dirname, '..', '..', exportJob.file_path);

    // Check if file exists
    const fs = require('fs').promises;
    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({ error: 'File ekspor tidak ditemukan atau sudah kedaluwarsa' });
    }

    // Set appropriate content type
    const contentType = exportJob.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="export-${jobId}.${exportJob.format}"`
    );

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
