import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  loadDraftsForSurvey,
  loadAllDraftsBySurvey,
  answersHaveContent,
  countAnswered,
} from '../surveyDraft';

describe('surveyDraft (per-nomor)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('menyimpan & memuat draft per nomor dengan currentStep/totalSteps', () => {
    saveDraft('s1', '1', { answers: { q1: 'A' }, currentStep: 3, totalSteps: 10 });
    const d = loadDraft('s1', '1');
    expect(d.answers).toEqual({ q1: 'A' });
    expect(d.currentStep).toBe(3);
    expect(d.totalSteps).toBe(10);
  });

  it('nomor berbeda = draft berbeda (paralel, tak saling menimpa)', () => {
    saveDraft('s1', '1', { answers: { q1: 'A' }, currentStep: 2 });
    saveDraft('s1', '2', { answers: { q1: 'B' }, currentStep: 5 });
    expect(loadDraft('s1', '1').answers).toEqual({ q1: 'A' });
    expect(loadDraft('s1', '2').answers).toEqual({ q1: 'B' });
    // Menghapus No. 1 tidak mengganggu No. 2.
    clearDraft('s1', '1');
    expect(loadDraft('s1', '1')).toBeNull();
    expect(loadDraft('s1', '2').currentStep).toBe(5);
  });

  it('loadDraftsForSurvey mengembalikan semua nomor berisi konten', () => {
    saveDraft('s1', '1', { answers: { q1: 'A' }, currentStep: 1 });
    saveDraft('s1', '2', { answers: { q1: 'B' }, currentStep: 4 });
    saveDraft('s1', '3', { answers: { q1: '' } }); // kosong → diabaikan
    saveDraft('s2', '9', { answers: { q1: 'X' } }); // survei lain
    const arr = loadDraftsForSurvey('s1');
    expect(arr.map((d) => d.number).sort()).toEqual(['1', '2']);
  });

  it('loadAllDraftsBySurvey mengelompokkan per survei', () => {
    saveDraft('s1', '1', { answers: { q1: 'A' } });
    saveDraft('s1', '2', { answers: { q1: 'B' } });
    saveDraft('s2', '5', { answers: { q1: 'C' } });
    const map = loadAllDraftsBySurvey(['s1', 's2', 's3']);
    expect(Object.keys(map).sort()).toEqual(['s1', 's2']);
    expect(map.s1).toHaveLength(2);
  });

  it('answersHaveContent & countAnswered mengabaikan nilai kosong', () => {
    const a = { q1: 'A', q2: '', q3: [], q4: ['x'], q5: null, q6: { a: 1 } };
    expect(answersHaveContent(a)).toBe(true);
    expect(countAnswered(a)).toBe(3);
    expect(answersHaveContent({ q1: '', q2: [] })).toBe(false);
  });
});
