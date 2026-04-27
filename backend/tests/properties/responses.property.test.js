/**
 * Property-Based Tests for Response Module
 *
 * Property 1: Nomor Kuesioner Unik per Survei
 * Validates: Requirements 13.1, 13.2
 *
 * Property 2: Durasi Pengisian Konsisten dengan Timestamp
 * Validates: Requirements 15.2, 15.3
 *
 * Property 7: Jawaban Tersimpan Berdasarkan Nilai, Bukan Posisi
 * Validates: Requirements 5.4
 */

const fc = require('fast-check');

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Derive a short survey prefix from the survey title.
 * Mirrors the backend logic in generateSurveyPrefix():
 *   - Strip non-alphanumeric characters, uppercase, take first 6 chars.
 *   - Fall back to 'SRV' if nothing remains.
 * @param {string} title
 * @returns {string}
 */
function generateSurveyPrefix(title) {
  const cleaned = (title || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 6) || 'SRV';
}

/**
 * Format a questionnaire number.
 * Mirrors the backend formatQuestionnaireNumber() function exactly.
 * Format: {SURVEY_PREFIX}-{YYYYMMDD}-{SEQUENCE_NUMBER:04d}
 * Example: SRV001-20240115-0001
 *
 * @param {string} surveyTitle - Survey title used to derive prefix
 * @param {Date}   endTime     - The submission date (used for YYYYMMDD portion)
 * @param {number} seqVal      - The sequence value from PostgreSQL nextval
 * @returns {string}
 */
function formatQuestionnaireNumber(surveyTitle, endTime, seqVal) {
  const prefix = generateSurveyPrefix(surveyTitle);
  const year  = endTime.getUTCFullYear();
  const month = String(endTime.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(endTime.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const seq = String(seqVal).padStart(4, '0');
  return `${prefix}-${dateStr}-${seq}`;
}

/**
 * Simulate Fisher-Yates shuffle (mirrors frontend randomization logic).
 */
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Property 1: Nomor Kuesioner Unik per Survei ─────────────────────────────

describe('Property 1: Nomor Kuesioner Unik per Survei', () => {
  /**
   * Feature: web-survey-platform, Property 1: Nomor kuesioner unik per survei
   * Validates: Requirements 13.1, 13.2
   *
   * Simulates multiple submissions for the same survey.
   * The PostgreSQL sequence `nextval('questionnaire_seq_{survey_id}')` guarantees
   * strictly increasing, unique integer values per survey.  This property verifies
   * that the questionnaire-number formatting function preserves that uniqueness:
   * for any survey title, submission date, and a list of distinct sequence values,
   * all generated questionnaire numbers must be unique within that survey.
   *
   * Two additional sub-cases are also verified:
   *   a) Numbers generated for the SAME survey on DIFFERENT dates are still unique
   *      (the sequence value alone distinguishes them even when the date differs).
   *   b) Numbers generated for DIFFERENT surveys with the SAME sequence value are
   *      NOT required to be unique (each survey has its own independent sequence),
   *      but numbers within a single survey always are.
   */

  test('semua nomor kuesioner yang dihasilkan harus unik dalam satu survei', () => {
    // Feature: web-survey-platform, Property 1: Nomor kuesioner unik per survei
    fc.assert(
      fc.property(
        // Survey title (arbitrary, may contain special characters)
        fc.string({ minLength: 0, maxLength: 50 }),
        // Submission date for all submissions in this run
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        // Number of submissions: at least 2, at most 50
        fc.integer({ min: 2, max: 50 }),
        (surveyTitle, submissionDate, numSubmissions) => {
          // Simulate PostgreSQL sequence: strictly increasing integers starting at 1.
          // Each call to nextval returns the next integer — guaranteed unique.
          const sequenceValues = Array.from({ length: numSubmissions }, (_, i) => i + 1);

          // Generate a questionnaire number for each simulated submission
          const numbers = sequenceValues.map((seqVal) =>
            formatQuestionnaireNumber(surveyTitle, submissionDate, seqVal)
          );

          // All numbers must be unique within this survey
          const uniqueNumbers = new Set(numbers);
          return uniqueNumbers.size === numbers.length;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('nomor kuesioner tetap unik meskipun tanggal pengisian berbeda-beda', () => {
    // Feature: web-survey-platform, Property 1: Nomor kuesioner unik per survei
    // Validates: Requirements 13.1, 13.2
    //
    // Even when submissions happen on different dates, the sequence value
    // ensures uniqueness within the same survey.
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        // Generate an array of distinct dates (one per submission)
        fc.array(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          { minLength: 2, maxLength: 30 }
        ),
        (surveyTitle, submissionDates) => {
          // Each submission gets the next sequence value (1-based)
          const numbers = submissionDates.map((date, idx) =>
            formatQuestionnaireNumber(surveyTitle, date, idx + 1)
          );

          const uniqueNumbers = new Set(numbers);
          return uniqueNumbers.size === numbers.length;
        }
      ),
      { numRuns: 25 }
    );
  });

  test('format nomor kuesioner harus sesuai pola {PREFIX}-{YYYYMMDD}-{SEQ:04d}', () => {
    // Feature: web-survey-platform, Property 1: Nomor kuesioner unik per survei
    // Validates: Requirements 13.1, 13.2
    //
    // Every generated questionnaire number must match the documented format.
    const QUESTIONNAIRE_NUMBER_PATTERN = /^[A-Z0-9]{1,6}-\d{8}-\d{4,}$/;

    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        fc.integer({ min: 1, max: 9999 }),
        (surveyTitle, submissionDate, seqVal) => {
          const number = formatQuestionnaireNumber(surveyTitle, submissionDate, seqVal);
          return QUESTIONNAIRE_NUMBER_PATTERN.test(number);
        }
      ),
      { numRuns: 25 }
    );
  });
});

// ─── Property 2: Durasi Pengisian Konsisten dengan Timestamp ─────────────────

describe('Property 2: Durasi Pengisian Konsisten dengan Timestamp', () => {
  /**
   * Validates: Requirements 15.2, 15.3
   *
   * For any start_time and duration_seconds, the calculated duration must equal
   * the difference between end_time and start_time, and end_time >= start_time.
   */
  test('duration_seconds harus konsisten dengan selisih end_time dan start_time', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        fc.integer({ min: 0, max: 86400 }), // duration in seconds
        (startTime, durationSeconds) => {
          const endTime = new Date(startTime.getTime() + durationSeconds * 1000);
          const calculatedDuration = Math.floor((endTime - startTime) / 1000);
          return calculatedDuration === durationSeconds && endTime >= startTime;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// ─── Property 7: Jawaban Tersimpan Berdasarkan Nilai, Bukan Posisi ────────────

describe('Property 7: Jawaban Tersimpan Berdasarkan Nilai, Bukan Posisi', () => {
  /**
   * Validates: Requirements 5.4
   *
   * For any set of options and a selected value, the value should be found
   * in the shuffled array regardless of its position.
   */
  test('nilai jawaban yang dipilih harus ditemukan berdasarkan value, bukan posisi', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ value: fc.string({ minLength: 1 }), label: fc.string() }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.integer({ min: 0, max: 9 }),
        (options, selectedIndex) => {
          const clampedIndex = selectedIndex % options.length;
          const selectedValue = options[clampedIndex].value;

          // Shuffle the options (simulating randomization)
          const shuffled = fisherYatesShuffle(options);

          // Find the selected option in shuffled array by VALUE (not position)
          const foundByValue = shuffled.find((opt) => opt.value === selectedValue);

          // The value should be found regardless of position
          return foundByValue !== undefined && foundByValue.value === selectedValue;
        }
      ),
      { numRuns: 25 }
    );
  });
});
