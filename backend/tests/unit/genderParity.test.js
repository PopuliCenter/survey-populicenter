/**
 * Unit tests untuk QC paritas jenis kelamin (genderParity).
 */

const { parityExpectedGender, isGenderParityMismatch } = require('../../src/utils/genderParity');

const AF = { source: 'questionnaire_number_parity', odd_value: 'L', even_value: 'P' };

describe('parityExpectedGender', () => {
  test('ganjil → odd_value, genap → even_value', () => {
    expect(parityExpectedGender('3', AF)).toBe('L');
    expect(parityExpectedGender('4', AF)).toBe('P');
    expect(parityExpectedGender('0001', AF)).toBe('L'); // zero-padded ganjil
    expect(parityExpectedGender('10', AF)).toBe('P');
  });

  test('nomor bukan bilangan bulat → null', () => {
    expect(parityExpectedGender('', AF)).toBeNull();
    expect(parityExpectedGender('12A', AF)).toBeNull();
    expect(parityExpectedGender(null, AF)).toBeNull();
  });

  test('auto_fill kosong / sumber lain → null', () => {
    expect(parityExpectedGender('3', null)).toBeNull();
    expect(parityExpectedGender('3', { source: 'lain', odd_value: 'L', even_value: 'P' })).toBeNull();
  });
});

describe('isGenderParityMismatch', () => {
  test('sesuai → false', () => {
    expect(isGenderParityMismatch('3', 'L', AF)).toBe(false);
    expect(isGenderParityMismatch('4', 'P', AF)).toBe(false);
  });

  test('tak sesuai → true', () => {
    expect(isGenderParityMismatch('3', 'P', AF)).toBe(true); // ganjil tapi Perempuan
    expect(isGenderParityMismatch('4', 'L', AF)).toBe(true); // genap tapi Laki-laki
  });

  test('jenis kelamin belum dijawab → null (tak dinilai)', () => {
    expect(isGenderParityMismatch('3', '', AF)).toBeNull();
    expect(isGenderParityMismatch('3', null, AF)).toBeNull();
  });

  test('nomor bukan angka → null', () => {
    expect(isGenderParityMismatch('SK-X', 'L', AF)).toBeNull();
  });
});
