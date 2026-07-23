import React from 'react';

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
  // ─── Render ─────────────────────────────────────────────────────────────────
  // Catatan: pesan "berhasil disinkronkan" TIDAK lagi ditampilkan di pill ini —
  // teksnya panjang dan menabrak judul header di layar sempit (masukan lapangan
  // 2026-07-23). Umpan balik hasil sinkron sudah lewat toast di BAWAH layar
  // (useSyncManager: "X data berhasil terkirim"), sama seperti notifikasi
  // online/offline. Pill cukup kembali ke "Online".

  if (isSyncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs font-medium text-accent-700 bg-accent-50 border border-accent-200 rounded-full px-3 py-1"
      >
        <svg
          className="animate-spin h-3 w-3 text-accent-600"
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

  // Online — aksen hangat (kalem), bukan hijau
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs font-medium text-accent-700 bg-accent-50 border border-accent-200 rounded-full px-3 py-1"
    >
      <span className="h-2 w-2 rounded-full bg-accent-500 flex-shrink-0" aria-hidden="true" />
      {pendingCount > 0 ? (
        <span>Online &middot; {pendingCount} data menunggu sinkronisasi</span>
      ) : (
        <span>Online</span>
      )}
    </div>
  );
}

export default OfflineStatusBar;
