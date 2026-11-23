'use strict';

/**
 * sessionRevocation.js — pembatalan sesi berbasis USER (bukan per token).
 *
 * JWT tak bisa ditarik setelah terbit. Dua penanda di Redis membuat authMiddleware
 * menolaknya sebelum kedaluwarsa:
 *
 *  1. user_revoked:<id>     — akun dinonaktifkan/dihapus → SEMUA token ditolak.
 *     Di-set hook model User saat is_active→false / destroy, DIHAPUS saat
 *     re-aktivasi agar user pulih bisa login lagi.
 *  2. user_valid_after:<id> — password diganti → token yang terbit SEBELUM saat
 *     itu ditolak (token baru hasil login ulang tetap jalan). Mencegah penyerang
 *     yang sudah memegang token tetap masuk setelah password direset admin.
 *
 * TTL kedua penanda WAJIB ≥ umur token terpanjang. Dulu TTL 12 jam sementara token
 * TPD 30 hari → TPD yang dinonaktifkan bisa masuk lagi setelah 12 jam (audit
 * 2026-11-23). Karena itu umur token didefinisikan DI SINI dan dipakai auth.js.
 *
 * Gagal-aman: Redis mati → tidak memblokir (pemeriksaan dilewati).
 */

const redis = require('../config/redis');

// Umur JWT per role (detik) — sumber tunggal; dibaca routes/auth.js saat login.
// TPD 30 hari: kerja lapangan berhari-hari & sinkron offline. Dashboard 8 jam.
const TOKEN_TTL_SEC = {
  surveyor: 30 * 24 * 60 * 60,
  default: 8 * 60 * 60,
};
const MAX_TOKEN_TTL_SEC = Math.max(...Object.values(TOKEN_TTL_SEC));
// Penanda hidup sedikit lebih lama dari token terpanjang (selisih jam server).
const MARKER_TTL_SEC = MAX_TOKEN_TTL_SEC + 24 * 60 * 60;

const revokedKey = (userId) => `user_revoked:${userId}`;
const validAfterKey = (userId) => `user_valid_after:${userId}`;

/** Umur token (detik) untuk role tertentu. */
function tokenTtlSec(role) {
  return TOKEN_TTL_SEC[role] || TOKEN_TTL_SEC.default;
}

async function revokeUser(userId) {
  if (!userId) return;
  try { await redis.setex(revokedKey(userId), MARKER_TTL_SEC, '1'); } catch { /* gagal-aman */ }
}

async function clearRevocation(userId) {
  if (!userId) return;
  try { await redis.del(revokedKey(userId)); } catch { /* gagal-aman */ }
}

/** Tolak semua token user ini yang terbit sebelum `nowMs` (detik penuh). */
async function invalidateSessionsBefore(userId, nowMs = Date.now()) {
  if (!userId) return;
  const sec = Math.floor(nowMs / 1000);
  try { await redis.setex(validAfterKey(userId), MARKER_TTL_SEC, String(sec)); } catch { /* gagal-aman */ }
}

async function isUserRevoked(userId) {
  try { return (await redis.get(revokedKey(userId))) != null; } catch { return false; }
}

/**
 * Apakah token (payload JWT terverifikasi) masih boleh dipakai?
 * @returns {Promise<null|'revoked'|'stale'>} null = boleh.
 */
async function sessionRejection(payload) {
  if (!payload || !payload.id) return null;
  if (await isUserRevoked(payload.id)) return 'revoked';
  try {
    const raw = await redis.get(validAfterKey(payload.id));
    const validAfter = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(validAfter) && Number.isFinite(payload.iat) && payload.iat < validAfter) {
      return 'stale';
    }
  } catch { /* gagal-aman */ }
  return null;
}

module.exports = {
  TOKEN_TTL_SEC,
  MARKER_TTL_SEC,
  tokenTtlSec,
  revokeUser,
  clearRevocation,
  invalidateSessionsBefore,
  isUserRevoked,
  sessionRejection,
};
