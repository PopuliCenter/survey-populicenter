/**
 * appUpdate.js — pemberitahuan & pemasangan pembaruan APK TPD.
 *
 * Sumber: GET /public/app-version (diumumkan admin di Status Sistem).
 *  - versi aplikasi < version_code     → "versi baru tersedia" (boleh ditunda)
 *  - versi aplikasi < min_version_code → WAJIB update (data tertunda tetap bisa
 *    dikirim dulu)
 *
 * Cara memperbarui (startUpdate):
 *  - ada apk_url + SHA-256 & build ini boleh memasang APK → unduh, verifikasi,
 *    buka pemasang Android langsung dari aplikasi (AppUpdaterPlugin.java)
 *  - selain itu (build Google Play, atau tanpa apk_url) → buka page_url
 *    (populicenter.org, kelak halaman Google Play).
 *
 * Hanya berlaku di APK. Web selalu memuat versi terbaru dari server.
 */

import { registerPlugin } from '@capacitor/core';
import api from '../services/api';
import { isNativePlatform, getAppVersion } from './capacitorBridge';
import { localStore } from './safeStorage';

const AppUpdater = registerPlugin('AppUpdater');

const DISMISS_KEY = 'app_update_dismissed';
export const DISMISS_MS = 24 * 60 * 60 * 1000;

/**
 * Tentukan status pembaruan (fungsi murni — mudah diuji).
 * @param {number} currentCode versionCode aplikasi yang terpasang
 * @param {object|null} release rilis terbaru dari server
 * @returns {'none'|'available'|'required'}
 */
export function evaluateUpdate(currentCode, release) {
  if (!release || !Number.isInteger(currentCode) || currentCode < 1) return 'none';
  if (Number.isInteger(release.min_version_code) && currentCode < release.min_version_code) return 'required';
  if (Number.isInteger(release.version_code) && currentCode < release.version_code) return 'available';
  return 'none';
}

/** Banner "versi baru" ditunda 24 jam per versi bila TPD memilih "Nanti". */
export function isDismissed(release, now = Date.now()) {
  try {
    const d = JSON.parse(localStore.getItem(DISMISS_KEY) || 'null');
    return !!d && d.code === release?.version_code && now - d.at < DISMISS_MS;
  } catch {
    return false;
  }
}

export function dismissRelease(release, now = Date.now()) {
  try { localStore.setItem(DISMISS_KEY, JSON.stringify({ code: release.version_code, at: now })); } catch { /* abaikan */ }
}

/**
 * Cek pembaruan. Tak pernah melempar — gagal (offline, server lama) = 'none'.
 * @returns {Promise<{ state: 'none'|'available'|'required', release: object|null, currentCode: number|null }>}
 */
export async function checkForUpdate() {
  if (!isNativePlatform()) return { state: 'none', release: null, currentCode: null };
  try {
    const [{ build }, res] = await Promise.all([getAppVersion(), api.get('/public/app-version')]);
    const currentCode = parseInt(build, 10);
    const release = res?.data?.release || null;
    return { state: evaluateUpdate(currentCode, release), release, currentCode };
  } catch {
    return { state: 'none', release: null, currentCode: null };
  }
}

/** Apakah build ini bisa memasang APK langsung (bukan build Play)? */
async function canInstallDirectly(release) {
  if (!release?.apk_url || !release?.apk_sha256) return false;
  try {
    const { declared } = await AppUpdater.getInstallSupport();
    return !!declared;
  } catch {
    return false; // plugin tak ada (APK lama / web)
  }
}

/**
 * Jalankan pembaruan.
 * @param {object} release
 * @param {{ onProgress?: (pct: number|null) => void }} [opts]
 * @returns {Promise<'installer_opened'|'needs_permission'|'opened_page'>}
 */
export async function startUpdate(release, { onProgress } = {}) {
  if (await canInstallDirectly(release)) {
    const handle = onProgress
      ? await AppUpdater.addListener('downloadProgress', ({ downloaded, total }) => {
        onProgress(total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
      })
      : null;
    try {
      const { status } = await AppUpdater.downloadAndInstall({ url: release.apk_url, sha256: release.apk_sha256 });
      return status;
    } finally {
      try { await handle?.remove(); } catch { /* abaikan */ }
    }
  }
  await openReleasePage(release);
  return 'opened_page';
}

/** Buka halaman unduh resmi (populicenter.org / Google Play). */
export async function openReleasePage(release) {
  try {
    await AppUpdater.openUrl({ url: release.page_url });
  } catch {
    // APK tanpa plugin: biarkan WebView meneruskan ke peramban sistem.
    window.open(release.page_url, '_blank', 'noopener');
  }
}

/** Layar "Izinkan dari sumber ini" — dibutuhkan sekali sebelum pemasangan pertama. */
export async function openInstallSettings() {
  await AppUpdater.openInstallSettings();
}

/** Pasang berkas yang sudah terunduh setelah izin diberikan. */
export async function installDownloaded(release) {
  const { status } = await AppUpdater.installDownloaded({ sha256: release.apk_sha256 });
  return status;
}

/** Pesan galat yang dimengerti TPD. */
export function updateErrorMessage(err) {
  const code = err?.code || '';
  if (code === 'CHECKSUM_MISMATCH') return 'Berkas unduhan tidak cocok dengan versi resmi. Coba lagi, atau unduh lewat halaman resmi.';
  if (code === 'URL_NOT_ALLOWED' || code === 'REDIRECT_NOT_ALLOWED') return 'Tautan unduhan bukan dari situs resmi Populi Center.';
  if (code === 'BUSY') return 'Unduhan masih berjalan.';
  if (code.startsWith('HTTP_') || code === 'DOWNLOAD_FAILED') return 'Unduhan gagal. Periksa sinyal lalu coba lagi.';
  return 'Pembaruan gagal. Coba lagi, atau unduh lewat halaman resmi.';
}
