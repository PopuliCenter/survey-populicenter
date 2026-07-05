'use strict';

/**
 * chunk.js — pecah array jadi potongan berukuran tetap. Dipakai untuk membatasi
 * jumlah id per query `IN (...)` / `Op.in`, menghindari daftar bind-parameter
 * raksasa (Postgres membatasi 65535 parameter per statement) pada operasi
 * survei besar.
 *
 * @template T
 * @param {T[]} arr
 * @param {number} size ukuran maksimum tiap potongan (default 1000)
 * @returns {T[][]}
 */
function chunk(arr, size = 1000) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const n = Math.max(1, size | 0);
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

module.exports = { chunk };
