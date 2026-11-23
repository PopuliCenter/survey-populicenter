/**
 * deviceOwner.js — data lapangan di HP milik SATU TPD (HP dipakai bergantian).
 *
 * Masalah (audit 2026-11-23): antrean offline, draf, dan cache per-TPD di HP tidak
 * menyimpan pemiliknya. Bila TPD B login di HP yang masih memegang data TPD A,
 * B bisa melihat & melanjutkan draf A (nama/telepon responden) dan antrean A
 * tersinkron dengan token B → respons tercatat atas nama B.
 *
 * Aturan:
 *  - HP mengingat email TPD terakhir yang login (pemilik data lokal).
 *  - Akun LAIN mencoba login sementara masih ada data belum terkirim → DITOLAK
 *    sebelum menghubungi server (supaya akun B pun tidak ikut terikat ke HP ini).
 *  - Tak ada data tertunda → sisa data per-TPD pemilik lama dibersihkan, akun
 *    baru menjadi pemilik.
 *
 * Data acuan bersama (wilayah, definisi survei, tema) tidak disentuh.
 */

import { localStore } from './safeStorage';
import { getQueueByStatus } from './storage';
import { answersHaveContent } from '../surveyor/utils/surveyDraft';

export const OWNER_KEY = 'device_owner_email';

// Kunci localStorage milik satu TPD (persis atau berawalan).
const PER_USER_KEYS = ['tpd_notifications', 'offline_quota_map', 'tpd:lastSeenSurveys', 'last_download_time'];
const PER_USER_PREFIXES = ['survey_draft_', 'rt_tickets__'];

const norm = (email) => String(email || '').trim().toLowerCase();

/** "tpd1@populi.com" → "t***1@populi.com" (cukup dikenali, tak membocorkan penuh). */
export function maskEmail(email) {
  const [name, domain] = norm(email).split('@');
  if (!name || !domain) return 'akun lain';
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

function allLocalKeys() {
  const keys = [];
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
  } catch { /* localStorage tak tersedia */ }
  return keys;
}

/** Jumlah draf yang benar-benar berisi jawaban. */
export function countDraftsWithContent() {
  let n = 0;
  for (const key of allLocalKeys()) {
    if (!key.startsWith('survey_draft_')) continue;
    try {
      const d = JSON.parse(localStore.getItem(key) || 'null');
      if (d && answersHaveContent(d.answers)) n += 1;
    } catch { n += 1; /* tak terbaca → anggap ada isi (aman) */ }
  }
  return n;
}

/** Jumlah data lapangan yang belum terkirim (antrean pending/gagal + draf berisi). */
export async function countUnsyncedLocalData() {
  let queued = 0;
  try {
    const [pending, failed] = await Promise.all([getQueueByStatus('pending'), getQueueByStatus('failed')]);
    queued = (pending?.length || 0) + (failed?.length || 0);
  } catch { /* penyimpanan offline tak tersedia (web tanpa IndexedDB) */ }
  return queued + countDraftsWithContent();
}

/**
 * Cek SEBELUM login: bolehkah `email` masuk di perangkat ini?
 * @returns {Promise<{ allowed: true } | { allowed: false, message: string }>}
 */
export async function checkLoginAllowed(email) {
  const owner = norm(localStore.getItem(OWNER_KEY));
  if (!owner || owner === norm(email)) return { allowed: true };
  const unsynced = await countUnsyncedLocalData();
  if (unsynced === 0) return { allowed: true };
  return {
    allowed: false,
    message: `HP ini masih menyimpan ${unsynced} data milik ${maskEmail(owner)} yang belum terkirim. `
      + 'Masuk dulu dengan akun tersebut dan kirim datanya (Sinkronkan), baru ganti akun.',
  };
}

/** Hapus sisa data lokal per-TPD (dipanggil hanya bila tak ada data tertunda). */
export function purgePerUserLocalData() {
  for (const key of allLocalKeys()) {
    if (PER_USER_KEYS.includes(key) || PER_USER_PREFIXES.some((p) => key.startsWith(p))) {
      localStore.removeItem(key);
    }
  }
}

/**
 * Setelah login sukses: jadikan TPD ini pemilik data lokal. Bila pemiliknya
 * berganti, bersihkan dulu sisa data per-TPD pemilik lama. Role non-TPD (admin
 * membuka HP lapangan) tidak mengubah kepemilikan.
 */
export function claimDeviceForUser(user) {
  if (!user || user.role !== 'surveyor') return;
  const email = norm(user.email);
  if (!email) return;
  const owner = norm(localStore.getItem(OWNER_KEY));
  if (owner && owner !== email) purgePerUserLocalData();
  localStore.setItem(OWNER_KEY, email);
}
