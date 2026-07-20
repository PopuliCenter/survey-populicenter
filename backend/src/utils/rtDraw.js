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

const ALGO_VERSION = 1;
const MAX_RT = 100000; // batas wajar jumlah RT dalam satu kelurahan/desa

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

/**
 * Undi `count` nomor RT berbeda dari 1..totalRt.
 *
 * Memakai Fisher-Yates parsial pada larik 1..totalRt sehingga setiap kombinasi
 * punya peluang sama (tanpa bias modulo, tanpa perlu tolak-ulang).
 *
 * @param {object} params
 * @param {string} params.seed - seed undian (disimpan untuk audit)
 * @param {number} params.totalRt - jumlah RT di kelurahan/desa
 * @param {number} params.count - berapa RT yang dipilih
 * @returns {number[]} nomor urut RT terpilih, terurut menaik
 * @throws {Error} bila input tidak masuk akal
 */
function drawRt({ seed, totalRt, count }) {
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
 * Verifikasi bahwa hasil tersimpan memang keluaran algoritma ini.
 * Dipakai supervisor/audit untuk membuktikan undian tidak dikarang.
 *
 * @param {object} params - { seed, totalRt, count }
 * @param {number[]} selected - nomor RT yang tersimpan
 * @returns {boolean}
 */
function verifyDraw(params, selected) {
  if (!Array.isArray(selected)) return false;
  let expected;
  try {
    expected = drawRt(params);
  } catch {
    return false;
  }
  if (expected.length !== selected.length) return false;
  return expected.every((v, i) => v === Number(selected[i]));
}

module.exports = { drawRt, verifyDraw, generateSeed, ALGO_VERSION, MAX_RT };
