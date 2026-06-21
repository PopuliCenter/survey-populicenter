import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import {
  getQueueByStatus,
  updateQueueStatus,
  clearSyncedQueue,
  deleteQueueEntry,
  getPendingCount,
  getMediaFilesByLocalId,
  deleteMediaFilesByLocalId,
} from '../../utils/storage';
import { addNetworkListener, getNetworkStatus, hapticNotify } from '../../utils/capacitorBridge';
import { toastSuccess, toastWarning } from '../../utils/toastBus';

/**
 * Hook untuk mengelola sinkronisasi Offline Queue ke backend.
 *
 * @returns {{
 *   isOnline: boolean,
 *   isSyncing: boolean,
 *   pendingCount: number,
 *   failedItems: object[],
 *   syncNow: () => Promise<void>,
 *   deleteFailedItem: (localId: number) => Promise<void>,
 * }}
 */
function useSyncManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState([]);
  const [failedItems, setFailedItems] = useState([]);
  const isSyncingRef = useRef(false);

  // ─── Refresh counts from IndexedDB ─────────────────────────────────────────
  const refreshCounts = useCallback(async () => {
    try {
      const count = await getPendingCount();
      const pending = await getQueueByStatus('pending');
      const failed = await getQueueByStatus('failed');
      setPendingCount(count);
      setPendingItems(pending);
      setFailedItems(failed);
    } catch (err) {
      console.error('useSyncManager: refreshCounts error', err);
    }
  }, []);

  // ─── Sync logic ─────────────────────────────────────────────────────────────
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    let syncedCount = 0;
    let failedCount = 0;

    try {
      const pending = await getQueueByStatus('pending');

      for (const entry of pending) {
        try {
          // Step 1: upload media files first (audio, photos, signature)
          const mediaFiles = await getMediaFilesByLocalId(entry.localId);
          let audio_path = null;
          let signature_path = null;
          const photo_paths = [];

          for (const media of mediaFiles) {
            const formData = new FormData();
            formData.append(media.type === 'audio' ? 'audio' : media.type === 'signature' ? 'signature' : 'photo', media.blob, media.filename);

            let endpoint;
            if (media.type === 'audio') endpoint = '/upload/audio';
            else if (media.type === 'signature') endpoint = '/upload/signature';
            else endpoint = '/upload/photo';

            const uploadRes = await api.post(endpoint, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 120000, // unggah media: beri waktu lebih untuk koneksi lambat
            });

            if (media.type === 'audio') audio_path = uploadRes.data.path;
            else if (media.type === 'signature') signature_path = uploadRes.data.path;
            else photo_paths.push(uploadRes.data.path);
          }

          // Step 2: start a response session
          const startRes = await api.post('/responses/start', {
            survey_id: entry.survey_id,
          });
          const { session_token } = startRes.data;

          // Step 3: submit the response with media paths and start geo
          const submitPayload = {
            session_token,
            survey_id: entry.survey_id,
            answers: entry.answers,
            geo: entry.geo,
          };

          if (audio_path) submitPayload.audio_path = audio_path;
          if (signature_path) submitPayload.signature_path = signature_path;
          if (photo_paths.length > 0) submitPayload.photo_paths = photo_paths;
          if (entry.start_geo) {
            submitPayload.start_latitude = entry.start_geo.lat;
            submitPayload.start_longitude = entry.start_geo.lng;
            submitPayload.start_geo_status = entry.start_geo.status;
          }

          await api.post('/responses/submit', submitPayload);

          // Success: mark as synced and clean up media files
          await updateQueueStatus(entry.localId, 'synced');
          await deleteMediaFilesByLocalId(entry.localId);
          syncedCount += 1;
        } catch (err) {
          if (!err.response) {
            // Network error — stop syncing, retry later
            console.warn('useSyncManager: network error, stopping sync', err.message);
            break;
          }
          // Server error (4xx/5xx) — mark as failed, continue to next
          const errorMessage =
            err.response?.data?.error ||
            err.response?.data?.message ||
            `Error ${err.response.status}`;
          await updateQueueStatus(entry.localId, 'failed', errorMessage);
          failedCount += 1;
        }
      }

      // Clean up synced entries
      await clearSyncedQueue();
    } catch (err) {
      console.error('useSyncManager: syncNow error', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshCounts();

      // Umpan balik hasil sinkron (pop-up sesaat) — hanya bila ada yang diproses.
      if (syncedCount > 0 && failedCount === 0) {
        toastSuccess(`${syncedCount} data berhasil terkirim`);
        hapticNotify('success');
      } else if (syncedCount > 0 && failedCount > 0) {
        toastWarning(`${syncedCount} terkirim, ${failedCount} gagal`);
        hapticNotify('warning');
      } else if (failedCount > 0) {
        toastWarning(`${failedCount} data gagal terkirim — coba lagi nanti`);
        hapticNotify('warning');
      }
    }
  }, [refreshCounts]);

  // ─── Delete a failed item ───────────────────────────────────────────────────
  const deleteFailedItem = useCallback(async (localId) => {
    try {
      await deleteMediaFilesByLocalId(localId);
      await deleteQueueEntry(localId);
      await refreshCounts();
    } catch (err) {
      console.error('useSyncManager: deleteFailedItem error', err);
    }
  }, [refreshCounts]);

  // ─── Retry a single failed item ─────────────────────────────────────────────
  // Kembalikan status 'failed' → 'pending' (hapus pesan error), lalu picu sync ulang.
  const retryFailedItem = useCallback(async (localId) => {
    try {
      await updateQueueStatus(localId, 'pending', null);
      await refreshCounts();
      if (navigator.onLine) syncNow();
    } catch (err) {
      console.error('useSyncManager: retryFailedItem error', err);
    }
  }, [refreshCounts, syncNow]);

  // ─── Retry all failed items ─────────────────────────────────────────────────
  const retryAllFailed = useCallback(async () => {
    try {
      const failed = await getQueueByStatus('failed');
      for (const entry of failed) {
        await updateQueueStatus(entry.localId, 'pending', null);
      }
      await refreshCounts();
      if (navigator.onLine) syncNow();
    } catch (err) {
      console.error('useSyncManager: retryAllFailed error', err);
    }
  }, [refreshCounts, syncNow]);

  // ─── Status jaringan + sinkron otomatis ─────────────────────────────────────
  // Pakai @capacitor/network (akurat di WebView Android) via capacitorBridge;
  // fallback ke event 'online'/'offline' di web.
  useEffect(() => {
    let cleanup = () => {};
    let active = true;

    refreshCounts();

    (async () => {
      try {
        const init = await getNetworkStatus();
        if (active) {
          setIsOnline(init.connected);
          if (init.connected) syncNow();
        }
      } catch {
        if (active && navigator.onLine) syncNow();
      }

      cleanup = await addNetworkListener(({ connected }) => {
        if (!active) return;
        setIsOnline(connected);
        if (connected) syncNow();
      });
    })();

    return () => { active = false; if (typeof cleanup === 'function') cleanup(); };
  }, [refreshCounts, syncNow]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    pendingItems,
    failedItems,
    syncNow,
    deleteFailedItem,
    retryFailedItem,
    retryAllFailed,
  };
}

export default useSyncManager;
