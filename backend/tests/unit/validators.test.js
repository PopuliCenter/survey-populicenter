const {
  validateDateFormat,
  validateTimeFormat,
  validateDateAnswer,
  validateMatrixAnswer,
} = require('../../src/utils/validators');

describe('validateDateFormat', () => {
  test('accepts valid dates', () => {
    expect(validateDateFormat('2024-01-01')).toBe(true);
    expect(validateDateFormat('2024-12-31')).toBe(true);
    expect(validateDateFormat('2024-02-29')).toBe(true); // leap year
    expect(validateDateFormat('2000-06-15')).toBe(true);
  });

  test('rejects invalid date formats', () => {
    expect(validateDateFormat('2024/01/01')).toBe(false);
    expect(validateDateFormat('01-01-2024')).toBe(false);
    expect(validateDateFormat('2024-1-1')).toBe(false);
    expect(validateDateFormat('not-a-date')).toBe(false);
    expect(validateDateFormat('')).toBe(false);
    expect(validateDateFormat(null)).toBe(false);
    expect(validateDateFormat(undefined)).toBe(false);
    expect(validateDateFormat(12345)).toBe(false);
  });

  test('rejects non-existent dates', () => {
    expect(validateDateFormat('2024-02-30')).toBe(false); // Feb 30 doesn't exist
    expect(validateDateFormat('2023-02-29')).toBe(false); // not a leap year
    expect(validateDateFormat('2024-13-01')).toBe(false); // month 13
    expect(validateDateFormat('2024-00-01')).toBe(false); // month 0
    expect(validateDateFormat('2024-04-31')).toBe(false); // April has 30 days
  });
});

describe('validateTimeFormat', () => {
  test('accepts valid times', () => {
    expect(validateTimeFormat('00:00')).toBe(true);
    expect(validateTimeFormat('23:59')).toBe(true);
    expect(validateTimeFormat('12:30')).toBe(true);
    expect(validateTimeFormat('09:05')).toBe(true);
  });

  test('rejects invalid time formats', () => {
    expect(validateTimeFormat('24:00')).toBe(false);
    expect(validateTimeFormat('00:60')).toBe(false);
    expect(validateTimeFormat('25:00')).toBe(false);
    expect(validateTimeFormat('1:00')).toBe(false);
    expect(validateTimeFormat('12:5')).toBe(false);
    expect(validateTimeFormat('12:00:00')).toBe(false);
    expect(validateTimeFormat('not-time')).toBe(false);
    expect(validateTimeFormat('')).toBe(false);
    expect(validateTimeFormat(null)).toBe(false);
    expect(validateTimeFormat(undefined)).toBe(false);
  });
});

describe('validateDateAnswer', () => {
  test('accepts valid date without config', () => {
    expect(validateDateAnswer('2024-06-15', null)).toEqual({ valid: true });
    expect(validateDateAnswer('2024-06-15', {})).toEqual({ valid: true });
  });

  test('accepts date within range', () => {
    const config = { min_date: '2024-01-01', max_date: '2024-12-31' };
    expect(validateDateAnswer('2024-06-15', config)).toEqual({ valid: true });
    expect(validateDateAnswer('2024-01-01', config)).toEqual({ valid: true }); // boundary
    expect(validateDateAnswer('2024-12-31', config)).toEqual({ valid: true }); // boundary
  });

  test('rejects date outside range', () => {
    const config = { min_date: '2024-01-01', max_date: '2024-12-31' };
    const before = validateDateAnswer('2023-12-31', config);
    expect(before.valid).toBe(false);
    expect(before.error).toContain('2024-01-01');

    const after = validateDateAnswer('2025-01-01', config);
    expect(after.valid).toBe(false);
    expect(after.error).toContain('2024-12-31');
  });

  test('rejects invalid format', () => {
    const result = validateDateAnswer('not-a-date', {});
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Format tanggal harus YYYY-MM-DD');
  });

  test('works with only min_date', () => {
    const config = { min_date: '2024-06-01' };
    expect(validateDateAnswer('2024-06-15', config)).toEqual({ valid: true });
    const result = validateDateAnswer('2024-05-01', config);
    expect(result.valid).toBe(false);
  });

  test('works with only max_date', () => {
    const config = { max_date: '2024-06-30' };
    expect(validateDateAnswer('2024-06-15', config)).toEqual({ valid: true });
    const result = validateDateAnswer('2024-07-01', config);
    expect(result.valid).toBe(false);
  });
});

describe('validateMatrixAnswer', () => {
  const config = {
    rows: ['Kebersihan', 'Pelayanan', 'Fasilitas'],
    columns: ['Buruk', 'Cukup', 'Baik'],
  };

  test('accepts valid complete answer', () => {
    const answer = { Kebersihan: 'Baik', Pelayanan: 'Cukup', Fasilitas: 'Buruk' };
    expect(validateMatrixAnswer(answer, config, true)).toEqual({ valid: true });
  });

  test('accepts valid partial answer when not required', () => {
    const answer = { Kebersihan: 'Baik' };
    expect(validateMatrixAnswer(answer, config, false)).toEqual({ valid: true });
  });

  test('rejects incomplete answer when required', () => {
    const answer = { Kebersihan: 'Baik' };
    const result = validateMatrixAnswer(answer, config, true);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Semua baris matrix wajib dijawab');
  });

  test('rejects answer with invalid row key', () => {
    const answer = { InvalidRow: 'Baik' };
    const result = validateMatrixAnswer(answer, config, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Jawaban matrix tidak valid');
  });

  test('rejects answer with invalid column value', () => {
    const answer = { Kebersihan: 'InvalidColumn' };
    const result = validateMatrixAnswer(answer, config, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Jawaban matrix tidak valid');
  });

  test('accepts null/undefined answer when not required', () => {
    expect(validateMatrixAnswer(null, config, false)).toEqual({ valid: true });
    expect(validateMatrixAnswer(undefined, config, false)).toEqual({ valid: true });
  });

  test('rejects null/undefined answer when required', () => {
    const result = validateMatrixAnswer(null, config, true);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Semua baris matrix wajib dijawab');
  });

  test('accepts empty object when not required', () => {
    expect(validateMatrixAnswer({}, config, false)).toEqual({ valid: true });
  });

  test('rejects empty object when required', () => {
    const result = validateMatrixAnswer({}, config, true);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Semua baris matrix wajib dijawab');
  });
});
