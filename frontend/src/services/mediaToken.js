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
