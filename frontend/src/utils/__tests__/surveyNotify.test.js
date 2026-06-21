import { describe, test, expect } from 'vitest';
import { diffSurveyAvailability, toSurveyStubs } from '../surveyNotify.js';

describe('diffSurveyAvailability', () => {
  test('mendeteksi survei baru (added)', () => {
    const prev = [{ id: 'a', title: 'A' }];
    const cur = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    const { added, removed } = diffSurveyAvailability(prev, cur);
    expect(added).toEqual([{ id: 'b', title: 'B' }]);
    expect(removed).toEqual([]);
  });

  test('mendeteksi survei dinonaktifkan (removed)', () => {
    const prev = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    const cur = [{ id: 'a', title: 'A' }];
    const { added, removed } = diffSurveyAvailability(prev, cur);
    expect(added).toEqual([]);
    expect(removed).toEqual([{ id: 'b', title: 'B' }]);
  });

  test('tanpa perubahan → kosong', () => {
    const list = [{ id: 'a', title: 'A' }];
    const { added, removed } = diffSurveyAvailability(list, list);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  test('toSurveyStubs hanya menyisakan id & title', () => {
    const stubs = toSurveyStubs([{ id: 'a', title: 'A', extra: 1, status: 'active' }]);
    expect(stubs).toEqual([{ id: 'a', title: 'A' }]);
  });
});
