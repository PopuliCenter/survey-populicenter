const express = require('express');
const { Op } = require('sequelize');
const { Survey, Question, sequelize } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validateSkipLogicNoCycles } = require('../utils/skipLogicValidator');
const { validateRandomizeOrderState, EXCLUDED_TYPES: RANDOMIZE_EXCLUDED_TYPES } = require('../utils/randomizeOrderValidator');
const { validateValidationConfig } = require('../utils/validationConfigValidator');
const { validateDateFormat } = require('../utils/validators');

const router = express.Router();

/**
 * Keadaan ringkas seluruh pertanyaan survei — bahan validasi aturan blok acak
 * urutan vs skip logic (lihat utils/randomizeOrderValidator).
 */
async function loadRandomizeOrderState(surveyId) {
  return Question.findAll({
    where: { survey_id: surveyId },
    attributes: ['id', 'type', 'order_index', 'randomize_order', 'skip_logic', 'auto_fill'],
    raw: true,
  });
}

const VALID_QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'long_text',
  'numeric_scale',
  'date',
  'photo',
  'rating_scale',
  'phone_number',
  'unique_id',
  'time',
  'matrix',
  'indonesia_region',
];

/**
 * Validasi konfigurasi options untuk tipe rating_scale.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRatingConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Konfigurasi rating (options) wajib diisi untuk tipe rating_scale' };
  }
  const { min, max, display } = options;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return { valid: false, error: 'Nilai min dan max harus berupa bilangan bulat' };
  }
  if (min < 1) {
    return { valid: false, error: 'Nilai min harus minimal 1' };
  }
  if (max > 10) {
    return { valid: false, error: 'Nilai max tidak boleh lebih dari 10' };
  }
  if (max <= min) {
    return { valid: false, error: 'Nilai max harus lebih besar dari min' };
  }
  if (display !== 'stars' && display !== 'numbers') {
    return { valid: false, error: "Display harus 'stars' atau 'numbers'" };
  }
  return { valid: true };
}

/**
 * Validasi konfigurasi options untuk tipe phone_number.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePhoneConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Konfigurasi panjang (options) wajib diisi untuk tipe phone_number' };
  }
  const { min_length, max_length } = options;
  if (!Number.isInteger(min_length) || !Number.isInteger(max_length)) {
    return { valid: false, error: 'Panjang minimum dan maksimum harus berupa bilangan bulat' };
  }
  if (min_length < 1) {
    return { valid: false, error: 'Panjang minimum harus minimal 1' };
  }
  if (max_length < min_length) {
    return { valid: false, error: 'Panjang maksimum harus lebih besar atau sama dengan panjang minimum' };
  }
  return { valid: true };
}

/**
 * Validasi konfigurasi options untuk tipe unique_id.
 * Options bersifat opsional untuk unique_id.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUniqueIdConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: true }; // options opsional untuk unique_id
  }
  const { min_length, max_length } = options;
  if (min_length !== undefined || max_length !== undefined) {
    if (!Number.isInteger(min_length) || !Number.isInteger(max_length)) {
      return { valid: false, error: 'Panjang minimum dan maksimum harus berupa bilangan bulat' };
    }
    if (min_length < 1) {
      return { valid: false, error: 'Panjang minimum harus minimal 1' };
    }
    if (max_length < min_length) {
      return { valid: false, error: 'Panjang maksimum harus lebih besar atau sama dengan panjang minimum' };
    }
  }
  return { valid: true };
}

/**
 * Validasi konfigurasi options untuk tipe date.
 * min_date dan max_date opsional (boleh null atau tidak ada).
 * Jika diisi, harus format YYYY-MM-DD yang valid.
 * Jika keduanya diisi, min_date <= max_date.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDateConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: true }; // options opsional untuk date
  }

  const { min_date, max_date } = options;

  if (min_date !== undefined && min_date !== null) {
    if (!validateDateFormat(min_date)) {
      return { valid: false, error: 'Format tanggal harus YYYY-MM-DD' };
    }
  }

  if (max_date !== undefined && max_date !== null) {
    if (!validateDateFormat(max_date)) {
      return { valid: false, error: 'Format tanggal harus YYYY-MM-DD' };
    }
  }

  if (min_date && max_date && min_date > max_date) {
    return { valid: false, error: 'Tanggal minimum tidak boleh lebih besar dari tanggal maksimum' };
  }

  return { valid: true };
}

/**
 * Validasi konfigurasi options untuk tipe matrix.
 * options harus memiliki property rows (array, minimal 1 elemen) dan columns (array, minimal 2 elemen).
 * Setiap elemen harus string non-kosong setelah trim.
 * Tidak boleh ada elemen duplikat dalam rows maupun columns.
 * @param {object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMatrixConfig(options) {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Matrix harus memiliki minimal 1 baris' };
  }

  const { rows, columns } = options;

  if (!Array.isArray(rows) || rows.length < 1) {
    return { valid: false, error: 'Matrix harus memiliki minimal 1 baris' };
  }

  if (!Array.isArray(columns) || columns.length < 2) {
    return { valid: false, error: 'Matrix harus memiliki minimal 2 kolom' };
  }

  // Check all elements are non-empty strings after trim
  for (const el of [...rows, ...columns]) {
    if (typeof el !== 'string' || el.trim() === '') {
      return { valid: false, error: 'Elemen baris dan kolom tidak boleh kosong' };
    }
  }

  // Check for duplicates in rows
  const trimmedRows = rows.map((r) => r.trim());
  if (new Set(trimmedRows).size !== trimmedRows.length) {
    return { valid: false, error: 'Elemen baris/kolom matrix tidak boleh duplikat' };
  }

  // Check for duplicates in columns
  const trimmedColumns = columns.map((c) => c.trim());
  if (new Set(trimmedColumns).size !== trimmedColumns.length) {
    return { valid: false, error: 'Elemen baris/kolom matrix tidak boleh duplikat' };
  }

  return { valid: true };
}

/**
 * Validasi konfigurasi auto_fill (isi otomatis jawaban).
 * Saat ini hanya mendukung jenis kelamin dari paritas Nomor Kuesioner.
 * - null/undefined → valid (nonaktif).
 * - Hanya berlaku untuk tipe single_choice.
 * - odd_value & even_value wajib string non-kosong dan (bila options berupa
 *   array pilihan) harus salah satu value pilihan yang ada.
 * @param {object|null} autoFill
 * @param {string} type
 * @param {Array|object|null} options
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAutoFill(autoFill, type, options) {
  if (autoFill === undefined || autoFill === null) {
    return { valid: true };
  }
  if (typeof autoFill !== 'object' || Array.isArray(autoFill)) {
    return { valid: false, error: 'Konfigurasi isi-otomatis tidak valid' };
  }
  if (autoFill.source !== 'questionnaire_number_parity') {
    return { valid: false, error: 'Sumber isi-otomatis tidak dikenal' };
  }
  if (type !== 'single_choice') {
    return { valid: false, error: 'Isi-otomatis jenis kelamin hanya untuk pertanyaan Pilihan Tunggal' };
  }
  const { odd_value, even_value } = autoFill;
  if (typeof odd_value !== 'string' || odd_value.trim() === '' ||
      typeof even_value !== 'string' || even_value.trim() === '') {
    return { valid: false, error: 'Pemetaan nomor ganjil & genap wajib diisi' };
  }
  if (Array.isArray(options)) {
    const values = options.map((o) => o && o.value);
    if (!values.includes(odd_value) || !values.includes(even_value)) {
      return { valid: false, error: 'Pemetaan ganjil/genap harus merujuk opsi jawaban yang ada' };
    }
  }
  return { valid: true };
}

/**
 * GET /surveys/:surveyId/questions
 * List all questions for a survey, ordered by order_index
 * Admin, supervisor, viewer, and surveyor can access
 */
router.get('/surveys/:surveyId/questions', authMiddleware, requireRole(['admin', 'supervisor', 'viewer', 'surveyor']), async (req, res, next) => {
  try {
    const { surveyId } = req.params;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const questions = await Question.findAll({
      where: { survey_id: surveyId },
      attributes: [
        'id', 'survey_id', 'text', 'type', 'order_index', 'is_required',
        'randomize_options', 'randomize_order', 'allow_other', 'options', 'skip_logic', 'auto_fill', 'created_at',
      ],
      order: [['order_index', 'ASC']],
    });

    res.json(questions);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveys/:surveyId/questions
 * Add a question to a survey (admin only)
 * Body: { text, type, order_index, is_required, randomize_options, options, skip_logic }
 */
router.post('/surveys/:surveyId/questions', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId } = req.params;
    const { text, type, is_required, randomize_options, randomize_order, allow_other, options, skip_logic, auto_fill } = req.body;
    let { order_index } = req.body;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    // Auto-assign order_index if not provided
    if (order_index === undefined || order_index === null) {
      const count = await Question.count({ where: { survey_id: surveyId } });
      order_index = count;
    }

    // Validate question type
    if (type && !VALID_QUESTION_TYPES.includes(type)) {
      return res.status(422).json({
        error: `Tipe pertanyaan tidak valid. Tipe yang didukung: ${VALID_QUESTION_TYPES.join(', ')}`,
      });
    }

    // Validate rating scale configuration if type is rating_scale
    if (type === 'rating_scale') {
      const ratingValidation = validateRatingConfig(options);
      if (!ratingValidation.valid) {
        return res.status(422).json({ error: ratingValidation.error });
      }
    }

    // Validate phone_number configuration
    if (type === 'phone_number') {
      const phoneValidation = validatePhoneConfig(options);
      if (!phoneValidation.valid) {
        return res.status(422).json({ error: phoneValidation.error });
      }
    }

    // Validate unique_id configuration
    if (type === 'unique_id') {
      const uniqueIdValidation = validateUniqueIdConfig(options);
      if (!uniqueIdValidation.valid) {
        return res.status(422).json({ error: uniqueIdValidation.error });
      }
    }

    // Validate date configuration if type is date and options provided
    if (type === 'date' && options) {
      const dateValidation = validateDateConfig(options);
      if (!dateValidation.valid) {
        return res.status(422).json({ error: dateValidation.error });
      }
    }

    // Validate matrix configuration (options mandatory for matrix)
    if (type === 'matrix') {
      const matrixValidation = validateMatrixConfig(options);
      if (!matrixValidation.valid) {
        return res.status(422).json({ error: matrixValidation.error });
      }
    }

    // Validate validation config if provided in options
    if (options && typeof options === 'object' && options.validation) {
      const validationConfigResult = validateValidationConfig(options.validation, type);
      if (!validationConfigResult.valid) {
        return res.status(422).json({ error: validationConfigResult.error });
      }
    }

    // Validate auto_fill (isi otomatis jenis kelamin dari paritas nomor kuesioner)
    const autoFillValidation = validateAutoFill(auto_fill, type, options);
    if (!autoFillValidation.valid) {
      return res.status(422).json({ error: autoFillValidation.error });
    }

    // Validate skip logic for cycles if provided
    if (skip_logic && Array.isArray(skip_logic) && skip_logic.length > 0) {
      // Get all existing questions for this survey plus the new one (with a temp id)
      const existingQuestions = await Question.findAll({
        where: { survey_id: surveyId },
        attributes: ['id', 'skip_logic'],
        raw: true,
      });

      // Build a temporary question list including the new question
      const tempId = `temp-new-${Date.now()}`;
      const allQuestions = [
        ...existingQuestions,
        { id: tempId, skip_logic },
      ];

      const validation = validateSkipLogicNoCycles(allQuestions);
      if (!validation.valid) {
        return res.status(422).json({ error: validation.error });
      }
    }

    // Aturan blok acak urutan vs skip logic / identitas — validasi atas calon
    // keadaan SETELAH pertanyaan ini ditambahkan.
    if (randomize_order === true || (Array.isArray(skip_logic) && skip_logic.length > 0)) {
      const state = await loadRandomizeOrderState(surveyId);
      state.push({
        id: '__baru__',
        type,
        order_index,
        randomize_order: randomize_order === true,
        skip_logic: skip_logic || null,
        auto_fill: auto_fill || null,
      });
      const roValidation = validateRandomizeOrderState(state);
      if (!roValidation.valid) {
        return res.status(422).json({ error: roValidation.error });
      }
    }

    const question = await Question.create({
      survey_id: surveyId,
      text,
      type,
      order_index,
      is_required: is_required !== undefined ? is_required : false,
      randomize_options: randomize_options !== undefined ? randomize_options : false,
      randomize_order: randomize_order === true,
      allow_other: allow_other !== undefined ? allow_other : false,
      options: options || null,
      skip_logic: skip_logic || null,
      auto_fill: auto_fill || null,
    });

    res.status(201).json({
      id: question.id,
      survey_id: question.survey_id,
      text: question.text,
      type: question.type,
      order_index: question.order_index,
      is_required: question.is_required,
      randomize_options: question.randomize_options,
      randomize_order: question.randomize_order,
      allow_other: question.allow_other,
      options: question.options,
      skip_logic: question.skip_logic,
      auto_fill: question.auto_fill,
      created_at: question.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /surveys/:surveyId/questions/:qid
 * Update a question (admin only)
 * Body: { text, type, order_index, is_required, randomize_options, options, skip_logic }
 */
router.put('/surveys/:surveyId/questions/:qid', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId, qid } = req.params;
    const { text, type, order_index, is_required, randomize_options, randomize_order, allow_other, options, skip_logic, auto_fill } = req.body;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const question = await Question.findOne({ where: { id: qid, survey_id: surveyId } });
    if (!question) {
      return res.status(404).json({ error: 'Pertanyaan tidak ditemukan' });
    }

    // Validate question type if provided
    if (type && !VALID_QUESTION_TYPES.includes(type)) {
      return res.status(422).json({
        error: `Tipe pertanyaan tidak valid. Tipe yang didukung: ${VALID_QUESTION_TYPES.join(', ')}`,
      });
    }

    // Validate rating scale configuration if effective type is rating_scale
    const effectiveType = type !== undefined ? type : question.type;
    if (effectiveType === 'rating_scale') {
      const effectiveOptions = options !== undefined ? options : question.options;
      const ratingValidation = validateRatingConfig(effectiveOptions);
      if (!ratingValidation.valid) {
        return res.status(422).json({ error: ratingValidation.error });
      }
    }

    // Validate phone_number configuration if effective type is phone_number
    if (effectiveType === 'phone_number') {
      const effectiveOptions = options !== undefined ? options : question.options;
      const phoneValidation = validatePhoneConfig(effectiveOptions);
      if (!phoneValidation.valid) {
        return res.status(422).json({ error: phoneValidation.error });
      }
    }

    // Validate unique_id configuration if effective type is unique_id
    if (effectiveType === 'unique_id') {
      const effectiveOptions = options !== undefined ? options : question.options;
      const uniqueIdValidation = validateUniqueIdConfig(effectiveOptions);
      if (!uniqueIdValidation.valid) {
        return res.status(422).json({ error: uniqueIdValidation.error });
      }
    }

    // Validate date configuration if effective type is date and options exist
    if (effectiveType === 'date') {
      const effectiveOptions = options !== undefined ? options : question.options;
      if (effectiveOptions) {
        const dateValidation = validateDateConfig(effectiveOptions);
        if (!dateValidation.valid) {
          return res.status(422).json({ error: dateValidation.error });
        }
      }
    }

    // Validate matrix configuration if effective type is matrix (options mandatory)
    if (effectiveType === 'matrix') {
      const effectiveOptions = options !== undefined ? options : question.options;
      const matrixValidation = validateMatrixConfig(effectiveOptions);
      if (!matrixValidation.valid) {
        return res.status(422).json({ error: matrixValidation.error });
      }
    }

    // Validate validation config if provided in options
    const effectiveOptions = options !== undefined ? options : question.options;
    if (effectiveOptions && typeof effectiveOptions === 'object' && effectiveOptions.validation) {
      const validationConfigResult = validateValidationConfig(effectiveOptions.validation, effectiveType);
      if (!validationConfigResult.valid) {
        return res.status(422).json({ error: validationConfigResult.error });
      }
    }

    // Validate auto_fill jika disertakan (pakai tipe & options efektif)
    if (auto_fill !== undefined) {
      const autoFillValidation = validateAutoFill(auto_fill, effectiveType, effectiveOptions);
      if (!autoFillValidation.valid) {
        return res.status(422).json({ error: autoFillValidation.error });
      }
    }

    // Validate skip logic for cycles if provided
    if (skip_logic !== undefined && Array.isArray(skip_logic) && skip_logic.length > 0) {
      // Get all questions for this survey
      const existingQuestions = await Question.findAll({
        where: { survey_id: surveyId },
        attributes: ['id', 'skip_logic'],
        raw: true,
      });

      // Replace the current question's skip_logic with the new one for validation
      const allQuestions = existingQuestions.map((q) =>
        q.id === qid ? { id: q.id, skip_logic } : q
      );

      const validation = validateSkipLogicNoCycles(allQuestions);
      if (!validation.valid) {
        return res.status(422).json({ error: validation.error });
      }
    }

    // Aturan blok acak urutan vs skip logic / identitas — validasi atas calon
    // keadaan SETELAH perubahan diterapkan (nilai efektif).
    if (randomize_order !== undefined || skip_logic !== undefined || order_index !== undefined
        || type !== undefined || auto_fill !== undefined) {
      const state = await loadRandomizeOrderState(surveyId);
      const candidate = state.map((q) => (q.id === qid ? {
        ...q,
        type: effectiveType,
        order_index: order_index !== undefined ? order_index : q.order_index,
        randomize_order: randomize_order !== undefined ? randomize_order === true : q.randomize_order,
        skip_logic: skip_logic !== undefined ? skip_logic : q.skip_logic,
        auto_fill: auto_fill !== undefined ? auto_fill : q.auto_fill,
      } : q));
      const roValidation = validateRandomizeOrderState(candidate);
      if (!roValidation.valid) {
        return res.status(422).json({ error: roValidation.error });
      }
    }

    // Apply updates
    if (text !== undefined) question.text = text;
    if (type !== undefined) question.type = type;
    if (order_index !== undefined) question.order_index = order_index;
    if (is_required !== undefined) question.is_required = is_required;
    if (randomize_options !== undefined) question.randomize_options = randomize_options;
    if (randomize_order !== undefined) question.randomize_order = randomize_order === true;
    if (allow_other !== undefined) question.allow_other = allow_other;
    if (options !== undefined) question.options = options;
    if (skip_logic !== undefined) question.skip_logic = skip_logic;
    if (auto_fill !== undefined) question.auto_fill = auto_fill;

    await question.save();

    res.json({
      id: question.id,
      survey_id: question.survey_id,
      text: question.text,
      type: question.type,
      order_index: question.order_index,
      is_required: question.is_required,
      randomize_options: question.randomize_options,
      randomize_order: question.randomize_order,
      allow_other: question.allow_other,
      options: question.options,
      skip_logic: question.skip_logic,
      auto_fill: question.auto_fill,
      created_at: question.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /surveys/:surveyId/questions/:qid
 * Delete a question (admin only)
 * Also removes all skip_logic rules in OTHER questions that reference this question as target
 */
router.delete('/surveys/:surveyId/questions/:qid', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId, qid } = req.params;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const question = await Question.findOne({ where: { id: qid, survey_id: surveyId } });
    if (!question) {
      return res.status(404).json({ error: 'Pertanyaan tidak ditemukan' });
    }

    // Find all other questions in this survey that have skip_logic referencing qid as target
    const otherQuestions = await Question.findAll({
      where: {
        survey_id: surveyId,
        id: { [Op.ne]: qid },
        skip_logic: { [Op.ne]: null },
      },
      attributes: ['id', 'skip_logic'],
    });

    // Clean up skip_logic references to the deleted question
    for (const otherQ of otherQuestions) {
      if (otherQ.skip_logic && Array.isArray(otherQ.skip_logic)) {
        const filteredLogic = otherQ.skip_logic.filter(
          (rule) => rule.target_question_id !== qid
        );

        if (filteredLogic.length !== otherQ.skip_logic.length) {
          // Use raw update to clean up skip_logic JSONB references
          await Question.update(
            { skip_logic: filteredLogic.length > 0 ? filteredLogic : null },
            { where: { id: otherQ.id } }
          );
        }
      }
    }

    await question.destroy();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /surveys/:surveyId/questions/reorder
 * Reorder questions (admin only)
 * Body: { order: [{ id, order_index }, ...] }
 */
router.patch('/surveys/:surveyId/questions/reorder', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId } = req.params;
    const { order } = req.body;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    if (!order || !Array.isArray(order)) {
      return res.status(422).json({ error: 'Format order tidak valid. Harus berupa array [{ id, order_index }]' });
    }

    // Memindah pertanyaan ber-blok-acak ke DALAM interval lompatan sama
    // bahayanya dengan memasang flag di sana — validasi calon urutan baru dulu.
    {
      const state = await loadRandomizeOrderState(surveyId);
      const newIndex = {};
      order.forEach(({ id, order_index }) => { newIndex[id] = order_index; });
      const candidate = state.map((q) => ({
        ...q,
        order_index: newIndex[q.id] !== undefined ? newIndex[q.id] : q.order_index,
      }));
      const roValidation = validateRandomizeOrderState(candidate);
      if (!roValidation.valid) {
        return res.status(422).json({ error: roValidation.error });
      }
    }

    // Update order_index for each question in the list.
    // Two-pass approach to avoid unique constraint violations on (survey_id, order_index):
    // Pass 1: shift all to a safe temporary range (add large offset)
    // Pass 2: set the final values
    const offset = 100000;
    await Promise.all(
      order.map(({ id, order_index }) =>
        Question.update(
          { order_index: order_index + offset },
          { where: { id, survey_id: surveyId } }
        )
      )
    );
    await Promise.all(
      order.map(({ id, order_index }) =>
        Question.update(
          { order_index },
          { where: { id, survey_id: surveyId } }
        )
      )
    );

    // Return updated questions list
    const questions = await Question.findAll({
      where: { survey_id: surveyId },
      attributes: [
        'id', 'survey_id', 'text', 'type', 'order_index', 'is_required',
        'randomize_options', 'randomize_order', 'allow_other', 'options', 'skip_logic', 'auto_fill', 'created_at',
      ],
      order: [['order_index', 'ASC']],
    });

    res.json(questions);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /surveys/:surveyId/questions/export
 * Export semua pertanyaan survei sebagai JSON.
 * Bisa digunakan untuk backup atau import ke survei lain.
 */
router.get('/surveys/:surveyId/questions/export', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId } = req.params;

    const survey = await Survey.findOne({ where: { id: surveyId }, attributes: ['id', 'title'] });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    const questions = await Question.findAll({
      where: { survey_id: surveyId },
      attributes: ['text', 'type', 'order_index', 'is_required', 'randomize_options', 'randomize_order', 'allow_other', 'options', 'skip_logic', 'auto_fill'],
      order: [['order_index', 'ASC']],
      raw: true,
    });

    const exportData = {
      _format: 'populi-survey-questionnaire-v1',
      _exported_at: new Date().toISOString(),
      survey_title: survey.title,
      question_count: questions.length,
      questions: questions.map((q) => ({
        text: q.text,
        type: q.type,
        is_required: q.is_required,
        randomize_options: q.randomize_options,
        randomize_order: q.randomize_order,
        allow_other: q.allow_other,
        options: q.options,
        auto_fill: q.auto_fill, // portabel: merujuk value opsi, bukan ID
        // Skip logic tidak di-export karena referensi ID akan berbeda di survei baru
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kuesioner-${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.json(exportData);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /surveys/:surveyId/questions/import
 * Import pertanyaan dari JSON file ke survei.
 * Body: { questions: [{ text, type, is_required, options, ... }] }
 * Pertanyaan ditambahkan setelah pertanyaan yang sudah ada.
 */
router.post('/surveys/:surveyId/questions/import', authMiddleware, requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), async (req, res, next) => {
  try {
    const { surveyId } = req.params;
    const { questions: importQuestions } = req.body;

    const survey = await Survey.findOne({ where: { id: surveyId } });
    if (!survey) {
      return res.status(404).json({ error: 'Survei tidak ditemukan' });
    }

    if (!importQuestions || !Array.isArray(importQuestions) || importQuestions.length === 0) {
      return res.status(422).json({ error: 'Data pertanyaan tidak valid. Pastikan format JSON benar.' });
    }

    // Validate each question
    const errors = [];
    importQuestions.forEach((q, i) => {
      if (!q.text || !q.text.trim()) {
        errors.push(`Pertanyaan ${i + 1}: teks wajib diisi`);
      }
      if (!q.type || !VALID_QUESTION_TYPES.includes(q.type)) {
        errors.push(`Pertanyaan ${i + 1}: tipe "${q.type}" tidak valid`);
      }
    });

    if (errors.length > 0) {
      return res.status(422).json({ error: errors.join('; ') });
    }

    // Get current max order_index
    const maxOrder = await Question.max('order_index', { where: { survey_id: surveyId } });
    let nextOrder = (maxOrder ?? -1) + 1;

    // Create questions in transaction
    const created = [];
    await sequelize.transaction(async (t) => {
      for (const q of importQuestions) {
        const question = await Question.create({
          survey_id: surveyId,
          text: q.text.trim(),
          type: q.type,
          order_index: nextOrder++,
          is_required: q.is_required ?? false,
          randomize_options: q.randomize_options ?? false,
          // Impor ditempatkan SETELAH pertanyaan terakhir (di luar semua
          // interval lompatan yang ada) dan skip_logic tidak diimpor, jadi
          // cukup saring tipe identitas & isi-otomatis.
          randomize_order: q.randomize_order === true
            && !RANDOMIZE_EXCLUDED_TYPES.includes(q.type)
            && !q.auto_fill,
          allow_other: q.allow_other ?? false,
          options: q.options || null,
          skip_logic: null, // Skip logic tidak di-import
          auto_fill: q.auto_fill || null,
        }, { transaction: t });
        created.push(question.id);
      }
    });

    res.status(201).json({
      imported_count: created.length,
      message: `${created.length} pertanyaan berhasil diimport ke survei "${survey.title}".`,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.validateRatingConfig = validateRatingConfig;
module.exports.validatePhoneConfig = validatePhoneConfig;
module.exports.validateUniqueIdConfig = validateUniqueIdConfig;
module.exports.validateAutoFill = validateAutoFill;
module.exports.validateDateConfig = validateDateConfig;
module.exports.validateMatrixConfig = validateMatrixConfig;
