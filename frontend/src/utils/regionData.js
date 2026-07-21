/**
 * regionData.js — data wilayah Indonesia (provinsi→kab/kota→kecamatan→desa)
 * yang TAHAN OFFLINE.
 *
 * MASALAH YANG DIPERBAIKI: berkas /wilayahIndonesia.json (~3,6 MB) sengaja
 * dikecualikan dari precache Service Worker (agar bundel tak membengkak),
 * sehingga saat offline ia hanya bergantung pada runtime cache bersama —
 * yang dibatasi maxEntries (LRU) dan maxAge 1 hari. Akibatnya berkas itu
 * TERGUSUR oleh lalu lintas API biasa, dan dropdown wilayah mendadak kosong
 * di lapangan meski TPD merasa sudah pernah membukanya saat online.
 *
 * SOLUSI: simpan hasil unduhan di IndexedDB (kuota besar, tanpa LRU, tak
 * kedaluwarsa sendiri). Urutan pengambilan:
 *   1. memori (paling cepat, per-sesi)
 *   2. IndexedDB (bertahan meski aplikasi ditutup / offline berhari-hari)
 *   3. jaringan (lalu SIMPAN ke IndexedDB untuk pemakaian berikutnya)
 *
 * Bentuk data dipertahankan apa adanya dari berkas JSON:
 *   { provinces, regenciesByProvince, districtsByRegency, villagesByDistrict }
 */

import { getReferenceData, putReferenceData } from './offlineDB';

export const REGION_URL = '/wilayahIndonesia.json';
const STORE_KEY = 'wilayah-indonesia';
/** Versi bentuk data — dinaikkan bila struktur JSON berubah agar cache lama dibuang. */
const SCHEMA_VERSION = 1;

const EMPTY = {
  provinces: [],
  regenciesByProvince: {},
  districtsByRegency: {},
  villagesByDistrict: {},
};

let memoryCache = null;
let inFlight = null; // cegah unduhan ganda bila beberapa komponen memanggil bersamaan

/** Data dianggap sah bila minimal daftar provinsi terisi. */
function isUsable(data) {
  return !!data && Array.isArray(data.provinces) && data.provinces.length > 0;
}

async function readFromDB() {
  try {
    const row = await getReferenceData(STORE_KEY);
    if (row && row.version === SCHEMA_VERSION && isUsable(row.data)) return row.data;
  } catch {
    // IndexedDB bisa tak tersedia (mode privasi/WebView terbatas) — jangan
    // gagalkan aplikasi; cukup jatuh ke jaringan.
  }
  return null;
}

async function saveToDB(data) {
  try {
    await putReferenceData(STORE_KEY, data, { version: SCHEMA_VERSION, url: REGION_URL });
    return true;
  } catch {
    return false; // penyimpanan penuh / tak tersedia — data tetap dipakai di sesi ini
  }
}

async function fetchFromNetwork() {
  const res = await fetch(REGION_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Gagal memuat data wilayah (HTTP ${res.status})`);
  const data = await res.json();
  if (!isUsable(data)) throw new Error('Data wilayah tidak berisi daftar provinsi.');
  return data;
}

/**
 * Ambil data wilayah. Tidak pernah melempar — bila semua sumber gagal,
 * mengembalikan struktur kosong agar UI tetap hidup (dropdown kosong lebih
 * baik daripada layar error), dan pemanggil bisa memeriksa lewat
 * isRegionDataUsable().
 *
 * @param {{ forceNetwork?: boolean }} [opts]
 * @returns {Promise<object>}
 */
export async function loadRegionData(opts = {}) {
  const { forceNetwork = false } = opts;

  if (!forceNetwork && memoryCache) return memoryCache;

  if (!forceNetwork) {
    const fromDb = await readFromDB();
    if (fromDb) {
      memoryCache = fromDb;
      return fromDb;
    }
  }

  // Satukan permintaan bersamaan menjadi satu unduhan.
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const data = await fetchFromNetwork();
        memoryCache = data;
        await saveToDB(data);
        return data;
      } finally {
        inFlight = null;
      }
    })();
  }

  try {
    return await inFlight;
  } catch {
    // Offline & belum pernah tersimpan → jangan hancurkan layar.
    return memoryCache || EMPTY;
  }
}

/**
 * Unduh & simpan data wilayah untuk dipakai offline (dipanggil dari tombol
 * "Siapkan data offline"). Berbeda dari loadRegionData: di sini kegagalan
 * DILAPORKAN agar TPD tahu persiapan offline-nya belum berhasil.
 *
 * @returns {Promise<{ ok: boolean, persisted: boolean, error?: string }>}
 */
export async function downloadRegionData() {
  try {
    const data = await fetchFromNetwork();
    memoryCache = data;
    const persisted = await saveToDB(data);
    return { ok: true, persisted };
  } catch (err) {
    return { ok: false, persisted: false, error: err?.message || 'Gagal mengunduh data wilayah.' };
  }
}

/**
 * Apakah data wilayah sudah tersimpan & siap dipakai tanpa jaringan?
 * @returns {Promise<boolean>}
 */
export async function isRegionDataReadyOffline() {
  if (memoryCache && isUsable(memoryCache)) {
    // Ada di memori belum tentu tersimpan permanen — periksa IndexedDB.
    return !!(await readFromDB());
  }
  return !!(await readFromDB());
}

/** Cek kelayakan data (dipakai UI untuk memberi peringatan). */
export function isRegionDataUsable(data) {
  return isUsable(data);
}

/** Hanya untuk pengujian — bersihkan cache memori. */
export function __resetRegionMemoryCache() {
  memoryCache = null;
  inFlight = null;
}
