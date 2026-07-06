'use strict';

/**
 * sessionRevocation.js — pembatalan sesi berbasis USER (bukan token).
 *
 * Masalah (audit M1): authMiddleware hanya cek expiry + blacklist token. Bila
 * admin menonaktifkan/menghapus akun, JWT yang sudah terbit tetap berlaku sampai
 * kedaluwarsa (surveyor 12 jam) → revoke tak efektif.
 *
 * Solusi: tandai user_id yang dicabut di Redis. authMiddleware menolaknya. Di-set
 * otomatis oleh hook model User saat is_active→false atau user dihapus, dan
 * DIBERSIHKAN saat is_active→true (re-aktivasi) agar user pulih bisa login lagi.
 * TTL = umur token terpanjang (12 jam); setelah itu token kedaluwarsa sendiri.
 */

const redis = require('../config/redis');

const REVOKE_TTL_SEC = 12 * 60 * 60;
const key = (userId) => `user_revoked:${userId}`;

async function revokeUser(userId) {
  if (!userId) return;
  try { await redis.setex(key(userId), REVOKE_TTL_SEC, '1'); } catch { /* gagal-aman */ }
}

async function clearRevocation(userId) {
  if (!userId) return;
  try { await redis.del(key(userId)); } catch { /* gagal-aman */ }
}

async function isUserRevoked(userId) {
  try { return (await redis.get(key(userId))) != null; } catch { return false; }
}

module.exports = { revokeUser, clearRevocation, isUserRevoked };
