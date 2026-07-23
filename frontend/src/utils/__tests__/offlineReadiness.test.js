/**
 * Unit Tests — utils/offlineReadiness.js (checklist pra-lapangan "siap offline")
 *
 * Checklist ini penjaga terakhir sebelum TPD berangkat ke pelosok: salah
 * menghitung "siap" padahal ada bahan hilang = dropdown kosong / tak bisa
 * mengundi RT di lokasi tanpa sinyal.
 */

import { describe, test, expect } from 'vitest';
import { buildOfflineChecklist, remainingRtTickets, STALE_AFTER_MS } from '../offlineReadiness';

const NOW = new Date('2026-07-23T08:00:00Z');

const survei = (id, over = {}) => ({ id, title: `Survei ${id}`, field_tools_settings: {}, ...over });

function fakeStore(map) {
  return { getItem: (k) => (k in map ? map[k] : null) };
}

describe('remainingRtTickets', () => {
  test('menghitung sisa: tiket dipakai server (used_village) & pending lokal ikut dikurangi', () => {
    const store = fakeStore({
      rt_tickets__s1: JSON.stringify({ tickets: [
        { id: 't1', used_village: 'A' },
        { id: 't2', used_village: null },
        { id: 't3', used_village: null },
        { id: 't4', used_village: null },
      ] }),
      rt_pending__s1: JSON.stringify([{ ticket_id: 't2', village: 'B' }]),
    });
    expect(remainingRtTickets('s1', store)).toBe(2); // t3 & t4
  });

  test('belum ada jatah tersimpan → null (beda makna dengan 0/habis)', () => {
    expect(remainingRtTickets('s1', fakeStore({}))).toBeNull();
  });

  test('data korup di storage → null, tidak melempar', () => {
    expect(remainingRtTickets('s1', fakeStore({ rt_tickets__s1: '{rusak' }))).toBeNull();
  });
});

describe('buildOfflineChecklist', () => {
  const semuaSiap = {
    surveys: [survei('s1'), survei('s2', { field_tools_settings: { rt_selection: 'enabled' } })],
    downloadedIds: new Set(['s1', 's2']),
    regionReady: true,
    lastDownloadIso: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(), // 1 jam lalu
    pendingCount: 0,
    failedCount: 0,
    readTickets: () => 12,
    now: NOW,
  };

  test('semua bahan lengkap → ready, tanpa fail/warn', () => {
    const r = buildOfflineChecklist(semuaSiap);
    expect(r.ready).toBe(true);
    expect(r.failCount).toBe(0);
    expect(r.warnCount).toBe(0);
    expect(r.items.map((i) => i.key)).toEqual(['surveys', 'region', 'rtTickets', 'freshness', 'sync']);
    expect(r.items.every((i) => i.status === 'ok')).toBe(true);
  });

  test('survei belum semua terunduh → FAIL (formulir tak bisa dibuka offline)', () => {
    const r = buildOfflineChecklist({ ...semuaSiap, downloadedIds: new Set(['s1']) });
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === 'surveys').status).toBe('fail');
    expect(r.items.find((i) => i.key === 'surveys').detail).toMatch(/1\/2/);
  });

  test('data wilayah belum tersimpan → FAIL dengan sebab-akibat (dropdown kosong)', () => {
    const r = buildOfflineChecklist({ ...semuaSiap, regionReady: false });
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === 'region').detail).toMatch(/dropdown wilayah kosong/i);
  });

  test('tiket RT: habis → FAIL; menipis (<5) → WARN; survei tanpa RT tidak dicek', () => {
    const habis = buildOfflineChecklist({ ...semuaSiap, readTickets: () => 0 });
    expect(habis.ready).toBe(false);
    expect(habis.items.find((i) => i.key === 'rtTickets').status).toBe('fail');

    const menipis = buildOfflineChecklist({ ...semuaSiap, readTickets: () => 3 });
    expect(menipis.ready).toBe(true); // warn tidak menghalangi ready
    expect(menipis.items.find((i) => i.key === 'rtTickets').status).toBe('warn');
    expect(menipis.items.find((i) => i.key === 'rtTickets').detail).toMatch(/menipis/);

    const tanpaRt = buildOfflineChecklist({ ...semuaSiap, surveys: [survei('s1')] });
    expect(tanpaRt.items.find((i) => i.key === 'rtTickets')).toBeUndefined();
  });

  test('belum ada jatah tiket sama sekali (null) → FAIL, bukan dianggap aman', () => {
    const r = buildOfflineChecklist({ ...semuaSiap, readTickets: () => null });
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === 'rtTickets').detail).toMatch(/belum ada jatah/i);
  });

  test('cache basi > 24 jam → WARN menyuruh Perbarui; belum pernah → WARN', () => {
    const basi = buildOfflineChecklist({
      ...semuaSiap,
      lastDownloadIso: new Date(NOW.getTime() - STALE_AFTER_MS - 60 * 60 * 1000).toISOString(),
    });
    expect(basi.items.find((i) => i.key === 'freshness').status).toBe('warn');
    expect(basi.items.find((i) => i.key === 'freshness').detail).toMatch(/tekan Perbarui/i);

    const belumPernah = buildOfflineChecklist({ ...semuaSiap, lastDownloadIso: null });
    expect(belumPernah.items.find((i) => i.key === 'freshness').status).toBe('warn');
  });

  test('antrean sinkron: gagal diprioritaskan atas pending; nol → ok', () => {
    const gagal = buildOfflineChecklist({ ...semuaSiap, pendingCount: 2, failedCount: 1 });
    expect(gagal.items.find((i) => i.key === 'sync').detail).toMatch(/GAGAL/);

    const pending = buildOfflineChecklist({ ...semuaSiap, pendingCount: 3 });
    expect(pending.items.find((i) => i.key === 'sync').status).toBe('warn');
    expect(pending.items.find((i) => i.key === 'sync').detail).toMatch(/3 data menunggu/);
  });
});
