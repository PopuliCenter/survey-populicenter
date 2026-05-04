/**
 * SignaturePadCanvas.jsx
 *
 * Canvas component for digital signature capture.
 * Touch-friendly with proper scroll prevention.
 */

import React from 'react';

function SignaturePadCanvas({ signaturePad, required = false, hasError = false }) {
  const { canvasRef, isEmpty, clear, undo } = signaturePad;
  const showError = hasError && isEmpty;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4" role="region" aria-label="Tanda tangan digital">
      <h3 className="text-sm font-medium text-gray-700 mb-2">
        Tanda Tangan {required && <span className="text-red-500">*</span>}
      </h3>

      {/* Canvas — fixed height, full width via CSS, internal resolution set by hook */}
      <div className="w-full">
        <canvas
          ref={canvasRef}
          className={`w-full rounded-lg bg-gray-50 ${
            showError ? 'border-red-500 border-2' : 'border border-gray-300'
          }`}
          style={{
            touchAction: 'none',
            height: '200px',
            cursor: 'crosshair',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          aria-label="Area tanda tangan — gambar dengan jari atau stylus"
        />
      </div>

      {/* Hint */}
      {isEmpty && !showError && (
        <p className="text-xs text-gray-400 mt-1 text-center">Gambar tanda tangan di area di atas</p>
      )}

      {showError && (
        <p className="text-sm text-red-600 mt-1" role="alert">Tanda tangan wajib diisi</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={clear}
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          Hapus
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={isEmpty}
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Ulangi
        </button>
        {!isEmpty && (
          <span className="text-xs text-green-600 ml-auto">✓ Tanda tangan terisi</span>
        )}
      </div>
    </div>
  );
}

export default SignaturePadCanvas;
