/**
 * deviceId.js — identitas perangkat yang stabil untuk fitur kunci perangkat
 * (1 user TPD = 1 device).
 *
 * UID dibuat sekali lalu disimpan di localStorage (persisten per instalasi
 * app/WebView; tidak ikut terhapus saat logout). Dikirim ke server sebagai
 * header X-Device-Id pada tiap request; server mengikat akun ke UID ini pada
 * survei ber-device_lock 'enforced'.
 */

const DEVICE_UID_KEY = 'device_uid';

/** UID perangkat yang stabil (dibuat sekali per instalasi). */
export function getDeviceUid() {
  try {
    let uid = localStorage.getItem(DEVICE_UID_KEY);
    if (!uid) {
      uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_UID_KEY, uid);
    }
    return uid;
  } catch {
    return ''; // localStorage tak tersedia — server melewati header kosong
  }
}

/**
 * Label perangkat ringkas & ramah-manusia untuk ditampilkan admin,
 * mis. "Android 13; Realme RMX3286" — diambil dari user agent.
 */
export function getDeviceLabel() {
  try {
    const ua = navigator.userAgent || '';
    // Ambil isi tanda kurung pertama (platform; model; build) bila ada.
    const m = ua.match(/\(([^)]+)\)/);
    const core = m ? m[1] : ua;
    // Buang token kepanjangan & rapikan.
    return core.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 3).join('; ').slice(0, 200);
  } catch {
    return '';
  }
}
