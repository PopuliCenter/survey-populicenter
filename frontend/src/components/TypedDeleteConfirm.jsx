/**
 * TypedDeleteConfirm.jsx
 *
 * Konfirmasi hapus permanen dengan mengetik satu kata, untuk penghapusan yang
 * menyapu banyak data sekaligus. Dua klik terlalu mudah terjadi tanpa sengaja:
 * setelah satu survei terhapus, baris berikutnya naik ke posisi tombol yang sama.
 *
 * Ketikan hidup di dalam komponen, jadi hilang begitu konfirmasi ditutup dan tak
 * terbawa ke penghapusan berikutnya.
 *
 * @param {{
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   loading?: boolean,
 *   children: React.ReactNode,
 * }} props children = keterangan apa yang akan terhapus
 */
import React, { useId, useState } from 'react';

const DELETE_WORD = 'HAPUS';

function TypedDeleteConfirm({ onConfirm, onCancel, loading = false, children }) {
  const [text, setText] = useState('');
  const inputId = useId();
  const confirmed = text.trim().toUpperCase() === DELETE_WORD;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed && !loading) onConfirm();
      }}
    >
      <label htmlFor={inputId} className="block text-xs text-red-700">
        {children} Ketik <strong>{DELETE_WORD}</strong> untuk melanjutkan. Tindakan ini tidak dapat dibatalkan.
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={DELETE_WORD}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="w-28 border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
        <button
          type="submit"
          disabled={!confirmed || loading}
          className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Menghapus…' : 'Hapus Permanen'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-md"
        >
          Batal
        </button>
      </div>
    </form>
  );
}

export default TypedDeleteConfirm;
