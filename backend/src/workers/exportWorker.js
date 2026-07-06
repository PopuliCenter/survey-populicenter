'use strict';

const path = require('path');
const fs = require('fs').promises;
const ExcelJS = require('exceljs');
const { stringify } = require('csv-stringify');
const { Op } = require('sequelize');
const { Response, Answer, Question, User, ExportJob } = require('../models');

/**
 * Build where clause for Response queries based on filters
 */
function buildResponseWhereClause(survey_id, filters = {}) {
  const whereClause = {
    survey_id,
    questionnaire_number: { [Op.notLike]: 'PENDING-%' },
  };

  if (filters.start_date || filters.end_date) {
    whereClause.created_at = {};

    if (filters.start_date) {
      const start = new Date(`${filters.start_date}T00:00:00.000Z`);
      whereClause.created_at[Op.gte] = start;
    }

    if (filters.end_date) {
      const end = new Date(`${filters.end_date}T23:59:59.999Z`);
      whereClause.created_at[Op.lte] = end;
    }
  }

  if (filters.surveyor_id) {
    whereClause.surveyor_id = filters.surveyor_id;
  }

  if (filters.geo_status) {
    whereClause.geo_status = filters.geo_status;
  }

  return whereClause;
}

/**
 * Fetch responses with answers for a survey
 */
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

/**
 * Build export data structure from responses and questions
 */
function buildExportData(responses, questions) {
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

  // Dynamic question headers
  // For matrix questions: one column per row with header "{question.text} - {rowName}"
  // For indonesia_region: one column per level (Provinsi, Kab/Kota, Kecamatan, Desa/Kelurahan)
  const questionHeaders = [];
  for (const q of questions) {
    if (q.type === 'matrix' && q.options && Array.isArray(q.options.rows)) {
      for (const row of q.options.rows) {
        questionHeaders.push(`${q.text} - ${row}`);
      }
    } else if (q.type === 'indonesia_region') {
      const depth = (q.options && q.options.depth) || 'village';
      questionHeaders.push(`${q.text} - Provinsi`);
      if (depth === 'regency' || depth === 'district' || depth === 'village') {
        questionHeaders.push(`${q.text} - Kabupaten/Kota`);
      }
      if (depth === 'district' || depth === 'village') {
        questionHeaders.push(`${q.text} - Kecamatan`);
      }
      if (depth === 'village') {
        questionHeaders.push(`${q.text} - Desa/Kelurahan`);
      }
    } else {
      questionHeaders.push(q.text);
    }
  }
  const headers = [...metaHeaders, ...questionHeaders];

  const rows = responses.map((r) => {
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
      } else if (q.type === 'indonesia_region') {
        // Wilayah Indonesia: satu kolom per tingkat wilayah sesuai depth
        const depth = (q.options && q.options.depth) || 'village';
        const v = (answer && answer.answer_json) ? answer.answer_json : {};
        questionValues.push(v.province_name || '');
        if (depth === 'regency' || depth === 'district' || depth === 'village') {
          questionValues.push(v.regency_name || '');
        }
        if (depth === 'district' || depth === 'village') {
          questionValues.push(v.district_name || '');
        }
        if (depth === 'village') {
          questionValues.push(v.village_name || '');
        }
      } else if (!answer) {
        questionValues.push('');
      } else if (q.type === 'photo') {
        questionValues.push(answer.photo_path || '');
      } else if (answer.answer_json !== null && answer.answer_json !== undefined) {
        questionValues.push(
          Array.isArray(answer.answer_json)
            ? answer.answer_json.map((v) => (typeof v === 'string' && v.startsWith('__other__:')) ? v.replace('__other__:', '') : v).join(', ')
            : JSON.stringify(answer.answer_json)
        );
      } else {
        questionValues.push(
          answer.answer_value !== null && answer.answer_value !== undefined
            ? (answer.answer_value.startsWith && answer.answer_value.startsWith('__other__:')
                ? answer.answer_value.replace('__other__:', '')
                : answer.answer_value)
            : ''
        );
      }
    }

    return [...metaValues, ...questionValues];
  });

  return { headers, rows };
}

/**
 * Generate XLSX file from export data
 */
async function generateXlsxFile(filePath, headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Laporan');

  // Header row with bold styling
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };

  // Data rows
  for (const row of rows) {
    worksheet.addRow(row);
  }

  // Auto-fit column widths
  worksheet.columns.forEach((col, idx) => {
    let maxLen = headers[idx] ? headers[idx].length : 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const cellLen = cell.value ? String(cell.value).length : 0;
      if (cellLen > maxLen) maxLen = cellLen;
    });
    col.width = Math.min(maxLen + 2, 60);
  });

  await workbook.xlsx.writeFile(filePath);
}

/**
 * Generate CSV file from export data
 */
async function generateCsvFile(filePath, headers, rows) {
  return new Promise((resolve, reject) => {
    const output = [];
    const stringifier = stringify({ header: false });

    stringifier.on('readable', () => {
      let row;
      while ((row = stringifier.read()) !== null) {
        output.push(row);
      }
    });

    stringifier.on('error', reject);
    stringifier.on('finish', async () => {
      try {
        await fs.writeFile(filePath, output.join(''));
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    // Write header
    stringifier.write(headers);

    // Write data rows
    for (const row of rows) {
      stringifier.write(row);
    }

    stringifier.end();
  });
}

/**
 * Export job processor
 * Processes async export jobs from the Bull queue
 * 
 * Job data structure:
 * {
 *   jobId: UUID,
 *   survey_id: UUID,
 *   format: 'xlsx' | 'csv',
 *   filters: { start_date?, end_date?, surveyor_id?, geo_status? }
 * }
 */
async function processExportJob(job) {
  const { jobId, survey_id, format, filters } = job.data;

  try {
    // Idempotensi: retry BullMQ tak boleh memproses ulang job yang sudah selesai.
    const existing = await ExportJob.findByPk(jobId, { attributes: ['status'] });
    if (!existing) return { success: false, skipped: 'job-record-missing' };
    if (existing.status === 'completed') return { success: true, skipped: 'already-completed' };

    // Update job status to processing
    await ExportJob.update(
      { status: 'processing' },
      { where: { id: jobId } }
    );

    // Fetch questions for the survey
    const questions = await Question.findAll({
      where: { survey_id },
      attributes: ['id', 'text', 'order_index', 'type', 'options'],
      order: [['order_index', 'ASC']],
    });

    // Build where clause and fetch responses
    const whereClause = buildResponseWhereClause(survey_id, filters);
    const responses = await fetchResponses(whereClause);

    // Build export data
    const { headers, rows } = buildExportData(responses, questions);

    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '..', '..', 'uploads', 'exports');
    await fs.mkdir(exportsDir, { recursive: true });

    // Generate file
    const fileName = `export-${jobId}.${format}`;
    const filePath = path.join(exportsDir, fileName);

    if (format === 'xlsx') {
      await generateXlsxFile(filePath, headers, rows);
    } else if (format === 'csv') {
      await generateCsvFile(filePath, headers, rows);
    } else {
      throw new Error(`Format tidak didukung: ${format}`);
    }

    // Update job status to completed
    await ExportJob.update(
      {
        status: 'completed',
        file_path: `uploads/exports/${fileName}`,
        completed_at: new Date(),
      },
      { where: { id: jobId } }
    );

    return { success: true, file_path: `uploads/exports/${fileName}` };
  } catch (error) {
    // Update job status to failed
    await ExportJob.update(
      { status: 'failed', completed_at: new Date() },
      { where: { id: jobId } }
    );

    throw error;
  }
}

module.exports = { processExportJob };
