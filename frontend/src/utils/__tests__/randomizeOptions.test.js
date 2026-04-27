/**
 * Unit Tests for randomizeOptions utility
 *
 * Tests:
 *   - shuffle menghasilkan semua pilihan (tidak ada yang hilang)
 *   - nilai tersimpan berdasarkan value bukan posisi
 *
 * Requirements: 5.2, 5.3, 5.4
 */

import { describe, test, expect } from 'vitest';
import { fisherYatesShuffle, getDisplayOptions } from '../randomizeOptions.js';

const OPTIONS = [
  { value: 'a', label: 'Pilihan A' },
  { value: 'b', label: 'Pilihan B' },
  { value: 'c', label: 'Pilihan C' },
  { value: 'd', label: 'Pilihan D' },
];

describe('fisherYatesShuffle', () => {
  test('menghasilkan array dengan panjang yang sama', () => {
    const result = fisherYatesShuffle(OPTIONS);
    expect(result).toHaveLength(OPTIONS.length);
  });

  test('mengandung semua elemen yang sama (tidak ada yang hilang)', () => {
    const result = fisherYatesShuffle(OPTIONS);
    const originalValues = OPTIONS.map((o) => o.value).sort();
    const resultValues = result.map((o) => o.value).sort();
    expect(resultValues).toEqual(originalValues);
  });

  test('tidak mengubah array asli (immutability)', () => {
    const original = OPTIONS.map((o) => ({ ...o }));
    fisherYatesShuffle(OPTIONS);
    OPTIONS.forEach((opt, i) => {
      expect(opt.value).toBe(original[i].value);
      expect(opt.label).toBe(original[i].label);
    });
  });

  test('mengembalikan array baru, bukan referensi yang sama', () => {
    const result = fisherYatesShuffle(OPTIONS);
    expect(result).not.toBe(OPTIONS);
  });

  test('setiap elemen dalam hasil adalah referensi dari array asli', () => {
    const result = fisherYatesShuffle(OPTIONS);
    result.forEach((item) => {
      expect(OPTIONS).toContain(item);
    });
  });

  test('array kosong dikembalikan sebagai array kosong', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });

  test('array satu elemen dikembalikan dengan elemen yang sama', () => {
    const single = [{ value: 'x', label: 'X' }];
    const result = fisherYatesShuffle(single);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('x');
  });

  test('nilai yang dipilih ditemukan berdasarkan value, bukan posisi', () => {
    // Requirement 5.4: jawaban tersimpan berdasarkan nilai, bukan posisi
    const selectedValue = 'c';
    const shuffled = fisherYatesShuffle(OPTIONS);

    // Find by value in shuffled array
    const found = shuffled.find((o) => o.value === selectedValue);
    expect(found).toBeDefined();
    expect(found.value).toBe(selectedValue);
    expect(found.label).toBe('Pilihan C');
  });
});

describe('getDisplayOptions', () => {
  test('randomize_options=true mengembalikan semua pilihan dalam urutan acak', () => {
    const result = getDisplayOptions(OPTIONS, true);
    expect(result).toHaveLength(OPTIONS.length);
    const originalValues = OPTIONS.map((o) => o.value).sort();
    const resultValues = result.map((o) => o.value).sort();
    expect(resultValues).toEqual(originalValues);
  });

  test('randomize_options=false mengembalikan array asli tanpa perubahan', () => {
    const result = getDisplayOptions(OPTIONS, false);
    expect(result).toBe(OPTIONS); // same reference
  });

  test('array kosong dikembalikan sebagai array kosong', () => {
    expect(getDisplayOptions([], true)).toEqual([]);
    expect(getDisplayOptions([], false)).toEqual([]);
  });

  test('null/undefined options dikembalikan sebagai array kosong', () => {
    expect(getDisplayOptions(null, true)).toEqual([]);
    expect(getDisplayOptions(undefined, false)).toEqual([]);
  });
});
