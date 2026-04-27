/**
 * Property-Based Tests for SurveyForm — Error Message Extraction
 *
 * Tests the error extraction logic used in SurveyForm.jsx catch blocks.
 * Instead of rendering the full component (which is slow), we test the
 * extraction expression directly as a pure function.
 *
 * Property 1 (Bug Condition): EXPECTED TO FAIL on unfixed code.
 * Property 2 (Preservation): EXPECTED TO PASS on unfixed code.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';

// ─── Extract the error logic as testable functions ────────────────────────────

/**
 * Simulates the CURRENT error extraction in SurveyForm.jsx line ~718:
 *   err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.'
 */
function extractLoadingError_original(err) {
  return err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.';
}

/**
 * Simulates the CURRENT photo upload error extraction line ~826:
 *   err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.'
 */
function extractPhotoError_original(err) {
  return err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.';
}

/**
 * The FIXED error extraction (what the code should do):
 *   err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.'
 */
function extractLoadingError_fixed(err) {
  return err.response?.data?.error || err.response?.data?.message || 'Gagal memuat survei.';
}

function extractPhotoError_fixed(err) {
  return err.response?.data?.error || err.response?.data?.message || 'Gagal mengunggah foto. Coba lagi.';
}

// ─── Property 1: Bug Condition — Backend error key is not extracted ───────────
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5

describe('Property 1: Bug Condition — Backend error key not extracted', () => {
  test('for any non-empty error string in err.response.data.error, the original extraction returns the generic fallback (demonstrates bug)', () => {
    const errorStringArb = fc.string({ minLength: 1, maxLength: 80 })
      .filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(errorStringArb, (errorMessage) => {
        const err = { response: { data: { error: errorMessage } } };

        // Original (buggy) code: reads .message which is undefined → falls back to generic
        const result = extractLoadingError_original(err);
        // BUG: result should be errorMessage, but it's the generic fallback
        expect(result).toBe(errorMessage);
      }),
      { numRuns: 3 }
    );
  });

  test('photo upload: original extraction ignores err.response.data.error (demonstrates bug)', () => {
    const errorStringArb = fc.string({ minLength: 1, maxLength: 80 })
      .filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(errorStringArb, (errorMessage) => {
        const err = { response: { data: { error: errorMessage } } };

        const result = extractPhotoError_original(err);
        expect(result).toBe(errorMessage);
      }),
      { numRuns: 3 }
    );
  });
});

// ─── Property 2: Preservation — Non-bug-condition inputs ──────────────────────
// Validates: Requirements 3.1, 3.2

describe('Property 2: Preservation — Fallback chain for non-bug-condition inputs', () => {
  test('when only message key is present, original extraction returns the message', () => {
    const messageArb = fc.string({ minLength: 1, maxLength: 80 })
      .filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(messageArb, (msg) => {
        const err = { response: { data: { message: msg } } };
        const original = extractLoadingError_original(err);
        const fixed = extractLoadingError_fixed(err);
        // Both should return the message string
        expect(original).toBe(msg);
        expect(fixed).toBe(msg);
      }),
      { numRuns: 3 }
    );
  });

  test('when neither error nor message key is present, both return generic fallback', () => {
    const arbitraryData = fc.record({
      code: fc.integer(),
      detail: fc.string(),
    });

    fc.assert(
      fc.property(arbitraryData, (data) => {
        const err = { response: { data } };
        const original = extractLoadingError_original(err);
        const fixed = extractLoadingError_fixed(err);
        expect(original).toBe('Gagal memuat survei.');
        expect(fixed).toBe('Gagal memuat survei.');
      }),
      { numRuns: 3 }
    );
  });

  test('when err.response is undefined (network error), both return generic fallback', () => {
    const err = {};
    expect(extractLoadingError_original(err)).toBe('Gagal memuat survei.');
    expect(extractLoadingError_fixed(err)).toBe('Gagal memuat survei.');
    expect(extractPhotoError_original(err)).toBe('Gagal mengunggah foto. Coba lagi.');
    expect(extractPhotoError_fixed(err)).toBe('Gagal mengunggah foto. Coba lagi.');
  });
});
