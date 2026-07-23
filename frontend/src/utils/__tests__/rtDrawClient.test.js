/**
 * Unit Tests — utils/rtDrawClient.js (undian RT offline, v2 Form A)
 *
 * INTI SEGALANYA: hasil klien harus IDENTIK dengan backend/src/utils/rtDraw.js
 * (v2). Menyimpang satu angka saja → semua undian offline berstatus
 * "tidak terverifikasi" di pengawasan.
 *
 * VEKTOR di bawah DIBANGKITKAN LANGSUNG dari implementasi backend
 * (drawRtFormA + generateFormAGrid). Bila salah satu sisi berubah,
 * regenerasi vektor dan perbarui KEDUA sisi bersama-sama.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { drawRtClient, drawRtFormAClient, generateFormAGridClient } from '../rtDrawClient';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

// ── Vektor paritas v2 (dibangkitkan dari backend 2026-07-23) ─────────────────
const VEKTOR = [
  { seed: 'seed-abc', totalRt: 25, count: 2, selected: [17, 20], picks: [{ cell: 1, value: 17 }, { cell: 2, value: 20 }] },
  { seed: 'tiket-offline-001', totalRt: 30, count: 2, selected: [12, 7], picks: [{ cell: 0, value: 12 }, { cell: 11, value: 7 }] },
  { seed: 'a', totalRt: 1, count: 1, selected: [1], picks: [{ cell: 184, value: 1 }] },
  { seed: 'kelurahan-tegal-parang', totalRt: 100, count: 4, selected: [29, 42, 23, 5], picks: [{ cell: 0, value: 29 }, { cell: 1, value: 42 }, { cell: 2, value: 23 }, { cell: 3, value: 5 }] },
  // totalRt=2: pick kedua baru ketemu di sel 254 — bukti lanjutan deret identik.
  { seed: '0123456789abcdef0123456789abcdef', totalRt: 2, count: 2, selected: [2, 1], picks: [{ cell: 35, value: 2 }, { cell: 254, value: 1 }] },
];

// 10 sel pertama grid utk seed-abc — paritas aliran PRNG mentah dgn backend.
const GRID10_SEED_ABC = [88, 17, 20, 34, 80, 20, 52, 37, 17, 53];

describe('drawRtFormAClient — paritas dengan backend', () => {
  test.each(VEKTOR)('seed "$seed" (total $totalRt) → selected & picks identik dgn server', async (v) => {
    const r = await drawRtFormAClient({ seed: v.seed, totalRt: v.totalRt, count: v.count });
    expect(r.selected).toEqual(v.selected);
    expect(r.picks).toEqual(v.picks);
  });

  test('aliran grid mentah identik (10 sel pertama seed-abc)', async () => {
    expect((await generateFormAGridClient('seed-abc', 10))).toEqual(GRID10_SEED_ABC);
  });

  test('deterministik: dua panggilan sama → hasil sama', async () => {
    const params = { seed: 'ulang', totalRt: 40, count: 3 };
    expect(await drawRtClient(params)).toEqual(await drawRtClient(params));
  });
});

describe('drawRtFormAClient — sifat Form A', () => {
  test('picks menunjuk sel grid yang benar (bahan kotak-kotak UI)', async () => {
    const { picks, gridCells } = await drawRtFormAClient({ seed: 'kotak', totalRt: 30, count: 2 });
    const grid = await generateFormAGridClient('kotak', gridCells);
    picks.forEach((p) => {
      expect(grid[p.cell]).toBe(p.value);
      expect(p.value).toBeLessThanOrEqual(30);
    });
  });

  test('hasil unik & dalam rentang', async () => {
    for (let i = 0; i < 20; i++) {
      const totalRt = 5 + i;
      const out = await drawRtClient({ seed: `s-${i}`, totalRt, count: 3 });
      expect(new Set(out).size).toBe(3);
      out.forEach((n) => { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(totalRt); });
    }
  });

  test.each([
    ['totalRt nol', { seed: 's', totalRt: 0, count: 1 }],
    ['totalRt > 100 (batas Form A)', { seed: 's', totalRt: 101, count: 1 }],
    ['count melebihi totalRt', { seed: 's', totalRt: 3, count: 4 }],
    ['tanpa seed', { seed: '', totalRt: 10, count: 2 }],
  ])('%s → melempar error', async (_l, params) => {
    await expect(drawRtClient(params)).rejects.toThrow();
  });
});
