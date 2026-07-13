/**
 * Unit test untuk evaluator skip logic sisi server.
 * Fokus: pertanyaan wajib yang TERSEMBUNYI oleh percabangan tidak boleh
 * dianggap "belum dijawab" (inti perbaikan validasi submit).
 */

const {
  evaluateCondition,
  evaluateRule,
  computeHiddenQuestions,
  buildAnswerMap,
} = require('../../src/utils/skipLogicEvaluator');

// Helper: tiru filter pertanyaan wajib yang hilang seperti di route /submit.
function missingRequired(questions, answers) {
  const typeMap = new Map(questions.map((q) => [q.id, q]));
  const answerMap = buildAnswerMap(answers, typeMap);
  const hidden = computeHiddenQuestions(questions, answerMap);
  const answered = new Set(answers.map((a) => a.question_id));
  return questions
    .filter((q) => q.is_required && !hidden.has(q.id) && !answered.has(q.id))
    .map((q) => q.id);
}

describe('evaluateCondition — operator', () => {
  const answers = { q1: 'A', q2: '7', q3: ['x', 'y'] };

  test('equals / not_equals', () => {
    expect(evaluateCondition({ question_id: 'q1', operator: 'equals', value: 'A' }, answers)).toBe(true);
    expect(evaluateCondition({ question_id: 'q1', operator: 'equals', value: 'B' }, answers)).toBe(false);
    expect(evaluateCondition({ question_id: 'q1', operator: 'not_equals', value: 'B' }, answers)).toBe(true);
  });

  test('greater_than / less_than (numerik)', () => {
    expect(evaluateCondition({ question_id: 'q2', operator: 'greater_than', value: '5' }, answers)).toBe(true);
    expect(evaluateCondition({ question_id: 'q2', operator: 'less_than', value: '5' }, answers)).toBe(false);
  });

  test('contains pada array multiple_choice', () => {
    expect(evaluateCondition({ question_id: 'q3', operator: 'contains', value: 'x' }, answers)).toBe(true);
    expect(evaluateCondition({ question_id: 'q3', operator: 'contains', value: 'z' }, answers)).toBe(false);
  });

  test('jawaban kosong → kondisi tidak terpenuhi', () => {
    expect(evaluateCondition({ question_id: 'qX', operator: 'equals', value: 'A' }, answers)).toBe(false);
  });

  test('is_answered / is_empty (pertanyaan terbuka)', () => {
    const a = { qText: 'jawaban bebas', qKosong: '', qArr: [], qMc: ['x'] };
    expect(evaluateCondition({ question_id: 'qText', operator: 'is_answered' }, a)).toBe(true);
    expect(evaluateCondition({ question_id: 'qText', operator: 'is_empty' }, a)).toBe(false);
    expect(evaluateCondition({ question_id: 'qKosong', operator: 'is_answered' }, a)).toBe(false);
    expect(evaluateCondition({ question_id: 'qKosong', operator: 'is_empty' }, a)).toBe(true);
    expect(evaluateCondition({ question_id: 'qMissing', operator: 'is_empty' }, a)).toBe(true);
    expect(evaluateCondition({ question_id: 'qArr', operator: 'is_empty' }, a)).toBe(true); // array kosong
    expect(evaluateCondition({ question_id: 'qMc', operator: 'is_answered' }, a)).toBe(true);
  });

  test('nilai __other__ cocok bila opsi "Lainnya" dipilih', () => {
    const a = {
      qSingle: '__other__:teks bebas responden',
      qSingleNormal: 'opsi_a',
      qMulti: ['opsi_b', '__other__:catatan'],
      qMultiNormal: ['opsi_b'],
    };
    // single_choice
    expect(evaluateCondition({ question_id: 'qSingle', operator: 'equals', value: '__other__' }, a)).toBe(true);
    expect(evaluateCondition({ question_id: 'qSingleNormal', operator: 'equals', value: '__other__' }, a)).toBe(false);
    expect(evaluateCondition({ question_id: 'qSingle', operator: 'not_equals', value: '__other__' }, a)).toBe(false);
    // multiple_choice
    expect(evaluateCondition({ question_id: 'qMulti', operator: 'contains', value: '__other__' }, a)).toBe(true);
    expect(evaluateCondition({ question_id: 'qMultiNormal', operator: 'contains', value: '__other__' }, a)).toBe(false);
  });
});

describe('evaluateRule — AND multi-kondisi & legacy', () => {
  const answers = { q1: 'A', q2: '10' };

  test('conditions array (AND) — semua harus benar', () => {
    const rule = {
      conditions: [
        { question_id: 'q1', operator: 'equals', value: 'A' },
        { question_id: 'q2', operator: 'greater_than', value: '5' },
      ],
    };
    expect(evaluateRule(rule, answers)).toBe(true);
    expect(evaluateRule({ conditions: [{ question_id: 'q2', operator: 'less_than', value: '5' }] }, answers)).toBe(false);
  });

  test('legacy single condition', () => {
    expect(evaluateRule({ condition: { question_id: 'q1', operator: 'equals', value: 'A' } }, answers)).toBe(true);
  });
});

describe('buildAnswerMap — pemetaan nilai per tipe', () => {
  const questions = [
    { id: 'q1', type: 'single_choice' },
    { id: 'q2', type: 'multiple_choice' },
    { id: 'q3', type: 'short_text' },
  ];

  test('multiple_choice → array (answer_json), lainnya → answer_value', () => {
    const answers = [
      { question_id: 'q1', answer_value: 'A' },
      { question_id: 'q2', answer_json: ['x', 'y'] },
      { question_id: 'q3', answer_value: 'halo' },
    ];
    const map = buildAnswerMap(answers, new Map(questions.map((q) => [q.id, q])));
    expect(map).toEqual({ q1: 'A', q2: ['x', 'y'], q3: 'halo' });
  });

  test('menerima questionMap berbentuk objek biasa', () => {
    const byId = { q1: { type: 'single_choice' } };
    const map = buildAnswerMap([{ question_id: 'q1', answer_value: 'A' }], byId);
    expect(map.q1).toBe('A');
  });
});

describe('computeHiddenQuestions — percabangan jump_to dua cabang', () => {
  // Tata letak eksperimen (BERURUTAN, sesuai batasan jump_to linear):
  //   q1 = pertanyaan induk
  //   q2,q3 = blok Cabang A
  //   q4,q5 = blok Cabang B
  //   q6 = pertanyaan umum/penutup
  // Aturan:
  //   - di q1: bila jawaban 'B' → lompat ke q4 (lewati Cabang A: q2,q3)
  //   - di q3 (akhir Cabang A): bila jawaban induk 'A' → lompat ke q6 (lewati Cabang B: q4,q5)
  const questions = [
    { id: 'q1', is_required: true, type: 'single_choice', order_index: 0, skip_logic: [
      { condition: { question_id: 'q1', operator: 'equals', value: 'B' }, action: 'jump_to', target_question_id: 'q4' },
    ] },
    { id: 'q2', is_required: true, type: 'short_text', order_index: 1, skip_logic: null },
    { id: 'q3', is_required: true, type: 'short_text', order_index: 2, skip_logic: [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: 'q6' },
    ] },
    { id: 'q4', is_required: true, type: 'short_text', order_index: 3, skip_logic: null },
    { id: 'q5', is_required: true, type: 'short_text', order_index: 4, skip_logic: null },
    { id: 'q6', is_required: true, type: 'short_text', order_index: 5, skip_logic: null },
  ];

  test('cabang A (induk=A): Cabang B (q4,q5) tersembunyi', () => {
    const hidden = computeHiddenQuestions(questions, { q1: 'A' });
    expect([...hidden].sort()).toEqual(['q4', 'q5']);
  });

  test('cabang B (induk=B): Cabang A (q2,q3) tersembunyi', () => {
    const hidden = computeHiddenQuestions(questions, { q1: 'B' });
    expect([...hidden].sort()).toEqual(['q2', 'q3']);
  });

  test('tanpa jawaban induk → tidak ada yang tersembunyi', () => {
    expect(computeHiddenQuestions(questions, {}).size).toBe(0);
  });
});

describe('integrasi logika wajib (mirror route /submit)', () => {
  const questions = [
    { id: 'q1', is_required: true, type: 'single_choice', order_index: 0, skip_logic: [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: 'q3' },
    ] },
    { id: 'q2', is_required: true, type: 'short_text', order_index: 1, skip_logic: null }, // cabang yang bisa dilewati
    { id: 'q3', is_required: true, type: 'short_text', order_index: 2, skip_logic: null },
  ];

  test('cabang dilewati: q2 wajib TIDAK dianggap hilang', () => {
    const answers = [
      { question_id: 'q1', answer_value: 'A' },
      { question_id: 'q3', answer_value: 'isi' },
    ];
    expect(missingRequired(questions, answers)).toEqual([]); // lolos — perbaikan utama
  });

  test('cabang dilalui: q2 wajib tetap diwajibkan', () => {
    const answers = [
      { question_id: 'q1', answer_value: 'B' }, // tidak melompat
      { question_id: 'q3', answer_value: 'isi' },
    ];
    expect(missingRequired(questions, answers)).toEqual(['q2']);
  });

  test('pertanyaan wajib di luar cabang yang belum diisi tetap terdeteksi', () => {
    const answers = [{ question_id: 'q1', answer_value: 'A' }]; // q3 (landing) belum diisi
    expect(missingRequired(questions, answers)).toEqual(['q3']);
  });
});
