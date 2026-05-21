import { openDB } from 'idb';

const DB_NAME = 'survey-offline-db';
const DB_VERSION = 2;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // surveys store
        db.createObjectStore('surveys', { keyPath: 'id' });
        // offline_queue store
        const queueStore = db.createObjectStore('offline_queue', {
          keyPath: 'localId',
          autoIncrement: true,
        });
        queueStore.createIndex('status', 'status');
        queueStore.createIndex('timestamp', 'timestamp');
      }
      if (oldVersion < 2) {
        // media_files store for large blobs (audio, photo, signature)
        const mediaStore = db.createObjectStore('media_files', {
          keyPath: 'fileId',
          autoIncrement: true,
        });
        mediaStore.createIndex('localId', 'localId');
        mediaStore.createIndex('type', 'type');
      }
    },
  });
}

// ─── Survey Cache ─────────────────────────────────────────────────────────────

export async function cacheSurvey(survey) {
  const db = await getDB();
  await db.put('surveys', { ...survey, cachedAt: Date.now() });
}

export async function getCachedSurvey(surveyId) {
  const db = await getDB();
  return db.get('surveys', surveyId);
}

export async function cacheSurveyList(surveys) {
  const db = await getDB();
  const tx = db.transaction('surveys', 'readwrite');
  // Merge: jangan overwrite data lengkap (questions, _assignedNumbers) yang sudah ada
  for (const s of surveys) {
    const existing = await tx.store.get(s.id);
    if (existing && existing.questions && existing.questions.length > 0) {
      // Sudah ada data lengkap — update metadata saja, jangan hapus questions
      await tx.store.put({ ...existing, ...s, questions: existing.questions, _assignedNumbers: existing._assignedNumbers, _usedNumbers: existing._usedNumbers, _offlineQuota: existing._offlineQuota, cachedAt: Date.now() });
    } else {
      // Belum ada data lengkap — simpan apa adanya
      await tx.store.put({ ...s, cachedAt: Date.now() });
    }
  }
  await tx.done;
}

export async function getCachedSurveyList() {
  const db = await getDB();
  return db.getAll('surveys');
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

export async function enqueueResponse(payload) {
  const db = await getDB();
  const localId = await db.add('offline_queue', {
    ...payload,
    status: 'pending',
    timestamp: Date.now(),
    errorMessage: null,
    start_geo: payload.start_geo || null,
    has_audio: payload.has_audio || false,
    has_signature: payload.has_signature || false,
    photo_count: payload.photo_count || 0,
  });
  return localId;
}

export async function getQueueByStatus(status) {
  const db = await getDB();
  const all = await db.getAllFromIndex('offline_queue', 'status', status);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateQueueStatus(localId, status, errorMessage = null) {
  const db = await getDB();
  const entry = await db.get('offline_queue', localId);
  if (!entry) return;
  await db.put('offline_queue', { ...entry, status, errorMessage });
}

export async function clearSyncedQueue() {
  const db = await getDB();
  const synced = await db.getAllFromIndex('offline_queue', 'status', 'synced');
  const tx = db.transaction('offline_queue', 'readwrite');
  await Promise.all([
    ...synced.map((entry) => tx.store.delete(entry.localId)),
    tx.done,
  ]);
}

export async function deleteQueueEntry(localId) {
  const db = await getDB();
  await db.delete('offline_queue', localId);
}

export async function getPendingCount() {
  const db = await getDB();
  const pending = await db.getAllFromIndex('offline_queue', 'status', 'pending');
  return pending.length;
}

// ─── Media Files ──────────────────────────────────────────────────────────────

export async function saveMediaFile({ localId, type, blob, filename }) {
  const db = await getDB();
  const fileId = await db.add('media_files', { localId, type, blob, filename });
  return fileId;
}

export async function getMediaFilesByLocalId(localId) {
  const db = await getDB();
  return db.getAllFromIndex('media_files', 'localId', localId);
}

export async function deleteMediaFilesByLocalId(localId) {
  const db = await getDB();
  const files = await db.getAllFromIndex('media_files', 'localId', localId);
  const tx = db.transaction('media_files', 'readwrite');
  await Promise.all([
    ...files.map((f) => tx.store.delete(f.fileId)),
    tx.done,
  ]);
}
