/**
 * SignaturePadCanvas.jsx
 *
 * Responsive canvas component for digital signature capture.
 * Includes clear and undo buttons below the canvas.
 * Shows red border when required and empty (hasError).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.10, 6.3, 6.4, 6.5
 */

import React, { useEffect } from 'react';

/**
 * @param {{
 *   signaturePad: import('../hooks/useSignaturePad').default,
 *   required?: boolean,
 *   hasError?: boolean,
 * }} props
 */
function SignaturePadCanvas({ signaturePad, required = false, hasError = false }) {
  const { canvasRef, isEmpty, clear, undo } = signaturePad;

  // Set canvas dimensions to match container on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      canvas.width = width;
      canvas.height = 200;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [canvasRef]);

  const showError = hasError && isEmpty;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4"
      role="region"
      aria-label="Tanda tangan digital"
    >
      <h3 className="text-sm font-medium text-gray-700 mb-2">
        Tanda Tangan {required && <span className="text-red-500">*</span>}
      </h3>

      {/* Canvas container */}
      <div className="w-full">
        <canvas
          ref={canvasRef}
          className={`w-full border rounded-lg bg-gray-50 ${
            showError ? 'border-red-500 border-2' : 'border-gray-300'
          }`}
          style={{ touchAction: 'none', height: '200px' }}
          aria-label="Area tanda tangan"
          role="img"
        />
      </div>

      {/* Error message */}
      {showError && (
        <p
          className="text-sm text-red-600 mt-1"
          role="alert"
          aria-live="assertive"
        >
          Tanda tangan wajib diisi
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={clear}
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          aria-label="Hapus semua tanda tangan"
        >
          Hapus
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={isEmpty}
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Batalkan goresan terakhir"
        >
          Ulangi
        </button>
      </div>
    </div>
  );
}

export default SignaturePadCanvas;
