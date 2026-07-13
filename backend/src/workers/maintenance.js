'use strict';

/**
 * maintenance.js — tugas pemeliharaan terjadwal (berjalan di proses worker,
 * instance tunggal, sehingga aman memakai setInterval).
 *
 * Mengatasi temuan review konkurensi:
 *  - M2: rekonsiliasi statistik survei (perbaiki drift akibat increment
 *        fire-and-forget yang sesekali gagal).
 *  - M3: hapus PENDING response yatim (>24 jam) agar tabel tidak membengkak
 *        dan COUNT kuota tetap cepat.
 *  - M4: reaper media yatim (file upload tak direferensikan response apa pun).
 *        DEFAULT dry-run (hanya melapor); set MEDIA_REAPER_ENABLED=true untuk
 *        benar-benar menghapus.
 *
 * ENV:
 *  MAINTENANCE_INTERVAL_MIN   default 60
 *  PENDING_TTL_HOURS          default 24
 *  MEDIA_REAPER_ENABLED       default false (dry-run)
 *  MEDIA_REAPER_AGE_HOURS     default 48
 */

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Response, Answer, Survey } = require('../models');
const { recomputeSurveyStats, drainDirtyStats } = require('../utils/statisticsUpdater');
const { chunk } = require('../utils/chunk');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const MEDIA_DIRS = ['photos', 'audio', 'signatures'];
const EXPORTS_DIR = path.join(UPLOAD_ROOT, 'exports');

// Nama file arsip sementara yang dibuat route /storage/survey/:id/archive:
// `arsip-<uuid>-<timestamp>.zip`. Regex sengaja ketat (UUID + angka) agar
// sweeper TIDAK menyentuh file lain milik aplikasi/OS di tmpdir.
const TMP_ARCHIVE_RE = /^arsip-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.zip$/i;
const TMP_ARCHIVE_MAX_AGE_MS = 60 * 60 * 1000; // 1 jam

// File hasil job async di uploads/exports (export-*.xlsx/csv, archive-*.zip)
// menumpuk seiring waktu. Sapu yang lebih tua dari ambang (default 48 jam).
const EXPORT_FILE_RE = /^(export|archive)-.*\.(xlsx|csv|zip)$/i;
const EXPORT_MAX_AGE_MS = (parseInt(process.env.EXPORT_TTL_HOURS, 10) || 48) * 60 * 60 * 1000;

// ─── M3: hapus PENDING yatim ───────────────────────────────────────────────────
async function cleanupStalePending() {
  const ttlHours = parseInt(process.env.PENDING_TTL_HOURS, 10) || 24;
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  const pending = await Response.findAll({
    where: {
      questionnaire_number: { [Op.or]: [{ [Op.eq]: 'PENDING' }, { [Op.like]: 'PENDING-%' }] },
      created_at: { [Op.lte]: cutoff },
    },
    attributes: ['id'],
    raw: true,
  });
  const ids = pending.map((r) => r.id);
  if (ids.length === 0) return 0;
  await sequelize.transaction(async (t) => {
    for (const part of chunk(ids)) {
      await Answer.destroy({ where: { response_id: { [Op.in]: part } }, transaction: t });
    }
    for (const part of chunk(ids)) {
      await Response.destroy({ where: { id: { [Op.in]: part } }, transaction: t });
    }
  });
  return ids.length;
}

// ─── M2: rekonsiliasi statistik ────────────────────────────────────────────────
async function reconcileStats() {
  // Semua survei non-draft (draft belum punya respons committed). Termasuk
  // 'inactive'/'completed' agar drift statistik pasca-purge/koreksi ikut pulih,
  // bukan hanya survei aktif.
  const surveys = await Survey.findAll({
    where: { status: { [Op.ne]: 'draft' } },
    attributes: ['id'],
    raw: true,
  });
  let ok = 0;
  for (const s of surveys) {
    try {
      await recomputeSurveyStats(s.id);
      ok += 1;
    } catch (err) {
      console.error(`[maintenance] gagal recompute stats survey ${s.id}:`, err.message);
    }
  }
  return ok;
}

// ─── M4: reaper media yatim ────────────────────────────────────────────────────
async function getReferencedMediaPaths() {
  const referenced = new Set();
  // responses.audio_path / audio_paths / signature_path / photo_paths
  const [rows] = await sequelize.query(
    `SELECT audio_path, audio_paths, signature_path, photo_paths FROM responses
     WHERE audio_path IS NOT NULL OR audio_paths IS NOT NULL OR signature_path IS NOT NULL OR photo_paths IS NOT NULL`
  );
  for (const r of rows) {
    if (r.audio_path) referenced.add(r.audio_path);
    if (Array.isArray(r.audio_paths)) for (const p of r.audio_paths) if (p) referenced.add(p);
    if (r.signature_path) referenced.add(r.signature_path);
    if (Array.isArray(r.photo_paths)) for (const p of r.photo_paths) if (p) referenced.add(p);
  }
  // answers.photo_path
  const [ans] = await sequelize.query(
    `SELECT photo_path FROM answers WHERE photo_path IS NOT NULL`
  );
  for (const a of ans) if (a.photo_path) referenced.add(a.photo_path);
  return referenced;
}

function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

async function reapOrphanMedia() {
  const enabled = process.env.MEDIA_REAPER_ENABLED === 'true';
  // M7: default 168 jam (7 hari) — media yang diunggah tapi respons-nya belum
  // ter-submit (draft lapangan tertunda: sinyal buruk / kuesioner panjang) TIDAK
  // direferensikan baris mana pun, jadi hanya usia yang melindunginya. Ambang 7
  // hari membuat penghapusan draft yang masih akan disubmit praktis mustahil,
  // sementara orphan sejati tetap dibersihkan (beberapa hari lebih lambat).
  const ageHours = parseInt(process.env.MEDIA_REAPER_AGE_HOURS, 10) || 168;
  const cutoffMs = Date.now() - ageHours * 60 * 60 * 1000;
  const referenced = await getReferencedMediaPaths();

  let orphans = 0;
  let deleted = 0;
  for (const sub of MEDIA_DIRS) {
    const dir = path.join(UPLOAD_ROOT, sub);
    for (const full of walkFiles(dir)) {
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.mtimeMs > cutoffMs) continue; // terlalu baru — mungkin masih in-flight
      // relative path seperti tersimpan di DB: uploads/<sub>/<...>
      const rel = path.relative(path.join(UPLOAD_ROOT, '..'), full).split(path.sep).join('/');
      if (referenced.has(rel)) continue;
      orphans += 1;
      if (enabled) {
        try { fs.unlinkSync(full); deleted += 1; } catch (e) {
          console.error('[maintenance] gagal hapus media yatim', rel, e.message);
        }
      }
    }
  }
  return { orphans, deleted, enabled };
}

// ─── Sweeper arsip sementara (temuan review #3) ────────────────────────────────
// Route arsip membangun ZIP ke os.tmpdir() lalu menghapusnya setelah terkirim.
// Bila proses restart/crash di tengah, file bisa tertinggal — sapu yang tua.
async function sweepTempArchives() {
  const dir = os.tmpdir();
  const cutoff = Date.now() - TMP_ARCHIVE_MAX_AGE_MS;
  let entries;
  try { entries = await fsp.readdir(dir); } catch { return 0; }
  let removed = 0;
  for (const name of entries) {
    if (!TMP_ARCHIVE_RE.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fsp.stat(full);
      if (st.mtimeMs > cutoff) continue; // masih baru — mungkin unduhan berjalan
      await fsp.unlink(full);
      removed += 1;
    } catch { /* sudah hilang / gagal — abaikan */ }
  }
  return removed;
}

// ─── Sweeper file ekspor/arsip lama (uploads/exports) ──────────────────────────
// Hasil job async (export-*.xlsx/csv, archive-*.zip) tak terpakai selamanya —
// hapus yang lebih tua dari EXPORT_TTL_HOURS agar disk tidak membengkak.
async function sweepOldExports() {
  const cutoff = Date.now() - EXPORT_MAX_AGE_MS;
  let entries;
  try { entries = await fsp.readdir(EXPORTS_DIR); } catch { return 0; }
  let removed = 0;
  for (const name of entries) {
    if (!EXPORT_FILE_RE.test(name)) continue;
    const full = path.join(EXPORTS_DIR, name);
    try {
      const st = await fsp.stat(full);
      if (st.mtimeMs > cutoff) continue;
      await fsp.unlink(full);
      removed += 1;
    } catch { /* sudah hilang / gagal — abaikan */ }
  }
  return removed;
}

// ─── Runner ──────────────────────────────────────────────────────────────────
let running = false;
async function runOnce() {
  if (running) return;
  running = true;
  const t0 = Date.now();
  try {
    const pending = await cleanupStalePending();
    const dirtyStats = await drainDirtyStats(); // M6: heal survei "dirty" lebih dulu
    const stats = await reconcileStats();
    const media = await reapOrphanMedia();
    const tmpZips = await sweepTempArchives();
    const oldExports = await sweepOldExports();
    console.log(
      `[maintenance] selesai dalam ${Date.now() - t0}ms | PENDING dihapus=${pending} | ` +
        `stats-dirty di-recompute=${dirtyStats} | stats direkonsiliasi=${stats} | media yatim=${media.orphans} ` +
        `(${media.enabled ? `dihapus=${media.deleted}` : 'dry-run'}) | arsip-tmp disapu=${tmpZips} | ` +
        `ekspor-lama disapu=${oldExports}`
    );
  } catch (err) {
    console.error('[maintenance] error:', err.message);
  } finally {
    running = false;
  }
}

function startMaintenanceScheduler() {
  const intervalMin = parseInt(process.env.MAINTENANCE_INTERVAL_MIN, 10) || 60;
  console.log(`[maintenance] scheduler aktif — tiap ${intervalMin} menit`);
  // Jalankan sekali ~30 dtk setelah start (beri waktu koneksi siap), lalu berkala.
  setTimeout(runOnce, 30 * 1000);
  const handle = setInterval(runOnce, intervalMin * 60 * 1000);
  if (handle.unref) handle.unref();
  return handle;
}

module.exports = {
  startMaintenanceScheduler,
  runOnce,
  cleanupStalePending,
  reconcileStats,
  reapOrphanMedia,
  sweepTempArchives,
  sweepOldExports,
};
