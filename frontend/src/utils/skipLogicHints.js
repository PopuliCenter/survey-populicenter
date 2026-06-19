/**
 * skipLogicHints.js
 *
 * Alat bantu builder: meringkas aturan skip logic sebuah pertanyaan menjadi
 * kalimat yang mudah dibaca DAN mendeteksi konfigurasi bermasalah (lompatan
 * mundur/no-op, tujuan belum dipilih, kondisi belum lengkap).
 *
 * Murni (tanpa React/DOM) agar mudah diuji. Dipakai oleh komponen SkipLogicHint.
 */

// Label operator — selaras dengan SkipLogicEditor.
const OPERATOR_LABELS = {
  equals: 'sama dengan',
  not_equals: 'tidak sama dengan',
  contains: 'mengandung kata',
  greater_than: 'lebih besar dari',
  less_than: 'lebih kecil dari',
};

/** Label pendek pertanyaan: "P3" (1-based dari order_index). */
function qLabel(q) {
  return q ? `P${(q.order_index ?? 0) + 1}` : '?';
}

/** Ambil daftar kondisi sebuah rule (mendukung format baru & legacy). */
function ruleConditions(rule) {
  if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    return rule.conditions;
  }
  return rule.condition ? [rule.condition] : [];
}

/**
 * Analisis satu rule relatif terhadap pertanyaan pemiliknya.
 *
 * @returns {{ summary: string, warning: string|null }}
 */
function analyzeRule(rule, ownerQuestion, questions) {
  const byId = (id) => questions.find((q) => q.id === id);
  const ownerIdx = questions.findIndex((q) => q.id === ownerQuestion.id);
  const conditions = ruleConditions(rule);

  // Teks kondisi: «P1 sama dengan "A" DAN P2 lebih besar dari "3"»
  const condText = conditions.length
    ? conditions
        .map((c) => {
          const src = byId(c.question_id);
          const op = OPERATOR_LABELS[c.operator] || c.operator;
          return `${qLabel(src)} ${op} "${c.value}"`;
        })
        .join(' DAN ')
    : '(kondisi belum diisi)';

  const target = byId(rule.target_question_id);
  const targetIdx = target ? questions.findIndex((q) => q.id === target.id) : -1;

  // ── Deteksi masalah ──────────────────────────────────────────────────────
  let warning = null;
  const condIncomplete =
    conditions.length === 0 ||
    conditions.some((c) => !c.question_id || c.value === '' || c.value == null);

  if (!rule.target_question_id) {
    warning = 'Tujuan lompatan belum dipilih.';
  } else if (targetIdx === -1) {
    warning = 'Pertanyaan tujuan tidak ditemukan (mungkin sudah dihapus).';
  } else if (ownerIdx !== -1 && targetIdx <= ownerIdx) {
    warning = 'Lompatan ke pertanyaan sebelumnya/diri sendiri tidak berpengaruh — tujuan harus SETELAH pertanyaan ini.';
  } else if (ownerIdx !== -1 && targetIdx === ownerIdx + 1) {
    warning = 'Tidak ada pertanyaan yang dilewati (tujuan tepat di bawahnya).';
  } else if (condIncomplete) {
    warning = 'Kondisi belum lengkap (pertanyaan atau nilai kosong).';
  }

  // ── Ringkasan rentang yang dilewati ──────────────────────────────────────
  let skipText;
  if (target && ownerIdx !== -1 && targetIdx > ownerIdx + 1) {
    const from = `P${ownerIdx + 2}`; // pertanyaan tepat setelah pemilik
    const to = `P${targetIdx}`;       // tepat sebelum tujuan
    skipText = from === to ? ` (lewati ${from})` : ` (lewati ${from}–${to})`;
  } else {
    skipText = '';
  }

  const targetLabel = target
    ? `lompat ke ${qLabel(target)}${skipText}`
    : 'lompat ke (belum dipilih)';

  return { summary: `Jika ${condText} → ${targetLabel}`, warning };
}

/**
 * Analisis seluruh skip logic sebuah pertanyaan.
 *
 * @param {{ id: string, order_index?: number, skip_logic?: Array|null }} question
 * @param {Array} questions  Daftar pertanyaan TERURUT (order_index naik)
 * @returns {{
 *   hasBranching: boolean,
 *   ruleCount: number,
 *   rules: Array<{ summary: string, warning: string|null }>,
 *   warnings: string[],   // gabungan unik
 * }}
 */
function analyzeQuestionSkipLogic(question, questions = []) {
  const rules = Array.isArray(question?.skip_logic) ? question.skip_logic : [];
  if (rules.length === 0) {
    return { hasBranching: false, ruleCount: 0, rules: [], warnings: [] };
  }

  const analyzed = rules.map((r) => analyzeRule(r, question, questions));
  const warnings = [...new Set(analyzed.map((a) => a.warning).filter(Boolean))];

  return {
    hasBranching: true,
    ruleCount: rules.length,
    rules: analyzed,
    warnings,
  };
}

export { analyzeQuestionSkipLogic, analyzeRule, OPERATOR_LABELS };
export default analyzeQuestionSkipLogic;
