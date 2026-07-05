'use strict';

/**
 * mediaFiles.js — bantu menghapus file media fisik (foto/audio/tanda tangan)
 * saat respons/survei dihapus, agar disk langsung lega (tidak menunggu reaper
 * terjadwal). Path yang dihapus wajib berada di dalam folder uploads/.
 */

const fsp = require('fs').promises;
const path = require('path');
const { chunk } = require('./chunk');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'uploads');

/**
 * Kumpulkan path media (relatif, seperti tersimpan di DB) dari sekumpulan
 * response id — mencakup responses.audio_path/signature_path/photo_paths dan
 * answers.photo_path.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string[]} responseIds
 * @returns {Promise<string[]>}
 */
async function collectMediaPaths(sequelize, responseIds) {
  const paths = new Set();
  if (!responseIds || responseIds.length === 0) return [];

  // Pecah per potongan agar daftar `IN (...)` tak melampaui batas bind-parameter
  // Postgres (65535) pada purge/cleanup survei besar.
  for (const ids of chunk(responseIds)) {
    const [resRows] = await sequelize.query(
      `SELECT audio_path, signature_path, photo_paths FROM responses WHERE id IN (:ids)`,
      { replacements: { ids } }
    );
    for (const r of resRows) {
      if (r.audio_path) paths.add(r.audio_path);
      if (r.signature_path) paths.add(r.signature_path);
      if (Array.isArray(r.photo_paths)) {
        for (const p of r.photo_paths) if (p) paths.add(p);
      }
    }

    const [ansRows] = await sequelize.query(
      `SELECT photo_path FROM answers WHERE response_id IN (:ids) AND photo_path IS NOT NULL`,
      { replacements: { ids } }
    );
    for (const a of ansRows) if (a.photo_path) paths.add(a.photo_path);
  }

  return [...paths];
}

/**
 * Hapus file fisik berdasarkan path relatif (mis. "uploads/photos/2024/01/x.jpg").
 * ASYNC + konkurensi terbatas agar tidak memblokir event loop saat menghapus
 * ribuan file (purge survei besar). Aman: hanya menghapus file yang benar-benar
 * di dalam uploads/ (cegah traversal).
 *
 * @param {string[]} relPaths
 * @param {number} [concurrency=16]
 * @returns {Promise<number>} jumlah file yang berhasil dihapus
 */
async function deleteMediaFiles(relPaths, concurrency = 16) {
  const list = (relPaths || []).filter((r) => r && typeof r === 'string');
  if (list.length === 0) return 0;

  let deleted = 0;
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const rel = list[idx++];
      const full = path.resolve(PROJECT_ROOT, rel);
      // Wajib berada di dalam uploads/ — cegah path traversal.
      if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) continue;
      try {
        await fsp.unlink(full);
        deleted += 1;
      } catch {
        // File mungkin sudah tak ada / gagal — abaikan (non-kritis).
      }
    }
  }
  const n = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: n }, worker));
  return deleted;
}

module.exports = { collectMediaPaths, deleteMediaFiles, UPLOADS_ROOT, PROJECT_ROOT };
