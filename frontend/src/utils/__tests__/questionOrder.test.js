/**
 * Unit Tests — utils/questionOrder.js (blok acak urutan pertanyaan)
 *
 * Yang dijaga:
 *   - deterministik: seed sama → urutan sama (draft dilanjutkan TIDAK berubah)
 *   - seed beda (nomor kuesioner beda) → urutan umumnya beda
 *   - hanya blok BERSEBELAHAN yang dikocok; pertanyaan lain tak bergeser posisi
 *   - dua blok terpisah dikocok independen (bukan permutasi identik)
 *   - tanpa flag → larik asli dikembalikan apa adanya (tanpa salinan sia-sia)
 */

import { describe, test, expect } from 'vitest';
import { seededShuffle, computeDisplayQuestions } from '../questionOrder';

const q = (id, over = {}) => ({ id, randomize_order: false, ...over });
const r = (id) => q(id, { randomize_order: true });
const ids = (arr) => arr.map((x) => x.id);

describe('seededShuffle', () => {
  test('deterministik: seed sama → hasil identik', () => {
    const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(seededShuffle(arr, 'seed-1')).toEqual(seededShuffle(arr, 'seed-1'));
  });

  test('seed beda → umumnya permutasi beda', () => {
    const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const berbeda = new Set();
    for (let i = 0; i < 20; i++) berbeda.add(seededShuffle(arr, `s-${i}`).join(''));
    expect(berbeda.size).toBeGreaterThan(15);
  });

  test('permutasi sah: elemen sama, tanpa duplikat, input tak berubah', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const out = seededShuffle(arr, 'x');
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(arr).toEqual(['a', 'b', 'c', 'd']); // tidak dimutasi
  });
});

describe('computeDisplayQuestions', () => {
  test('tanpa flag → larik asli (referensi sama, nol biaya)', () => {
    const qs = [q('a'), q('b'), q('c')];
    expect(computeDisplayQuestions(qs, 'seed')).toBe(qs);
  });

  test('pertanyaan di luar blok TIDAK bergeser posisi', () => {
    // identitas (a,b) — blok acak (c,d,e) — penutup (f)
    const qs = [q('a'), q('b'), r('c'), r('d'), r('e'), q('f')];
    const out = computeDisplayQuestions(qs, 'srv__012');

    expect(out[0].id).toBe('a');
    expect(out[1].id).toBe('b');
    expect(out[5].id).toBe('f');
    expect(ids(out.slice(2, 5)).sort()).toEqual(['c', 'd', 'e']);
  });

  test('deterministik per seed: nomor kuesioner sama → urutan sama persis', () => {
    const qs = [q('a'), r('b'), r('c'), r('d'), r('e'), q('f')];
    expect(ids(computeDisplayQuestions(qs, 'srv__007')))
      .toEqual(ids(computeDisplayQuestions(qs, 'srv__007')));
  });

  test('nomor kuesioner beda → urutan blok umumnya beda', () => {
    const qs = [r('a'), r('b'), r('c'), r('d'), r('e'), r('f'), r('g')];
    const variasi = new Set();
    for (let n = 1; n <= 20; n++) variasi.add(ids(computeDisplayQuestions(qs, `srv__${n}`)).join(''));
    expect(variasi.size).toBeGreaterThan(15);
  });

  test('dua blok TERPISAH dikocok independen (bukan permutasi identik)', () => {
    // blok1 (a,b,c,d,e) — pemisah — blok2 (v,w,x,y,z)
    const qs = [r('a'), r('b'), r('c'), r('d'), r('e'), q('sep'), r('v'), r('w'), r('x'), r('y'), r('z')];
    // Pada minimal satu dari beberapa seed, pola permutasi kedua blok berbeda —
    // kalau seed blok tidak dibedakan, polanya SELALU identik.
    let adaBeda = false;
    for (let n = 0; n < 10 && !adaBeda; n++) {
      const out = ids(computeDisplayQuestions(qs, `s__${n}`));
      const pola1 = out.slice(0, 5).map((x) => 'abcde'.indexOf(x)).join('');
      const pola2 = out.slice(6).map((x) => 'vwxyz'.indexOf(x)).join('');
      if (pola1 !== pola2) adaBeda = true;
    }
    expect(adaBeda).toBe(true);
  });

  test('blok satu pertanyaan tidak berubah (tak ada yang bisa dikocok)', () => {
    const qs = [q('a'), r('b'), q('c')];
    expect(ids(computeDisplayQuestions(qs, 'x'))).toEqual(['a', 'b', 'c']);
  });

  test('larik kosong / null aman', () => {
    expect(computeDisplayQuestions([], 's')).toEqual([]);
    expect(computeDisplayQuestions(null, 's')).toEqual([]);
  });
});
