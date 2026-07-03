/**
 * usePhotoCapture.js
 *
 * React hook that manages multi-photo capture with file validation.
 * Validates MIME type (JPEG, PNG, WEBP) and file size (max 5 MB).
 * Creates preview URLs via URL.createObjectURL and revokes them on cleanup.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_MAX_SIZE_MB = 5;
const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let nextId = 1;

/**
 * usePhotoCapture
 *
 * @param {{ maxSizeMB?: number, allowedTypes?: string[] }} [options]
 * @returns {{
 *   photos: Array<{ id: string, blob: Blob, previewUrl: string }>,
 *   addPhoto: (file: File) => { success: boolean, error?: string },
 *   removePhoto: (id: string) => void,
 *   clearPhotos: () => void,
 *   getPhotoBlobs: () => Blob[],
 * }}
 */
function usePhotoCapture(options = {}) {
  const maxSizeBytes = (options.maxSizeMB || DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
  const allowedTypes = options.allowedTypes || DEFAULT_ALLOWED_TYPES;

  const [photos, setPhotos] = useState([]);
  const previewUrlsRef = useRef(new Set());

  // Revoke all preview URLs on unmount. Salin ref ke variabel lokal agar
  // cleanup memakai koleksi yang sama (menghindari peringatan exhaustive-deps).
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const addPhoto = useCallback((file) => {
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Format foto tidak didukung. Gunakan JPEG, PNG, atau WEBP',
      };
    }

    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: 'Ukuran foto melebihi batas maksimal 5 MB',
      };
    }

    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.add(previewUrl);

    const id = `photo-${nextId++}`;
    setPhotos((prev) => [...prev, { id, blob: file, previewUrl }]);

    return { success: true };
  }, [allowedTypes, maxSizeBytes]);

  const removePhoto = useCallback((id) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
        previewUrlsRef.current.delete(photo.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const clearPhotos = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => {
        URL.revokeObjectURL(p.previewUrl);
        previewUrlsRef.current.delete(p.previewUrl);
      });
      return [];
    });
  }, []);

  const getPhotoBlobs = useCallback(() => {
    return photos.map((p) => p.blob);
  }, [photos]);

  return {
    photos,
    addPhoto,
    removePhoto,
    clearPhotos,
    getPhotoBlobs,
  };
}

export default usePhotoCapture;
