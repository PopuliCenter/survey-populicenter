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
  const [failedItems, setFailedItems] = useState([]);
  const isSyncingRef = useRef(false);

  // ─── Refresh counts from IndexedDB ─────────────────────────────────────────
  const refreshCounts = useCallback(async () => {
    try {
      const count = await getPendingCount();
      const failed = await getQueueByStatus('failed');
      setPendingCount(count);
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

  // ─── Online/offline event listeners ────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow]);

  // ─── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    refreshCounts();
    // If online on mount and there are pending items, sync automatically
    if (navigator.onLine) {
      syncNow();
    }
  }, [refreshCounts, syncNow]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    failedItems,
    syncNow,
    deleteFailedItem,
  };
}

export default useSyncManager;
