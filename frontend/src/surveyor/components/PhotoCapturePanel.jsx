/**
 * PhotoCapturePanel.jsx
 *
 * Photo capture component with camera/gallery input, thumbnail grid,
 * and per-photo delete buttons.
 *
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.8, 3.9, 3.10, 6.2, 6.4, 6.5
 */

import React, { useRef, useState } from 'react';
import { isNativePlatform, takePhoto } from '../../utils/capacitorBridge';

/**
 * @param {{
 *   photoCapture: import('../hooks/usePhotoCapture').default,
 * }} props
 */
function PhotoCapturePanel({ photoCapture }) {
  const { photos, addPhoto, removePhoto } = photoCapture;
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    for (let i = 0; i < files.length; i++) {
      const result = addPhoto(files[i]);
      if (!result.success) {
        setError(result.error);
        break;
      }
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddClick = async () => {
    setError(null);

    // Android/iOS native: buka kamera native (Capacitor) yang langsung
    // mengompres foto (quality 80, maks 1280px) saat pengambilan.
    if (isNativePlatform()) {
      setCapturing(true);
      try {
        const result = await takePhoto();
        if (result?.blob) {
          // Beri nama file agar konsisten saat disimpan/diunggah
          const file = new File([result.blob], `photo-${Date.now()}.jpg`, {
            type: result.blob.type || 'image/jpeg',
          });
          const added = addPhoto(file);
          if (!added.success) setError(added.error);
        }
        // result null = pengguna membatalkan; tidak ada error
      } catch {
        setError('Gagal mengambil foto dari kamera. Coba lagi.');
      } finally {
        setCapturing(false);
      }
      return;
    }

    // Web: gunakan input file biasa
    fileInputRef.current?.click();
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4"
      role="region"
      aria-label="Pengambilan foto"
    >
      {/* Header with add button */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          Foto ({photos.length})
        </h3>
        <button
          type="button"
          onClick={handleAddClick}
          disabled={capturing}
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
          aria-label="Tambah foto"
        >
          {capturing ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Membuka kamera…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Ambil Foto
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Thumbnail grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2" role="list" aria-label="Daftar foto">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200"
              role="listitem"
            >
              <img
                src={photo.previewUrl}
                alt="Pratinjau foto"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                aria-label="Hapus foto"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          Belum ada foto. Tekan "Ambil Foto" untuk membuka kamera.
        </p>
      )}
    </div>
  );
}

export default PhotoCapturePanel;
