/**
 * Unit Tests — utils/rtDraw.js (undian RT menggantikan FORM A)
 *
 * Sifat yang WAJIB dijaga:
 *   - reproducible: seed sama → hasil sama (dasar auditabilitas)
 *   - berbeda-beda: seed beda → umumnya hasil beda (bukan konstanta)
 *   - valid: selalu dalam 1..totalRt, tanpa duplikat, terurut
 *   - seragam: tiap RT punya peluang sebanding (tak bias ke nomor kecil)
 *   - verifyDraw menolak hasil karangan
 */

const { drawRt, verifyDraw, generateSeed, MAX_RT } = require('../../src/utils/rtDraw');

describe('drawRt — sifat dasar', () => {
  test('seed sama menghasilkan RT yang sama persis (reproducible)', () => {
    const params = { seed: 'seed-abc', totalRt: 25, count: 2 };
    expect(drawRt(params)).toEqual(drawRt(params));
  });

  test('hasil selalu dalam rentang, unik, dan terurut menaik', () => {
    for (let i = 0; i < 200; i++) {
      const totalRt = 1 + (i % 60);
      const count = 1 + (i % Math.max(1, Math.min(5, totalRt)));
      const out = drawRt({ seed: `s-${i}`, totalRt, count });

      expect(out).toHaveLength(count);
      expect(new Set(out).size).toBe(count); // tanpa duplikat
      out.forEach((n) => {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(totalRt);
      });
      expect([...out].sort((a, b) => a - b)).toEqual(out);
    }
  });

  test('seed berbeda menghasilkan kombinasi yang bervariasi', () => {
    const hasil = new Set();
    for (let i = 0; i < 100; i++) {
      hasil.add(drawRt({ seed: `beda-${i}`, totalRt: 25, count: 2 }).join('-'));
    }
    // Bila algoritma macet/konstan, set ini akan berisi 1 elemen.
    expect(hasil.size).toBeGreaterThan(30);
  });

  test('memilih seluruh RT bila count sama dengan totalRt', () => {
    expect(drawRt({ seed: 'x', totalRt: 5, count: 5 })).toEqual([1, 2, 3, 4, 5]);
  });

  test('totalRt = 1 tetap sah', () => {
    expect(drawRt({ seed: 'x', totalRt: 1, count: 1 })).toEqual([1]);
  });
});

describe('drawRt — keseragaman (tidak bias ke RT nomor kecil)', () => {
  test('setiap RT terpilih dengan frekuensi sebanding', () => {
    const totalRt = 10;
    const count = 2;
    const putaran = 20000;
    const hitung = new Array(totalRt + 1).fill(0);

    for (let i = 0; i < putaran; i++) {
      drawRt({ seed: `u-${i}`, totalRt, count }).forEach((n) => { hitung[n] += 1; });
    }

    // Harapan tiap RT = putaran * count / totalRt = 4000.
    const harapan = (putaran * count) / totalRt;
    for (let rt = 1; rt <= totalRt; rt++) {
      const selisih = Math.abs(hitung[rt] - harapan) / harapan;
      // Toleransi 10% — cukup longgar untuk keacakan, cukup ketat untuk
      // menangkap bias sistematis (mis. bug modulo yang menguntungkan RT kecil).
      expect(selisih).toBeLessThan(0.1);
    }
  });
});

describe('drawRt — input tidak valid ditolak', () => {
  test.each([
    ['totalRt nol', { seed: 's', totalRt: 0, count: 1 }],
    ['totalRt pecahan', { seed: 's', totalRt: 2.5, count: 1 }],
    ['totalRt melebihi batas', { seed: 's', totalRt: MAX_RT + 1, count: 1 }],
    ['count nol', { seed: 's', totalRt: 10, count: 0 }],
    ['count melebihi totalRt', { seed: 's', totalRt: 3, count: 4 }],
    ['tanpa seed', { seed: '', totalRt: 10, count: 2 }],
  ])('%s → melempar error', (_label, params) => {
    expect(() => drawRt(params)).toThrow();
  });
});

describe('verifyDraw — audit hasil tersimpan', () => {
  test('menerima hasil yang benar', () => {
    const params = { seed: 'audit-1', totalRt: 25, count: 2 };
    expect(verifyDraw(params, drawRt(params))).toBe(true);
  });

  test('menolak hasil yang diubah (angka dikarang)', () => {
    const params = { seed: 'audit-1', totalRt: 25, count: 2 };
    const asli = drawRt(params);
    const palsu = [asli[0], asli[1] === 25 ? 24 : asli[1] + 1];
    expect(verifyDraw(params, palsu)).toBe(false);
  });

  test('menolak bila jumlah RT terpilih tidak cocok', () => {
    const params = { seed: 'audit-1', totalRt: 25, count: 2 };
    expect(verifyDraw(params, [1])).toBe(false);
  });

  test('menolak input yang bukan larik atau parameter rusak', () => {
    expect(verifyDraw({ seed: 's', totalRt: 25, count: 2 }, null)).toBe(false);
    expect(verifyDraw({ seed: 's', totalRt: 0, count: 2 }, [1, 2])).toBe(false);
  });
});

describe('generateSeed', () => {
  test('menghasilkan seed hex 32 karakter yang berbeda tiap panggilan', () => {
    const a = generateSeed();
    const b = generateSeed();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
