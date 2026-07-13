'use strict';

/**
 * Utilitas QC: memeriksa konsistensi jawaban jenis kelamin terhadap paritas
 * Nomor Kuesioner (ganjil → odd_value, genap → even_value), sesuai konfigurasi
 * auto_fill pada pertanyaan single_choice.
 */

/**
 * Nilai jenis kelamin yang DIHARAPKAN dari paritas nomor kuesioner.
 * @param {string|number|null} numberStr - nilai jawaban unique_id (nomor kuesioner)
 * @param {object|null} autoFill - { source, odd_value, even_value }
 * @returns {string|null} nilai opsi yang diharapkan, atau null bila tak dapat dinilai
 */
function parityExpectedGender(numberStr, autoFill) {
  if (!autoFill || autoFill.source !== 'questionnaire_number_parity') return null;
  const s = String(numberStr == null ? '' : numberStr).trim();
  // Butuh bilangan bulat untuk menentukan ganjil/genap.
  if (!/^\d+$/.test(s)) return null;
  const isEven = parseInt(s, 10) % 2 === 0;
  return isEven ? autoFill.even_value : autoFill.odd_value;
}

/**
 * Apakah jawaban jenis kelamin TIDAK sesuai paritas nomor kuesioner?
 * @param {string|number|null} numberStr - nilai unique_id
 * @param {string|null} genderValue - nilai jawaban jenis kelamin
 * @param {object|null} autoFill - konfigurasi auto_fill
 * @returns {boolean|null} true = tak sesuai, false = sesuai,
 *   null = tak dapat dinilai (nomor bukan angka / gender belum dijawab / non-paritas)
 */
function isGenderParityMismatch(numberStr, genderValue, autoFill) {
  const expected = parityExpectedGender(numberStr, autoFill);
  if (expected == null) return null;
  const g = genderValue == null ? '' : String(genderValue);
  if (g === '') return null; // jenis kelamin belum dijawab → tidak dinilai
  return g !== expected;
}

module.exports = { parityExpectedGender, isGenderParityMismatch };
