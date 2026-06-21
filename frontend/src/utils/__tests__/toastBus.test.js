import { describe, test, expect, vi } from 'vitest';
import { subscribeToasts, showToast, toastSuccess, toastWarning } from '../toastBus.js';

describe('toastBus', () => {
  test('listener menerima toast yang ditampilkan', () => {
    const seen = [];
    const unsub = subscribeToasts((t) => seen.push(t));
    const id = showToast({ message: 'halo', tone: 'info' });
    expect(id).toBeGreaterThan(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ message: 'halo', tone: 'info' });
    unsub();
  });

  test('berhenti berlangganan: tidak lagi menerima', () => {
    const cb = vi.fn();
    const unsub = subscribeToasts(cb);
    unsub();
    showToast({ message: 'x' });
    expect(cb).not.toHaveBeenCalled();
  });

  test('helper tone + pesan kosong diabaikan', () => {
    const seen = [];
    const unsub = subscribeToasts((t) => seen.push(t));
    toastSuccess('ok');
    toastWarning('awas', { duration: 1000 });
    expect(showToast({ message: '' })).toBe(-1); // pesan kosong → tidak emit
    expect(seen.map((t) => t.tone)).toEqual(['success', 'warning']);
    expect(seen[1].duration).toBe(1000);
    unsub();
  });
});
