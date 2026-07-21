/**
 * Unit Tests — utils/rtDrawClient.js (undian RT offline di perangkat)
 *
 * INTI SEGALANYA: hasil klien harus IDENTIK dengan backend/src/utils/rtDraw.js.
 * Kalau menyimpang satu angka saja, setiap undian offline akan berstatus
 * "tidak terverifikasi" di pengawasan — fitur offline jadi tak berguna.
 *
 * VEKTOR di bawah DIBANGKITKAN LANGSUNG dari implementasi backend
 * (node -e "require('./src/utils/rtDraw').drawRt(...)"). Bila salah satu sisi
 * berubah, bangkitkan ulang vektor dan perbarui KEDUA sisi bersama-sama.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { drawRtClient } from '../rtDrawClient';

beforeAll(() => {
  // jsdom tidak menyediakan crypto.subtle — pakai WebCrypto Node (API sama
  // dengan yang tersedia di WebView/browser sungguhan).
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

// ── Vektor paritas (dibangkitkan dari backend 2026-07-21) ─────────────────────
const VEKTOR = [
  { seed: 'seed-abc', totalRt: 25, count: 2, expected: [5, 22] },
  { seed: 'tiket-offline-001', totalRt: 25, count: 2, expected: [3, 12] },
  { seed: 'a', totalRt: 1, count: 1, expected: [1] },
  { seed: 'kelurahan-tegal-parang', totalRt: 120, count: 4, expected: [8, 29, 35, 51] },
  { seed: 'ffffffffffffffffffffffffffffffff', totalRt: 7, count: 7, expected: [1, 2, 3, 4, 5, 6, 7] },
  { seed: '0123456789abcdef0123456789abcdef', totalRt: 999, count: 10, expected: [30, 126, 205, 268, 465, 631, 749, 831, 832, 905] },
];

describe('drawRtClient — paritas dengan backend', () => {
  test.each(VEKTOR)('seed "$seed" (total $totalRt, pilih $count) → hasil identik dgn server', async (v) => {
    expect(await drawRtClient(v)).toEqual(v.expected);
  });

  test('deterministik: dua panggilan sama → hasil sama', async () => {
    const params = { seed: 'ulang', totalRt: 40, count: 3 };
    expect(await drawRtClient(params)).toEqual(await drawRtClient(params));
  });
});

describe('drawRtClient — sifat dasar', () => {
  test('hasil unik, dalam rentang, terurut menaik', async () => {
    for (let i = 0; i < 30; i++) {
      const totalRt = 5 + i;
      const out = await drawRtClient({ seed: `s-${i}`, totalRt, count: 3 });
      expect(new Set(out).size).toBe(3);
      out.forEach((n) => { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(totalRt); });
      expect([...out].sort((a, b) => a - b)).toEqual(out);
    }
  });

  test.each([
    ['totalRt nol', { seed: 's', totalRt: 0, count: 1 }],
    ['count melebihi totalRt', { seed: 's', totalRt: 3, count: 4 }],
    ['tanpa seed', { seed: '', totalRt: 10, count: 2 }],
  ])('%s → melempar error', async (_l, params) => {
    await expect(drawRtClient(params)).rejects.toThrow();
  });
});
