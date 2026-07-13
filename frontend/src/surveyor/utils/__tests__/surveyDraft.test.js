import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  loadAllDrafts,
  answersHaveContent,
  countAnswered,
} from '../surveyDraft';

describe('surveyDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('menyimpan & memuat draft dengan currentStep/totalSteps', () => {
    saveDraft('s1', { answers: { q1: 'A' }, currentStep: 3, totalSteps: 10 });
    const d = loadDraft('s1');
    expect(d.answers).toEqual({ q1: 'A' });
    expect(d.currentStep).toBe(3);
    expect(d.totalSteps).toBe(10);
    expect(typeof d.savedAt).toBe('number');
  });

  it('default currentStep/totalSteps = 0 bila tak diberikan', () => {
    saveDraft('s1', { answers: { q1: 'A' } });
    const d = loadDraft('s1');
    expect(d.currentStep).toBe(0);
    expect(d.totalSteps).toBe(0);
  });

  it('clearDraft menghapus', () => {
    saveDraft('s1', { answers: { q1: 'A' } });
    clearDraft('s1');
    expect(loadDraft('s1')).toBeNull();
  });

  it('answersHaveContent & countAnswered mengabaikan nilai kosong', () => {
    const a = { q1: 'A', q2: '', q3: [], q4: ['x'], q5: null, q6: { a: 1 } };
    expect(answersHaveContent(a)).toBe(true);
    expect(countAnswered(a)).toBe(3); // q1, q4, q6
    expect(answersHaveContent({ q1: '', q2: [] })).toBe(false);
  });

  it('loadAllDrafts hanya mengembalikan draft berisi konten', () => {
    saveDraft('s1', { answers: { q1: 'A' }, currentStep: 1 });
    saveDraft('s2', { answers: { q1: '' } }); // kosong → diabaikan
    saveDraft('s3', { answers: { q2: ['x'] }, currentStep: 2 });
    const all = loadAllDrafts(['s1', 's2', 's3', 's4']);
    expect(Object.keys(all).sort()).toEqual(['s1', 's3']);
    expect(all.s1.currentStep).toBe(1);
  });
});
