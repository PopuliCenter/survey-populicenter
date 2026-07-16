'use strict';

/**
 * mediaStorage.js — Abstraksi penyimpanan media (12-factor faktor 4).
 *
 * Driver dipilih via env MEDIA_STORAGE:
 *   'disk' (default) — perilaku lama: file di volume uploads/.
 *   's3'             — MinIO/S3-compatible (MINIO_* env), kunci objek = path
 *                      persis seperti tersimpan di DB ("uploads/photos/....").
 *
 * Desain aman-rollback: PEMBACAAN selalu mencoba driver utama lalu FALLBACK ke
 * driver satunya (bila terkonfigurasi). Jadi:
 *   - mode s3 : file lama yang belum termigrasi tetap terbaca dari disk;
 *   - kembali ke disk: file yang terlanjur diunggah ke MinIO tetap terbaca.
 *
 * Kunci objek DIJAGA: wajib berawalan "uploads/" dan tanpa segmen ".." —
 * berlaku untuk kedua driver (cegah path traversal).
 */

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'uploads');

const DRIVER = (process.env.MEDIA_STORAGE || 'disk').toLowerCase();
const BUCKET = process.env.MINIO_BUCKET || 'survey-media';

function isS3() {
  return DRIVER === 's3';
}

function s3Configured() {
  return !!(process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY);
}

let minioClient = null;
let bucketEnsured = false;

function client() {
  if (!minioClient) {
    if (!s3Configured()) {
      throw new Error('Storage s3 dipakai tapi MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY belum diset');
    }
    // Lazy require: mode disk (termasuk seluruh suite test) tak menyentuh paket minio.
    const Minio = require('minio');
    minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: parseInt(process.env.MINIO_PORT, 10) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return minioClient;
}

async function ensureBucket() {
  if (bucketEnsured) return;
  const c = client();
  if (!(await c.bucketExists(BUCKET))) {
    await c.makeBucket(BUCKET);
  }
  bucketEnsured = true;
}

/** Validasi kunci/relPath: wajib "uploads/..." tanpa ".." (kedua driver). */
function assertKey(relPath) {
  if (
    typeof relPath !== 'string' ||
    !relPath.startsWith('uploads/') ||
    relPath.split('/').some((seg) => seg === '..' || seg === '')
  ) {
    const err = new Error(`Path media tidak valid: ${relPath}`);
    err.code = 'MEDIA_BAD_PATH';
    throw err;
  }
}

function diskPath(relPath) {
  const full = path.resolve(PROJECT_ROOT, relPath);
  if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) {
    const err = new Error(`Path media di luar uploads/: ${relPath}`);
    err.code = 'MEDIA_BAD_PATH';
    throw err;
  }
  return full;
}

function notFound(relPath) {
  const err = new Error(`Media tidak ditemukan: ${relPath}`);
  err.code = 'MEDIA_NOT_FOUND';
  return err;
}

/** Simpan buffer ke driver AKTIF (tanpa fallback — tulisan harus deterministik). */
async function saveBuffer(relPath, buffer, contentType) {
  assertKey(relPath);
  if (isS3()) {
    await ensureBucket();
    await client().putObject(BUCKET, relPath, buffer, buffer.length, {
      'Content-Type': contentType || 'application/octet-stream',
    });
    return;
  }
  const full = diskPath(relPath);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer);
}

async function getStreamS3(relPath) {
  await ensureBucket();
  const stat = await client().statObject(BUCKET, relPath); // lempar bila tak ada
  const stream = await client().getObject(BUCKET, relPath);
  return {
    stream,
    contentType: (stat.metaData && (stat.metaData['content-type'] || stat.metaData['Content-Type'])) || null,
    size: stat.size,
  };
}

async function getStreamDisk(relPath) {
  const full = diskPath(relPath);
  await fsp.access(full, fs.constants.R_OK); // lempar bila tak ada
  return { stream: fs.createReadStream(full), contentType: null, size: null };
}

/**
 * Ambil stream media. Urutan: driver utama → fallback driver satunya (bila
 * terkonfigurasi). Lempar {code:'MEDIA_NOT_FOUND'} bila tak ada di mana pun.
 */
async function getStream(relPath) {
  assertKey(relPath);
  const attempts = isS3()
    ? [getStreamS3, getStreamDisk]
    : s3Configured()
      ? [getStreamDisk, getStreamS3]
      : [getStreamDisk];
  for (const attempt of attempts) {
    try {
      return await attempt(relPath);
    } catch {
      // lanjut ke sumber berikutnya
    }
  }
  throw notFound(relPath);
}

/** Hapus di SEMUA sumber yang terkonfigurasi (best-effort, tak pernah melempar). */
async function remove(relPath) {
  try {
    assertKey(relPath);
  } catch {
    return false;
  }
  let removed = false;
  try {
    await fsp.unlink(diskPath(relPath));
    removed = true;
  } catch { /* tak ada di disk */ }
  if (s3Configured()) {
    try {
      await ensureBucket();
      await client().removeObject(BUCKET, relPath);
      removed = true;
    } catch { /* tak ada di bucket */ }
  }
  return removed;
}

/**
 * Total ukuran media pada driver AKTIF (byte).
 * - s3  : jumlah size seluruh objek di bucket (listObjects rekursif).
 * - disk: ukuran folder uploads/ (dirSizeBytes).
 * Dipakai halaman Penyimpanan admin agar angka mencerminkan storage sebenarnya.
 */
async function usageBytes() {
  if (isS3()) {
    await ensureBucket();
    return await new Promise((resolve, reject) => {
      let total = 0;
      const stream = client().listObjects(BUCKET, '', true);
      stream.on('data', (obj) => { total += obj.size || 0; });
      stream.on('error', reject);
      stream.on('end', () => resolve(total));
    });
  }
  const { dirSizeBytes } = require('./diskUsage');
  return dirSizeBytes(UPLOADS_ROOT);
}

/** Nama driver aktif untuk ditampilkan di UI ('minio' | 'disk'). */
function driverLabel() {
  return isS3() ? 'minio' : 'disk';
}

module.exports = { isS3, s3Configured, saveBuffer, getStream, remove, usageBytes, driverLabel, BUCKET };
