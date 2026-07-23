/**
 * Unit Tests — utils/rtDraw.js (undian RT = REPLIKA DIGITAL FORM A, v2)
 *
 * Metodologi resmi Populi (FORM A - SURNAS.xlsx): grid 10x10 berisi angka
 * 1-100 (rumus Excel =INT(RAND()*100)+1), discan dari baris 1 kolom 1 ke
 * kanan lalu turun; angka <= jumlah RT terpilih; duplikat dilewati.
 *
 * Sifat yang WAJIB dijaga:
 *   - reproducible: seed sama → grid & hasil sama (dasar auditabilitas)
 *   - REPLIKA SETIA: hasil = persis hasil scan manual atas grid yang sama
 *   - valid: dalam 1..totalRt, tanpa duplikat, urutan SESUAI DITEMUKAN
 *   - jumlah RT kecil → deret dilanjutkan (baris tambahan), tidak macet
 *   - seragam: tiap RT berpeluang sebanding
 *   - verifyDraw sadar-versi: baris lama v1 tetap terverifikasi
 */

const {
  drawRt, drawRtFormA, drawRtV1, generateFormAGrid,
  verifyDraw, generateSeed, MAX_RT, GRID_COLS, GRID_ROWS,
} = require('../../src/utils/rtDraw');

/** Scan manual grid ala TPD di kertas — pembanding independen utk drawRt. */
function scanManual(grid, totalRt, count) {
  const out = [];
  const seen = new Set();
  for (const v of grid) {
    if (v <= totalRt && !seen.has(v)) { seen.add(v); out.push(v); }
    if (out.length === count) break;
  }
  return out;
}

describe('drawRt (v2 Form A) — kesetiaan pada metodologi kertas', () => {
  test('hasil = persis hasil scan manual atas grid yang sama', () => {
    for (let i = 0; i < 50; i++) {
      const seed = `form-a-${i}`;
      const totalRt = 5 + (i % 60);
      const grid = generateFormAGrid(seed, 500); // cukup panjang utk pembanding
      expect(drawRt({ seed, totalRt, count: 2 })).toEqual(scanManual(grid, totalRt, 2));
    }
  });

  test('grid meniru rumus Excel: seluruh sel 1..100', () => {
    const grid = generateFormAGrid('cek-rentang', GRID_ROWS * GRID_COLS);
    expect(grid).toHaveLength(100);
    grid.forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  test('picks menunjuk sel grid yang benar (untuk kotak-kotak di UI)', () => {
    const seed = 'kotak-ui';
    const { selected, picks, gridCells } = drawRtFormA({ seed, totalRt: 30, count: 2 });
    const grid = generateFormAGrid(seed, gridCells);
    picks.forEach((p, idx) => {
      expect(grid[p.cell]).toBe(p.value);
      expect(selected[idx]).toBe(p.value);
      expect(p.value).toBeLessThanOrEqual(30);
    });
    // Semua sel SEBELUM pick terakhir yang bukan pick = tidak memenuhi syarat
    // (lebih besar dari totalRt atau duplikat) — bukti tak ada yang dilompati.
    const pickCells = new Set(picks.map((p) => p.cell));
    const takenValues = new Set();
    for (let c = 0; c <= picks[picks.length - 1].cell; c++) {
      if (pickCells.has(c)) { takenValues.add(grid[c]); continue; }
      expect(grid[c] > 30 || takenValues.has(grid[c])).toBe(true);
    }
  });

  test('duplikat angka yang sudah terpilih DILEWATI (RT tak diundi dua kali)', () => {
    for (let i = 0; i < 300; i++) {
      const out = drawRt({ seed: `dup-${i}`, totalRt: 5, count: 3 });
      expect(new Set(out).size).toBe(3);
    }
  });

  test('jumlah RT kecil → deret dilanjutkan melewati 100 sel, tidak macet', () => {
    // totalRt=2: peluang per sel hanya 2% — hampir pasti butuh baris tambahan.
    const { selected, gridCells } = drawRtFormA({ seed: 'kecil', totalRt: 2, count: 2 });
    expect([...selected].sort()).toEqual([1, 2]);
    expect(gridCells).toBeGreaterThanOrEqual(GRID_ROWS * GRID_COLS);
  });

  test('deterministik: seed sama → hasil & grid sama persis', () => {
    const params = { seed: 'seed-abc', totalRt: 25, count: 2 };
    expect(drawRt(params)).toEqual(drawRt(params));
    expect(generateFormAGrid('seed-abc')).toEqual(generateFormAGrid('seed-abc'));
  });

  test('seed berbeda menghasilkan kombinasi bervariasi', () => {
    const hasil = new Set();
    for (let i = 0; i < 100; i++) {
      hasil.add(drawRt({ seed: `beda-${i}`, totalRt: 25, count: 2 }).join('-'));
    }
    expect(hasil.size).toBeGreaterThan(30);
  });

  test('hasil selalu dalam rentang dan unik', () => {
    for (let i = 0; i < 100; i++) {
      const totalRt = 1 + (i % 60);
      const count = 1 + (i % Math.max(1, Math.min(5, totalRt)));
      const out = drawRt({ seed: `s-${i}`, totalRt, count });
      expect(out).toHaveLength(count);
      expect(new Set(out).size).toBe(count);
      out.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(totalRt);
      });
    }
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
    const harapan = (putaran * count) / totalRt;
    for (let rt = 1; rt <= totalRt; rt++) {
      expect(Math.abs(hitung[rt] - harapan) / harapan).toBeLessThan(0.1);
    }
  });
});

describe('drawRt — input tidak valid ditolak', () => {
  test.each([
    ['totalRt nol', { seed: 's', totalRt: 0, count: 1 }],
    ['totalRt pecahan', { seed: 's', totalRt: 2.5, count: 1 }],
    ['totalRt melebihi batas Form A (100)', { seed: 's', totalRt: MAX_RT + 1, count: 1 }],
    ['count nol', { seed: 's', totalRt: 10, count: 0 }],
    ['count melebihi totalRt', { seed: 's', totalRt: 3, count: 4 }],
    ['tanpa seed', { seed: '', totalRt: 10, count: 2 }],
  ])('%s → melempar error', (_label, params) => {
    expect(() => drawRt(params)).toThrow();
  });
});

describe('verifyDraw — audit sadar-versi', () => {
  test('menerima hasil v2 yang benar (default)', () => {
    const params = { seed: 'audit-1', totalRt: 25, count: 2 };
    expect(verifyDraw(params, drawRt(params))).toBe(true);
  });

  test('menolak hasil v2 yang diubah', () => {
    const params = { seed: 'audit-1', totalRt: 25, count: 2 };
    const asli = drawRt(params);
    const palsu = [asli[0], asli[1] === 25 ? 24 : asli[1] + 1];
    expect(verifyDraw(params, palsu)).toBe(false);
  });

  test('baris LAMA v1 tetap terverifikasi dengan algoVersion: 1', () => {
    const params = { seed: 'warisan', totalRt: 32, count: 2 };
    const v1 = drawRtV1(params);
    expect(verifyDraw({ ...params, algoVersion: 1 }, v1)).toBe(true);
    // Dan hasil v1 TIDAK lolos verifikasi v2 (algoritmanya memang beda) —
    // kecuali kebetulan identik; pastikan kasus uji ini tidak kebetulan.
    if (drawRt(params).join(',') !== [...v1].join(',')) {
      expect(verifyDraw(params, v1)).toBe(false);
    }
  });

  test('menolak input bukan larik / parameter rusak', () => {
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
