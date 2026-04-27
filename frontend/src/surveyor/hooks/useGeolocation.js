/**
 * useGeolocation.js
 *
 * React hook that wraps the browser Geolocation API.
 * Returns a `getLocation()` function that resolves to { status, lat, lng }.
 *
 * Status values:
 *   'available'             – coordinates obtained successfully
 *   'lokasi_tidak_tersedia' – user denied permission
 *   'tidak_didukung'        – browser does not support Geolocation API
 *   'timeout'               – no response within 10 seconds
 *
 * The 10-second timeout is implemented with setTimeout (NOT the built-in
 * Geolocation API timeout option) per Requirements 16.5.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

const TIMEOUT_MS = 10_000;

/**
 * useGeolocation
 *
 * @returns {{ getLocation: () => Promise<{ status: string, lat: number|null, lng: number|null }> }}
 */
function useGeolocation() {
  /**
   * Request the device's current position.
   *
   * @returns {Promise<{ status: string, lat: number|null, lng: number|null }>}
   */
  function getLocation() {
    return new Promise((resolve) => {
      // Requirement 16.4: browser does not support Geolocation API
      if (!navigator.geolocation) {
        resolve({ status: 'tidak_didukung', lat: null, lng: null });
        return;
      }

      let settled = false;

      // Requirement 16.5: 10-second timeout via setTimeout (not built-in option)
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ status: 'timeout', lat: null, lng: null });
        }
      }, TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              status: 'available',
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
        },
        // Error callback — covers permission denied and other errors
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            // Requirement 16.3: user denied permission
            resolve({ status: 'lokasi_tidak_tersedia', lat: null, lng: null });
          }
        }
      );
    });
  }

  return { getLocation };
}

export default useGeolocation;
