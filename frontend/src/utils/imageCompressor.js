/**
 * imageCompressor.js
 *
 * Kompresi gambar client-side sebelum upload ke server.
 * Menggunakan Canvas API — tidak butuh library tambahan.
 *
 * Mengurangi ukuran foto dari 3-5 MB menjadi ~200-500 KB
 * tanpa kehilangan kualitas yang signifikan untuk keperluan survei.
 */

/**
 * Kompresi gambar (Blob/File) ke ukuran yang lebih kecil.
 *
 * @param {Blob|File} imageBlob - File gambar asli
 * @param {object} options
 * @param {number} options.maxWidth - Lebar maksimum (default: 1280px)
 * @param {number} options.maxHeight - Tinggi maksimum (default: 1280px)
 * @param {number} options.quality - Kualitas JPEG 0-1 (default: 0.7)
 * @param {string} options.outputType - MIME type output (default: 'image/jpeg')
 * @returns {Promise<Blob>} Blob gambar yang sudah dikompresi
 */
export async function compressImage(imageBlob, options = {}) {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.7,
    outputType = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Draw to canvas at new size
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Gagal mengkompresi gambar'));
          }
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Jika gagal kompresi, kembalikan blob asli
      resolve(imageBlob);
    };

    img.src = url;
  });
}

/**
 * Kompresi gambar hanya jika ukurannya melebihi threshold.
 *
 * @param {Blob|File} imageBlob
 * @param {number} thresholdBytes - Ukuran minimum untuk kompresi (default: 500KB)
 * @returns {Promise<Blob>}
 */
export async function compressIfNeeded(imageBlob, thresholdBytes = 500 * 1024) {
  if (imageBlob.size <= thresholdBytes) {
    return imageBlob; // Sudah kecil, tidak perlu kompresi
  }
  return compressImage(imageBlob);
}
