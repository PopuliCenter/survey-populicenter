'use strict';

/**
 * appRelease.js — validasi & bentuk publik rilis aplikasi TPD (APK Android).
 *
 * Aturan tautan: HANYA https ke domain resmi Populi Center atau halaman Google
 * Play. Aplikasi (AppUpdaterPlugin.java) menegakkan daftar yang SAMA — tautan
 * asing tak akan dibuka/diunduh walau lolos di sini. Ubah keduanya bersamaan.
 */

const ALLOWED_HOSTS = [
  'populicenter.org',
  'www.populicenter.org',
  'populicenter.com',
  'www.populicenter.com',
  'play.google.com',
];

const MAX_NOTES = 2000;
const MAX_URL = 500;
const SHA256_RE = /^[0-9a-f]{64}$/i;

function isAllowedUrl(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const toInt = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN));

/**
 * Validasi isian rilis baru.
 * @param {object} body
 * @param {{ version_code: number }|null} latest rilis terakhir platform ini
 * @returns {{ errors: string[], value: object }}
 */
function validateRelease(body, latest) {
  const b = body || {};
  const errors = [];

  const versionCode = toInt(b.version_code);
  const minCode = toInt(b.min_version_code);
  if (!Number.isInteger(versionCode) || versionCode < 1) errors.push('Kode versi wajib bilangan bulat ≥ 1.');
  if (!Number.isInteger(minCode) || minCode < 1) errors.push('Versi minimum wajib bilangan bulat ≥ 1.');
  if (Number.isInteger(versionCode) && Number.isInteger(minCode) && minCode > versionCode) {
    errors.push('Versi minimum tidak boleh lebih besar dari kode versi terbaru.');
  }
  if (latest && Number.isInteger(versionCode) && versionCode < latest.version_code) {
    errors.push(`Kode versi tidak boleh turun dari rilis terakhir (${latest.version_code}).`);
  }

  const versionName = String(b.version_name || '').trim();
  if (versionName.length > 30) errors.push('Nama versi maksimal 30 karakter.');

  const notes = String(b.notes || '').trim();
  if (notes.length > MAX_NOTES) errors.push(`Catatan maksimal ${MAX_NOTES} karakter.`);

  const pageUrl = String(b.page_url || '').trim();
  if (!pageUrl || pageUrl.length > MAX_URL || !isAllowedUrl(pageUrl)) {
    errors.push(`Tautan halaman wajib https ke domain resmi: ${ALLOWED_HOSTS.join(', ')}.`);
  }

  const apkUrl = String(b.apk_url || '').trim();
  const sha = String(b.apk_sha256 || '').trim().toLowerCase();
  if (apkUrl) {
    if (apkUrl.length > MAX_URL || !isAllowedUrl(apkUrl)) {
      errors.push(`Tautan berkas APK wajib https ke domain resmi: ${ALLOWED_HOSTS.join(', ')}.`);
    }
    if (!SHA256_RE.test(sha)) {
      errors.push('SHA-256 berkas APK wajib diisi (64 karakter heksadesimal) bila tautan APK diisi.');
    }
  }

  return {
    errors,
    value: {
      platform: 'android',
      version_code: versionCode,
      version_name: versionName || null,
      min_version_code: minCode,
      notes: notes || null,
      page_url: pageUrl,
      apk_url: apkUrl || null,
      apk_sha256: apkUrl ? sha : null,
    },
  };
}

/** Bentuk yang dibaca aplikasi (tanpa id internal / pembuat). */
function toPublicRelease(row) {
  if (!row) return null;
  return {
    version_code: row.version_code,
    version_name: row.version_name,
    min_version_code: row.min_version_code,
    notes: row.notes,
    page_url: row.page_url,
    apk_url: row.apk_url,
    apk_sha256: row.apk_sha256,
    published_at: row.created_at,
  };
}

module.exports = { ALLOWED_HOSTS, isAllowedUrl, validateRelease, toPublicRelease };
