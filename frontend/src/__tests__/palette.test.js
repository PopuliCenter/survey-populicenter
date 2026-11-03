/**
 * Guard kontras palet (WCAG AA). Aplikasi dipakai TPD di lapangan, sering di
 * bawah terik matahari di HP murah — keterbacaan lebih penting dari estetika.
 * Mengubah warna di src/theme/palette.js harus tetap lolos tes ini.
 */
import { describe, test, expect } from 'vitest';
import { brand, ink, positive, warning, negative, info, surface, darkBg, darkFg, darkBorder } from '../theme/palette';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = '#ffffff';
const SCALES = { brand, positive, warning, negative, info };

describe('teks netral', () => {
  test.each([
    ['gray-500 di atas putih', ink[500], WHITE],
    ['gray-500 di atas gray-50 (latar halaman)', ink[500], ink[50]],
    ['gray-500 di atas gray-100', ink[500], ink[100]],
    ['gray-600 di atas gray-100', ink[600], ink[100]],
  ])('%s ≥ 4,5:1', (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(Object.entries(SCALES))('skala %s', (_, s) => {
  test('tombol: teks putih di atas 600 & 700 ≥ 4,5:1', () => {
    expect(contrast(WHITE, s[600])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, s[700])).toBeGreaterThanOrEqual(4.5);
  });
  test('label: teks 700 di atas tint 50 & 100 ≥ 4,5:1', () => {
    expect(contrast(s[700], s[50])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s[700], s[100])).toBeGreaterThanOrEqual(4.5);
  });
  test('teks 600 di atas putih & tint 50 ≥ 4,5:1', () => {
    expect(contrast(s[600], WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s[600], s[50])).toBeGreaterThanOrEqual(4.5);
  });
  test('bar 500 terlihat di atas putih & gray-100 ≥ 3:1 (elemen non-teks)', () => {
    expect(contrast(s[500], WHITE)).toBeGreaterThanOrEqual(2.9);
    expect(contrast(s[500], ink[100])).toBeGreaterThanOrEqual(2.5);
  });
});

const HUES = ['brand', 'positive', 'warning', 'negative', 'info'];
const SURFACES = { halaman: surface.page, kartu: surface.card, modal: surface.raised };

describe('mode gelap', () => {
  describe.each(Object.entries(SURFACES))('di atas %s', (_, bg) => {
    test('teks netral 300-900 >= 4,5:1', () => {
      for (const l of [300, 400, 500, 600, 700, 800, 900]) expect(contrast(darkFg.ink[l], bg)).toBeGreaterThanOrEqual(4.5);
    });
    test.each(HUES)('teks %s 400-900 >= 4,5:1', (h) => {
      for (const l of [400, 500, 600, 700, 800, 900]) expect(contrast(darkFg[h][l], bg)).toBeGreaterThanOrEqual(4.5);
    });
    test.each(HUES)('bar & titik %s 400-500 >= 3:1', (h) => {
      for (const l of [400, 500]) expect(contrast(darkBg[h][l], bg)).toBeGreaterThanOrEqual(3);
    });
    test('titik netral bg-gray-400 >= 3:1', () => {
      expect(contrast(darkBg.ink[400], bg)).toBeGreaterThanOrEqual(3);
    });
    test('garis kontrol border-gray-300 >= 3:1', () => {
      expect(contrast(darkBorder.ink[300], bg)).toBeGreaterThanOrEqual(3);
    });
  });
  test.each(HUES)('tint %s: teks 500-900 di 50 & 100 >= 4,5:1', (h) => {
    for (const t of [50, 100]) for (const l of [500, 600, 700, 800, 900]) expect(contrast(darkFg[h][l], darkBg[h][t])).toBeGreaterThanOrEqual(4.5);
  });
  test.each(HUES)('tint %s: text-gray-500 di 50 & 100 >= 4,5:1', (h) => {
    for (const t of [50, 100]) expect(contrast(darkFg.ink[500], darkBg[h][t])).toBeGreaterThanOrEqual(4.5);
  });
  test('isian netral: text-gray-500 di 100 & 200, text-gray-700 di 300 >= 4,5:1', () => {
    expect(contrast(darkFg.ink[500], darkBg.ink[100])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkFg.ink[500], darkBg.ink[200])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkFg.ink[700], darkBg.ink[300])).toBeGreaterThanOrEqual(4.5);
  });
  test.each([
    ['bg-primary-600', 'brand', 600], ['bg-primary-700', 'brand', 700],
    ['bg-red-500', 'negative', 500], ['bg-red-600', 'negative', 600], ['bg-red-700', 'negative', 700], ['bg-red-300', 'negative', 300],
    ['bg-green-600', 'positive', 600], ['bg-green-700', 'positive', 700],
    ['bg-amber-500', 'warning', 500], ['bg-amber-600', 'warning', 600], ['bg-amber-700', 'warning', 700],
    ['bg-gray-400', 'ink', 400], ['bg-gray-700', 'ink', 700], ['bg-gray-800', 'ink', 800], ['bg-gray-900', 'ink', 900],
  ])('solid: teks putih di atas %s >= 4,5:1', (_, f, l) => {
    expect(contrast(WHITE, darkBg[f][l])).toBeGreaterThanOrEqual(4.5);
  });
  test('tooltip bg-gray-900 tetap gelap (scrim & teks terang bergantung padanya)', () => {
    expect(lum(darkBg.ink[900])).toBeLessThan(lum(surface.page));
    for (const t of [darkFg.ink[300], darkFg.ink[500], darkFg.info[200], darkFg.warning[200], darkFg.warning[300]]) {
      expect(contrast(t, darkBg.ink[900])).toBeGreaterThanOrEqual(4.5);
    }
  });
  test('rel progres: bar 500 di atas bg-gray-200 >= 3:1', () => {
    for (const h of HUES) expect(contrast(darkBg[h][500], darkBg.ink[200])).toBeGreaterThanOrEqual(3);
  });
  test('urutan elevasi: halaman < kartu < modal < gray-100 < gray-200', () => {
    const seq = [surface.page, surface.card, surface.raised, darkBg.ink[100], darkBg.ink[200]].map(lum);
    seq.reduce((a, b) => { expect(b).toBeGreaterThan(a); return b; });
  });
});
