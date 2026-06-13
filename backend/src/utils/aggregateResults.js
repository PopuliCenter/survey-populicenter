'use strict';

/**
 * aggregateResults — menyusun snapshot AGREGAT hasil survei untuk ditayangkan
 * publik di website (populicenter.org).
 *
 * Prinsip privasi (WAJIB):
 *   - Hanya menghitung agregat: distribusi jawaban, jumlah responden, sebaran
 *     wilayah (level provinsi). TIDAK pernah menyertakan jawaban individual,
 *     identitas responden, nomor telepon, GPS mentah, foto, atau teks bebas.
 *   - Tipe pertanyaan teks-bebas / media DI-SKIP (lihat AGGREGATABLE_TYPES).
 *   - Jawaban "__other__:<teks>" dikelompokkan jadi satu bucket "Lainnya" agar
 *     teks bebas yang diketik responden tidak bocor.
 *   - Hanya response COMMITTED (bukan PENDING) yang dihitung.
 */

const { Op } = require('sequelize');
const { Survey, Question, Response, Answer } = require('../models');

// Tipe pertanyaan yang aman diagregasi (kategorikal / numerik / wilayah).
const AGGREGATABLE_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'rating_scale',
  'numeric_scale',
  'matrix',
  'indonesia_region',
]);

// Filter response committed (mengabaikan shell PENDING).
const COMMITTED_FILTER = {
  questionnaire_number: {
    [Op.and]: [{ [Op.ne]: 'PENDING' }, { [Op.notLike]: 'PENDING-%' }],
  },
};

const OTHER_BUCKET = '__other__';

/** Bangun peta value→label dari options pertanyaan pilihan. */
function buildLabelMap(question) {
  const map = {};
  const opts = question.options;
  if (Array.isArray(opts)) {
    for (const o of opts) {
      if (o && typeof o === 'object' && 'value' in o) {
        map[String(o.value)] = o.label != null ? String(o.label) : String(o.value);
      }
    }
  }
  return map;
}

/** Normalisasi satu nilai jawaban → kunci bucket (sembunyikan teks "__other__"). */
function toBucketKey(raw) {
  if (typeof raw === 'string' && raw.startsWith('__other__:')) return OTHER_BUCKET;
  if (raw == null || raw === '') return null;
  return String(raw);
}

/** Ubah Map<bucket,count> menjadi array distribusi terurut (desc) + persen. */
function toDistribution(counts, total, labelMap) {
  const entries = [];
  for (const [value, count] of counts.entries()) {
    const label =
      value === OTHER_BUCKET ? 'Lainnya' : (labelMap[value] != null ? labelMap[value] : value);
    entries.push({
      value,
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

/**
 * Hitung agregat satu pertanyaan dari daftar jawaban miliknya.
 * @returns objek ringkasan agregat untuk pertanyaan tsb.
 */
function aggregateQuestion(question, answers) {
  const base = {
    id: question.id,
    text: question.text,
    type: question.type,
    order_index: question.order_index,
    total_answered: answers.length,
  };

  // ── Pilihan ganda (boleh banyak nilai per responden) ──────────────────────
  if (question.type === 'multiple_choice') {
    const labelMap = buildLabelMap(question);
    const counts = new Map();
    for (const a of answers) {
      const vals = Array.isArray(a.answer_json) ? a.answer_json : [];
      for (const v of vals) {
        const key = toBucketKey(v);
        if (key == null) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return { ...base, distribution: toDistribution(counts, answers.length, labelMap) };
  }

  // ── Matriks: satu distribusi per baris ────────────────────────────────────
  if (question.type === 'matrix') {
    const labelMap = buildLabelMap(question); // label untuk nilai kolom (bila ada)
    const rowNames =
      question.options && Array.isArray(question.options.rows) ? question.options.rows : [];
    const rowCounts = new Map(rowNames.map((r) => [r, new Map()]));
    const rowTotals = new Map(rowNames.map((r) => [r, 0]));

    for (const a of answers) {
      const obj = a.answer_json && typeof a.answer_json === 'object' ? a.answer_json : {};
      for (const rowName of rowNames) {
        const key = toBucketKey(obj[rowName]);
        if (key == null) continue;
        const cm = rowCounts.get(rowName);
        cm.set(key, (cm.get(key) || 0) + 1);
        rowTotals.set(rowName, rowTotals.get(rowName) + 1);
      }
    }

    return {
      ...base,
      rows: rowNames.map((rowName) => ({
        row: rowName,
        total_answered: rowTotals.get(rowName),
        distribution: toDistribution(rowCounts.get(rowName), rowTotals.get(rowName), labelMap),
      })),
    };
  }

  // ── Wilayah Indonesia: distribusi level provinsi ──────────────────────────
  if (question.type === 'indonesia_region') {
    const counts = new Map();
    for (const a of answers) {
      const obj = a.answer_json && typeof a.answer_json === 'object' ? a.answer_json : {};
      const prov = obj.province_name;
      const key = toBucketKey(prov);
      if (key == null) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return { ...base, distribution: toDistribution(counts, answers.length, {}) };
  }

  // ── Skala (rating / numeric): distribusi + rata-rata ──────────────────────
  if (question.type === 'rating_scale' || question.type === 'numeric_scale') {
    const counts = new Map();
    let sum = 0;
    let n = 0;
    for (const a of answers) {
      const raw = a.answer_value != null ? a.answer_value : a.answer_json;
      const key = toBucketKey(raw);
      if (key == null) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      const num = Number(key);
      if (!Number.isNaN(num)) {
        sum += num;
        n += 1;
      }
    }
    return {
      ...base,
      distribution: toDistribution(counts, answers.length, {}),
      average: n > 0 ? Math.round((sum / n) * 100) / 100 : null,
    };
  }

  // ── Pilihan tunggal (default) ─────────────────────────────────────────────
  const labelMap = buildLabelMap(question);
  const counts = new Map();
  for (const a of answers) {
    const raw = a.answer_value != null ? a.answer_value : a.answer_json;
    const key = toBucketKey(raw);
    if (key == null) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { ...base, distribution: toDistribution(counts, answers.length, labelMap) };
}

/**
 * Bangun snapshot agregat lengkap untuk satu survei.
 *
 * @param {string} surveyId
 * @returns {Promise<object>} snapshot { survey, response_count, generated_at, questions[], map }
 * @throws {Error} bila survei tidak ditemukan (error.status = 404)
 */
async function buildSnapshot(surveyId) {
  const survey = await Survey.findByPk(surveyId, {
    attributes: ['id', 'title', 'description', 'type'],
  });
  if (!survey) {
    const err = new Error('Survei tidak ditemukan');
    err.status = 404;
    throw err;
  }

  // Jumlah responden (committed).
  const responseCount = await Response.count({
    where: { survey_id: surveyId, ...COMMITTED_FILTER },
  });

  // Pertanyaan yang aman diagregasi, urut tampilan.
  const questions = await Question.findAll({
    where: { survey_id: surveyId },
    attributes: ['id', 'text', 'type', 'order_index', 'options'],
    order: [['order_index', 'ASC']],
  });
  const aggregatable = questions.filter((q) => AGGREGATABLE_TYPES.has(q.type));

  // Ambil semua jawaban (committed) untuk pertanyaan-pertanyaan tsb sekaligus,
  // lalu kelompokkan per question_id di memori.
  const answersByQuestion = new Map(aggregatable.map((q) => [q.id, []]));
  if (aggregatable.length > 0) {
    const answers = await Answer.findAll({
      where: { question_id: { [Op.in]: aggregatable.map((q) => q.id) } },
      attributes: ['question_id', 'answer_value', 'answer_json'],
      include: [
        {
          model: Response,
          as: 'response',
          attributes: [],
          required: true,
          where: { survey_id: surveyId, ...COMMITTED_FILTER },
        },
      ],
    });
    for (const a of answers) {
      const bucket = answersByQuestion.get(a.question_id);
      if (bucket) bucket.push(a);
    }
  }

  const questionSummaries = aggregatable.map((q) =>
    aggregateQuestion(q, answersByQuestion.get(q.id) || [])
  );

  // Peta sebaran: dari pertanyaan indonesia_region PERTAMA (level provinsi).
  let map = null;
  const firstRegion = questionSummaries.find((q) => q.type === 'indonesia_region');
  if (firstRegion && firstRegion.distribution && firstRegion.distribution.length > 0) {
    map = {
      level: 'province',
      source_question_id: firstRegion.id,
      regions: firstRegion.distribution.map((d) => ({ name: d.label, count: d.count })),
    };
  }

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description || null,
      type: survey.type,
    },
    response_count: responseCount,
    questions: questionSummaries,
    map,
  };
}

module.exports = { buildSnapshot, aggregateQuestion, AGGREGATABLE_TYPES };
