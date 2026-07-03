/**
 * Property-Based Tests for Geolocation Precision
 *
 * Property 6: Geolokasi Tersimpan dengan Presisi Minimal 6 Desimal
 * Validates: Requirements 16.2
 *
 * Feature: web-survey-platform, Property 6: Geolokasi Tersimpan dengan Presisi Minimal 6 Desimal
 *
 * For any lat/lng coordinate pair obtained from the browser with status "available",
 * the stored values must preserve at least 6 decimal places of precision.
 *
 * The hook returns coordinates directly from `position.coords.latitude` and
 * `position.coords.longitude` without truncation. This property verifies that
 * the precision contract is upheld: parseFloat(coord.toFixed(6)) equals the
 * value that would be stored (i.e., no precision is lost beyond 6 decimal places).
 */

import fc from 'fast-check';
import { describe, test, vi, beforeEach, afterEach } from 'vitest';
import useGeolocation from '../useGeolocation.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Simulate what the hook does: call getLocation() with a mocked
 * navigator.geolocation that immediately resolves with the given coordinates.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ status: string, lat: number, lng: number }>}
 */
function simulateGeolocationSuccess(lat, lng) {
  // Mock navigator.geolocation to immediately call the success callback
  Object.defineProperty(global.navigator, 'geolocation', {
    value: {
      getCurrentPosition: vi.fn((successCb) => {
        successCb({
          coords: {
            latitude: lat,
            longitude: lng,
          },
        });
      }),
    },
    configurable: true,
    writable: true,
  });

  // Sengaja memanggil hook di helper test (di luar komponen) untuk menguji getLocation.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { getLocation } = useGeolocation();
  return getLocation();
}

// ─── Property 6 Tests ─────────────────────────────────────────────────────────

describe('Property 6: Geolokasi Tersimpan dengan Presisi Minimal 6 Desimal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Feature: web-survey-platform, Property 6: Geolokasi Tersimpan dengan Presisi Minimal 6 Desimal
   * Validates: Requirements 16.2
   *
   * For any lat/lng pair, the value returned by the hook (which is what gets
   * stored) must equal parseFloat(coord.toFixed(6)) — meaning the stored value
   * preserves at least 6 decimal places of precision.
   */
  test('koordinat yang dikembalikan hook memiliki presisi minimal 6 angka desimal', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: -90, max: 90, noNaN: true }),
        fc.float({ min: -180, max: 180, noNaN: true }),
        async (lat, lng) => {
          const result = await simulateGeolocationSuccess(lat, lng);

          // The hook must return status 'available' with the coordinates
          if (result.status !== 'available') return false;

          // The stored value must preserve at least 6 decimal places.
          // parseFloat(lat.toFixed(6)) gives the value rounded to 6 decimals.
          // The stored value (result.lat) must equal the original lat value
          // (no truncation beyond what the browser provides).
          // Key check: the stored value must be equal to the input (no precision loss).
          const storedLat = result.lat;
          const storedLng = result.lng;

          // Verify the stored value equals the original coordinate
          // (the hook must not truncate or round the coordinates)
          if (storedLat !== lat) return false;
          if (storedLng !== lng) return false;

          // Verify that the value has at least 6 decimal places of precision:
          // parseFloat(coord.toFixed(6)) should equal the stored value
          // (i.e., rounding to 6 decimals does not change the value significantly)
          const latPrecision6 = parseFloat(lat.toFixed(6));
          const lngPrecision6 = parseFloat(lng.toFixed(6));

          // The stored value must be representable with at least 6 decimal places
          // This means: Math.abs(storedLat - latPrecision6) < epsilon
          const epsilon = 1e-6;
          if (Math.abs(storedLat - latPrecision6) > epsilon) return false;
          if (Math.abs(storedLng - lngPrecision6) > epsilon) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('nilai latitude yang tersimpan tidak kehilangan presisi dari browser', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: -90, max: 90, noNaN: true }),
        fc.float({ min: -180, max: 180, noNaN: true }),
        async (lat, lng) => {
          const result = await simulateGeolocationSuccess(lat, lng);

          if (result.status !== 'available') return false;

          // The hook passes through coordinates as-is from position.coords
          // No rounding or truncation should occur
          return result.lat === lat && result.lng === lng;
        }
      ),
      { numRuns: 100 }
    );
  });
});
