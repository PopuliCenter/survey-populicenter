/**
 * Guard kontras palet (WCAG AA). Aplikasi dipakai TPD di lapangan, sering di
 * bawah terik matahari di HP murah — keterbacaan lebih penting dari estetika.
 * Mengubah warna di src/theme/palette.js harus tetap lolos tes ini.
 */
import { describe, test, expect } from 'vitest';
import { brand, ink, positive, warning, negative, info } from '../theme/palette';

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
