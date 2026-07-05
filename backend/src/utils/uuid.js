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

module.exports = { isUUID };
