'use strict';

/**
 * time.js
 *
 * Helper zona waktu untuk perhitungan "hari ini" memakai WIB (Asia/Jakarta, UTC+7).
 * Data `created_at` disimpan sebagai timestamptz (UTC); batas "hari" untuk dashboard
 * dihitung dalam WIB agar sesuai persepsi pengguna di Indonesia (reset jam 00:00 WIB,
 * bukan 07:00 WIB seperti bila memakai UTC).
 *
 * WIB tidak memakai DST, jadi offset tetap +7 jam — aman dihitung dengan offset konstan.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tanggal kalender WIB ('YYYY-MM-DD') untuk sebuah momen.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function wibDateString(date = new Date()) {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Rentang satu hari WIB dinyatakan dalam UTC (untuk filter kolom timestamptz).
 * Mis. "hari ini WIB" 00:00–23:59:59.999 WIB → pasangan Date UTC yang setara.
 * @param {Date} [date=new Date()]
 * @returns {{ start: Date, end: Date }}
 */
function wibDayRangeUTC(date = new Date()) {
  const wibNow = new Date(date.getTime() + WIB_OFFSET_MS);
  const y = wibNow.getUTCFullYear();
  const m = wibNow.getUTCMonth();
  const d = wibNow.getUTCDate();
  // WIB tengah malam = UTC midnight tanggal tsb dikurangi offset WIB.
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - WIB_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - WIB_OFFSET_MS);
  return { start, end };
}

module.exports = { wibDateString, wibDayRangeUTC, WIB_OFFSET_MS };
