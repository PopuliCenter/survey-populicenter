/**
 * Regresi insiden produksi 2026-07-18: `window.localStorage` NULL di sebagian
 * WebView/iframe embed → akses langsung di jalur boot melempar
 * "Cannot read properties of null (reading 'getItem')" → layar putih.
 *
 * safeStorage & authStorage TIDAK BOLEH melempar walau storage null/menolak.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';

const realLocal = window.localStorage;
const realSession = window.sessionStorage;

function setStorage(name, value) {
  Object.defineProperty(window, name, { value, configurable: true });
}

afterEach(() => {
  setStorage('localStorage', realLocal);
  setStorage('sessionStorage', realSession);
  vi.resetModules();
});

describe('safeStorage saat window.localStorage NULL', () => {
  test('getItem/setItem/removeItem tidak melempar & fallback ke memori', async () => {
    setStorage('localStorage', null);
    setStorage('sessionStorage', null);
    vi.resetModules();
    const { localStore, sessionStore } = await import('../safeStorage');

    expect(() => localStore.getItem('token')).not.toThrow();
    expect(localStore.getItem('token')).toBeNull();

    localStore.setItem('token', 'abc');
    expect(localStore.getItem('token')).toBe('abc'); // dari memori

    localStore.removeItem('token');
    expect(localStore.getItem('token')).toBeNull();

    expect(() => sessionStore.setItem('k', 'v')).not.toThrow();
    expect(sessionStore.getItem('k')).toBe('v');
  });

  test('storage yang MELEMPAR saat diakses juga aman (mode privasi ketat)', async () => {
    const throwing = {
      getItem() { throw new Error('Access is denied'); },
      setItem() { throw new Error('Access is denied'); },
      removeItem() { throw new Error('Access is denied'); },
    };
    setStorage('localStorage', throwing);
    vi.resetModules();
    const { localStore } = await import('../safeStorage');

    expect(() => localStore.setItem('a', '1')).not.toThrow();
    expect(localStore.getItem('a')).toBe('1'); // probe gagal → fallback memori
  });

  test('storage normal tetap dipakai apa adanya', async () => {
    vi.resetModules();
    const { localStore } = await import('../safeStorage');
    localStore.setItem('x', 'y');
    expect(window.localStorage.getItem('x')).toBe('y');
    localStore.removeItem('x');
  });
});

describe('authStorage.restoreAuthIfMissing saat storage NULL', () => {
  test('resolve tanpa melempar (jalur boot aman)', async () => {
    setStorage('localStorage', null);
    vi.resetModules();
    const { restoreAuthIfMissing, clearAuth, persistAuth } = await import('../authStorage');

    await expect(restoreAuthIfMissing()).resolves.toBeUndefined();
    expect(() => clearAuth()).not.toThrow();
    await expect(persistAuth('t', { id: 1 })).resolves.toBeUndefined();
  });
});
