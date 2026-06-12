/**
 * ConfirmDialog.jsx
 *
 * Dialog konfirmasi terpusat & aksesibel untuk dashboard admin (desktop).
 * Dipakai untuk aksi destruktif (hapus, nonaktifkan) agar konsisten dan
 * memberi konteks konsekuensi — menggantikan konfirmasi inline ad-hoc.
 *
 * Escape / klik backdrop = batal. Focus di-trap & dikembalikan ke pemicu.
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   description?: React.ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   tone?: 'danger' | 'primary',
 *   loading?: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 */
import React, { useRef } from 'react';
import useModalA11y from '../hooks/useModalA11y';

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const containerRef = useRef(null);
  useModalA11y(open, onCancel, containerRef);

  if (!open) return null;

  const confirmClasses =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
      : 'bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300';

  const iconWrap = tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-600';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Tutup" onClick={onCancel} className="absolute inset-0 bg-black/50 cursor-default" />
      <div ref={containerRef} tabIndex={-1} className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {description && <div className="mt-1.5 text-sm text-gray-600">{description}</div>}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${confirmClasses}`}
          >
            {loading ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
