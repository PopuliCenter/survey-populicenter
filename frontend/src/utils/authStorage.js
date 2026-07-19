/**
 * authStorage.js — Penyimpanan sesi login TAHAN BANTING.
 *
 * Masalah yang diselesaikan: token hanya di localStorage (WebView) bisa hilang
 * saat aplikasi "dibersihkan" (app pembersih HP / evict WebView / tutup paksa
 * di sebagian ROM) → TPD mendadak logout. Solusi: cermin token+user ke
 * penyimpanan NATIF (@capacitor/preferences → SharedPreferences Android) yang
 * tidak ikut terhapus, lalu pulihkan ke localStorage saat aplikasi dibuka.
 *
 * Web/PWA: Preferences memakai localStorage juga (tanpa manfaat ekstra) —
 * seluruh API di sini aman dipanggil di web (no-op efektif).
 *
 * Catatan: "Hapus data" eksplisit dari Setelan Android menghapus SEMUANYA
 * (termasuk SharedPreferences) — itu memang reset total, tak bisa dihindari.
 */

const KEYS = ['token', 'user'];

function isNative() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
}

async function prefs() {
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

/** Simpan sesi (dipanggil saat login sukses). localStorage + natif. */
export async function persistAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  if (!isNative()) return;
  try {
    const P = await prefs();
    await P.set({ key: 'token', value: token });
    await P.set({ key: 'user', value: JSON.stringify(user) });
  } catch { /* non-kritis — localStorage tetap terisi */ }
}

/** Hapus sesi di SEMUA lapisan (logout / 401 / token kedaluwarsa). */
export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (!isNative()) return;
  // Fire-and-forget: pemanggil sinkron (interceptor/route guard) tak perlu menunggu.
  prefs()
    .then((P) => Promise.all(KEYS.map((key) => P.remove({ key }))))
    .catch(() => { /* non-kritis */ });
}

/**
 * Pulihkan sesi dari penyimpanan natif bila localStorage kosong (mis. WebView
 * dibersihkan). Panggil SEKALI di boot, SEBELUM render — agar route guard
 * langsung melihat token yang dipulihkan.
 */
export async function restoreAuthIfMissing() {
  if (!isNative()) return;
  if (localStorage.getItem('token')) return; // sesi masih ada — tak perlu apa-apa
  try {
    const P = await prefs();
    const { value: token } = await P.get({ key: 'token' });
    if (!token) return;
    localStorage.setItem('token', token);
    const { value: user } = await P.get({ key: 'user' });
    if (user) localStorage.setItem('user', user);
  } catch { /* non-kritis — pengguna login ulang seperti biasa */ }
}
