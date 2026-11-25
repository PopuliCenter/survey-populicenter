/**
 * appUpdate — penentu status pembaruan APK & penundaan "Nanti".
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { evaluateUpdate, isDismissed, dismissRelease, DISMISS_MS, updateErrorMessage } from '../appUpdate';

const rel = { version_code: 29, min_version_code: 27 };

describe('evaluateUpdate', () => {
  test.each([
    [29, 'none'], // sudah terbaru
    [30, 'none'], // lebih baru dari yang diumumkan (build uji)
    [28, 'available'], // di antara minimum & terbaru
    [27, 'available'], // tepat minimum masih boleh
    [26, 'required'], // di bawah minimum → wajib
  ])('versi %i → %s', (code, expected) => {
    expect(evaluateUpdate(code, rel)).toBe(expected);
  });

  test('tanpa rilis / versi tak terbaca → none', () => {
    expect(evaluateUpdate(26, null)).toBe('none');
    expect(evaluateUpdate(NaN, rel)).toBe('none');
  });
});

describe('Nanti (tunda 24 jam per versi)', () => {
  beforeEach(() => localStorage.clear());

  test('ditunda untuk versi yang sama selama 24 jam', () => {
    dismissRelease(rel, 1_000);
    expect(isDismissed(rel, 1_000 + DISMISS_MS - 1)).toBe(true);
    expect(isDismissed(rel, 1_000 + DISMISS_MS + 1)).toBe(false);
  });

  test('versi yang lebih baru muncul lagi walau versi lama ditunda', () => {
    dismissRelease(rel, 1_000);
    expect(isDismissed({ ...rel, version_code: 30 }, 2_000)).toBe(false);
  });
});

test('pesan galat dimengerti TPD', () => {
  expect(updateErrorMessage({ code: 'CHECKSUM_MISMATCH' })).toMatch(/tidak cocok/);
  expect(updateErrorMessage({ code: 'HTTP_404' })).toMatch(/sinyal/);
  expect(updateErrorMessage(new Error('x'))).toMatch(/halaman resmi/);
});
