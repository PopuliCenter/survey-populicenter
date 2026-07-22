/**
 * questionOrder.js — RANDOMISASI URUTAN pertanyaan (blok acak) per responden.
 *
 * Aturan (ditegakkan juga oleh server — utils/randomizeOrderValidator):
 *   - Pertanyaan ber-`randomize_order: true` yang BERSEBELAHAN membentuk satu
 *     blok; urutan dikocok hanya DI DALAM blok. Pertanyaan lain tidak bergeser.
 *   - Pertanyaan identitas & yang terlibat skip logic tak pernah ber-flag
 *     (builder + server menolaknya), jadi lompatan tetap bermakna.
 *
 * Seed = surveyId + nomor kuesioner → tiap responden mendapat urutan berbeda,
 * TETAPI urutan yang sama bila draft ditunda lalu dilanjutkan, dan supervisor
 * bisa mereproduksi urutan yang dilihat responden mana pun (auditable).
 * Jawaban tetap tersimpan per question_id — data & ekspor tidak terpengaruh.
 */

/** Hash string → uint32 (xmur3) — deterministik lintas perangkat. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** PRNG mulberry32 — sama dengan yang dipakai undian RT. */
function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates deterministik. Mengembalikan larik BARU; elemen referensi sama.
 * @template T
 * @param {T[]} array
 * @param {string} seedStr
 * @returns {T[]}
 */
export function seededShuffle(array, seedStr) {
  const arr = [...array];
  const rand = mulberry32(xmur3(String(seedStr)));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Susun urutan TAMPIL pertanyaan: kocok tiap blok `randomize_order` yang
 * bersebelahan, sisanya tetap. Tanpa blok → larik yang sama (referensi asli).
 *
 * @param {Array<{ id: string, randomize_order?: boolean }>} questions - sudah terurut order_index
 * @param {string} seedStr - mis. `${surveyId}__${nomorKuesioner}`
 * @returns {Array} urutan tampil
 */
export function computeDisplayQuestions(questions, seedStr) {
  if (!Array.isArray(questions) || questions.length === 0) return questions || [];
  if (!questions.some((q) => q.randomize_order === true)) return questions;

  const out = [];
  let block = [];
  const flush = () => {
    if (block.length === 0) return;
    // Seed per blok (id anggota pertama URUTAN ASLI ikut serta) agar dua blok
    // dalam satu survei tidak dikocok dengan permutasi identik.
    const blockSeed = `${seedStr}__${block[0].id}`;
    out.push(...(block.length > 1 ? seededShuffle(block, blockSeed) : block));
    block = [];
  };
  for (const q of questions) {
    if (q.randomize_order === true) block.push(q);
    else { flush(); out.push(q); }
  }
  flush();
  return out;
}
