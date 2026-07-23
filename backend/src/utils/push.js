'use strict';

/**
 * push.js — kirim push notification FCM ke perangkat TPD.
 *
 * Push adalah LAPISAN TAMBAHAN di atas lonceng dalam-aplikasi (tpd_notifications
 * tetap sumber kebenaran): gunanya membangunkan HP yang aplikasinya tertutup.
 * Karena itu SEMUA kegagalan di sini non-fatal — fitur inti tidak boleh gagal
 * hanya karena push bermasalah.
 *
 * Konfigurasi: env FIREBASE_SERVICE_ACCOUNT_PATH menunjuk file kunci service
 * account Firebase (di-mount read-only ke container, TIDAK pernah di repo).
 * Tanpa env / file tidak terbaca → modul jadi no-op dengan satu peringatan
 * (lingkungan dev/tes tetap jalan normal tanpa Firebase).
 */

const fs = require('fs');
const { FcmToken } = require('../models');

let messagingInstance = null; // lazy — hanya dibuat bila kunci tersedia
let initTried = false;

function getMessaging() {
  if (initTried) return messagingInstance;
  initTried = true;

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) return null; // push dinonaktifkan (dev/tes) — senyap saja

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    // API MODULAR (firebase-admin ≥ v14): namespace lama (admin.apps /
    // admin.messaging()) sudah dihapus — memakainya membuat init tumbang
    // dengan "Cannot read properties of undefined" (insiden 2026-07-23).
    // Lazy require: hanya dimuat bila kunci benar-benar tersedia.
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const app = getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
    messagingInstance = getMessaging(app);
    console.log('[Push] FCM aktif (service account terbaca).');
  } catch (err) {
    console.warn(`[Push] FCM NONAKTIF — inisialisasi gagal (kunci: ${keyPath}): ${err.message}`);
    messagingInstance = null;
  }
  return messagingInstance;
}

/** Apakah pengiriman push terkonfigurasi di lingkungan ini? */
function isPushEnabled() {
  return getMessaging() !== null;
}

/**
 * Kirim push ke SEMUA perangkat terdaftar seorang pengguna.
 * Fire-and-forget aman: tidak pernah melempar; token mati dibersihkan otomatis.
 *
 * @param {string} userId
 * @param {{ title: string, body: string, data?: Record<string,string> }} payload
 * @returns {Promise<{ sent: number, pruned: number }>}
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  const messaging = getMessaging();
  if (!messaging || !userId) return { sent: 0, pruned: 0 };

  try {
    const rows = await FcmToken.findAll({
      where: { user_id: userId },
      attributes: ['token'],
      raw: true,
    });
    const tokens = rows.map((r) => r.token).filter(Boolean);
    if (tokens.length === 0) return { sent: 0, pruned: 0 };

    const resp = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        // Isi bisa panjang (catatan supervisor) — Android memotong sendiri.
        title: String(title || 'Populi Survey').slice(0, 200),
        body: String(body || '').slice(0, 1000),
      },
      // Data string-only (aturan FCM) — dipakai aplikasi untuk navigasi kelak.
      data: Object.fromEntries(Object.entries(data)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
    });

    // Bersihkan token yang sudah hangus (aplikasi di-uninstall / token dirotasi)
    // agar tabel tidak menumpuk dan kiriman berikutnya tidak sia-sia.
    const deadTokens = [];
    resp.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-argument'
        || code === 'messaging/invalid-registration-token') {
        deadTokens.push(tokens[i]);
      }
    });
    if (deadTokens.length > 0) {
      await FcmToken.destroy({ where: { token: deadTokens } }).catch(() => {});
    }

    return { sent: resp.successCount, pruned: deadTokens.length };
  } catch (err) {
    console.warn('[Push] Gagal mengirim ke user', userId, '-', err.message);
    return { sent: 0, pruned: 0 };
  }
}

module.exports = { sendPushToUser, isPushEnabled };
