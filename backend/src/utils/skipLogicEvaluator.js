/**
 * skipLogicEvaluator.js
 *
 * Evaluasi skip logic di SISI SERVER — port dari hook frontend
 * `useSkipLogic.js` agar otoritas validasi tetap di backend (klien tidak bisa
 * mengakali pertanyaan wajib hanya dengan menyembunyikannya).
 *
 * Dipakai validasi submit: pertanyaan wajib yang TERSEMBUNYI oleh percabangan
 * tidak boleh dianggap "belum dijawab".
 *
 * Semua fungsi murni (tanpa dependensi DB) agar mudah diuji.
 */

/**
 * Evaluasi satu kondisi skip logic terhadap peta jawaban.
 *
 * @param {{ question_id: string, operator: string, value: string }} condition
 * @param {Object.<string, string|string[]>} answers  Peta question_id → nilai jawaban
 * @returns {boolean} true bila kondisi terpenuhi
 */
function evaluateCondition(condition, answers) {
  if (!condition) return false;
  const { question_id, operator, value: conditionValue } = condition;
  const answer = answers[question_id];

  // Belum ada jawaban → kondisi tidak terpenuhi
  if (answer === undefined || answer === null || answer === '') {
    return false;
  }

  const answerStr = Array.isArray(answer) ? answer.join(',') : String(answer);
  const conditionStr = String(conditionValue);

  switch (operator) {
    case 'equals':
      return answerStr === conditionStr;

    case 'not_equals':
      return answerStr !== conditionStr;

    case 'contains':
      if (Array.isArray(answer)) {
        return answer.includes(conditionValue);
      }
      return answerStr.includes(conditionStr);

    case 'greater_than': {
      const numAnswer = parseFloat(answerStr);
      const numCondition = parseFloat(conditionStr);
      if (Number.isNaN(numAnswer) || Number.isNaN(numCondition)) return false;
      return numAnswer > numCondition;
    }

    case 'less_than': {
      const numAnswer = parseFloat(answerStr);
      const numCondition = parseFloat(conditionStr);
      if (Number.isNaN(numAnswer) || Number.isNaN(numCondition)) return false;
      return numAnswer < numCondition;
    }

    default:
      return false;
  }
}

/**
 * Evaluasi semua kondisi sebuah rule (logika AND).
 * Mendukung format baru `conditions` (array) maupun legacy `condition` (tunggal).
 *
 * @param {object} rule
 * @param {Object} answers
 * @returns {boolean}
 */
function evaluateRule(rule, answers) {
  if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions.every((cond) => evaluateCondition(cond, answers));
  }
  if (rule.condition) {
    return evaluateCondition(rule.condition, answers);
  }
  return false;
}

/**
 * Hitung himpunan question_id yang TERSEMBUNYI berdasarkan jawaban saat ini.
 *
 * Semantik "jump_to": bila rule pada pertanyaan X menyala "lompat ke Y", maka
 * semua pertanyaan ANTARA X dan Y (eksklusif) disembunyikan — Y tetap tampil
 * sebagai titik pendaratan. Iterasi sampai stabil untuk menangani percabangan
 * berantai (chained).
 *
 * @param {Array<{ id: string, skip_logic: Array|null }>} questions  Daftar pertanyaan TERURUT (order_index naik)
 * @param {Object.<string, string|string[]>} answers
 * @returns {Set<string>} himpunan question_id yang tersembunyi
 */
function computeHiddenQuestions(questions, answers) {
  const hidden = new Set();

  const indexMap = {};
  questions.forEach((q, i) => { indexMap[q.id] = i; });

  let changed = true;
  while (changed) {
    changed = false;

    for (const question of questions) {
      if (hidden.has(question.id)) continue;

      const rules = question.skip_logic;
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;

      for (const rule of rules) {
        if (!rule.target_question_id) continue;

        const conditionMet = evaluateRule(rule, answers);
        if (!conditionMet) continue;

        const sourceIndex = indexMap[question.id];
        const targetIndex = indexMap[rule.target_question_id];

        if (sourceIndex == null || targetIndex == null) continue;
        if (targetIndex <= sourceIndex) continue;

        for (let i = sourceIndex + 1; i < targetIndex; i++) {
          const qid = questions[i].id;
          if (!hidden.has(qid)) {
            hidden.add(qid);
            changed = true;
          }
        }
      }
    }
  }

  return hidden;
}

/**
 * Bangun peta jawaban {question_id → nilai} dari array jawaban submit.
 * Nilai disesuaikan tipe agar kondisi skip logic cocok dengan sisi klien:
 *   - multiple_choice → array (answer_json)
 *   - lainnya         → string (answer_value)
 *
 * @param {Array<{question_id, answer_value?, answer_json?}>} answers
 * @param {Map<string, {type: string}>|Object.<string,{type:string}>} questionByIdOrType
 *        Peta question_id → objek pertanyaan (untuk tahu tipe). Boleh Map atau objek biasa.
 * @returns {Object.<string, string|string[]>}
 */
function buildAnswerMap(answers, questionByIdOrType) {
  const getQ = (id) => (
    questionByIdOrType instanceof Map
      ? questionByIdOrType.get(id)
      : questionByIdOrType[id]
  );

  const map = {};
  for (const a of answers || []) {
    const q = getQ(a.question_id);
    const type = q && q.type;
    if (type === 'multiple_choice') {
      map[a.question_id] = Array.isArray(a.answer_json) ? a.answer_json : [];
    } else if (a.answer_value !== undefined && a.answer_value !== null) {
      map[a.question_id] = a.answer_value;
    } else if (a.answer_json !== undefined && a.answer_json !== null) {
      // Fallback untuk tipe non-pilihan yang memakai answer_json (jarang jadi sumber skip logic)
      map[a.question_id] = a.answer_json;
    }
  }
  return map;
}

module.exports = {
  evaluateCondition,
  evaluateRule,
  computeHiddenQuestions,
  buildAnswerMap,
};
