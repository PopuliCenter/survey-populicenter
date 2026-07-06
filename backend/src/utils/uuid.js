'use strict';

/**
 * uuid.js — validasi UUID v4-ish. Dipakai sebagai guard defensif sebelum
 * menyisipkan id ke dalam nama identifier SQL (mis. nama sequence) agar aman
 * dari SQL-identifier-injection walau input berubah di refactor mendatang.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Karakter yang aman disisipkan ke nama identifier SQL (nama sequence) SETELAH
// hyphen→underscore: hanya huruf/angka/underscore/hyphen. Cukup untuk mencegah
// SQL-identifier-injection (tak ada kutip/semicolon/spasi/kurung) tanpa memaksa
// format UUID penuh. UUID nyata otomatis lolos. Dipakai di situs `questionnaire_seq_${id}`.
const SAFE_IDENT_RE = /^[A-Za-z0-9_-]+$/;
function isSafeSqlIdent(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 64 && SAFE_IDENT_RE.test(s);
}

module.exports = { isUUID, isSafeSqlIdent };
