import api from './api';

/**
 * Token akses media berumur-pendek untuk URL <img>/<audio> (/uploads).
 * Dipakai alih-alih JWT sesi agar token sesi tak terpapar di log/URL.
 * Di-cache di memori & diperbarui otomatis menjelang kedaluwarsa.
 */
let cached = null; // { token, expMs }

export async function getMediaToken() {
  const now = Date.now();
  // Pakai cache selama masih tersisa > 1 menit.
  if (cached && cached.expMs - now > 60_000) return cached.token;
  const res = await api.get('/auth/media-token');
  const token = res.data?.token || '';
  const ttlMs = (res.data?.expiresInSec || 900) * 1000;
  cached = { token, expMs: now + ttlMs };
  return token;
}

/** Bersihkan cache (mis. saat logout). */
export function clearMediaToken() {
  cached = null;
}

/**
 * Bangun URL media /uploads dengan token SEGAR — panggil SAAT DIKLIK, bukan
 * saat halaman dibuka.
 *
 * Token media berumur 15 menit. Tautan yang URL-nya dirakit saat mount akan
 * kedaluwarsa diam-diam bila halaman dibiarkan terbuka: diklik → JSON
 * "Sesi telah berakhir" alih-alih fotonya (insiden Lihat foto Form B,
 * 2026-07-21). <img>/<audio> yang termuat langsung saat render tidak kena
 * masalah ini.
 *
 * @param {string} path - mis. "uploads/photos/2026-07-21/xxx.jpg"
 * @returns {Promise<string|null>}
 */
export async function freshMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const token = await getMediaToken();
  const q = token ? `?t=${encodeURIComponent(token)}` : '';
  const serverUrl = localStorage.getItem('api_server_url');
  const rel = path.replace(/^\//, '');
  return serverUrl ? `${serverUrl}/${rel}${q}` : `/${rel}${q}`;
}

/** Buka media /uploads di tab baru dengan token segar (aman diklik kapan pun). */
export async function openMediaInNewTab(path) {
  const url = await freshMediaUrl(path);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
