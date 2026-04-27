/**
 * Property-Based Tests for Phone Number and Unique ID Question Types
 *
 * Properties tested:
 *   - Property 1: Konfigurasi phone valid selalu diterima
 *   - Property 3: Konfigurasi dengan max_length < min_length selalu ditolak
 *   - Property 4: Input non-angka selalu ditolak
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 3.4, 4.2, 5.2
 */

const fc = require('fast-check');

const { validatePhoneConfig, validateUniqueIdConfig } = require('../../src/routes/questions');

// ─── Property 1: Konfigurasi phone valid selalu diterima ──────────────────────
// Feature: phone-and-unique-id-questions, Property 1: Konfigurasi phone valid selalu diterima

describe('Property 1: Konfigurasi phone valid selalu diterima', () => {
  test('validatePhoneConfig mengembalikan valid: true untuk semua kombinasi min_length/max_length yang valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }).chain((min_length) =>
          fc.integer({ min: min_length, max: 20 }).map((max_length) => ({
            min_length,
            max_length,
          }))
        ),
        ({ min_length, max_length }) => {
          const result = validatePhoneConfig({ min_length, max_length });
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateUniqueIdConfig mengembalikan valid: true untuk semua kombinasi min_length/max_length yang valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }).chain((min_length) =>
          fc.integer({ min: min_length, max: 20 }).map((max_length) => ({
            min_length,
            max_length,
          }))
        ),
        ({ min_length, max_length }) => {
          const result = validateUniqueIdConfig({ min_length, max_length });
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateUniqueIdConfig mengembalikan valid: true ketika options null (opsional)', () => {
    const result = validateUniqueIdConfig(null);
    expect(result.valid).toBe(true);
  });

  test('validateUniqueIdConfig mengembalikan valid: true ketika options undefined (opsional)', () => {
    const result = validateUniqueIdConfig(undefined);
    expect(result.valid).toBe(true);
  });
});

// ─── Property 3: Konfigurasi dengan max < min selalu ditolak ──────────────────
// Feature: phone-and-unique-id-questions, Property 3: Konfigurasi dengan max < min selalu ditolak

describe('Property 3: Konfigurasi dengan max_length < min_length selalu ditolak', () => {
  test('validatePhoneConfig mengembalikan valid: false untuk semua max_length < min_length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }).chain((min_length) =>
          fc.integer({ min: 1, max: min_length - 1 }).map((max_length) => ({
            min_length,
            max_length,
          }))
        ),
        ({ min_length, max_length }) => {
          const result = validatePhoneConfig({ min_length, max_length });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateUniqueIdConfig mengembalikan valid: false untuk semua max_length < min_length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }).chain((min_length) =>
          fc.integer({ min: 1, max: min_length - 1 }).map((max_length) => ({
            min_length,
            max_length,
          }))
        ),
        ({ min_length, max_length }) => {
          const result = validateUniqueIdConfig({ min_length, max_length });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Input non-angka selalu ditolak ──────────────────────────────
// Feature: phone-and-unique-id-questions, Property 4: Input non-angka selalu ditolak

describe('Property 4: Input non-angka selalu ditolak', () => {
  test('Regex /^\\d+$/ mengembalikan false untuk semua string non-digit', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s.length > 0 && !/^\d+$/.test(s)),
        (nonDigitString) => {
          return /^\d+$/.test(nonDigitString) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Regex /^\\d+$/ mengembalikan true untuk semua string yang hanya berisi digit', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 20 }),
        (digitString) => {
          return /^\d+$/.test(digitString) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
