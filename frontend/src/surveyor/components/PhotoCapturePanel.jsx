/**
 * PhotoCapturePanel.jsx
 *
 * Photo capture component with camera/gallery input, thumbnail grid,
 * and per-photo delete buttons.
 *
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.8, 3.9, 3.10, 6.2, 6.4, 6.5
 */

import React, { useRef, useState } from 'react';

/**
 * @param {{
 *   photoCapture: import('../hooks/usePhotoCapture').default,
 * }} props
 */
function PhotoCapturePanel({ photoCapture }) {
  const { photos, addPhoto, removePhoto } = photoCapture;
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);

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

  const handleAddClick = () => {
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
          className="min-w-[44px] min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          aria-label="Tambah foto"
        >
          Tambah Foto
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
          Belum ada foto. Tekan "Tambah Foto" untuk mengambil foto.
        </p>
      )}
    </div>
  );
}

export default PhotoCapturePanel;
