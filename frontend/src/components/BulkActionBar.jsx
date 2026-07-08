import React from 'react';

/**
 * BulkActionBar — bar aksi massal yang muncul saat ada baris terpilih.
 *
 * Generik: menampilkan jumlah terpilih + tombol "Bersihkan", dan menampung
 * tombol aksi (Aktifkan/Nonaktifkan/Hapus/…) via `children` sehingga tiap
 * halaman bisa menaruh aksi yang relevan.
 *
 * @param {{ count: number, onClear: () => void, busy?: boolean, children: React.ReactNode }} props
 */
export default function BulkActionBar({ count, onClear, busy = false, children }) {
  if (!count) return null;
  return (
    <div
      className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-primary-50 border-b border-primary-100"
      role="region"
      aria-label="Aksi massal"
    >
      <span className="text-sm font-semibold text-primary-800" aria-live="polite">
        {count} dipilih
      </span>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 focus:outline-none focus:underline"
      >
        Bersihkan
      </button>
    </div>
  );
}
