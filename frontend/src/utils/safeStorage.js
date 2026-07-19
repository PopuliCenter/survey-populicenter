/**
 * safeStorage.js — Akses localStorage/sessionStorage yang TAK PERNAH melempar.
 *
 * Insiden produksi 2026-07-18: `window.localStorage` bisa NULL / dilarang di
 * sebagian konteks (WebView dengan DOM storage nonaktif, mode privasi ketat,
 * iframe embed lintas-origin dengan cookie pihak-ketiga diblokir). Akses
 * langsung `localStorage.getItem(...)` di jalur boot melempar
 * "Cannot read properties of null (reading 'getItem')" SEBELUM render →
 * layar putih permanen.
 *
 * Wrapper ini: pakai storage asli bila tersedia & bisa ditulis; selain itu
 * fallback ke Map di memori (bertahan selama tab hidup — cukup agar aplikasi
 * tetap BERFUNGSI walau sesi tak persisten di perangkat seperti itu).
 */

function makeStore(kind) {
  let store = null;
  try {
    store = typeof window !== 'undefined' ? window[kind] : null;
    if (store) {
      // Probe tulis: sebagian browser menyediakan objeknya tapi menolak operasi.
      const probe = '__storage_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
    }
  } catch {
    store = null;
  }
  const mem = new Map();
  return {
    getItem(key) {
      try {
        if (store) return store.getItem(key);
      } catch { /* jatuh ke memori */ }
      return mem.has(key) ? mem.get(key) : null;
    },
    setItem(key, value) {
      try {
        if (store) { store.setItem(key, value); return; }
      } catch { /* jatuh ke memori */ }
      mem.set(key, String(value));
    },
    removeItem(key) {
      try {
        if (store) store.removeItem(key);
      } catch { /* abaikan */ }
      mem.delete(key);
    },
  };
}

/** Pengganti aman untuk window.localStorage. */
export const localStore = makeStore('localStorage');

/** Pengganti aman untuk window.sessionStorage. */
export const sessionStore = makeStore('sessionStorage');
