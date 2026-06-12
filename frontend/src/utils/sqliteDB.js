/**
 * sqliteDB.js
 *
 * SQLite offline storage untuk Capacitor (Android/iOS).
 * Lebih stabil dari IndexedDB di mobile — crash recovery lebih baik,
 * data tidak hilang saat app force-close atau low memory.
 *
 * Digunakan sebagai pengganti IndexedDB di platform native.
 * Di browser web, tetap fallback ke IndexedDB (lihat offlineDB.js).
 *
 * Schema:
 *   surveys(id TEXT PK, data TEXT, cached_at INTEGER)
 *   offline_queue(local_id INTEGER PK AUTOINCREMENT, survey_id TEXT, answers TEXT,
 *                 geo TEXT, status TEXT, timestamp INTEGER, error_message TEXT,
 *                 start_geo TEXT, has_audio INTEGER, has_signature INTEGER, photo_count INTEGER)
 *   media_files(file_id INTEGER PK AUTOINCREMENT, local_id INTEGER, type TEXT,
 *               blob_base64 TEXT, filename TEXT)
 */

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'survey_offline';
const DB_VERSION = 1;

let db = null;
const sqlite = new SQLiteConnection(CapacitorSQLite);

// ─── Initialize ───────────────────────────────────────────────────────────────

export async function initSQLiteDB() {
  if (db) return db;

  const ret = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

  if (isConn) {
    db = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
  }

  await db.open();

  // Create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id TEXT NOT NULL,
      answers TEXT NOT NULL,
      geo TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      timestamp INTEGER NOT NULL,
      error_message TEXT,
      start_geo TEXT,
      has_audio INTEGER DEFAULT 0,
      has_signature INTEGER DEFAULT 0,
      photo_count INTEGER DEFAULT 0
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_queue_status ON offline_queue(status);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS media_files (
      file_id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      blob_base64 TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT
    );
  `);

  // Migrasi: tambah kolom mime_type untuk instalasi lama yang tabelnya sudah ada.
  // Tanpa kolom ini, blob direkonstruksi sebagai 'application/octet-stream' dan
  // DITOLAK server saat sync (fileFilter multer) → data media gagal tersinkron.
  try {
    await db.execute(`ALTER TABLE media_files ADD COLUMN mime_type TEXT;`);
  } catch {
    // Kolom sudah ada (instalasi baru) — abaikan.
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_media_local_id ON media_files(local_id);
  `);

  return db;
}

// ─── Survey Cache ─────────────────────────────────────────────────────────────

export async function cacheSurveySQLite(survey) {
  const conn = await initSQLiteDB();
  await conn.run(
    `INSERT OR REPLACE INTO surveys (id, data, cached_at) VALUES (?, ?, ?)`,
    [survey.id, JSON.stringify(survey), Date.now()]
  );
}

export async function getCachedSurveySQLite(surveyId) {
  const conn = await initSQLiteDB();
  const res = await conn.query(`SELECT data FROM surveys WHERE id = ?`, [surveyId]);
  if (res.values && res.values.length > 0) {
    return JSON.parse(res.values[0].data);
  }
  return null;
}

export async function cacheSurveyListSQLite(surveys) {
  const conn = await initSQLiteDB();
  for (const s of surveys) {
    // Merge: jangan overwrite data lengkap yang sudah ada
    const existing = await conn.query(`SELECT data FROM surveys WHERE id = ?`, [s.id]);
    if (existing.values && existing.values.length > 0) {
      const existingData = JSON.parse(existing.values[0].data);
      if (existingData.questions && existingData.questions.length > 0) {
        // Sudah ada data lengkap — update metadata saja
        const merged = { ...existingData, ...s, questions: existingData.questions, _assignedNumbers: existingData._assignedNumbers, _usedNumbers: existingData._usedNumbers, _offlineQuota: existingData._offlineQuota };
        await conn.run(
          `INSERT OR REPLACE INTO surveys (id, data, cached_at) VALUES (?, ?, ?)`,
          [s.id, JSON.stringify(merged), Date.now()]
        );
        continue;
      }
    }
    await conn.run(
      `INSERT OR REPLACE INTO surveys (id, data, cached_at) VALUES (?, ?, ?)`,
      [s.id, JSON.stringify(s), Date.now()]
    );
  }
}

export async function getCachedSurveyListSQLite() {
  const conn = await initSQLiteDB();
  const res = await conn.query(`SELECT data FROM surveys ORDER BY cached_at DESC`);
  return (res.values || []).map((row) => JSON.parse(row.data));
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

export async function enqueueResponseSQLite(payload) {
  const conn = await initSQLiteDB();
  const res = await conn.run(
    `INSERT INTO offline_queue (survey_id, answers, geo, status, timestamp, start_geo, has_audio, has_signature, photo_count)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      payload.survey_id,
      JSON.stringify(payload.answers),
      payload.geo ? JSON.stringify(payload.geo) : null,
      Date.now(),
      payload.start_geo ? JSON.stringify(payload.start_geo) : null,
      payload.has_audio ? 1 : 0,
      payload.has_signature ? 1 : 0,
      payload.photo_count || 0,
    ]
  );
  return res.changes?.lastId || 0;
}

export async function getQueueByStatusSQLite(status) {
  const conn = await initSQLiteDB();
  const res = await conn.query(
    `SELECT * FROM offline_queue WHERE status = ? ORDER BY timestamp ASC`,
    [status]
  );
  return (res.values || []).map((row) => ({
    localId: row.local_id,
    survey_id: row.survey_id,
    answers: JSON.parse(row.answers),
    geo: row.geo ? JSON.parse(row.geo) : null,
    status: row.status,
    timestamp: row.timestamp,
    errorMessage: row.error_message,
    start_geo: row.start_geo ? JSON.parse(row.start_geo) : null,
    has_audio: !!row.has_audio,
    has_signature: !!row.has_signature,
    photo_count: row.photo_count,
  }));
}

export async function updateQueueStatusSQLite(localId, status, errorMessage = null) {
  const conn = await initSQLiteDB();
  await conn.run(
    `UPDATE offline_queue SET status = ?, error_message = ? WHERE local_id = ?`,
    [status, errorMessage, localId]
  );
}

export async function clearSyncedQueueSQLite() {
  const conn = await initSQLiteDB();
  await conn.run(`DELETE FROM offline_queue WHERE status = 'synced'`);
}

export async function deleteQueueEntrySQLite(localId) {
  const conn = await initSQLiteDB();
  await conn.run(`DELETE FROM offline_queue WHERE local_id = ?`, [localId]);
}

export async function getPendingCountSQLite() {
  const conn = await initSQLiteDB();
  const res = await conn.query(`SELECT COUNT(*) as cnt FROM offline_queue WHERE status = 'pending'`);
  return res.values?.[0]?.cnt || 0;
}

// ─── Media Files ──────────────────────────────────────────────────────────────

/**
 * Simpan media file sebagai base64 di SQLite.
 * Blob dikonversi ke base64 sebelum disimpan.
 */
export async function saveMediaFileSQLite({ localId, type, blob, filename }) {
  const conn = await initSQLiteDB();
  // Convert blob to base64
  const base64 = await blobToBase64(blob);
  // Simpan MIME type asli (mis. audio/webm, image/jpeg, image/png) agar saat sync
  // blob direkonstruksi dengan tipe benar dan diterima server. Fallback bila kosong.
  const mimeType = (blob && blob.type) || deriveMimeType(type, filename);
  const res = await conn.run(
    `INSERT INTO media_files (local_id, type, blob_base64, filename, mime_type) VALUES (?, ?, ?, ?, ?)`,
    [localId, type, base64, filename, mimeType]
  );
  return res.changes?.lastId || 0;
}

export async function getMediaFilesByLocalIdSQLite(localId) {
  const conn = await initSQLiteDB();
  const res = await conn.query(
    `SELECT * FROM media_files WHERE local_id = ?`,
    [localId]
  );
  const files = [];
  for (const row of res.values || []) {
    // Pakai mime_type tersimpan; data lama (sebelum migrasi) NULL → turunkan dari type/filename.
    const mimeType = row.mime_type || deriveMimeType(row.type, row.filename);
    files.push({
      fileId: row.file_id,
      localId: row.local_id,
      type: row.type,
      blob: base64ToBlob(row.blob_base64, mimeType),
      filename: row.filename,
    });
  }
  return files;
}

export async function deleteMediaFilesByLocalIdSQLite(localId) {
  const conn = await initSQLiteDB();
  await conn.run(`DELETE FROM media_files WHERE local_id = ?`, [localId]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Turunkan MIME type dari jenis media + ekstensi nama file.
 * Dipakai sebagai fallback untuk data lama yang tersimpan tanpa kolom mime_type.
 */
function deriveMimeType(type, filename) {
  if (type === 'audio') return 'audio/webm';
  if (type === 'signature') return 'image/png';
  // photo → tebak dari ekstensi (hasil kompresi default jpeg)
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const byteChars = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}
