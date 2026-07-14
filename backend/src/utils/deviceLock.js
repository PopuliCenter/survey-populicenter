'use strict';

/**
 * deviceLock.js — utilitas kunci perangkat (1 akun TPD = 1 perangkat).
 *
 * Dipakai di dua tempat:
 *  - auth /login          → TOLAK login bila akun sudah terikat ke perangkat lain.
 *  - responses start/submit → ikat perangkat pertama & tolak perangkat lain
 *                             (khusus survei dengan field_tools_settings.device_lock='enforced').
 *
 * PENGIKATAN hanya terjadi lewat survei ber-device_lock — login tidak pernah
 * mengikat. Jadi TPD yang belum pernah kena kunci tetap bebas login dari mana pun.
 */

/** Identitas perangkat dari header yang dikirim app/web (lihat frontend/src/utils/deviceId.js). */
function readDeviceHeaders(req) {
  return {
    deviceId: String(req.headers['x-device-id'] || '').trim().slice(0, 100),
    deviceLabel: String(req.headers['x-device-label'] || '').slice(0, 255) || null,
  };
}

/** Pesan standar saat akun terikat ke perangkat LAIN. */
function lockedToOtherDeviceMessage(deviceLabel) {
  return `Akun ini terkunci ke perangkat lain${deviceLabel ? ` (${deviceLabel})` : ''}. Gunakan perangkat terdaftar, atau minta admin mereset perangkat di Manajemen TPD.`;
}

/** Pesan saat app tidak mengirim identitas perangkat (mis. APK lama) — jalur LOGIN. */
const LOGIN_MISSING_DEVICE_MESSAGE =
  'Akun ini terkunci ke satu perangkat. Perbarui aplikasi ke versi terbaru lalu coba lagi.';

/**
 * Cek ikatan perangkat untuk user yang SUDAH terikat (users.device_id terisi).
 * TIDAK mengikat perangkat baru.
 *
 * @param {{ device_id?: string|null, device_label?: string|null }} user
 * @param {string} deviceId - dari header X-Device-Id
 * @param {string} missingMessage - pesan bila header kosong
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
function checkBoundDevice(user, deviceId, missingMessage = LOGIN_MISSING_DEVICE_MESSAGE) {
  if (!user || !user.device_id) return { ok: true }; // belum terikat → bebas
  if (!deviceId) return { ok: false, status: 403, error: missingMessage };
  if (user.device_id === deviceId) return { ok: true };
  return { ok: false, status: 403, error: lockedToOtherDeviceMessage(user.device_label) };
}

module.exports = {
  readDeviceHeaders,
  lockedToOtherDeviceMessage,
  checkBoundDevice,
  LOGIN_MISSING_DEVICE_MESSAGE,
};
