/**
 * storage.js
 *
 * Unified offline storage abstraction.
 * Otomatis memilih backend storage berdasarkan platform:
 *   - Android/iOS (Capacitor native) → SQLite (lebih stabil, crash-safe)
 *   - Browser web → IndexedDB (via idb library)
 *
 * Semua komponen menggunakan API ini, bukan langsung ke offlineDB atau sqliteDB.
 * API identik dengan offlineDB.js — drop-in replacement.
 */

import { Capacitor } from '@capacitor/core';

// Lazy-loaded modules
let storageModule = null;

/**
 * Detect apakah berjalan di native platform (Android/iOS)
 */
function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Load storage module sesuai platform (lazy, sekali saja)
 */
async function getStorage() {
  if (storageModule) return storageModule;

  if (isNativePlatform()) {
    // Native → SQLite
    const sqlite = await import('./sqliteDB.js');
    await sqlite.initSQLiteDB();
    storageModule = {
      cacheSurvey: sqlite.cacheSurveySQLite,
      getCachedSurvey: sqlite.getCachedSurveySQLite,
      cacheSurveyList: sqlite.cacheSurveyListSQLite,
      getCachedSurveyList: sqlite.getCachedSurveyListSQLite,
      enqueueResponse: sqlite.enqueueResponseSQLite,
      getQueueByStatus: sqlite.getQueueByStatusSQLite,
      updateQueueStatus: sqlite.updateQueueStatusSQLite,
      clearSyncedQueue: sqlite.clearSyncedQueueSQLite,
      deleteQueueEntry: sqlite.deleteQueueEntrySQLite,
      getPendingCount: sqlite.getPendingCountSQLite,
      saveMediaFile: sqlite.saveMediaFileSQLite,
      getMediaFilesByLocalId: sqlite.getMediaFilesByLocalIdSQLite,
      deleteMediaFilesByLocalId: sqlite.deleteMediaFilesByLocalIdSQLite,
    };
  } else {
    // Web → IndexedDB (existing implementation)
    const idb = await import('./offlineDB.js');
    storageModule = {
      cacheSurvey: idb.cacheSurvey,
      getCachedSurvey: idb.getCachedSurvey,
      cacheSurveyList: idb.cacheSurveyList,
      getCachedSurveyList: idb.getCachedSurveyList,
      enqueueResponse: idb.enqueueResponse,
      getQueueByStatus: idb.getQueueByStatus,
      updateQueueStatus: idb.updateQueueStatus,
      clearSyncedQueue: idb.clearSyncedQueue,
      deleteQueueEntry: idb.deleteQueueEntry,
      getPendingCount: idb.getPendingCount,
      saveMediaFile: idb.saveMediaFile,
      getMediaFilesByLocalId: idb.getMediaFilesByLocalId,
      deleteMediaFilesByLocalId: idb.deleteMediaFilesByLocalId,
    };
  }

  return storageModule;
}

// ─── Exported API (proxy to platform-specific implementation) ─────────────────

export async function cacheSurvey(survey) {
  const s = await getStorage();
  return s.cacheSurvey(survey);
}

export async function getCachedSurvey(surveyId) {
  const s = await getStorage();
  return s.getCachedSurvey(surveyId);
}

export async function cacheSurveyList(surveys) {
  const s = await getStorage();
  return s.cacheSurveyList(surveys);
}

export async function getCachedSurveyList() {
  const s = await getStorage();
  return s.getCachedSurveyList();
}

export async function enqueueResponse(payload) {
  const s = await getStorage();
  return s.enqueueResponse(payload);
}

export async function getQueueByStatus(status) {
  const s = await getStorage();
  return s.getQueueByStatus(status);
}

export async function updateQueueStatus(localId, status, errorMessage = null) {
  const s = await getStorage();
  return s.updateQueueStatus(localId, status, errorMessage);
}

export async function clearSyncedQueue() {
  const s = await getStorage();
  return s.clearSyncedQueue();
}

export async function deleteQueueEntry(localId) {
  const s = await getStorage();
  return s.deleteQueueEntry(localId);
}

export async function getPendingCount() {
  const s = await getStorage();
  return s.getPendingCount();
}

export async function saveMediaFile(params) {
  const s = await getStorage();
  return s.saveMediaFile(params);
}

export async function getMediaFilesByLocalId(localId) {
  const s = await getStorage();
  return s.getMediaFilesByLocalId(localId);
}

export async function deleteMediaFilesByLocalId(localId) {
  const s = await getStorage();
  return s.deleteMediaFilesByLocalId(localId);
}
