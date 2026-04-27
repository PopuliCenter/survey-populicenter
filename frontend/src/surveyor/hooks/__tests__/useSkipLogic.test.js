/**
 * Unit Tests for useSkipLogic hook
 *
 * Tests:
 *   - skip logic linear (A → B → C)
 *   - skip logic berantai (chained)
 *   - semua operator: equals, not_equals, contains, greater_than, less_than
 *   - pertanyaan tanpa skip logic selalu terlihat
 *   - jawaban kosong tidak memicu skip
 *
 * Requirements: 4.4, 4.5
 */

import { describe, test, expect } from 'vitest';
import { evaluateCondition, computeHiddenQuestions } from '../useSkipLogic.js';

// ─── evaluateCondition ────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  test('equals: mengembalikan true jika jawaban sama dengan nilai kondisi', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'equals', value: 'ya' },
      { q1: 'ya' }
    )).toBe(true);
  });

  test('equals: mengembalikan false jika jawaban berbeda', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'equals', value: 'ya' },
      { q1: 'tidak' }
    )).toBe(false);
  });

  test('not_equals: mengembalikan true jika jawaban berbeda', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'not_equals', value: 'ya' },
      { q1: 'tidak' }
    )).toBe(true);
  });

  test('not_equals: mengembalikan false jika jawaban sama', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'not_equals', value: 'ya' },
      { q1: 'ya' }
    )).toBe(false);
  });

  test('contains: mengembalikan true jika string jawaban mengandung nilai kondisi', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'contains', value: 'survey' },
      { q1: 'web survey platform' }
    )).toBe(true);
  });

  test('contains: mengembalikan true jika array jawaban mengandung nilai kondisi', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'contains', value: 'b' },
      { q1: ['a', 'b', 'c'] }
    )).toBe(true);
  });

  test('contains: mengembalikan false jika array jawaban tidak mengandung nilai kondisi', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'contains', value: 'x' },
      { q1: ['a', 'b', 'c'] }
    )).toBe(false);
  });

  test('greater_than: mengembalikan true jika jawaban numerik lebih besar', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'greater_than', value: '5' },
      { q1: '10' }
    )).toBe(true);
  });

  test('greater_than: mengembalikan false jika jawaban numerik lebih kecil', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'greater_than', value: '10' },
      { q1: '5' }
    )).toBe(false);
  });

  test('greater_than: mengembalikan false jika jawaban bukan angka', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'greater_than', value: '5' },
      { q1: 'bukan angka' }
    )).toBe(false);
  });

  test('less_than: mengembalikan true jika jawaban numerik lebih kecil', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'less_than', value: '10' },
      { q1: '3' }
    )).toBe(true);
  });

  test('less_than: mengembalikan false jika jawaban numerik lebih besar', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'less_than', value: '3' },
      { q1: '10' }
    )).toBe(false);
  });

  test('operator tidak dikenal mengembalikan false', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'unknown_op', value: 'ya' },
      { q1: 'ya' }
    )).toBe(false);
  });

  test('jawaban kosong (undefined) tidak memenuhi kondisi apapun', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'equals', value: 'ya' },
      {}
    )).toBe(false);
  });

  test('jawaban null tidak memenuhi kondisi apapun', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'equals', value: 'ya' },
      { q1: null }
    )).toBe(false);
  });

  test('jawaban string kosong tidak memenuhi kondisi apapun', () => {
    expect(evaluateCondition(
      { question_id: 'q1', operator: 'equals', value: '' },
      { q1: '' }
    )).toBe(false);
  });
});

// ─── computeHiddenQuestions ───────────────────────────────────────────────────

describe('computeHiddenQuestions - skip logic linear', () => {
  test('pertanyaan tanpa skip_logic tidak pernah disembunyikan', () => {
    const questions = [
      { id: 'q1', skip_logic: null },
      { id: 'q2', skip_logic: [] },
      { id: 'q3', skip_logic: null },
    ];
    const hidden = computeHiddenQuestions(questions, {});
    expect(hidden.size).toBe(0);
  });

  test('skip logic linear: q1 → skip q2 jika jawaban q1 = "ya"', () => {
    // Rule on q1: "jump to q3" → q2 (between q1 and q3) should be hidden, q3 visible
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3',
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      { id: 'q3', skip_logic: null },
    ];

    // Condition met: q2 (between q1 and q3) should be hidden, q3 visible
    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.has('q2')).toBe(true);
    expect(hidden.has('q3')).toBe(false);
  });

  test('skip logic linear: kondisi tidak terpenuhi → tidak ada yang disembunyikan', () => {
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3',
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      { id: 'q3', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'tidak' });
    expect(hidden.size).toBe(0);
  });

  test('skip logic dengan multiple rules: hanya rule yang terpenuhi yang memicu skip', () => {
    // q1 has two rules: jump to q3 (hides q2) or jump to q4 (hides q2, q3)
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3', // hides q2
          },
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'mungkin' },
            action: 'jump_to',
            target_question_id: 'q4', // hides q2, q3
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      { id: 'q3', skip_logic: null },
      { id: 'q4', skip_logic: null },
    ];

    // Only first rule fires: q2 hidden, q3 visible, q4 visible
    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.has('q2')).toBe(true);
    expect(hidden.has('q3')).toBe(false);
    expect(hidden.has('q4')).toBe(false);
  });
});

describe('computeHiddenQuestions - skip logic berantai (chained)', () => {
  test('chained: q1 → skip q2, q2 → skip q3 (q2 tersembunyi, q3 juga tersembunyi)', () => {
    /**
     * q1 has two rules: jump to q3 (hides q2) and jump to q4 (hides q2, q3).
     * When q1='ya', first rule fires: hides q2, jumps to q3.
     * Second rule also fires: hides q2 and q3, jumps to q4.
     * Result: q2 and q3 hidden, q4 visible.
     */
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3', // hides q2
          },
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q4', // hides q2, q3
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      { id: 'q3', skip_logic: null },
      { id: 'q4', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.has('q2')).toBe(true);
    expect(hidden.has('q3')).toBe(true);
    expect(hidden.has('q4')).toBe(false);
  });

  test('chained: q1 → skip q2, q3 → skip q4 (independent chains)', () => {
    // q1 jumps to q3 → hides q2; q3 jumps to q5 → hides q4
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3', // hides q2
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      {
        id: 'q3',
        skip_logic: [
          {
            condition: { question_id: 'q3', operator: 'greater_than', value: '5' },
            action: 'jump_to',
            target_question_id: 'q5', // hides q4
          },
        ],
      },
      { id: 'q4', skip_logic: null },
      { id: 'q5', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'ya', q3: '10' });
    expect(hidden.has('q2')).toBe(true);
    expect(hidden.has('q4')).toBe(true);
    expect(hidden.has('q1')).toBe(false);
    expect(hidden.has('q3')).toBe(false);
    expect(hidden.has('q5')).toBe(false);
  });

  test('chained: pertanyaan tersembunyi tidak memicu skip logic-nya sendiri', () => {
    /**
     * q1 jumps to q3 → hides q2.
     * q2 has a rule that would jump to q4 (hiding q3), but q2 is hidden so its rule doesn't fire.
     */
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3', // hides q2
          },
        ],
      },
      {
        id: 'q2',
        // q2 has a rule that would hide q3, but q2 itself is hidden
        skip_logic: [
          {
            condition: { question_id: 'q2', operator: 'equals', value: 'apapun' },
            action: 'jump_to',
            target_question_id: 'q4', // would hide q3 if q2 were visible
          },
        ],
      },
      { id: 'q3', skip_logic: null },
      { id: 'q4', skip_logic: null },
    ];

    // q1 = 'ya' → q2 is hidden; q2's rule should NOT fire (q2 is hidden)
    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.has('q2')).toBe(true);
    // q3 should NOT be hidden because q2 is hidden and its rule doesn't fire
    expect(hidden.has('q3')).toBe(false);
    expect(hidden.has('q4')).toBe(false);
  });

  test('chained: q1 → q2 → q3 via separate answers (multi-level chain)', () => {
    /**
     * q1 jumps to q3 → hides q2.
     * q3 jumps to q5 → hides q4.
     * Both chains active simultaneously.
     */
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'skip' },
            action: 'jump_to',
            target_question_id: 'q3', // hides q2
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      {
        id: 'q3',
        skip_logic: [
          {
            condition: { question_id: 'q3', operator: 'less_than', value: '3' },
            action: 'jump_to',
            target_question_id: 'q5', // hides q4
          },
        ],
      },
      { id: 'q4', skip_logic: null },
      { id: 'q5', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'skip', q3: '1' });
    expect(hidden.has('q2')).toBe(true);
    expect(hidden.has('q4')).toBe(true);
    expect(hidden.has('q5')).toBe(false);
  });
});

describe('computeHiddenQuestions - edge cases', () => {
  test('array pertanyaan kosong menghasilkan set kosong', () => {
    const hidden = computeHiddenQuestions([], {});
    expect(hidden.size).toBe(0);
  });

  test('answers kosong tidak memicu skip logic apapun', () => {
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            target_question_id: 'q3',
          },
        ],
      },
      { id: 'q2', skip_logic: null },
      { id: 'q3', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, {});
    expect(hidden.size).toBe(0);
  });

  test('rule tanpa target_question_id diabaikan', () => {
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            condition: { question_id: 'q1', operator: 'equals', value: 'ya' },
            action: 'jump_to',
            // target_question_id missing
          },
        ],
      },
      { id: 'q2', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.size).toBe(0);
  });

  test('rule tanpa condition diabaikan', () => {
    const questions = [
      {
        id: 'q1',
        skip_logic: [
          {
            // condition missing
            action: 'jump_to',
            target_question_id: 'q2',
          },
        ],
      },
      { id: 'q2', skip_logic: null },
    ];

    const hidden = computeHiddenQuestions(questions, { q1: 'ya' });
    expect(hidden.size).toBe(0);
  });
});
