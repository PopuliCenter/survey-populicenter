/**
 * Property-Based Tests for Answer Randomisation
 *
 * Property 4: Randomisasi Jawaban Mempertahankan Kelengkapan
 * Validates: Requirements 5.2, 5.3
 *
 * Feature: web-survey-platform, Property 4: Randomisasi jawaban mempertahankan kelengkapan
 *
 * For any set of options, a Fisher-Yates shuffle must:
 *   1. Produce an array of the same length (no elements lost or duplicated).
 *   2. Contain exactly the same elements (by value+label identity) as the original.
 *   3. Never mutate the original array.
 */

import fc from 'fast-check';
import { describe, test } from 'vitest';
import { fisherYatesShuffle, getDisplayOptions } from '../randomizeOptions.js';

// ─── Arbitrary ────────────────────────────────────────────────────────────────

/**
 * Generates an array of option objects with unique values.
 * minLength: 2 ensures there is always something to shuffle.
 */
const optionsArb = fc
  .array(
    fc.record({
      value: fc.string({ minLength: 1, maxLength: 20 }),
      label: fc.string({ minLength: 0, maxLength: 50 }),
    }),
    { minLength: 2, maxLength: 20 }
  )
  // Deduplicate by value to avoid ambiguity in set-equality checks
  .map((opts) => {
    const seen = new Set();
    return opts.filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  })
  // After dedup we still need at least 2 elements
  .filter((opts) => opts.length >= 2);

// ─── Property 4 Tests ─────────────────────────────────────────────────────────

describe('Property 4: Randomisasi Jawaban Mempertahankan Kelengkapan', () => {
  /**
   * Feature: web-survey-platform, Property 4: Randomisasi jawaban mempertahankan kelengkapan
   * Validates: Requirements 5.2, 5.3
   *
   * The shuffled array must contain exactly the same elements as the original —
   * no element may be lost or duplicated.
   */
  test('hasil shuffle mengandung semua elemen yang sama (tidak ada yang hilang atau duplikat)', () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const shuffled = fisherYatesShuffle(options);

        // Same length
        if (shuffled.length !== options.length) return false;

        // Same set of values (order-independent equality)
        const originalValues = options.map((o) => o.value).sort();
        const shuffledValues = shuffled.map((o) => o.value).sort();

        return JSON.stringify(originalValues) === JSON.stringify(shuffledValues);
      }),
      { numRuns: 25 }
    );
  });

  test('shuffle tidak mengubah array asli (immutability)', () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const originalSnapshot = options.map((o) => ({ ...o }));
        fisherYatesShuffle(options);

        // Original array must be unchanged
        for (let i = 0; i < options.length; i++) {
          if (options[i].value !== originalSnapshot[i].value) return false;
          if (options[i].label !== originalSnapshot[i].label) return false;
        }
        return true;
      }),
      { numRuns: 25 }
    );
  });

  test('setiap elemen dalam hasil shuffle adalah referensi dari array asli', () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const shuffled = fisherYatesShuffle(options);

        // Every element in shuffled must be the same object reference as in options
        return shuffled.every((item) => options.includes(item));
      }),
      { numRuns: 25 }
    );
  });

  test('getDisplayOptions dengan randomize_options=true menghasilkan semua elemen', () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const displayed = getDisplayOptions(options, true);

        if (displayed.length !== options.length) return false;

        const originalValues = options.map((o) => o.value).sort();
        const displayedValues = displayed.map((o) => o.value).sort();

        return JSON.stringify(originalValues) === JSON.stringify(displayedValues);
      }),
      { numRuns: 25 }
    );
  });

  test('getDisplayOptions dengan randomize_options=false mengembalikan urutan asli', () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const displayed = getDisplayOptions(options, false);

        // Should be the exact same array reference (no copy made)
        return displayed === options;
      }),
      { numRuns: 25 }
    );
  });

  test('nilai yang dipilih berdasarkan value tetap valid setelah shuffle', () => {
    /**
     * Validates: Requirement 5.4
     * Regardless of display order, the answer submitted is always the option's
     * `value` field — not its position index.
     */
    fc.assert(
      fc.property(
        optionsArb,
        fc.integer({ min: 0, max: 19 }),
        (options, rawIndex) => {
          const selectedIndex = rawIndex % options.length;
          const selectedValue = options[selectedIndex].value;

          const shuffled = fisherYatesShuffle(options);

          // Find by VALUE in the shuffled array (not by position)
          const found = shuffled.find((o) => o.value === selectedValue);

          return found !== undefined && found.value === selectedValue;
        }
      ),
      { numRuns: 25 }
    );
  });
});
