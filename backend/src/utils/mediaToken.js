'use strict';

/**
 * mediaToken.js — token akses media berumur-pendek untuk /uploads.
 *
 * Kenapa: <img>/<audio>/<a> tak bisa mengirim header Authorization, jadi token
 * dibawa di query ?t= (yang bisa masuk log akses nginx). Alih-alih menaruh JWT
 * SESI penuh di URL (berumur jam, bisa untuk akses API), kita pakai token
 * KHUSUS-MEDIA:
 *   - berumur pendek (15 menit) → paparan di log cepat kedaluwarsa
 *   - ditandatangani secret TURUNAN dari JWT_SECRET → TIDAK bisa diverifikasi
 *     authMiddleware (yang pakai JWT_SECRET), sehingga tak bisa dipakai untuk
 *     memanggil API meski bocor.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Secret turunan — beda domain dari JWT_SECRET (dipisah label + hash).
const MEDIA_SECRET = crypto
  .createHash('sha256')
  .update(`${process.env.JWT_SECRET || ''}:media-token-v1`)
  .digest('hex');

const MEDIA_TTL_SEC = 15 * 60; // 15 menit

function signMediaToken({ id, role }) {
  return jwt.sign({ id, role, typ: 'media' }, MEDIA_SECRET, { expiresIn: MEDIA_TTL_SEC });
}

/** @returns {{id:string, role:string}|null} */
function verifyMediaToken(token) {
  try {
    const p = jwt.verify(token, MEDIA_SECRET);
    if (p.typ !== 'media') return null;
    return { id: p.id, role: p.role };
  } catch {
    return null;
  }
}

module.exports = { signMediaToken, verifyMediaToken, MEDIA_TTL_SEC };
