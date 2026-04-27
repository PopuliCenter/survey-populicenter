import React, { useState, useCallback } from 'react';

/**
 * Custom hook untuk mengelola state view mode dengan localStorage.
 *
 * @param {string} storageKey — localStorage key (e.g. 'surveys_view_mode')
 * @returns {['table' | 'grid', (mode: 'table' | 'grid') => void]}
 */
export function useViewMode(storageKey) {
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === 'grid' ? 'grid' : 'table';
    } catch {
      return 'table';
    }
  });

  const handleViewChange = useCallback((mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // localStorage might be full or disabled
    }
  }, [storageKey]);

  return [viewMode, handleViewChange];
}

/**
 * Komponen toggle untuk beralih antara tampilan tabel dan grid.
 * Menampilkan dua tombol ikon SVG inline.
 *
 * @param {{
 *   viewMode: 'table' | 'grid',
 *   onViewChange: (mode: 'table' | 'grid') => void,
 * }} props
 */
function ViewToggle({ viewMode, onViewChange }) {
  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 overflow-hidden"
      role="group"
      aria-label="Pilih mode tampilan"
    >
      {/* Tombol Tabel */}
      <button
        type="button"
        className={`p-2 transition-colors ${
          viewMode === 'table'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-50 text-gray-400 hover:text-gray-600'
        }`}
        onClick={() => onViewChange('table')}
        aria-label="Tampilan Tabel"
        aria-pressed={viewMode === 'table'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Tombol Grid */}
      <button
        type="button"
        className={`p-2 transition-colors ${
          viewMode === 'grid'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-50 text-gray-400 hover:text-gray-600'
        }`}
        onClick={() => onViewChange('grid')}
        aria-label="Tampilan Grid"
        aria-pressed={viewMode === 'grid'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
          />
        </svg>
      </button>
    </div>
  );
}

export default ViewToggle;
