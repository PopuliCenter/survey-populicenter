import React, { useEffect } from 'react';

/**
 * ConfirmSheet — pop-up konfirmasi bergaya bottom sheet (modern, native Android).
 *
 * Muncul dari bawah layar dengan sudut atas membulat dan "handle".
 * Dipakai untuk konfirmasi logout (daftar survei) dan keluar aplikasi (login).
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   description?: string,
 *   iconType?: 'warning' | 'exit',
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   children?: React.ReactNode,   // konten tambahan (mis. peringatan data belum tersinkron)
 * }} props
 */
function ConfirmSheet({
  open,
  title,
  description,
  iconType = 'warning',
  confirmLabel = 'Keluar',
  cancelLabel = 'Batal',
  onConfirm,
  onCancel,
  children,
}) {
  // Kunci scroll body saat sheet terbuka
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const icon = iconType === 'exit' ? (
    <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ) : (
    <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" />
    </svg>
  );
  const iconWrap = iconType === 'exit' ? 'bg-blue-100' : 'bg-amber-100';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop — tap untuk batal */}
      <button
        type="button"
        aria-label="Tutup"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 animate-backdrop-in cursor-default"
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-sheet-up">
        {/* Handle */}
        <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mb-5" aria-hidden="true" />

        {/* Ikon */}
        <div className={`w-14 h-14 rounded-full ${iconWrap} flex items-center justify-center mx-auto mb-4`}>
          {icon}
        </div>

        {/* Judul + deskripsi */}
        <h3 className="text-lg font-bold text-gray-900 text-center">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 text-center mt-1.5">{description}</p>
        )}

        {/* Konten tambahan (peringatan, dll.) */}
        {children && <div className="mt-3 space-y-2">{children}</div>}

        {/* Aksi — tombol ditumpuk vertikal, mudah dijangkau jempol */}
        <div className="mt-5 space-y-2.5">
          <button
            onClick={onConfirm}
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmSheet;
