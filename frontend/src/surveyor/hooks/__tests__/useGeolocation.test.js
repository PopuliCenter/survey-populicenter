/**
 * Unit Tests for useGeolocation hook
 *
 * Tests:
 *   - returns { status: 'tidak_didukung', lat: null, lng: null } when navigator.geolocation is not available
 *   - returns { status: 'lokasi_tidak_tersedia', lat: null, lng: null } when user denies permission
 *   - returns { status: 'timeout', lat: null, lng: null } when no response within 10 seconds
 *   - returns { status: 'available', lat, lng } when coordinates are obtained
 *
 * Requirements: 16.1, 16.3, 16.4, 16.5
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import useGeolocation from '../useGeolocation.js';

describe('useGeolocation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Requirement 16.4: browser does not support Geolocation API ─────────────

  test('mengembalikan status tidak_didukung ketika navigator.geolocation tidak tersedia', async () => {
    // Remove geolocation from navigator
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();
    const result = await getLocation();

    expect(result).toEqual({ status: 'tidak_didukung', lat: null, lng: null });
  });

  // ─── Requirement 16.3: user denied permission ────────────────────────────────

  test('mengembalikan status lokasi_tidak_tersedia ketika pengguna menolak izin', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_successCb, errorCb) => {
          // Simulate permission denied error
          errorCb(new Error('User denied geolocation'));
        }),
      },
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();
    const result = await getLocation();

    expect(result).toEqual({ status: 'lokasi_tidak_tersedia', lat: null, lng: null });
  });

  // ─── Requirement 16.5: timeout after 10 seconds ──────────────────────────────

  test('mengembalikan status timeout ketika tidak ada respons dalam batas waktu', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        // Never calls success or error callback — simulates no response
        getCurrentPosition: vi.fn(() => {
          // intentionally does nothing
        }),
      },
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();

    // Start the promise but don't await yet
    const promise = getLocation();

    // Advance timers past the timeout window to trigger the timeout
    vi.advanceTimersByTime(25_000);

    const result = await promise;

    expect(result).toEqual({ status: 'timeout', lat: null, lng: null });
  });

  // ─── Requirement 16.1, 16.2: coordinates obtained successfully ──────────────

  test('mengembalikan status available dengan koordinat ketika lokasi berhasil diperoleh', async () => {
    const mockLat = -6.200000;
    const mockLng = 106.816666;

    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((successCb) => {
          successCb({
            coords: {
              latitude: mockLat,
              longitude: mockLng,
            },
          });
        }),
      },
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();
    const result = await getLocation();

    expect(result).toEqual({
      status: 'available',
      lat: mockLat,
      lng: mockLng,
    });
  });

  test('koordinat yang dikembalikan memiliki presisi penuh dari browser', async () => {
    // Requirement 16.2: precision of at least 6 decimal places
    const mockLat = -6.123456789;
    const mockLng = 106.987654321;

    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((successCb) => {
          successCb({
            coords: {
              latitude: mockLat,
              longitude: mockLng,
            },
          });
        }),
      },
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();
    const result = await getLocation();

    expect(result.status).toBe('available');
    // Verify precision is preserved (at least 6 decimal places)
    expect(result.lat).toBe(mockLat);
    expect(result.lng).toBe(mockLng);
    // Verify 6 decimal places are present
    expect(result.lat.toFixed(6)).toBe(mockLat.toFixed(6));
    expect(result.lng.toFixed(6)).toBe(mockLng.toFixed(6));
  });

  test('timeout tidak terpicu jika koordinat diperoleh sebelum 10 detik', async () => {
    const mockLat = -7.250445;
    const mockLng = 112.768845;

    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((successCb) => {
          // Responds immediately (before timeout)
          successCb({
            coords: {
              latitude: mockLat,
              longitude: mockLng,
            },
          });
        }),
      },
      configurable: true,
      writable: true,
    });

    const { getLocation } = useGeolocation();
    const result = await getLocation();

    // Even after advancing time, the result should be 'available' not 'timeout'
    vi.advanceTimersByTime(10_000);

    expect(result.status).toBe('available');
    expect(result.lat).toBe(mockLat);
    expect(result.lng).toBe(mockLng);
  });
});
