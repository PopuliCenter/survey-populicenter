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
const { Survey, Question, Response, Answer, SurveyorQuota } = require('../models');
const { normalizeProvince } = require('./province');

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

/**
 * Ubah Map<bucket,count> menjadi array distribusi + persen.
 * @param {Map} counts
 * @param {number} total
 * @param {object} labelMap
 * @param {Array<string>|null} orderedKeys - bila diberikan, urutkan mengikuti
 *   urutan kunci ini (mis. kolom matriks atau skala menaik) alih-alih frekuensi.
 *   Kunci di luar daftar (mis. "Lainnya") diletakkan di akhir, diurutkan desc by count.
 */
function toDistribution(counts, total, labelMap, orderedKeys = null) {
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
  if (Array.isArray(orderedKeys) && orderedKeys.length > 0) {
    const orderIndex = new Map(orderedKeys.map((k, i) => [String(k), i]));
    entries.sort((a, b) => {
      const ia = orderIndex.has(a.value) ? orderIndex.get(a.value) : Infinity;
      const ib = orderIndex.has(b.value) ? orderIndex.get(b.value) : Infinity;
      if (ia !== ib) return ia - ib;
      return b.count - a.count; // tie-break untuk kunci tak dikenal
    });
  } else {
    entries.sort((a, b) => b.count - a.count);
  }
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
    // Urutkan distribusi tiap baris mengikuti urutan KOLOM yang didefinisikan
    // (bukan frekuensi/peringkat), agar mis. skala 1..10 tampil berurutan.
    const columns =
      question.options && Array.isArray(question.options.columns) ? question.options.columns : null;
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
        distribution: toDistribution(rowCounts.get(rowName), rowTotals.get(rowName), labelMap, columns),
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
    // Urutkan skala menaik (1,2,3,…) bukan berdasarkan frekuensi.
    const scaleOrder = [...counts.keys()]
      .filter((k) => k !== OTHER_BUCKET && !Number.isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b));
    return {
      ...base,
      distribution: toDistribution(counts, answers.length, {}, scaleOrder),
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
 * @param {{ questionIds?: string[]|null }} [options] - bila questionIds diisi,
 *        hanya pertanyaan tsb yang diagregasi (selain itu semua yang bisa).
 * @returns {Promise<object>} snapshot { survey, response_count, questions[], map, target }
 * @throws {Error} bila survei tidak ditemukan (error.status = 404)
 */
async function buildSnapshot(surveyId, options = {}) {
  const questionIds = Array.isArray(options.questionIds) && options.questionIds.length > 0
    ? options.questionIds
    : null;
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
  const aggregatable = questions.filter(
    (q) => AGGREGATABLE_TYPES.has(q.type) && (!questionIds || questionIds.includes(q.id))
  );

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

  // Target total = jumlah seluruh kuota TPD untuk survei ini; capaian = responden
  // committed terhadap target.
  const totalTarget = (await SurveyorQuota.sum('quota', { where: { survey_id: surveyId } })) || 0;
  const target = {
    total: totalTarget,
    achieved: responseCount,
    pct: totalTarget > 0 ? Math.round((responseCount / totalTarget) * 1000) / 10 : null,
  };

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
    target,
  };
}

/**
 * buildMonitoringSnapshot — snapshot MONITORING klien: capaian vs target sampel,
 * total & per provinsi. Berbeda dari buildSnapshot (hasil publik) — ini fokus
 * progres pengumpulan data, bukan distribusi jawaban.
 *
 * Target total = jumlah target per provinsi bila diisi; selain itu jumlah kuota TPD.
 * Capaian per provinsi diturunkan dari pertanyaan tipe indonesia_region (committed).
 *
 * @param {string} surveyId
 * @returns {Promise<object>} { survey, total, regions[], has_region_data }
 * @throws {Error} status 404 bila survei tidak ada
 */
async function buildMonitoringSnapshot(surveyId) {
  const survey = await Survey.findByPk(surveyId, {
    attributes: ['id', 'title', 'type', 'region_targets'],
  });
  if (!survey) {
    const err = new Error('Survei tidak ditemukan');
    err.status = 404;
    throw err;
  }

  const responseCount = await Response.count({
    where: { survey_id: surveyId, ...COMMITTED_FILTER },
  });

  const totalQuota = (await SurveyorQuota.sum('quota', { where: { survey_id: surveyId } })) || 0;
  const regionTargets = Array.isArray(survey.region_targets) ? survey.region_targets : [];
  const totalRegionTarget = regionTargets.reduce((s, r) => s + (Number(r.target) || 0), 0);
  const totalTarget = totalRegionTarget > 0 ? totalRegionTarget : totalQuota;

  // Capaian aktual per provinsi dari pertanyaan wilayah (committed).
  const regionQuestions = await Question.findAll({
    where: { survey_id: surveyId, type: 'indonesia_region' },
    attributes: ['id'],
  });
  const actualByProvince = new Map();
  if (regionQuestions.length > 0) {
    const answers = await Answer.findAll({
      where: { question_id: { [Op.in]: regionQuestions.map((q) => q.id) } },
      attributes: ['answer_json'],
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
      const prov = a.answer_json && typeof a.answer_json === 'object' ? a.answer_json.province_name : null;
      const key = normalizeProvince(prov);
      if (!key) continue;
      actualByProvince.set(key, (actualByProvince.get(key) || 0) + 1);
    }
  }

  // Gabung provinsi dari target + aktual.
  const merged = new Map();
  for (const r of regionTargets) {
    const key = normalizeProvince(r.province);
    if (!key) continue;
    merged.set(key, { province: r.province, target: Number(r.target) || 0, actual: actualByProvince.get(key) || 0 });
  }
  for (const [key, actual] of actualByProvince) {
    if (!merged.has(key)) merged.set(key, { province: key, target: 0, actual });
  }

  const regions = Array.from(merged.values())
    .map((r) => ({
      province: r.province,
      target: r.target,
      actual: r.actual,
      pct: r.target > 0 ? Math.round((r.actual / r.target) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.actual - a.actual);

  return {
    survey: { id: survey.id, title: survey.title, type: survey.type },
    total: {
      target: totalTarget,
      achieved: responseCount,
      pct: totalTarget > 0 ? Math.round((responseCount / totalTarget) * 1000) / 10 : null,
    },
    regions,
    has_region_data: regionQuestions.length > 0,
  };
}

module.exports = { buildSnapshot, buildMonitoringSnapshot, aggregateQuestion, AGGREGATABLE_TYPES };
