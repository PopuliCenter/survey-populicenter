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
 * Wrapper ini: pakai storage asli bila bisa dibaca; tulisan yang ditolak jatuh ke
 * Map di memori (bertahan selama tab hidup — cukup agar aplikasi tetap BERFUNGSI
 * walau sesi tak persisten di perangkat seperti itu). Storage penuh menolak tulis
 * tetapi datanya masih sah, jadi tak boleh dianggap hilang: token & preferensi
 * yang sudah tersimpan tetap terbaca.
 */

function makeStore(kind) {
  let store = null;
  try {
    store = typeof window !== 'undefined' ? window[kind] : null;
    // Probe baca: sebagian browser menyediakan objeknya tapi melempar saat diakses.
    if (store) store.getItem('__storage_probe__');
  } catch {
    store = null;
  }
  const mem = new Map();
  return {
    getItem(key) {
      if (mem.has(key)) return mem.get(key); // nilai terbaru yang gagal ditulis ke store
      try {
        if (store) return store.getItem(key);
      } catch { /* anggap kosong */ }
      return null;
    },
    setItem(key, value) {
      try {
        if (store) { store.setItem(key, value); mem.delete(key); return; }
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
