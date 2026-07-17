const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Response, Answer, Question, Survey, User, SurveyorQuota, Sequelize, sequelize } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { validateAllAnswers } = require('../utils/answerValidator');
const { isGenderParityMismatch } = require('../utils/genderParity');
const { readDeviceHeaders, lockedToOtherDeviceMessage } = require('../utils/deviceLock');
const { validateDateFormat, validateTimeFormat, validateDateAnswer, validateMatrixAnswer } = require('../utils/validators');
const { validateFieldToolsSubmission } = require('../utils/fieldToolsValidator');
const { incrementResponseStats, markStatsDirty } = require('../utils/statisticsUpdater');
const { computeHiddenQuestions, buildAnswerMap } = require('../utils/skipLogicEvaluator');
const { isSafeSqlIdent } = require('../utils/uuid');

const { Op } = Sequelize;

const router = express.Router();

// Wajib dari env (divalidasi fail-fast di app.js REQUIRED_ENV). TANPA fallback
// string statis — fallback publik di source = celah pemalsuan token.
const SESSION_SECRET = process.env.SESSION_SECRET;

// QC: durasi pengisian "mencurigakan" = di bawah ambang survei
// (field_tools_settings.min_duration_sec, detik). Absen → default 30 detik;
// 0 = penanda nonaktif. Menandai indikasi TPD terburu-buru/mengarang, mirip
// penanda paritas gender. duration_seconds null (tak dinilai) → tidak ditandai.
const DEFAULT_MIN_DURATION_SEC = 30;
function isShortDuration(durationSeconds, fieldToolsSettings) {
  const raw = fieldToolsSettings ? fieldToolsSettings.min_duration_sec : undefined;
  const minDur = raw == null ? DEFAULT_MIN_DURATION_SEC : Number(raw);
  return minDur > 0 && durationSeconds != null && Number(durationSeconds) < minDur;
}

/**
 * Kunci perangkat (1 user = 1 device) — berlaku bila survei menyetel
 * field_tools_settings.device_lock === 'enforced'. Perangkat pertama yang
 * dipakai mengisi otomatis TERIKAT ke akun; perangkat lain ditolak (403)
 * sampai admin mereset ikatan dari Manajemen TPD. Mencegah "double user" /
 * salah isi memakai akun TPD lain.
 *
 * @param {import('express').Request} req
 * @param {object} survey - instance Survey (perlu field_tools_settings)
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
async function enforceDeviceLock(req, survey) {
  const settings = survey && survey.field_tools_settings;
  if (!settings || settings.device_lock !== 'enforced') return { ok: true };

  const { deviceId, deviceLabel } = readDeviceHeaders(req);
  if (!deviceId) {
    return {
      ok: false,
      status: 403,
      error: 'Survei ini mewajibkan kunci perangkat. Perbarui aplikasi ke versi terbaru lalu coba lagi.',
    };
  }

  const user = await User.findOne({
    where: { id: req.user.id },
    attributes: ['id', 'device_id', 'device_label'],
  });
  if (!user) {
    return { ok: false, status: 403, error: 'Pengguna tidak ditemukan' };
  }

  if (!user.device_id) {
    // Perangkat pertama → ikat ke akun ini.
    await User.update(
      { device_id: deviceId, device_label: deviceLabel, device_bound_at: new Date() },
      { where: { id: req.user.id } }
    );
    return { ok: true };
  }

  if (user.device_id === deviceId) return { ok: true };

  return { ok: false, status: 403, error: lockedToOtherDeviceMessage(user.device_label) };
}

/**
 * POST /responses/start
 * Start a new response session for a survey.
 * Body: { survey_id }
 * Returns: { session_token, start_time }
 * Requires: authMiddleware + requireRole('surveyor')
 * Requirements: 15.1
 */
router.post('/start', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const { survey_id } = req.body;
    const surveyor_id = req.user.id;

    if (!survey_id) {
      return res.status(422).json({ error: 'survey_id wajib diisi' });
    }

    // Verify survey exists and is active
    const survey = await Survey.findOne({ where: { id: survey_id, status: 'active' } });
    if (!survey) {
      return res.status(409).json({ error: 'Survei tidak lagi aktif' });
    }

    // Pengecekan periode aktif
    const now = new Date();
    if (survey.end_date && new Date(survey.end_date) <= now) {
      return res.status(409).json({ error: 'Survei sudah berakhir' });
    }
    if (survey.start_date && new Date(survey.start_date) > now) {
      return res.status(409).json({ error: 'Survei belum dimulai' });
    }

    // Kunci perangkat (bila diaktifkan pada survei ini)
    const deviceCheck = await enforceDeviceLock(req, survey);
    if (!deviceCheck.ok) {
      return res.status(deviceCheck.status).json({ error: deviceCheck.error });
    }

    // --- Quota enforcement ---
    const quotaRecord = await SurveyorQuota.findOne({
      where: { survey_id, surveyor_id },
    });
    if (!quotaRecord) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses untuk survei ini' });
    }

    // Count committed responses (exclude PENDING-* records)
    const committedCount = await Response.count({
      where: {
        survey_id,
        surveyor_id,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
    });
    if (committedCount >= quotaRecord.quota) {
      return res.status(403).json({ error: 'Kuota pengisian survei Anda sudah tercapai' });
    }
    // --- End quota enforcement ---

    const start_time = new Date().toISOString();

    // Create a pending response record with a unique temporary questionnaire number
    const response = await Response.create({
      survey_id,
      surveyor_id,
      questionnaire_number: `PENDING-${uuidv4()}`,
      start_time,
      geo_status: 'available',
    });

    // Issue session token containing response_id, survey_id, surveyor_id
    const session_token = jwt.sign(
      {
        response_id: response.id,
        survey_id,
        surveyor_id,
        start_time,
      },
      SESSION_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ session_token, start_time });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate a short survey prefix from the survey title.
 * Takes up to 6 uppercase alphanumeric characters from the title.
 * Falls back to 'SRV' if the title yields no alphanumeric characters.
 * @param {string} title - Survey title
 * @returns {string} - e.g. 'SRV001', 'SURVEY', 'MYSVR'
 */
function generateSurveyPrefix(title) {
  const cleaned = (title || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 6) || 'SRV';
}

/**
 * Format a questionnaire number.
 * Format: {SURVEY_PREFIX}-{YYYYMMDD}-{SUFFIX}
 * Suffix is either the surveyor-provided unique_id or a zero-padded sequence number.
 * Example: SRV001-20240115-12345 (unique_id) or SRV001-20240115-0001 (auto-sequence)
 * @param {string} surveyTitle - Survey title used to derive prefix
 * @param {Date} endTime - The end time (used for date portion)
 * @param {number|string} seqVal - The sequence value or unique_id string
 * @returns {string}
 */
function formatQuestionnaireNumber(surveyTitle, endTime, seqVal) {
  const prefix = generateSurveyPrefix(surveyTitle);
  const d = endTime;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  // If seqVal is a string (unique_id from surveyor), use as-is; otherwise pad to 4 digits
  const suffix = typeof seqVal === 'string' ? seqVal : String(seqVal).padStart(4, '0');
  return `${prefix}-${dateStr}-${suffix}`;
}

/**
 * POST /responses/submit
 * Submit a complete response atomically.
 * Body: { session_token, answers: [{ question_id, answer_value, answer_json, photo_path }], geo: { status, lat, lng } }
 * Returns: { questionnaire_number, end_time, duration_seconds }
 * Requires: authMiddleware + requireRole('surveyor')
 * Requirements: 9.3, 9.5, 9.6, 9.7, 13.1, 13.2, 13.6, 15.2, 15.3, 16.2, 16.3, 16.4, 16.5
 */
router.post('/submit', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const {
      session_token,
      answers = [],
      geo = {},
      audio_path,
      audio_paths,
      signature_path,
      photo_paths,
      start_latitude,
      start_longitude,
      start_geo_status,
      client_start_time,
      client_end_time,
    } = req.body;

    if (!session_token) {
      return res.status(422).json({ error: 'session_token wajib diisi' });
    }

    // Normalisasi audio: dukung banyak segmen (audio_paths) + kompat audio_path.
    let audioPathsArr = Array.isArray(audio_paths) ? audio_paths.filter(Boolean) : [];
    if (audio_path && !audioPathsArr.includes(audio_path)) {
      audioPathsArr = [audio_path, ...audioPathsArr];
    }
    const firstAudioPath = audioPathsArr[0] || null;

    // Validate session token
    let sessionPayload;
    try {
      sessionPayload = jwt.verify(session_token, SESSION_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Session token tidak valid atau sudah kedaluwarsa' });
    }

    const { response_id, survey_id, surveyor_id, start_time } = sessionPayload;

    // Ensure the token belongs to the authenticated surveyor
    if (surveyor_id !== req.user.id) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
    }

    // Find the pending response record
    const existingResponse = await Response.findOne({
      where: { id: response_id, survey_id, surveyor_id, questionnaire_number: { [Op.like]: 'PENDING-%' } },
    });
    if (!existingResponse) {
      return res.status(404).json({ error: 'Sesi pengisian tidak ditemukan atau sudah disubmit' });
    }

    // Fetch survey to get title for questionnaire number prefix and field tools settings
    const survey = await Survey.findOne({
      where: { id: survey_id },
      attributes: ['id', 'title', 'field_tools_settings'],
    });
    if (!survey) {
      return res.status(409).json({ error: 'Survei tidak lagi aktif' });
    }

    // Kunci perangkat (bila diaktifkan pada survei ini) — juga menjaga jalur
    // sinkron offline: data dari perangkat tak terdaftar ditolak saat submit.
    const deviceCheck = await enforceDeviceLock(req, survey);
    if (!deviceCheck.ok) {
      return res.status(deviceCheck.status).json({ error: deviceCheck.error });
    }

    // Validate field tools submission against survey settings
    const fieldToolsResult = validateFieldToolsSubmission(
      {
        signature_path: signature_path || null,
        audio_path: firstAudioPath,
        photo_paths: Array.isArray(photo_paths) ? photo_paths : [],
        latitude: start_latitude != null ? start_latitude : null,
        longitude: start_longitude != null ? start_longitude : null,
      },
      survey.field_tools_settings
    );
    if (!fieldToolsResult.valid) {
      return res.status(422).json({ error: fieldToolsResult.error });
    }

    // Get all questions for this survey (terurut untuk evaluasi skip logic)
    const questions = await Question.findAll({
      where: { survey_id },
      attributes: ['id', 'is_required', 'type', 'options', 'order_index', 'skip_logic', 'allow_other'],
      order: [['order_index', 'ASC']],
    });

    // Hitung pertanyaan yang TERSEMBUNYI oleh skip logic berdasarkan jawaban
    // yang masuk. Otoritas di server: pertanyaan wajib pada cabang yang TIDAK
    // dilalui responden tidak boleh dianggap "belum dijawab".
    const questionTypeMap = new Map(questions.map((q) => [q.id, q]));
    const answerMap = buildAnswerMap(answers, questionTypeMap);
    const hiddenQuestionIds = computeHiddenQuestions(questions, answerMap);

    // H1: BUANG jawaban untuk pertanyaan yang TERSEMBUNYI oleh skip logic —
    // otoritas di server. Jawaban di cabang mati tak boleh masuk dataset
    // (mencemari agregat) maupun mengklaim nomor kuesioner (unique_id tersembunyi).
    // Skip logic dievaluasi memakai `answers` penuh di atas; downstream memakai
    // `visibleAnswers` yang sudah bersih.
    const visibleAnswers = answers.filter((a) => !hiddenQuestionIds.has(a.question_id));

    // Validate required questions are answered (kecuali yang tersembunyi cabang)
    const answeredQuestionIds = new Set(visibleAnswers.map((a) => a.question_id));
    const missingQuestions = questions
      .filter((q) => q.is_required && !hiddenQuestionIds.has(q.id) && !answeredQuestionIds.has(q.id))
      .map((q) => q.id);

    if (missingQuestions.length > 0) {
      return res.status(422).json({
        error: 'Pertanyaan wajib belum dijawab',
        missing_questions: missingQuestions,
      });
    }

    // Validate answers against validation rules configured on questions
    const validationResult = validateAllAnswers(visibleAnswers, questions);
    if (!validationResult.valid) {
      return res.status(422).json({
        error: 'Validasi jawaban gagal',
        validation_errors: validationResult.errors,
      });
    }

    // Build question map for answer validation
    const questionMap = {};
    for (const q of questions) {
      questionMap[q.id] = q;
    }

    // Validate phone_number and unique_id answers
    const SCALAR_TYPES = ['phone_number', 'unique_id', 'date', 'time'];
    for (const ans of visibleAnswers) {
      const q = questionMap[ans.question_id];
      if (!q) continue;

      // L3: tipe skalar menaruh nilai di answer_value. Bila klien menyelundupkan
      // nilai lewat answer_json (mem-bypass validasi format di bawah) → tolak.
      if (SCALAR_TYPES.includes(q.type) && !ans.answer_value) {
        const j = ans.answer_json;
        if ((typeof j === 'string' && j.trim() !== '') || typeof j === 'number') {
          return res.status(422).json({ error: 'Format jawaban tidak valid untuk tipe pertanyaan ini' });
        }
      }

      if (q.type === 'phone_number' && ans.answer_value) {
        // Hanya digit
        if (!/^\d+$/.test(ans.answer_value)) {
          return res.status(422).json({ error: 'Nomor telepon hanya boleh berisi angka' });
        }
        // Panjang sesuai konfigurasi
        const config = q.options || {};
        if (config.min_length && ans.answer_value.length < config.min_length) {
          return res.status(422).json({
            error: `Panjang nomor telepon harus antara ${config.min_length} dan ${config.max_length} digit`,
          });
        }
        if (config.max_length && ans.answer_value.length > config.max_length) {
          return res.status(422).json({
            error: `Panjang nomor telepon harus antara ${config.min_length} dan ${config.max_length} digit`,
          });
        }
      }

      if (q.type === 'unique_id' && ans.answer_value) {
        // Hanya digit
        if (!/^\d+$/.test(ans.answer_value)) {
          return res.status(422).json({ error: 'Nomor kuesioner hanya boleh berisi angka' });
        }
        // Panjang sesuai konfigurasi (jika ada)
        const config = q.options || {};
        if (config.min_length && ans.answer_value.length < config.min_length) {
          return res.status(422).json({
            error: `Panjang nomor kuesioner harus antara ${config.min_length} dan ${config.max_length} digit`,
          });
        }
        if (config.max_length && ans.answer_value.length > config.max_length) {
          return res.status(422).json({
            error: `Panjang nomor kuesioner harus antara ${config.min_length} dan ${config.max_length} digit`,
          });
        }
        // Cek duplikat per survei
        const existingAnswer = await Answer.findOne({
          where: { question_id: q.id, answer_value: ans.answer_value },
          include: [{
            model: Response,
            as: 'response',
            where: { survey_id },
            attributes: ['id'],
          }],
        });
        if (existingAnswer) {
          return res.status(422).json({ error: 'Nomor kuesioner sudah digunakan dalam survei ini' });
        }
      }

      if (q.type === 'date' && ans.answer_value) {
        if (!validateDateFormat(ans.answer_value)) {
          return res.status(422).json({ error: 'Format tanggal harus YYYY-MM-DD' });
        }
        const config = q.options || {};
        if (config.min_date || config.max_date) {
          const dateResult = validateDateAnswer(ans.answer_value, config);
          if (!dateResult.valid) {
            return res.status(422).json({ error: dateResult.error });
          }
        }
      }

      if (q.type === 'time' && ans.answer_value) {
        if (!validateTimeFormat(ans.answer_value)) {
          return res.status(422).json({ error: 'Format waktu harus HH:mm (24 jam)' });
        }
      }

      if (q.type === 'matrix') {
        const config = q.options || {};
        const matrixResult = validateMatrixAnswer(ans.answer_json, config, q.is_required);
        if (!matrixResult.valid) {
          return res.status(422).json({ error: matrixResult.error });
        }
      }

      if (q.type === 'indonesia_region') {
        const val = ans.answer_json;
        // L4: validasi struktur bila WAJIB, atau bila opsional TAPI diisi
        // (jangan biarkan objek wilayah sembarang lolos tanpa cek).
        const provided = val != null && !(typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0);
        if (q.is_required || provided) {
          const config = q.options || {};
          const depth = config.depth || 'village';
          let invalid = !val || typeof val !== 'object' || !val.province_id;
          if (!invalid && depth === 'regency') invalid = !val.regency_id;
          if (!invalid && depth === 'district') invalid = !val.regency_id || !val.district_id;
          if (!invalid && depth === 'village') invalid = !val.regency_id || !val.district_id || !val.village_id;
          if (invalid) {
            return res.status(422).json({ error: 'Jawaban wilayah Indonesia tidak lengkap sesuai konfigurasi pertanyaan' });
          }
        }
      }
    }

    const end_time = new Date();
    const startDate = new Date(start_time);
    let duration_seconds = Math.floor((end_time - startDate) / 1000);
    // Durasi wawancara AKURAT dari klien. Untuk data OFFLINE, sesi /start dibuat
    // saat SINKRON (bisa berjam/hari setelah wawancara), sehingga durasi berbasis
    // start_time sesi ≈ 0 atau salah. Bila klien mengirim rentang waktu wawancara
    // yang WAJAR (0..24 jam), pakai itu. Guard mencegah jam perangkat yang kacau
    // menghasilkan durasi absurd (negatif / berhari-hari).
    if (client_start_time && client_end_time) {
      const cs = new Date(client_start_time);
      const ce = new Date(client_end_time);
      if (!Number.isNaN(cs.getTime()) && !Number.isNaN(ce.getTime())) {
        const span = Math.floor((ce - cs) / 1000);
        if (span >= 0 && span <= 24 * 3600) duration_seconds = span;
      }
    }

    // Geo data
    // If geo_status is not 'available', lat and lng must be null
    const geo_status = geo.status || 'available';
    const latitude = geo_status === 'available' && geo.lat != null ? geo.lat : null;
    const longitude = geo_status === 'available' && geo.lng != null ? geo.lng : null;

    // Atomic transaction: generate questionnaire number + save response + save answers
    let questionnaire_number;
    let end_time_iso;

    const transaction = await sequelize.transaction();
    try {
      // --- Quota re-check inside transaction (prevents race condition) ---
      // Kunci baris kuota (FOR UPDATE) agar submit konkuren dari TPD yang sama
      // ter-serialisasi: tanpa ini, di READ COMMITTED dua submit bisa sama-sama
      // membaca count yang sama lalu sama-sama lolos → kuota jebol (bug C1).
      const quotaRecord = await SurveyorQuota.findOne({
        where: { survey_id, surveyor_id },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (quotaRecord) {
        const committedCount = await Response.count({
          where: {
            survey_id,
            surveyor_id,
            questionnaire_number: { [Op.notLike]: 'PENDING-%' },
          },
          transaction,
        });
        if (committedCount >= quotaRecord.quota) {
          await transaction.rollback();
          // Clean up the pending response
          await existingResponse.destroy();
          return res.status(403).json({ error: 'Kuota pengisian survei Anda sudah tercapai' });
        }
      } else {
        // M4 (DEFENSIF): baris kuota tak ada saat submit. Idealnya ditolak untuk
        // cegah bypass, TAPI /start SUDAH mewajibkan kuota — jadi kuota-null di
        // sini berarti kondisi sah (mis. survei sampel/uji, atau kuota di-reassign
        // di tengah sesi). JANGAN patahkan submit yang valid. Catat untuk ditinjau,
        // lalu izinkan lanjut. (Sebelumnya sempat menolak 403 → memutus submit.)
        console.warn('[submit] baris kuota tidak ditemukan saat submit — DIIZINKAN (tinjau):',
          'survey', survey_id, 'surveyor', surveyor_id);
      }
      // --- End quota re-check ---

      // M3: kunci baris response (FOR UPDATE) & pastikan MASIH PENDING. Bila
      // submit konkuren (double-tap/retry jaringan) sudah mengklaim record ini
      // lebih dulu, re-fetch berpredikat PENDING mengembalikan null → 409;
      // mencegah jawaban duplikat / dua nomor kuesioner untuk satu sesi.
      const lockedPending = await Response.findOne({
        where: { id: response_id, questionnaire_number: { [Op.like]: 'PENDING-%' } },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!lockedPending) {
        await transaction.rollback();
        return res.status(409).json({ error: 'Sesi pengisian ini sudah disubmit' });
      }

      // Generate questionnaire number using PostgreSQL sequence
      // Sequence name uses underscores (hyphens replaced) to match the name created at activation
      // Guard anti-injeksi: survey_id (dari session token) hanya boleh karakter
      // aman sebelum disisipkan ke nama sequence. Melindungi bila token dipalsukan.
      if (!isSafeSqlIdent(survey_id)) throw new Error('survey_id tidak valid');
      const seqName = `questionnaire_seq_${survey_id.replace(/-/g, '_')}`;
      const [[{ nextval }]] = await sequelize.query(
        `SELECT nextval('${seqName}') AS nextval`,
        { transaction }
      );

      // Check if surveyor provided a unique_id answer — use it as the suffix instead of auto-sequence
      // (dari visibleAnswers → unique_id di cabang tersembunyi tak mengklaim nomor)
      let uniqueIdValue = null;
      for (const ans of visibleAnswers) {
        const q = questionMap[ans.question_id];
        if (q && q.type === 'unique_id' && ans.answer_value) {
          uniqueIdValue = ans.answer_value;
          break;
        }
      }

      // Validate unique_id against assigned_numbers if admin has assigned specific numbers
      if (uniqueIdValue && quotaRecord && quotaRecord.assigned_numbers && Array.isArray(quotaRecord.assigned_numbers) && quotaRecord.assigned_numbers.length > 0) {
        if (!quotaRecord.assigned_numbers.includes(uniqueIdValue)) {
          await transaction.rollback();
          return res.status(422).json({
            error: `Nomor kuesioner "${uniqueIdValue}" tidak ada dalam daftar nomor yang ditugaskan. Gunakan nomor yang sudah ditentukan oleh admin.`,
          });
        }
      }

      // Format: {SURVEY_PREFIX}-{YYYYMMDD}-{UNIQUE_ID or SEQUENCE_NUMBER:04d}
      questionnaire_number = formatQuestionnaireNumber(survey.title, end_time, uniqueIdValue || Number(nextval));
      end_time_iso = end_time.toISOString();

      // Update the pending response record
      await existingResponse.update(
        {
          questionnaire_number,
          end_time: end_time_iso,
          duration_seconds,
          latitude,
          longitude,
          geo_status,
          audio_path: firstAudioPath,
          audio_paths: audioPathsArr,
          signature_path: signature_path || null,
          photo_paths: Array.isArray(photo_paths) ? photo_paths : [],
          start_latitude: start_latitude != null ? start_latitude : null,
          start_longitude: start_longitude != null ? start_longitude : null,
          start_geo_status: start_geo_status || 'available',
          unique_identifier: uniqueIdValue || null,
        },
        { transaction }
      );

      // Save all answers (hanya yang terlihat — jawaban cabang tersembunyi dibuang)
      if (visibleAnswers.length > 0) {
        const answerRecords = visibleAnswers.map((a) => ({
          response_id,
          question_id: a.question_id,
          answer_value: a.answer_value || null,
          answer_json: a.answer_json || null,
          photo_path: a.photo_path || null,
        }));
        await Answer.bulkCreate(answerRecords, { transaction });
      }

      await transaction.commit();
    } catch (txError) {
      await transaction.rollback();
      // Log error agar 500 tidak "senyap" (memudahkan diagnosa di produksi).
      console.error('[responses/submit] transaksi gagal:', txError.message);
      // Pelanggaran UNIQUE (nomor kuesioner / unique_id sudah dipakai) — ini
      // backstop race C2: kembalikan 422 yang ramah, bukan 500 generik.
      if (txError.name === 'SequelizeUniqueConstraintError') {
        const fields = txError.fields || {};
        if ('unique_identifier' in fields || (txError.parent?.constraint || '').includes('unique_identifier')) {
          return res.status(422).json({ error: 'Nomor kuesioner sudah digunakan dalam survei ini' });
        }
        return res.status(422).json({ error: 'Nomor kuesioner sudah digunakan. Silakan gunakan nomor lain.' });
      }
      // If sequence doesn't exist or other DB error
      return res.status(500).json({ error: 'Gagal menyimpan data. Silakan coba kembali' });
    }

    // Update aggregated statistics (non-blocking, fire-and-forget).
    // M6: bila gagal (mis. deadlock/timeout transient), tandai survei "dirty"
    // agar maintenance me-recompute-nya → drift statistik tak permanen.
    incrementResponseStats(survey_id, surveyor_id).catch((err) => {
      console.error('[Stats] Failed to update statistics:', err.message);
      markStatsDirty(survey_id);
    });

    res.status(201).json({
      questionnaire_number,
      end_time: end_time_iso,
      duration_seconds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /responses/assigned-numbers/:surveyId
 * Get assigned questionnaire numbers for the current TPD on a specific survey.
 * Returns: { assigned_numbers: string[] | null, used_numbers: string[] }
 * - assigned_numbers: nomor yang ditugaskan admin, null jika tidak ada penugasan
 * - used_numbers: nomor yang sudah dipakai pada survei ini oleh TPD MANA PUN.
 *   (Global, bukan per-TPD — bila nomor yang sama tertugaskan/terisi ke akun
 *   lain, nomor itu harus tampil "sudah diisi" agar tidak dikerjakan dobel
 *   lalu gagal di akhir saat simpan.)
 * Requires: authMiddleware + requireRole('surveyor')
 */
router.get('/assigned-numbers/:surveyId', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const { surveyId } = req.params;
    const surveyorId = req.user.id;

    // Get quota record with assigned_numbers
    const quotaRecord = await SurveyorQuota.findOne({
      where: { survey_id: surveyId, surveyor_id: surveyorId },
    });

    const assignedNumbers = quotaRecord?.assigned_numbers || null;

    // Nomor yang sudah dipakai pada survei ini (semua TPD, hanya yang committed)
    const usedResponses = await Response.findAll({
      where: {
        survey_id: surveyId,
        questionnaire_number: { [Op.notLike]: 'PENDING-%' },
      },
      attributes: ['questionnaire_number'],
      raw: true,
    });

    // Extract the suffix (the unique_id part) from questionnaire numbers
    // Format: PREFIX-YYYYMMDD-SUFFIX
    const usedNumbers = usedResponses.map((r) => {
      const parts = r.questionnaire_number.split('-');
      // The suffix is everything after the second dash (could contain dashes)
      return parts.length >= 3 ? parts.slice(2).join('-') : r.questionnaire_number;
    });

    res.json({
      assigned_numbers: assignedNumbers,
      used_numbers: usedNumbers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /responses/check-unique
 * Check if a unique_id value is already used in a survey.
 * Body: { survey_id, question_id, value }
 * Returns: { available: boolean }
 * Requires: authMiddleware + requireRole('surveyor')
 */
router.post('/check-unique', authMiddleware, requireRole('surveyor'), async (req, res, next) => {
  try {
    const { survey_id, question_id, value } = req.body;

    if (!survey_id || !question_id || !value) {
      return res.status(422).json({
        error: 'Parameter survey_id, question_id, dan value wajib diisi',
      });
    }

    const existingAnswer = await Answer.findOne({
      where: { question_id, answer_value: value },
      include: [{
        model: Response,
        as: 'response',
        where: { survey_id },
        attributes: ['id'],
      }],
    });

    res.json({ available: !existingAnswer });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /responses
 * List responses.
 *   - Admin/Supervisor/Viewer: all responses
 *   - Surveyor: only their own responses
 * Requirements: 9.2, 9.4, 13.5, 15.5
 */
router.get('/', authMiddleware, requireRole(['admin', 'supervisor', 'viewer', 'surveyor']), async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    const whereClause = {};

    // Surveyor hanya boleh melihat respons miliknya sendiri.
    // Role lain (admin/supervisor/viewer) boleh memfilter berdasarkan TPD tertentu.
    if (role === 'surveyor') {
      whereClause.surveyor_id = userId;
    } else if (req.query.surveyor_id) {
      whereClause.surveyor_id = req.query.surveyor_id;
    }

    // Filter berdasarkan survei
    if (req.query.survey_id) {
      whereClause.survey_id = req.query.survey_id;
    }

    // Filter rentang tanggal berdasarkan waktu mulai survei (inklusif).
    // Tanggal dikirim sebagai 'YYYY-MM-DD'.
    const { start_date, end_date } = req.query;
    if (start_date || end_date) {
      whereClause.start_time = {};
      if (start_date) whereClause.start_time[Op.gte] = new Date(`${start_date}T00:00:00.000`);
      if (end_date) whereClause.start_time[Op.lte] = new Date(`${end_date}T23:59:59.999`);
    }

    // Exclude PENDING responses from listing
    whereClause.questionnaire_number = { [Op.notLike]: 'PENDING-%' };

    // Pencarian teks berdasarkan nomor kuesioner (digabung dengan exclude PENDING)
    if (req.query.q && String(req.query.q).trim()) {
      whereClause.questionnaire_number[Op.iLike] = `%${String(req.query.q).trim()}%`;
    }

    // Filter status geolokasi (sebelumnya difilter di klien — kini server-side
    // agar pagination & total akurat)
    if (req.query.geo_status) {
      whereClause.geo_status = req.query.geo_status;
    }

    // Apply review_status filter for non-surveyor roles
    const validReviewStatuses = ['unreviewed', 'flagged', 'verified'];
    if (role !== 'surveyor' && req.query.review_status) {
      if (validReviewStatuses.includes(req.query.review_status)) {
        whereClause.review_status = req.query.review_status;
      }
      // Invalid filter values are silently ignored (return all)
    }

    // Filter QC "durasi singkat" (server-side, akurat lintas halaman): respons dengan
    // durasi di bawah ambang survei (field_tools_settings.min_duration_sec; default 30,
    // 0 = nonaktif). Subquery terkorelasi ke surveys → tak bergantung alias join, aman
    // saat Sequelize membungkus query untuk pagination.
    if (role !== 'surveyor' && req.query.quality === 'short_duration') {
      // Subquery mandiri (alias r2/s2) — hanya mereferensikan "Response"."id" dari
      // luar, jadi kebal terhadap pembungkusan join/pagination Sequelize.
      const thr = `COALESCE(NULLIF((s2.field_tools_settings->>'min_duration_sec'), '')::int, ${DEFAULT_MIN_DURATION_SEC})`;
      whereClause[Op.and] = [
        ...(whereClause[Op.and] ? [].concat(whereClause[Op.and]) : []),
        Sequelize.literal(`"Response"."id" IN (SELECT r2.id FROM responses r2 JOIN surveys s2 ON s2.id = r2.survey_id WHERE r2.duration_seconds IS NOT NULL AND ${thr} > 0 AND r2.duration_seconds < ${thr})`),
      ];
    }

    const isSurveyor = role === 'surveyor';

    // ── Pagination (server-side) ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.page_size, 10) || 25));
    const offset = (page - 1) * pageSize;

    // Base attributes
    const attributes = [
      'id',
      'questionnaire_number',
      'survey_id',
      'surveyor_id',
      'start_time',
      'end_time',
      'duration_seconds',
      'geo_status',
      'created_at',
    ];

    // Include review fields for non-surveyor roles
    if (!isSurveyor) {
      attributes.push('review_status', 'review_note', 'reviewed_by', 'reviewed_at');
    }

    const includeAssociations = [
      {
        model: Survey,
        as: 'survey',
        attributes: ['id', 'title', 'field_tools_settings'],
      },
      {
        model: User,
        as: 'surveyor',
        attributes: ['id', 'name'],
      },
    ];

    // Include reviewer association for non-surveyor roles
    if (!isSurveyor) {
      includeAssociations.push({
        model: User,
        as: 'reviewer',
        attributes: ['id', 'name'],
      });
    }

    const total = await Response.count({ where: whereClause });

    const responses = await Response.findAll({
      where: whereClause,
      attributes,
      include: includeAssociations,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset,
    });

    // Metadata pagination via header (body tetap array — kompatibel)
    res.set('X-Total-Count', String(total ?? 0));
    res.set('X-Page', String(page));
    res.set('X-Page-Size', String(pageSize));

    // ── QC: tandai jenis kelamin yang tak sesuai paritas nomor kuesioner ──────
    // Dihitung per halaman (maks pageSize baris) dan hanya untuk survei yang
    // memiliki pertanyaan unique_id + single_choice ber-auto_fill paritas.
    const parityBySurvey = {}; // survey_id -> { uniqueQId, genderQId, autoFill }
    const answersByResponse = {}; // response_id -> { [question_id]: answer_value }
    const pageSurveyIds = [...new Set(responses.map((r) => r.survey_id))];
    if (pageSurveyIds.length > 0) {
      const parityQuestions = (await Question.findAll({
        where: { survey_id: { [Op.in]: pageSurveyIds }, type: { [Op.in]: ['unique_id', 'single_choice'] } },
        attributes: ['id', 'survey_id', 'type', 'auto_fill'],
        raw: true,
      })) || [];
      const bySurvey = {};
      for (const q of parityQuestions) {
        const e = bySurvey[q.survey_id] || (bySurvey[q.survey_id] = { uniqueQId: null, genderQId: null, autoFill: null });
        if (q.type === 'unique_id' && !e.uniqueQId) e.uniqueQId = q.id;
        if (q.type === 'single_choice' && q.auto_fill &&
            q.auto_fill.source === 'questionnaire_number_parity' && !e.genderQId) {
          e.genderQId = q.id;
          e.autoFill = q.auto_fill;
        }
      }
      for (const [sid, e] of Object.entries(bySurvey)) {
        if (e.uniqueQId && e.genderQId) parityBySurvey[sid] = e;
      }

      const relevantResponseIds = responses
        .filter((r) => parityBySurvey[r.survey_id])
        .map((r) => r.id);
      if (relevantResponseIds.length > 0) {
        const qIds = [];
        for (const e of Object.values(parityBySurvey)) qIds.push(e.uniqueQId, e.genderQId);
        const parityAnswers = (await Answer.findAll({
          where: { response_id: { [Op.in]: relevantResponseIds }, question_id: { [Op.in]: qIds } },
          attributes: ['response_id', 'question_id', 'answer_value'],
          raw: true,
        })) || [];
        for (const a of parityAnswers) {
          const rec = answersByResponse[a.response_id] || (answersByResponse[a.response_id] = {});
          rec[a.question_id] = a.answer_value;
        }
      }
    }

    const result = responses.map((r) => {
      const item = {
        id: r.id,
        questionnaire_number: r.questionnaire_number,
        survey_id: r.survey_id,
        survey_title: r.survey ? r.survey.title : null,
        surveyor_id: r.surveyor_id,
        surveyor_name: r.surveyor ? r.surveyor.name : null,
        start_time: r.start_time,
        end_time: r.end_time,
        duration_seconds: r.duration_seconds,
        geo_status: r.geo_status,
        created_at: r.created_at,
      };

      // QC: null = tak dapat dinilai; true = tak sesuai paritas; false = sesuai.
      const parity = parityBySurvey[r.survey_id];
      item.gender_parity_mismatch = parity
        ? isGenderParityMismatch(
            (answersByResponse[r.id] || {})[parity.uniqueQId],
            (answersByResponse[r.id] || {})[parity.genderQId],
            parity.autoFill
          )
        : null;

      // QC: durasi pengisian mencurigakan (di bawah ambang survei).
      item.short_duration = isShortDuration(r.duration_seconds, r.survey && r.survey.field_tools_settings);

      if (!isSurveyor) {
        item.review_status = r.review_status;
        item.review_note = r.review_note;
        item.reviewed_by = r.reviewed_by;
        item.reviewed_at = r.reviewed_at;
        item.reviewer_name = r.reviewer ? r.reviewer.name : null;
      }

      return item;
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /responses/quality-summary
 * Ringkasan kualitas data untuk filter aktif (survey/surveyor/tanggal) — menyuplai
 * kartu ringkasan + chip filter di halaman Data Responden. Hitungan AKURAT lintas
 * halaman (agregasi SQL). Ambang durasi-singkat per survei (min_duration_sec).
 */
router.get('/quality-summary', authMiddleware, requireRole(['admin', 'supervisor', 'viewer']), async (req, res, next) => {
  try {
    const clauses = ["r.questionnaire_number NOT LIKE 'PENDING-%'"];
    const replacements = {};
    if (req.query.survey_id) { clauses.push('r.survey_id = :surveyId'); replacements.surveyId = req.query.survey_id; }
    if (req.query.surveyor_id) { clauses.push('r.surveyor_id = :surveyorId'); replacements.surveyorId = req.query.surveyor_id; }
    if (req.query.start_date) { clauses.push('r.start_time >= :startDate'); replacements.startDate = new Date(`${req.query.start_date}T00:00:00.000`); }
    if (req.query.end_date) { clauses.push('r.start_time <= :endDate'); replacements.endDate = new Date(`${req.query.end_date}T23:59:59.999`); }
    const whereSql = clauses.join(' AND ');
    const thr = `COALESCE(NULLIF((s.field_tools_settings->>'min_duration_sec'), '')::int, ${DEFAULT_MIN_DURATION_SEC})`;
    const rows = await sequelize.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE r.review_status = 'unreviewed')::int AS unreviewed,
         COUNT(*) FILTER (WHERE r.review_status = 'verified')::int AS verified,
         COUNT(*) FILTER (WHERE r.review_status = 'flagged')::int AS flagged,
         COUNT(*) FILTER (WHERE r.latitude IS NOT NULL)::int AS gps_with,
         COUNT(*) FILTER (WHERE r.duration_seconds IS NOT NULL AND ${thr} > 0 AND r.duration_seconds < ${thr})::int AS short_duration
       FROM responses r LEFT JOIN surveys s ON s.id = r.survey_id
       WHERE ${whereSql}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
    res.json(rows[0] || { total: 0, unreviewed: 0, verified: 0, flagged: 0, gps_with: 0, short_duration: 0 });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /responses/:id
 * Get response detail with all answers.
 *   - Admin/Supervisor/Viewer: any response
 *   - Surveyor: only their own
 * Requirements: 9.4, 13.5, 15.5
 */
router.get('/:id', authMiddleware, requireRole(['admin', 'supervisor', 'viewer', 'surveyor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const whereClause = { id };
    if (role === 'surveyor') {
      whereClause.surveyor_id = userId;
    }

    const isSurveyor = role === 'surveyor';

    // Base attributes
    const attributes = [
      'id',
      'questionnaire_number',
      'survey_id',
      'surveyor_id',
      'start_time',
      'end_time',
      'duration_seconds',
      'latitude',
      'longitude',
      'geo_status',
      'audio_path',
      'audio_paths',
      'signature_path',
      'photo_paths',
      'start_latitude',
      'start_longitude',
      'start_geo_status',
      'created_at',
    ];

    // Include review fields for non-surveyor roles
    if (!isSurveyor) {
      attributes.push('review_status', 'review_note', 'reviewed_by', 'reviewed_at');
    }

    const includeAssociations = [
      {
        model: Survey,
        as: 'survey',
        attributes: ['id', 'title', 'field_tools_settings'],
      },
      {
        model: User,
        as: 'surveyor',
        attributes: ['id', 'name'],
      },
      {
        model: Answer,
        as: 'answers',
        attributes: ['id', 'question_id', 'answer_value', 'answer_json', 'photo_path', 'created_at'],
        include: [
          {
            model: Question,
            as: 'question',
            attributes: ['id', 'text', 'type', 'order_index', 'options', 'auto_fill'],
          },
        ],
      },
    ];

    // Include reviewer association for non-surveyor roles
    if (!isSurveyor) {
      includeAssociations.push({
        model: User,
        as: 'reviewer',
        attributes: ['id', 'name'],
      });
    }

    const response = await Response.findOne({
      where: whereClause,
      attributes,
      include: includeAssociations,
    });

    if (!response) {
      return res.status(404).json({ error: 'Data responden tidak ditemukan' });
    }

    const result = {
      id: response.id,
      questionnaire_number: response.questionnaire_number,
      survey_id: response.survey_id,
      survey_title: response.survey ? response.survey.title : null,
      surveyor_id: response.surveyor_id,
      surveyor_name: response.surveyor ? response.surveyor.name : null,
      start_time: response.start_time,
      end_time: response.end_time,
      duration_seconds: response.duration_seconds,
      latitude: response.latitude,
      longitude: response.longitude,
      geo_status: response.geo_status,
      audio_path: response.audio_path,
      audio_paths: Array.isArray(response.audio_paths) && response.audio_paths.length > 0
        ? response.audio_paths
        : (response.audio_path ? [response.audio_path] : []),
      signature_path: response.signature_path,
      photo_paths: response.photo_paths,
      start_latitude: response.start_latitude,
      start_longitude: response.start_longitude,
      start_geo_status: response.start_geo_status,
      created_at: response.created_at,
      // QC: durasi pengisian mencurigakan (di bawah ambang survei).
      short_duration: isShortDuration(response.duration_seconds, response.survey && response.survey.field_tools_settings),
      answers: (response.answers || []).map((a) => ({
        id: a.id,
        question_id: a.question_id,
        answer_value: a.answer_value,
        answer_json: a.answer_json,
        photo_path: a.photo_path,
        created_at: a.created_at,
        question_text: a.question ? a.question.text : null,
        question_type: a.question ? a.question.type : null,
        question_order: a.question ? a.question.order_index : null,
        question_options: a.question ? a.question.options : null,
        question_auto_fill: a.question ? a.question.auto_fill : null,
      })),
    };

    if (!isSurveyor) {
      result.review_status = response.review_status;
      result.review_note = response.review_note;
      result.reviewed_by = response.reviewed_by;
      result.reviewed_at = response.reviewed_at;
      result.reviewer_name = response.reviewer ? response.reviewer.name : null;
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /responses/:id/review
 * Update review status and note for a response.
 * Body: { review_status, review_note? }
 * Returns: { id, review_status, review_note, reviewed_by, reviewed_at, reviewer_name }
 * Requires: authMiddleware + requireRole(['admin', 'supervisor'])
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2
 */
router.patch('/:id/review', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { review_status, review_note } = req.body;

    // Validate review_status
    const validStatuses = ['unreviewed', 'flagged', 'verified'];
    if (!validStatuses.includes(review_status)) {
      return res.status(400).json({
        error: 'Status review tidak valid. Gunakan: unreviewed, flagged, atau verified',
      });
    }

    // Find response
    const response = await Response.findByPk(id);
    if (!response) {
      return res.status(404).json({ error: 'Data responden tidak ditemukan' });
    }

    // Capture old review state for audit log
    const oldValue = {
      review_status: response.review_status,
      review_note: response.review_note,
    };

    // Update review fields
    const reviewedAt = new Date();
    await response.update({
      review_status,
      review_note: review_note !== undefined ? review_note : null,
      reviewed_by: req.user.id,
      reviewed_at: reviewedAt,
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'REVIEW_RESPONSE',
      entityType: 'response',
      entityId: id,
      oldValue,
      newValue: {
        review_status,
        review_note: review_note !== undefined ? review_note : null,
      },
      ipAddress: req.ip,
    });

    // Fetch reviewer name
    const reviewer = await User.findByPk(req.user.id, { attributes: ['name'] });

    res.json({
      id: response.id,
      review_status: response.review_status,
      review_note: response.review_note,
      reviewed_by: response.reviewed_by,
      reviewed_at: response.reviewed_at,
      reviewer_name: reviewer ? reviewer.name : null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
