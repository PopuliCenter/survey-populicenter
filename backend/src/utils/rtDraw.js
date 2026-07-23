'use strict';

/**
 * rtDraw.js — Undian RT acak yang DETERMINISTIK & bisa diaudit.
 *
 * Menggantikan "Lembar Angka Acak" (FORM A) yang selama ini discan manual oleh
 * TPD. Di kertas, TPD menyusuri tabel angka acak mencari nilai <= jumlah RT;
 * cara itu rawan salah arah scan DAN rawan dipilih sesukanya (mis. mengambil
 * angka yang kebetulan menunjuk RT dekat jalan) tanpa bisa dibuktikan.
 *
 * Di sini undian dilakukan SERVER, dan seluruh hasil dapat dihitung ulang dari
 * (seed, totalRt, count). Artinya supervisor bisa memverifikasi bahwa hasil yang
 * tersimpan memang keluaran algoritma ini — bukan angka karangan. Verifikasi
 * semacam ini tidak mungkin dilakukan pada lembar kertas.
 *
 * CATATAN: keacakan di sini untuk penarikan sampel survei, BUKAN kriptografi.
 * Yang penting reproducible & seragam, bukan tahan serangan.
 */

const crypto = require('crypto');

// v2 = replika digital FORM A (grid 10x10 angka 1-100, scan baris, ambil yang
// <= jumlah RT). v1 (Fisher-Yates) dipertahankan HANYA untuk memverifikasi
// undian lama yang tersimpan dengan algo_version 1.
const ALGO_VERSION = 2;
const MAX_RT = 100; // Form A memakai angka 1-100 — jumlah RT per kelurahan maks 100
const GRID_COLS = 10;
const GRID_ROWS = 10;

/**
 * PRNG mulberry32 — kecil, cepat, distribusi seragam, dan hasilnya identik di
 * mesin mana pun (tidak bergantung Math.random bawaan runtime).
 * @param {number} a - state awal (uint32)
 * @returns {() => number} fungsi penghasil angka [0,1)
 */
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
 * Ubah seed string apa pun menjadi state uint32 yang stabil.
 * @param {string} seed
 * @returns {number}
 */
function seedToUint32(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest();
  return hash.readUInt32BE(0);
}

/**
 * Buat seed acak baru untuk satu undian.
 * @returns {string} hex 32 karakter
 */
function generateSeed() {
  return crypto.randomBytes(16).toString('hex');
}

function validateParams({ seed, totalRt, count }) {
  if (!Number.isInteger(totalRt) || totalRt < 1 || totalRt > MAX_RT) {
    throw new Error(`Jumlah RT harus bilangan bulat 1–${MAX_RT}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Jumlah RT yang dipilih harus bilangan bulat minimal 1');
  }
  if (count > totalRt) {
    throw new Error(`Tidak bisa memilih ${count} RT dari total ${totalRt} RT`);
  }
  if (!seed) {
    throw new Error('Seed undian wajib ada');
  }
}

/**
 * v1 (LEGACY) — Fisher-Yates parsial. Jangan dipakai untuk undian baru;
 * dipertahankan hanya agar undian lama (algo_version 1) tetap terverifikasi.
 */
function drawRtV1({ seed, totalRt, count }) {
  validateParams({ seed, totalRt, count });
  const rand = mulberry32(seedToUint32(seed));
  const pool = Array.from({ length: totalRt }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (totalRt - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/**
 * Grid angka acak ala FORM A: deretan sel berisi angka 1–100 (persis rumus
 * Excel resmi `=INT(RAND()*100)+1`), dibangkitkan deterministik dari seed.
 * Sel ke-0..99 = grid 10x10 yang DITAMPILKAN; bila belum cukup angka lolos,
 * deret dilanjutkan (baris ke-11, 12, …) dengan aliran acak yang sama.
 *
 * @param {string} seed
 * @param {number} cells - berapa sel yang dibangkitkan
 * @returns {number[]}
 */
function generateFormAGrid(seed, cells = GRID_ROWS * GRID_COLS) {
  const rand = mulberry32(seedToUint32(seed));
  const out = new Array(cells);
  for (let i = 0; i < cells; i++) out[i] = Math.floor(rand() * 100) + 1;
  return out;
}

/**
 * Undi `count` nomor RT — REPLIKA DIGITAL FORM A (metodologi resmi Populi):
 * scan grid dari baris 1 kolom 1 ke kanan lalu turun; angka yang LEBIH KECIL
 * ATAU SAMA DENGAN jumlah RT terpilih; duplikat angka yang sudah terpilih
 * dilewati (satu RT tak mungkin diundi dua kali). Bila 100 sel belum
 * menghasilkan cukup angka (jumlah RT sangat kecil), deret dilanjutkan —
 * setara TPD mengambil lembar angka acak berikutnya.
 *
 * Hasil TERURUT SESUAI DITEMUKAN (bukan menaik) — sama seperti di kertas:
 * "RT pertama" adalah angka lolos pertama. Ini juga yang ditampilkan UI
 * beserta gridnya sehingga TPD/SPV bisa mencocokkan dengan mata.
 *
 * @param {object} params - { seed, totalRt, count }
 * @returns {{ selected: number[], picks: Array<{cell: number, value: number}>, gridCells: number }}
 *   picks.cell = indeks sel (0-based, baris = floor(cell/10), kolom = cell%10)
 */
function drawRtFormA({ seed, totalRt, count }) {
  validateParams({ seed, totalRt, count });
  const selected = [];
  const picks = [];
  const seen = new Set();
  let cells = GRID_ROWS * GRID_COLS;
  let grid = generateFormAGrid(seed, cells);
  let i = 0;
  while (selected.length < count) {
    if (i >= grid.length) {
      // Lanjutkan deret (baris tambahan) — deterministik dari seed yang sama.
      cells += GRID_COLS;
      grid = generateFormAGrid(seed, cells);
    }
    const value = grid[i];
    if (value <= totalRt && !seen.has(value)) {
      seen.add(value);
      selected.push(value);
      picks.push({ cell: i, value });
    }
    i += 1;
  }
  return { selected, picks, gridCells: cells };
}

/**
 * Undian RT untuk pemakaian BARU (v2, metodologi Form A).
 * @param {object} params - { seed, totalRt, count }
 * @returns {number[]} nomor RT terpilih, urutan sesuai ditemukan di grid
 */
function drawRt(params) {
  return drawRtFormA(params).selected;
}

/**
 * Verifikasi bahwa hasil tersimpan memang keluaran algoritma versinya.
 * Dipakai supervisor/audit untuk membuktikan undian tidak dikarang.
 *
 * @param {object} params - { seed, totalRt, count, algoVersion? } (default v2)
 * @param {number[]} selected - nomor RT yang tersimpan
 * @returns {boolean}
 */
function verifyDraw(params, selected) {
  if (!Array.isArray(selected)) return false;
  let expected;
  try {
    expected = (params.algoVersion === 1 ? drawRtV1 : drawRt)(params);
  } catch {
    return false;
  }
  if (expected.length !== selected.length) return false;
  // v1 tersimpan terurut menaik; v2 sesuai urutan ditemukan. Bandingkan sebagai
  // himpunan TERURUT SAMA: samakan cara banding dengan cara simpan per versi.
  const a = params.algoVersion === 1 ? [...expected] : expected;
  const b = params.algoVersion === 1
    ? [...selected].map(Number).sort((x, y) => x - y)
    : selected.map(Number);
  return a.every((v, i) => v === b[i]);
}

module.exports = {
  drawRt, drawRtFormA, drawRtV1, generateFormAGrid,
  verifyDraw, generateSeed, ALGO_VERSION, MAX_RT, GRID_COLS, GRID_ROWS,
};
