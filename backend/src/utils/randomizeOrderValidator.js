'use strict';

/**
 * randomizeOrderValidator.js — aturan keselamatan RANDOMISASI URUTAN pertanyaan.
 *
 * Latar: skip logic kita bermakna POSISI — "lompat dari X ke Y" menyembunyikan
 * semua pertanyaan DI ANTARA X dan Y. Bila urutan diacak, makna "di antara"
 * berubah per responden: lompatan yang sama menyembunyikan pertanyaan yang
 * berbeda-beda → data tak sebanding antar-responden. Karena itu pertanyaan yang
 * terlibat skip logic HARAM masuk blok acak, dan sebaliknya.
 *
 * Pertanyaan identitas (nomor kuesioner, wilayah, isi-otomatis gender) juga
 * haram diacak — alur data diri harus baku agar TPD tidak bingung.
 *
 * Dipakai rute questions pada: set flag randomize_order, simpan skip_logic,
 * dan reorder (memindah pertanyaan ber-flag ke dalam interval lompatan sama
 * bahayanya dengan memasang flag di sana).
 */

// Tipe yang tak boleh diacak: identitas/struktural.
const EXCLUDED_TYPES = ['unique_id', 'indonesia_region'];

/** Ambil daftar rule jump {sourceId, targetId} dari kumpulan pertanyaan. */
function collectJumpRules(questions) {
  const rules = [];
  for (const q of questions) {
    if (!Array.isArray(q.skip_logic)) continue;
    for (const rule of q.skip_logic) {
      if (rule && rule.action === 'jump_to' && rule.target_question_id) {
        rules.push({ sourceId: q.id, targetId: rule.target_question_id });
      }
    }
  }
  return rules;
}

/** Interval [min,max] order_index (inklusif) untuk sebuah rule; null bila tak lengkap. */
function ruleInterval(rule, orderOf) {
  const a = orderOf[rule.sourceId];
  const b = orderOf[rule.targetId];
  if (a === undefined || b === undefined) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Validasi kumpulan pertanyaan sebuah survei terhadap seluruh aturan blok acak.
 * Dipanggil dengan kondisi SETELAH perubahan diterapkan (calon keadaan baru).
 *
 * @param {Array<{ id, type, order_index, randomize_order, skip_logic, auto_fill }>} questions
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRandomizeOrderState(questions) {
  const orderOf = {};
  const byId = {};
  for (const q of questions) {
    orderOf[q.id] = q.order_index;
    byId[q.id] = q;
  }

  const flagged = questions.filter((q) => q.randomize_order === true);
  if (flagged.length === 0) return { valid: true };

  for (const q of flagged) {
    if (EXCLUDED_TYPES.includes(q.type)) {
      return {
        valid: false,
        error: `Pertanyaan identitas (${q.type}) tidak boleh masuk blok acak urutan.`,
      };
    }
    if (q.auto_fill) {
      return {
        valid: false,
        error: 'Pertanyaan ber-isi-otomatis (mis. jenis kelamin dari nomor kuesioner) tidak boleh masuk blok acak urutan.',
      };
    }
    if (Array.isArray(q.skip_logic) && q.skip_logic.length > 0) {
      return {
        valid: false,
        error: 'Pertanyaan yang punya aturan lompatan (skip logic) tidak boleh masuk blok acak urutan — lompatan bermakna posisi.',
      };
    }
  }

  // Flagged tak boleh jadi target lompatan, dan tak boleh berada DI DALAM
  // interval lompatan mana pun (ikut tersembunyi/tidak harus konsisten posisi).
  const rules = collectJumpRules(questions);
  for (const rule of rules) {
    const target = byId[rule.targetId];
    if (target && target.randomize_order === true) {
      return {
        valid: false,
        error: 'Pertanyaan tujuan lompatan (skip logic) tidak boleh masuk blok acak urutan.',
      };
    }
    const interval = ruleInterval(rule, orderOf);
    if (!interval) continue;
    for (const q of flagged) {
      if (q.order_index > interval[0] && q.order_index < interval[1]) {
        return {
          valid: false,
          error: 'Blok acak urutan tidak boleh berada di antara sumber dan tujuan lompatan (skip logic) — pertanyaan yang dilewati lompatan harus tetap posisinya.',
        };
      }
    }
  }

  return { valid: true };
}

module.exports = { validateRandomizeOrderState, EXCLUDED_TYPES };
