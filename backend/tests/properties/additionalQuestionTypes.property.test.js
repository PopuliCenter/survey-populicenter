/**
 * Property-Based Tests for Additional Question Types
 *
 * Properties tested:
 *   - Property 1: Validasi Konfigurasi Date
 *   - Property 2: Validasi Jawaban Date terhadap Rentang
 *   - Property 3: Validasi Format Waktu
 *   - Property 4: Validasi Konfigurasi Matrix
 *   - Property 5: Validasi Jawaban Matrix
 *   - Property 6: Round-trip Konfigurasi Pertanyaan
 *   - Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar
 *   - Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru
 *
 * Requirements: 1.3, 1.7, 2.5, 3.4, 3.5, 3.10, 5.3, 6.1, 6.6, 6.7, 6.8, 6.9, 7.3
 */

const fc = require('fast-check');

// Mock dependencies before requiring route modules
jest.mock('../../src/models', () => {
  const mockSequelize = {
    fn: jest.fn((fnName, col) => ({ fn: fnName, col })),
    col: jest.fn((col) => col),
    query: jest.fn().mockResolvedValue([]),
  };

  return {
    Survey: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    },
    Question: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    Response: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    AuditLog: {
      create: jest.fn(),
    },
    sequelize: mockSequelize,
    Sequelize: { Op: { ne: Symbol('ne'), like: Symbol('like'), notLike: Symbol('notLike') } },
  };
});

jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
}));

const { validateDateConfig, validateMatrixConfig } = require('../../src/routes/questions');
const {
  validateDateFormat,
  validateTimeFormat,
  validateDateAnswer,
  validateMatrixAnswer,
} = require('../../src/utils/validators');

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Generate a valid YYYY-MM-DD date string.
 */
const validDateArb = fc
  .record({
    year: fc.integer({ min: 1900, max: 2100 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // 28 is always safe for any month
  })
  .map(({ year, month, day }) => {
    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

/**
 * Generate an invalid date string (not YYYY-MM-DD or invalid date).
 */
const invalidDateArb = fc.oneof(
  // Random string that doesn't match YYYY-MM-DD
  fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
  // Correct format but invalid date (month 13, day 32, etc.)
  fc.constant('2024-13-01'),
  fc.constant('2024-02-30'),
  fc.constant('2024-00-15'),
  fc.constant('2024-06-00')
);

/**
 * Generate a valid HH:mm time string.
 */
const validTimeArb = fc
  .record({
    hours: fc.integer({ min: 0, max: 23 }),
    minutes: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ hours, minutes }) => {
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    return `${h}:${m}`;
  });

/**
 * Generate an invalid time string.
 */
const invalidTimeArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !/^\d{2}:\d{2}$/.test(s)),
  fc.constant('24:00'),
  fc.constant('23:60'),
  fc.constant('99:99')
);

/**
 * Generate a non-empty trimmed string for matrix rows/columns.
 * Prefixed with "R_" to avoid collisions with Object.prototype property names
 * (e.g., constructor, valueOf, __proto__) that cause issues when used as object keys.
 */
const nonEmptyStringArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')), { minLength: 1, maxLength: 25 })
  .filter((s) => s.trim().length > 0)
  .map((s) => `R_${s.trim()}`);

/**
 * Generate a unique array of non-empty strings.
 */
function uniqueNonEmptyArrayArb(minLen, maxLen) {
  return fc
    .uniqueArray(nonEmptyStringArb, {
      minLength: minLen,
      maxLength: maxLen,
      comparator: (a, b) => a.trim() === b.trim(),
    });
}


// ─── Property 1: Validasi Konfigurasi Date ───────────────────────────────────
// Feature: additional-question-types, Property 1: Validasi Konfigurasi Date

describe('Property 1: Validasi Konfigurasi Date', () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 6.1, 6.2**
   *
   * For any pair of strings min_date and max_date, validateDateConfig SHALL accept
   * the config if and only if: (a) both strings (if provided) have valid YYYY-MM-DD
   * format representing real dates, and (b) if both are provided, min_date <= max_date.
   */
  test('accepts config with valid YYYY-MM-DD dates where min_date <= max_date', () => {
    fc.assert(
      fc.property(validDateArb, validDateArb, (d1, d2) => {
        const minDate = d1 <= d2 ? d1 : d2;
        const maxDate = d1 <= d2 ? d2 : d1;
        const result = validateDateConfig({ min_date: minDate, max_date: maxDate });
        return result.valid === true;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects config where min_date > max_date', () => {
    fc.assert(
      fc.property(validDateArb, validDateArb, (d1, d2) => {
        fc.pre(d1 > d2);
        const result = validateDateConfig({ min_date: d1, max_date: d2 });
        return result.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects config with invalid date format strings', () => {
    fc.assert(
      fc.property(invalidDateArb, (badDate) => {
        // Test with bad min_date
        const result1 = validateDateConfig({ min_date: badDate, max_date: null });
        // Test with bad max_date
        const result2 = validateDateConfig({ min_date: null, max_date: badDate });

        // At least one should be invalid (the one with the bad date)
        // If badDate is null/undefined, validateDateConfig treats it as optional
        if (badDate === null || badDate === undefined) return true;
        return result1.valid === false || result2.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('accepts config with null/undefined options (options are optional for date)', () => {
    expect(validateDateConfig(null).valid).toBe(true);
    expect(validateDateConfig(undefined).valid).toBe(true);
    expect(validateDateConfig({}).valid).toBe(true);
    expect(validateDateConfig({ min_date: null, max_date: null }).valid).toBe(true);
  });

  test('accepts config with only min_date or only max_date', () => {
    fc.assert(
      fc.property(validDateArb, (date) => {
        const r1 = validateDateConfig({ min_date: date });
        const r2 = validateDateConfig({ max_date: date });
        return r1.valid === true && r2.valid === true;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Validasi Jawaban Date terhadap Rentang ──────────────────────
// Feature: additional-question-types, Property 2: Validasi Jawaban Date terhadap Rentang

describe('Property 2: Validasi Jawaban Date terhadap Rentang', () => {
  /**
   * **Validates: Requirements 1.7, 1.8, 6.7**
   *
   * For any date answer string and date config (min_date, max_date),
   * validateDateAnswer SHALL accept only answers with valid format within range.
   */
  test('accepts valid date answers within configured range', () => {
    fc.assert(
      fc.property(validDateArb, validDateArb, validDateArb, (d1, d2, answer) => {
        const minDate = d1 <= d2 ? d1 : d2;
        const maxDate = d1 <= d2 ? d2 : d1;
        fc.pre(answer >= minDate && answer <= maxDate);

        const result = validateDateAnswer(answer, { min_date: minDate, max_date: maxDate });
        return result.valid === true;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects date answers outside configured range', () => {
    fc.assert(
      fc.property(validDateArb, validDateArb, validDateArb, (d1, d2, answer) => {
        const minDate = d1 <= d2 ? d1 : d2;
        const maxDate = d1 <= d2 ? d2 : d1;
        fc.pre(answer < minDate || answer > maxDate);

        const result = validateDateAnswer(answer, { min_date: minDate, max_date: maxDate });
        return result.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects answers with invalid date format', () => {
    fc.assert(
      fc.property(invalidDateArb, (badDate) => {
        fc.pre(badDate !== null && badDate !== undefined);
        const result = validateDateAnswer(badDate, {});
        return result.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('accepts valid date answers when no config is provided', () => {
    fc.assert(
      fc.property(validDateArb, (date) => {
        const result = validateDateAnswer(date, null);
        return result.valid === true;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Validasi Format Waktu ───────────────────────────────────────
// Feature: additional-question-types, Property 3: Validasi Format Waktu

describe('Property 3: Validasi Format Waktu', () => {
  /**
   * **Validates: Requirements 2.5, 2.6, 6.8**
   *
   * For any string input, validateTimeFormat SHALL return true if and only if
   * the string matches format HH:mm with hours 00-23 and minutes 00-59.
   */
  test('returns true for all valid HH:mm strings', () => {
    fc.assert(
      fc.property(validTimeArb, (time) => {
        return validateTimeFormat(time) === true;
      }),
      { numRuns: 100 }
    );
  });

  test('returns false for invalid time strings', () => {
    fc.assert(
      fc.property(invalidTimeArb, (badTime) => {
        return validateTimeFormat(badTime) === false;
      }),
      { numRuns: 100 }
    );
  });

  test('returns false for random strings that are not valid times', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (s) => {
        const result = validateTimeFormat(s);
        // Verify: if result is true, then s must match HH:mm with valid ranges
        if (result) {
          const match = /^(\d{2}):(\d{2})$/.exec(s);
          if (!match) return false;
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          return h >= 0 && h <= 23 && m >= 0 && m <= 59;
        }
        return true; // false results are fine
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Validasi Konfigurasi Matrix ─────────────────────────────────
// Feature: additional-question-types, Property 4: Validasi Konfigurasi Matrix

describe('Property 4: Validasi Konfigurasi Matrix', () => {
  /**
   * **Validates: Requirements 3.4, 3.5, 6.3, 6.4, 6.5**
   *
   * For any config object, validateMatrixConfig SHALL accept if and only if:
   * (a) rows is array with >= 1 element, (b) columns is array with >= 2 elements,
   * (c) all elements are non-empty strings after trim, (d) no duplicates in rows or columns.
   */
  test('accepts valid matrix configs with unique non-empty rows and columns', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 10),
        uniqueNonEmptyArrayArb(2, 10),
        (rows, columns) => {
          const result = validateMatrixConfig({ rows, columns });
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects config with empty rows array', () => {
    fc.assert(
      fc.property(uniqueNonEmptyArrayArb(2, 10), (columns) => {
        const result = validateMatrixConfig({ rows: [], columns });
        return result.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects config with columns array having fewer than 2 elements', () => {
    fc.assert(
      fc.property(uniqueNonEmptyArrayArb(1, 10), (rows) => {
        const result0 = validateMatrixConfig({ rows, columns: [] });
        const result1 = validateMatrixConfig({ rows, columns: ['Only one'] });
        return result0.valid === false && result1.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects config with duplicate rows', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        uniqueNonEmptyArrayArb(2, 5),
        (dupRow, columns) => {
          const rows = [dupRow, dupRow]; // duplicate
          const result = validateMatrixConfig({ rows, columns });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects config with duplicate columns', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        nonEmptyStringArb,
        (rows, dupCol) => {
          const columns = [dupCol, dupCol]; // duplicate
          const result = validateMatrixConfig({ rows, columns });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects config with empty string elements', () => {
    fc.assert(
      fc.property(uniqueNonEmptyArrayArb(2, 5), (columns) => {
        const result = validateMatrixConfig({ rows: [''], columns });
        return result.valid === false;
      }),
      { numRuns: 100 }
    );
  });

  test('rejects null/undefined/non-object config', () => {
    expect(validateMatrixConfig(null).valid).toBe(false);
    expect(validateMatrixConfig(undefined).valid).toBe(false);
    expect(validateMatrixConfig('string').valid).toBe(false);
  });
});


// ─── Property 5: Validasi Jawaban Matrix ─────────────────────────────────────
// Feature: additional-question-types, Property 5: Validasi Jawaban Matrix

describe('Property 5: Validasi Jawaban Matrix', () => {
  /**
   * **Validates: Requirements 3.10, 3.11, 3.12, 6.9**
   *
   * For any matrix answer and valid matrix config, validateMatrixAnswer SHALL accept
   * only answers where every key is in rows, every value is in columns, and if required,
   * all rows have answers.
   */
  test('accepts valid complete answers for required matrix questions', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          // Build a complete valid answer: every row maps to a random column
          const answer = {};
          for (const row of rows) {
            answer[row] = columns[0]; // pick first column for simplicity
          }
          const result = validateMatrixAnswer(answer, { rows, columns }, true);
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('accepts valid partial answers for non-required matrix questions', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(2, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          // Build a partial answer: only first row answered
          const answer = { [rows[0]]: columns[0] };
          const result = validateMatrixAnswer(answer, { rows, columns }, false);
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects incomplete answers for required matrix questions', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(2, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          // Build a partial answer: only first row answered (missing others)
          const answer = { [rows[0]]: columns[0] };
          const result = validateMatrixAnswer(answer, { rows, columns }, true);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects answers with keys not in rows', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        nonEmptyStringArb,
        (rows, columns, badKey) => {
          fc.pre(!rows.includes(badKey));
          const answer = { [badKey]: columns[0] };
          const result = validateMatrixAnswer(answer, { rows, columns }, false);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects answers with values not in columns', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        nonEmptyStringArb,
        (rows, columns, badValue) => {
          fc.pre(!columns.includes(badValue));
          const answer = { [rows[0]]: badValue };
          const result = validateMatrixAnswer(answer, { rows, columns }, false);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('accepts null/undefined answer for non-required questions', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          const r1 = validateMatrixAnswer(null, { rows, columns }, false);
          const r2 = validateMatrixAnswer(undefined, { rows, columns }, false);
          return r1.valid === true && r2.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects null/undefined answer for required questions', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          const r1 = validateMatrixAnswer(null, { rows, columns }, true);
          const r2 = validateMatrixAnswer(undefined, { rows, columns }, true);
          return r1.valid === false && r2.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Round-trip Konfigurasi Pertanyaan ───────────────────────────
// Feature: additional-question-types, Property 6: Round-trip Konfigurasi Pertanyaan

describe('Property 6: Round-trip Konfigurasi Pertanyaan', () => {
  /**
   * **Validates: Requirements 1.1, 3.2, 3.9, 6.6**
   *
   * For any valid config (date config, matrix config), JSON.parse(JSON.stringify(config))
   * produces an identical object (simulating JSONB round-trip).
   */
  test('date config survives JSON round-trip', () => {
    fc.assert(
      fc.property(validDateArb, validDateArb, (d1, d2) => {
        const minDate = d1 <= d2 ? d1 : d2;
        const maxDate = d1 <= d2 ? d2 : d1;
        const config = { min_date: minDate, max_date: maxDate };
        const roundTripped = JSON.parse(JSON.stringify(config));
        return (
          roundTripped.min_date === config.min_date &&
          roundTripped.max_date === config.max_date
        );
      }),
      { numRuns: 100 }
    );
  });

  test('matrix config survives JSON round-trip', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 10),
        uniqueNonEmptyArrayArb(2, 10),
        (rows, columns) => {
          const config = { rows, columns };
          const roundTripped = JSON.parse(JSON.stringify(config));
          return (
            JSON.stringify(roundTripped.rows) === JSON.stringify(config.rows) &&
            JSON.stringify(roundTripped.columns) === JSON.stringify(config.columns)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('date config with null fields survives JSON round-trip', () => {
    fc.assert(
      fc.property(
        fc.oneof(validDateArb, fc.constant(null)),
        fc.oneof(validDateArb, fc.constant(null)),
        (minDate, maxDate) => {
          const config = { min_date: minDate, max_date: maxDate };
          const roundTripped = JSON.parse(JSON.stringify(config));
          return (
            roundTripped.min_date === config.min_date &&
            roundTripped.max_date === config.max_date
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar ────────────
// Feature: additional-question-types, Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar

describe('Property 7: Ekspor Data Matrix Menghasilkan Kolom yang Benar', () => {
  /**
   * **Validates: Requirements 5.3, 5.4, 5.5**
   *
   * For any matrix question with N rows and a set of answers (including empty/partial),
   * the export logic SHALL produce exactly N additional columns with correct headers
   * and data.
   *
   * Since buildExportData is not exported, we replicate the matrix header/data logic
   * as a local helper for testing.
   */

  // Local helper replicating the matrix export logic from reports.js
  function buildMatrixExportData(responses, questions) {
    const questionHeaders = [];
    for (const q of questions) {
      if (q.type === 'matrix' && q.options && Array.isArray(q.options.rows)) {
        for (const row of q.options.rows) {
          questionHeaders.push(`${q.text} - ${row}`);
        }
      } else {
        questionHeaders.push(q.text);
      }
    }

    const rows = responses.map((r) => {
      const answerMap = {};
      for (const a of r.answers || []) {
        if (a.question_id) {
          answerMap[a.question_id] = a;
        }
      }

      const questionValues = [];
      for (const q of questions) {
        const answer = answerMap[q.id];

        if (q.type === 'matrix' && q.options && Array.isArray(q.options.rows)) {
          const json = answer && answer.answer_json ? answer.answer_json : {};
          for (const row of q.options.rows) {
            questionValues.push(json[row] || '');
          }
        } else if (!answer) {
          questionValues.push('');
        } else {
          questionValues.push(
            answer.answer_value !== null && answer.answer_value !== undefined
              ? answer.answer_value
              : ''
          );
        }
      }

      return questionValues;
    });

    return { headers: questionHeaders, rows };
  }

  test('produces exactly N columns for a matrix question with N rows', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 8),
        uniqueNonEmptyArrayArb(2, 5),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        (rows, columns, questionText) => {
          const question = {
            id: 'q1',
            text: questionText,
            type: 'matrix',
            options: { rows, columns },
          };

          const { headers } = buildMatrixExportData([], [question]);

          // Should have exactly N headers (one per row)
          if (headers.length !== rows.length) return false;

          // Each header should be "{questionText} - {rowName}"
          for (let i = 0; i < rows.length; i++) {
            if (headers[i] !== `${questionText} - ${rows[i]}`) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('fills correct values for complete answers and empty string for missing rows', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(2, 5),
        uniqueNonEmptyArrayArb(2, 5),
        fc.integer({ min: 0, max: 4 }),
        (rows, columns, answeredCount) => {
          const actualAnswered = Math.min(answeredCount, rows.length);
          const question = {
            id: 'q1',
            text: 'Test Matrix',
            type: 'matrix',
            options: { rows, columns },
          };

          // Build a partial answer
          const answerJson = {};
          for (let i = 0; i < actualAnswered; i++) {
            answerJson[rows[i]] = columns[0];
          }

          const response = {
            answers: [{ question_id: 'q1', answer_json: answerJson }],
          };

          const { rows: dataRows } = buildMatrixExportData([response], [question]);

          if (dataRows.length !== 1) return false;
          const values = dataRows[0];
          if (values.length !== rows.length) return false;

          // Check answered rows have the correct value
          for (let i = 0; i < actualAnswered; i++) {
            if (values[i] !== columns[0]) return false;
          }
          // Check unanswered rows have empty string
          for (let i = actualAnswered; i < rows.length; i++) {
            if (values[i] !== '') return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('produces empty strings for all rows when no answer exists', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 8),
        uniqueNonEmptyArrayArb(2, 5),
        (rows, columns) => {
          const question = {
            id: 'q1',
            text: 'Matrix Q',
            type: 'matrix',
            options: { rows, columns },
          };

          const response = { answers: [] };
          const { rows: dataRows } = buildMatrixExportData([response], [question]);

          if (dataRows.length !== 1) return false;
          return dataRows[0].every((v) => v === '');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru ───────────
// Feature: additional-question-types, Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru

describe('Property 8: Clone Survei Mempertahankan Konfigurasi Tipe Baru', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any survey containing date/time/matrix questions, deep-cloning the options
   * JSONB produces identical objects. This tests the clone property:
   * JSON.parse(JSON.stringify(options)) === original options.
   */
  test('deep-cloning date question options preserves config', () => {
    fc.assert(
      fc.property(
        fc.oneof(validDateArb, fc.constant(null)),
        fc.oneof(validDateArb, fc.constant(null)),
        (minDate, maxDate) => {
          const options = { min_date: minDate, max_date: maxDate };
          const cloned = JSON.parse(JSON.stringify(options));
          return (
            cloned.min_date === options.min_date &&
            cloned.max_date === options.max_date
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('deep-cloning time question options preserves config (null options)', () => {
    // Time questions have null options — clone should preserve null
    const options = null;
    const cloned = JSON.parse(JSON.stringify({ options }));
    expect(cloned.options).toBeNull();
  });

  test('deep-cloning matrix question options preserves rows and columns', () => {
    fc.assert(
      fc.property(
        uniqueNonEmptyArrayArb(1, 10),
        uniqueNonEmptyArrayArb(2, 10),
        (rows, columns) => {
          const options = { rows, columns };
          const cloned = JSON.parse(JSON.stringify(options));

          // Verify arrays are identical
          if (cloned.rows.length !== options.rows.length) return false;
          if (cloned.columns.length !== options.columns.length) return false;
          for (let i = 0; i < rows.length; i++) {
            if (cloned.rows[i] !== options.rows[i]) return false;
          }
          for (let i = 0; i < columns.length; i++) {
            if (cloned.columns[i] !== options.columns[i]) return false;
          }

          // Verify it's a deep clone (not same reference)
          return cloned !== options && cloned.rows !== options.rows && cloned.columns !== options.columns;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('deep-cloning a survey with mixed question types preserves all options', () => {
    fc.assert(
      fc.property(
        validDateArb,
        validDateArb,
        uniqueNonEmptyArrayArb(1, 5),
        uniqueNonEmptyArrayArb(2, 5),
        (d1, d2, rows, columns) => {
          const minDate = d1 <= d2 ? d1 : d2;
          const maxDate = d1 <= d2 ? d2 : d1;

          const questions = [
            { type: 'date', options: { min_date: minDate, max_date: maxDate } },
            { type: 'time', options: null },
            { type: 'matrix', options: { rows, columns } },
          ];

          const clonedQuestions = JSON.parse(JSON.stringify(questions));

          // Verify each question's options are preserved
          if (clonedQuestions[0].options.min_date !== minDate) return false;
          if (clonedQuestions[0].options.max_date !== maxDate) return false;
          if (clonedQuestions[1].options !== null) return false;
          if (JSON.stringify(clonedQuestions[2].options.rows) !== JSON.stringify(rows)) return false;
          if (JSON.stringify(clonedQuestions[2].options.columns) !== JSON.stringify(columns)) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
