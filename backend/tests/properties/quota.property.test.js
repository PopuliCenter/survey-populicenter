/**
 * Property-Based Tests for Quota Validation
 *
 * Property 5: Kuota Responden Hanya Menerima Bilangan Bulat Positif
 * Validates: Requirements 14.1, 14.2
 */

const fc = require('fast-check');
const { validateQuota } = require('../../src/utils/validators');

describe('Property 5: Kuota Responden Hanya Menerima Bilangan Bulat Positif', () => {
  /**
   * Validates: Requirements 14.1, 14.2
   *
   * For any input value, the system only accepts values that are positive
   * integers (> 0); all other inputs must be rejected.
   */

  test('harus menerima semua bilangan bulat positif (> 0)', () => {
    // Test 1: all positive integers are accepted
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (n) => {
        return validateQuota(n) === true;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak nilai nol', () => {
    // Test 2: zero is rejected
    expect(validateQuota(0)).toBe(false);
  });

  test('harus menolak bilangan bulat negatif', () => {
    // Test 3: negative integers are rejected
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: -1 }), (n) => {
        return validateQuota(n) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak bilangan desimal (float)', () => {
    // Test 4: floats are rejected
    // Generate floats that are not whole numbers
    // fc.float() requires 32-bit float values for min/max constraints
    const nonIntegerFloatArb = fc
      .float({ min: Math.fround(0.001), max: Math.fround(1000000), noNaN: true, noDefaultInfinity: true })
      .filter((n) => !Number.isInteger(n));

    fc.assert(
      fc.property(nonIntegerFloatArb, (n) => {
        return validateQuota(n) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak string', () => {
    // Test 5: strings are rejected
    fc.assert(
      fc.property(fc.string(), (s) => {
        return validateQuota(s) === false;
      }),
      { numRuns: 25 }
    );
  });

  test('harus menolak null dan undefined', () => {
    // Test 6: null/undefined are rejected
    expect(validateQuota(null)).toBe(false);
    expect(validateQuota(undefined)).toBe(false);
  });

  test('harus menolak berbagai tipe input non-integer menggunakan oneof', () => {
    // Combined test using oneof for various invalid types
    const invalidArb = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(0),
      fc.integer({ min: -1000000, max: -1 }),
      fc.float({ min: Math.fround(0.001), max: Math.fround(999.999), noNaN: true, noDefaultInfinity: true })
        .filter((n) => !Number.isInteger(n))
    );

    fc.assert(
      fc.property(invalidArb, (val) => {
        return validateQuota(val) === false;
      }),
      { numRuns: 25 }
    );
  });
});
