/**
 * Property-Based Tests for Auth Module
 *
 * Property 8: Validasi Password Konsisten
 * Validates: Requirements 2.7
 */

const fc = require('fast-check');
const { validatePassword } = require('../../src/utils/validators');

describe('Property 8: Validasi Password Konsisten', () => {
  /**
   * Validates: Requirements 2.7
   *
   * For any string password, the validation function must reject passwords
   * that do not meet all requirements (min 8 chars, uppercase, lowercase, digit)
   * and accept all passwords that meet all requirements.
   */

  test('harus menerima semua password yang memenuhi semua syarat', () => {
    // Generator for valid passwords: ≥8 chars, has uppercase, lowercase, digit
    const validPasswordArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { minLength: 1, maxLength: 5 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 5 }),
        fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 5 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 1, maxLength: 5 })
      )
      .map(([upper, lower, digit, extra]) => {
        // Shuffle the parts together to form a valid password
        const combined = (upper + lower + digit + extra).split('');
        // Simple deterministic shuffle using index
        for (let i = combined.length - 1; i > 0; i--) {
          const j = i % (i + 1); // deterministic, not truly random but sufficient
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }
        return combined.join('');
      })
      .filter((pwd) => pwd.length >= 8);

    fc.assert(
      fc.property(validPasswordArb, (password) => {
        return validatePassword(password) === true;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak password yang kurang dari 8 karakter', () => {
    // Generator for short passwords (< 8 chars)
    const shortPasswordArb = fc.string({ minLength: 0, maxLength: 7 });

    fc.assert(
      fc.property(shortPasswordArb, (password) => {
        return validatePassword(password) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak password tanpa huruf besar', () => {
    // Generator for passwords without uppercase: ≥8 chars, has lowercase and digit, no uppercase
    const noUpperArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 10 }),
        fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 5 })
      )
      .map(([lower, digit]) => lower + digit)
      .filter((pwd) => pwd.length >= 8 && !/[A-Z]/.test(pwd));

    fc.assert(
      fc.property(noUpperArb, (password) => {
        return validatePassword(password) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak password tanpa huruf kecil', () => {
    // Generator for passwords without lowercase: ≥8 chars, has uppercase and digit, no lowercase
    const noLowerArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { minLength: 1, maxLength: 10 }),
        fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 5 })
      )
      .map(([upper, digit]) => upper + digit)
      .filter((pwd) => pwd.length >= 8 && !/[a-z]/.test(pwd));

    fc.assert(
      fc.property(noLowerArb, (password) => {
        return validatePassword(password) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak password tanpa angka', () => {
    // Generator for passwords without digits: ≥8 chars, has uppercase and lowercase, no digit
    const noDigitArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { minLength: 1, maxLength: 10 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 10 })
      )
      .map(([upper, lower]) => upper + lower)
      .filter((pwd) => pwd.length >= 8 && !/[0-9]/.test(pwd));

    fc.assert(
      fc.property(noDigitArb, (password) => {
        return validatePassword(password) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak nilai null dan undefined', () => {
    expect(validatePassword(null)).toBe(false);
    expect(validatePassword(undefined)).toBe(false);
    expect(validatePassword('')).toBe(false);
  });
});
