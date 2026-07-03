'use strict';

/**
 * mediaFiles.js — bantu menghapus file media fisik (foto/audio/tanda tangan)
 * saat respons/survei dihapus, agar disk langsung lega (tidak menunggu reaper
 * terjadwal). Path yang dihapus wajib berada di dalam folder uploads/.
 */

const fs = require('fs');
const path = require('path');

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

  const [resRows] = await sequelize.query(
    `SELECT audio_path, signature_path, photo_paths FROM responses WHERE id IN (:ids)`,
    { replacements: { ids: responseIds } }
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
    { replacements: { ids: responseIds } }
  );
  for (const a of ansRows) if (a.photo_path) paths.add(a.photo_path);

  return [...paths];
}

/**
 * Hapus file fisik berdasarkan path relatif (mis. "uploads/photos/2024/01/x.jpg").
 * Aman: hanya menghapus file yang benar-benar di dalam uploads/ (cegah traversal).
 *
 * @param {string[]} relPaths
 * @returns {number} jumlah file yang berhasil dihapus
 */
function deleteMediaFiles(relPaths) {
  let deleted = 0;
  for (const rel of relPaths || []) {
    if (!rel || typeof rel !== 'string') continue;
    const full = path.resolve(PROJECT_ROOT, rel);
    // Wajib berada di dalam uploads/ — cegah path traversal.
    if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) continue;
    try {
      fs.unlinkSync(full);
      deleted += 1;
    } catch {
      // File mungkin sudah tak ada / gagal — abaikan (non-kritis).
    }
  }
  return deleted;
}

module.exports = { collectMediaPaths, deleteMediaFiles, UPLOADS_ROOT, PROJECT_ROOT };
