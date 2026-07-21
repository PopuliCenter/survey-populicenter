/**
 * Unit Tests — utils/regionData.js
 *
 * REGRESI YANG DIJAGA: dropdown wilayah pernah KOSONG saat offline padahal TPD
 * sudah pernah membukanya online. Sebabnya berkas ~3,6 MB itu hanya mengandalkan
 * cache Service Worker bersama (maxEntries/maxAge) sehingga tergusur lalu lintas
 * API. Karena itu yang wajib dibuktikan di sini:
 *   - sekali terunduh, data dibaca dari IndexedDB tanpa menyentuh jaringan
 *   - saat offline & sudah tersimpan → data TETAP ada
 *   - saat offline & belum pernah tersimpan → tidak melempar (UI tak boleh mati)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Tiruan lapisan IndexedDB (satu objek in-memory).
const store = new Map();
vi.mock('../offlineDB', () => ({
  getReferenceData: vi.fn(async (key) => store.get(key)),
  putReferenceData: vi.fn(async (key, data, meta) => { store.set(key, { key, data, ...meta }); }),
  deleteReferenceData: vi.fn(async (key) => { store.delete(key); }),
}));

// Platform: default web; tes native mengubahnya lewat setNative().
vi.mock('../capacitorBridge', () => ({
  isNativePlatform: vi.fn(() => false),
}));

import {
  loadRegionData,
  downloadRegionData,
  isRegionDataReadyOffline,
  isRegionDataUsable,
  __resetRegionMemoryCache,
} from '../regionData';
import { putReferenceData } from '../offlineDB';
import { isNativePlatform } from '../capacitorBridge';

/** Jalankan sisa tes seolah-olah di APK native (Capacitor). */
function setNative(on = true) {
  isNativePlatform.mockReturnValue(on);
}

const DATA_WILAYAH = {
  provinces: [{ id: '31', name: 'DKI JAKARTA' }, { id: '32', name: 'JAWA BARAT' }],
  regenciesByProvince: { 31: [{ id: '3171', name: 'KOTA JAKARTA SELATAN' }] },
  districtsByRegency: { 3171: [{ id: '317101', name: 'MAMPANG PRAPATAN' }] },
  villagesByDistrict: { 317101: [{ id: '3171011', name: 'TEGAL PARANG' }] },
};

function mockFetchOk(data = DATA_WILAYAH) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
}
function mockFetchOffline() {
  global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

beforeEach(() => {
  store.clear();
  __resetRegionMemoryCache();
  vi.clearAllMocks();
  setNative(false); // default: web
});

describe('loadRegionData — unduhan pertama', () => {
  test('mengambil dari jaringan lalu MENYIMPAN ke IndexedDB', async () => {
    mockFetchOk();

    const data = await loadRegionData();

    expect(data.provinces).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(putReferenceData).toHaveBeenCalled();
    expect(store.get('wilayah-indonesia')).toBeTruthy();
  });

  test('beberapa pemanggil bersamaan hanya memicu SATU unduhan', async () => {
    mockFetchOk();

    const [a, b, c] = await Promise.all([loadRegionData(), loadRegionData(), loadRegionData()]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a.provinces).toHaveLength(2);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

describe('loadRegionData — sudah tersimpan (inti perbaikan)', () => {
  test('membaca dari IndexedDB TANPA menyentuh jaringan', async () => {
    await putReferenceData('wilayah-indonesia', DATA_WILAYAH, { version: 1 });
    __resetRegionMemoryCache();
    mockFetchOk();

    const data = await loadRegionData();

    expect(data.provinces).toHaveLength(2);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('OFFLINE + sudah tersimpan → daftar wilayah tetap tersedia', async () => {
    await putReferenceData('wilayah-indonesia', DATA_WILAYAH, { version: 1 });
    __resetRegionMemoryCache();
    mockFetchOffline();

    const data = await loadRegionData();

    expect(data.provinces).toHaveLength(2);
    expect(data.villagesByDistrict['317101'][0].name).toBe('TEGAL PARANG');
  });

  test('cache versi lama diabaikan (struktur berubah) dan diunduh ulang', async () => {
    await putReferenceData('wilayah-indonesia', DATA_WILAYAH, { version: 0 });
    __resetRegionMemoryCache();
    mockFetchOk();

    await loadRegionData();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('loadRegionData — gagal total', () => {
  test('OFFLINE + belum pernah tersimpan → kembalikan struktur kosong, TIDAK melempar', async () => {
    mockFetchOffline();

    const data = await loadRegionData();

    expect(data.provinces).toEqual([]);
    expect(isRegionDataUsable(data)).toBe(false);
  });

  test('respons HTTP gagal tidak melempar', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    const data = await loadRegionData();

    expect(data.provinces).toEqual([]);
  });

  test('JSON tanpa daftar provinsi dianggap tidak sah & tidak disimpan', async () => {
    mockFetchOk({ provinces: [], regenciesByProvince: {} });

    const data = await loadRegionData();

    expect(data.provinces).toEqual([]);
    expect(store.get('wilayah-indonesia')).toBeUndefined();
  });

  test('IndexedDB tak tersedia → tetap jalan lewat jaringan', async () => {
    const offlineDB = await import('../offlineDB');
    offlineDB.getReferenceData.mockRejectedValueOnce(new Error('IDB diblokir'));
    offlineDB.putReferenceData.mockRejectedValueOnce(new Error('IDB diblokir'));
    mockFetchOk();

    const data = await loadRegionData();

    expect(data.provinces).toHaveLength(2);
  });
});

describe('downloadRegionData — persiapan offline eksplisit', () => {
  test('melaporkan sukses + tersimpan', async () => {
    mockFetchOk();

    const res = await downloadRegionData();

    expect(res).toEqual({ ok: true, persisted: true });
  });

  test('MELAPORKAN kegagalan (berbeda dari loadRegionData yang diam)', async () => {
    mockFetchOffline();

    const res = await downloadRegionData();

    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test('forceNetwork mengambil ulang meski sudah ada di cache', async () => {
    await putReferenceData('wilayah-indonesia', DATA_WILAYAH, { version: 1 });
    __resetRegionMemoryCache();
    mockFetchOk();

    await loadRegionData({ forceNetwork: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('APK native — berkas ikut aset aplikasi', () => {
  // Di native, fetch('/wilayahIndonesia.json') menunjuk server URL aplikasi
  // sendiri sehingga dilayani asset loader WebView (bukan jaringan). Data selalu
  // ada, jadi status offline TIDAK boleh bergantung pada IndexedDB.

  test('dilaporkan SIAP OFFLINE walau IndexedDB kosong (bukan peringatan palsu)', async () => {
    setNative(true);

    expect(await isRegionDataReadyOffline()).toBe(true);
  });

  test('tidak menggandakan ~3,6 MB ke IndexedDB', async () => {
    setNative(true);
    mockFetchOk();

    await loadRegionData();

    expect(putReferenceData).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  test('downloadRegionData melaporkan persisted=true (aset permanen di APK)', async () => {
    setNative(true);
    mockFetchOk();

    const res = await downloadRegionData();

    expect(res).toEqual({ ok: true, persisted: true });
  });

  test('data tetap terbaca dari aset lokal', async () => {
    setNative(true);
    mockFetchOk();

    const data = await loadRegionData();

    expect(data.provinces).toHaveLength(2);
  });

  test('di web, perilaku lama tetap: DISIMPAN ke IndexedDB', async () => {
    setNative(false);
    mockFetchOk();

    await loadRegionData();

    expect(putReferenceData).toHaveBeenCalled();
    expect(store.size).toBe(1);
  });
});

describe('isRegionDataReadyOffline', () => {
  test('false sebelum diunduh', async () => {
    expect(await isRegionDataReadyOffline()).toBe(false);
  });

  test('true setelah tersimpan', async () => {
    mockFetchOk();
    await downloadRegionData();

    expect(await isRegionDataReadyOffline()).toBe(true);
  });

  test('false bila hanya ada di memori tetapi gagal disimpan permanen', async () => {
    const offlineDB = await import('../offlineDB');
    offlineDB.putReferenceData.mockRejectedValue(new Error('kuota penuh'));
    mockFetchOk();

    await loadRegionData(); // masuk memori, gagal persist

    expect(await isRegionDataReadyOffline()).toBe(false);
  });
});
