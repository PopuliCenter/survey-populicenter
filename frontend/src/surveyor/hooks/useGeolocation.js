/**
 * useGeolocation.js
 *
 * Hook untuk akses lokasi perangkat.
 * - Di Android/iOS (Capacitor) memakai plugin Geolocation native (lebih andal,
 *   bisa fix satelit murni tanpa internet).
 * - Di web memakai browser Geolocation API.
 *
 * Status values:
 *   'available'             – koordinat berhasil didapat
 *   'lokasi_tidak_tersedia' – izin ditolak
 *   'tidak_didukung'        – browser tidak mendukung Geolocation API
 *   'timeout'               – tidak ada respons dalam batas waktu
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import {
  isNativePlatform,
  getCurrentPosition as nativeGetCurrentPosition,
  watchPosition as bridgeWatchPosition,
} from '../../utils/capacitorBridge';

// Timeout diperpanjang dari 10s → 25s agar fix GPS offline (lambat) sempat didapat.
const TIMEOUT_MS = 25_000;

function getLocationWeb() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ status: 'tidak_didukung', lat: null, lng: null });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ status: 'timeout', lat: null, lng: null });
      }
    }, TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            status: 'available',
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ status: 'lokasi_tidak_tersedia', lat: null, lng: null });
        }
      }
    );
  });
}

function useGeolocation() {
  /**
   * Ambil posisi sekali (one-shot).
   * @returns {Promise<{ status: string, lat: number|null, lng: number|null, accuracy?: number }>}
   */
  async function getLocation() {
    if (isNativePlatform()) {
      const pos = await nativeGetCurrentPosition({ timeout: TIMEOUT_MS });
      if (pos && pos.lat != null && pos.lng != null) {
        return { status: 'available', lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
      }
      // Gagal/timeout di native (mis. masih mencari satelit / izin ditolak)
      return { status: 'timeout', lat: null, lng: null };
    }
    return getLocationWeb();
  }

  /**
   * Pantau lokasi terus-menerus. Berguna untuk mendapatkan fix offline yang
   * lambat selama wawancara berlangsung.
   * @param {(pos: { lat: number, lng: number, accuracy: number }) => void} onUpdate
   * @returns {Promise<() => void>} fungsi untuk menghentikan pantauan
   */
  function watchLocation(onUpdate) {
    return bridgeWatchPosition(onUpdate, { timeout: TIMEOUT_MS });
  }

  return { getLocation, watchLocation };
}

export default useGeolocation;
