/**
 * Unit test untuk skipLogicHints — ringkasan & deteksi masalah skip logic
 * di builder (vitest).
 */

import { describe, test, expect } from 'vitest';
import { analyzeQuestionSkipLogic, analyzeRule } from '../skipLogicHints.js';

// Daftar pertanyaan terurut (order_index 0..5)
const QUESTIONS = [
  { id: 'q1', order_index: 0, type: 'single_choice', text: 'Induk' },
  { id: 'q2', order_index: 1, type: 'short_text', text: 'A1' },
  { id: 'q3', order_index: 2, type: 'short_text', text: 'A2' },
  { id: 'q4', order_index: 3, type: 'short_text', text: 'B1' },
  { id: 'q5', order_index: 4, type: 'short_text', text: 'B2' },
  { id: 'q6', order_index: 5, type: 'short_text', text: 'Penutup' },
];

function withSkip(id, skip_logic) {
  const base = QUESTIONS.find((q) => q.id === id);
  return { ...base, skip_logic };
}

describe('analyzeQuestionSkipLogic — dasar', () => {
  test('tanpa skip logic → hasBranching false', () => {
    const a = analyzeQuestionSkipLogic(QUESTIONS[0], QUESTIONS);
    expect(a.hasBranching).toBe(false);
    expect(a.ruleCount).toBe(0);
  });

  test('lompatan maju valid → ringkasan + rentang dilewati, tanpa peringatan', () => {
    const q = withSkip('q1', [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: 'q4' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.hasBranching).toBe(true);
    expect(a.ruleCount).toBe(1);
    expect(a.warnings).toEqual([]);
    expect(a.rules[0].summary).toContain('Jika P1 sama dengan "A"');
    expect(a.rules[0].summary).toContain('lompat ke P4');
    expect(a.rules[0].summary).toContain('lewati P2–P3');
  });
});

describe('analyzeQuestionSkipLogic — deteksi masalah', () => {
  test('tujuan belum dipilih', () => {
    const q = withSkip('q1', [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: '' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.warnings).toContain('Tujuan lompatan belum dipilih.');
  });

  test('lompatan mundur tidak berpengaruh', () => {
    // q4 melompat ke q2 (sebelum dirinya) → mundur
    const q = withSkip('q4', [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: 'q2' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.warnings[0]).toMatch(/tidak berpengaruh|SETELAH/);
  });

  test('tidak ada yang dilewati (tujuan tepat di bawah)', () => {
    const q = withSkip('q1', [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: 'q2' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.warnings).toContain('Tidak ada pertanyaan yang dilewati (tujuan tepat di bawahnya).');
  });

  test('kondisi belum lengkap (nilai kosong) pada lompatan maju', () => {
    const q = withSkip('q1', [
      { condition: { question_id: 'q1', operator: 'equals', value: '' }, action: 'jump_to', target_question_id: 'q4' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.warnings).toContain('Kondisi belum lengkap (pertanyaan atau nilai kosong).');
  });

  test('peringatan unik tergabung untuk banyak aturan', () => {
    const q = withSkip('q1', [
      { condition: { question_id: 'q1', operator: 'equals', value: 'A' }, action: 'jump_to', target_question_id: '' },
      { condition: { question_id: 'q1', operator: 'equals', value: 'B' }, action: 'jump_to', target_question_id: '' },
    ]);
    const a = analyzeQuestionSkipLogic(q, QUESTIONS);
    expect(a.ruleCount).toBe(2);
    expect(a.warnings).toEqual(['Tujuan lompatan belum dipilih.']); // dedup
  });
});

describe('analyzeRule — multi-kondisi (AND)', () => {
  test('ringkasan menggabungkan kondisi dengan DAN', () => {
    const rule = {
      conditions: [
        { question_id: 'q1', operator: 'equals', value: 'A' },
        { question_id: 'q2', operator: 'greater_than', value: '3' },
      ],
      action: 'jump_to',
      target_question_id: 'q5',
    };
    const r = analyzeRule(rule, QUESTIONS[0], QUESTIONS);
    expect(r.summary).toContain('P1 sama dengan "A" DAN P2 lebih besar dari "3"');
    expect(r.summary).toContain('lompat ke P5');
  });
});
