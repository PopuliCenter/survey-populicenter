import React, { useEffect, useRef, useState } from 'react';

/**
 * Komponen status bar yang menampilkan status koneksi dan sinkronisasi.
 *
 * @param {{
 *   isOnline: boolean,
 *   isSyncing: boolean,
 *   pendingCount: number,
 * }} props
 */
function OfflineStatusBar({ isOnline, isSyncing, pendingCount }) {
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const prevSyncingRef = useRef(isSyncing);
  const timerRef = useRef(null);

  // Detect transition: isSyncing true → false with pendingCount === 0
  useEffect(() => {
    if (prevSyncingRef.current === true && isSyncing === false && pendingCount === 0) {
      setShowSyncSuccess(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowSyncSuccess(false);
      }, 3000);
    }
    prevSyncingRef.current = isSyncing;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isSyncing, pendingCount]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isSyncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-3 py-1"
      >
        <svg
          className="animate-spin h-3 w-3 text-primary-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Menyinkronkan data...
      </div>
    );
  }

  if (showSyncSuccess) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1"
      >
        <span aria-hidden="true">✓</span>
        Semua data berhasil disinkronkan
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1"
      >
        <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" aria-hidden="true" />
        Offline
      </div>
    );
  }

  // Online
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1"
    >
      <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
      {pendingCount > 0 ? (
        <span>Online &middot; {pendingCount} data menunggu sinkronisasi</span>
      ) : (
        <span>Online</span>
      )}
    </div>
  );
}

export default OfflineStatusBar;
