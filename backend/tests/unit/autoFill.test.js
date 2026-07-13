/**
 * Unit tests untuk validateAutoFill — isi otomatis jenis kelamin dari paritas
 * Nomor Kuesioner (ganjil → odd_value, genap → even_value).
 */

const { validateAutoFill } = require('../../src/routes/questions');

const OPTS = [
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' },
];

describe('validateAutoFill', () => {
  test('null/undefined → valid (nonaktif)', () => {
    expect(validateAutoFill(null, 'single_choice', OPTS).valid).toBe(true);
    expect(validateAutoFill(undefined, 'single_choice', OPTS).valid).toBe(true);
  });

  test('konfigurasi lengkap & value ada di options → valid', () => {
    const cfg = { source: 'questionnaire_number_parity', odd_value: 'L', even_value: 'P' };
    expect(validateAutoFill(cfg, 'single_choice', OPTS).valid).toBe(true);
  });

  test('sumber tidak dikenal → ditolak', () => {
    const cfg = { source: 'lainnya', odd_value: 'L', even_value: 'P' };
    expect(validateAutoFill(cfg, 'single_choice', OPTS).valid).toBe(false);
  });

  test('tipe selain single_choice → ditolak', () => {
    const cfg = { source: 'questionnaire_number_parity', odd_value: 'L', even_value: 'P' };
    expect(validateAutoFill(cfg, 'multiple_choice', OPTS).valid).toBe(false);
  });

  test('odd/even kosong → ditolak', () => {
    const cfg = { source: 'questionnaire_number_parity', odd_value: '', even_value: 'P' };
    expect(validateAutoFill(cfg, 'single_choice', OPTS).valid).toBe(false);
  });

  test('value tidak ada di options → ditolak', () => {
    const cfg = { source: 'questionnaire_number_parity', odd_value: 'L', even_value: 'X' };
    expect(validateAutoFill(cfg, 'single_choice', OPTS).valid).toBe(false);
  });

  test('bukan objek → ditolak', () => {
    expect(validateAutoFill('nope', 'single_choice', OPTS).valid).toBe(false);
    expect(validateAutoFill(['a'], 'single_choice', OPTS).valid).toBe(false);
  });
});
