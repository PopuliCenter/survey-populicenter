/**
 * deviceOwner — HP dipakai bergantian (audit 2026-11-23).
 *
 * Dijaga: akun lain TIDAK bisa masuk selama data TPD sebelumnya belum terkirim
 * (antrean pending/gagal atau draf berisi); bila bersih, sisa data per-TPD lama
 * dihapus saat akun baru mengklaim perangkat; role non-TPD tak mengubah pemilik.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const queue = { pending: [], failed: [] };
vi.mock('../storage', () => ({
  getQueueByStatus: vi.fn(async (status) => queue[status] || []),
}));

import {
  OWNER_KEY, checkLoginAllowed, claimDeviceForUser, countUnsyncedLocalData, maskEmail,
} from '../deviceOwner';

const tpdA = { id: 'a', role: 'surveyor', email: 'tpd1@populi.com' };
const tpdB = { id: 'b', role: 'surveyor', email: 'tpd2@populi.com' };

beforeEach(() => {
  localStorage.clear();
  queue.pending = [];
  queue.failed = [];
});

describe('checkLoginAllowed', () => {
  test('perangkat baru / pemilik sama → boleh', async () => {
    expect((await checkLoginAllowed('siapa@saja.id')).allowed).toBe(true);
    claimDeviceForUser(tpdA);
    queue.pending = [{ local_id: 1 }];
    expect((await checkLoginAllowed('  TPD1@populi.com ')).allowed).toBe(true);
  });

  test('akun lain + antrean belum terkirim → ditolak, email pemilik tersamar', async () => {
    claimDeviceForUser(tpdA);
    queue.pending = [{ local_id: 1 }];
    queue.failed = [{ local_id: 2 }];
    const r = await checkLoginAllowed(tpdB.email);
    expect(r.allowed).toBe(false);
    expect(r.message).toContain('2 data');
    expect(r.message).toContain('t***1@populi.com');
    expect(r.message).not.toContain('tpd1@populi.com');
  });

  test('akun lain + draf berisi jawaban → ditolak; draf kosong tidak dihitung', async () => {
    claimDeviceForUser(tpdA);
    localStorage.setItem('survey_draft_s1__001', JSON.stringify({ answers: { q1: '' } }));
    expect((await checkLoginAllowed(tpdB.email)).allowed).toBe(true);
    localStorage.setItem('survey_draft_s1__002', JSON.stringify({ answers: { q1: 'Budi' } }));
    expect((await checkLoginAllowed(tpdB.email)).allowed).toBe(false);
    expect(await countUnsyncedLocalData()).toBe(1);
  });
});

describe('claimDeviceForUser', () => {
  test('pemilik berganti → sisa data per-TPD lama dibersihkan, data bersama utuh', () => {
    claimDeviceForUser(tpdA);
    localStorage.setItem('tpd_notifications', '[1]');
    localStorage.setItem('offline_quota_map', '{}');
    localStorage.setItem('rt_tickets__s1', '[]');
    localStorage.setItem('survey_draft_s1__001', JSON.stringify({ answers: {} }));
    localStorage.setItem('theme', 'dark');

    claimDeviceForUser(tpdB);

    expect(localStorage.getItem(OWNER_KEY)).toBe('tpd2@populi.com');
    ['tpd_notifications', 'offline_quota_map', 'rt_tickets__s1', 'survey_draft_s1__001']
      .forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  test('pemilik sama login ulang → data TIDAK dihapus', () => {
    claimDeviceForUser(tpdA);
    localStorage.setItem('tpd_notifications', '[1]');
    claimDeviceForUser({ ...tpdA, email: 'TPD1@populi.com' });
    expect(localStorage.getItem('tpd_notifications')).toBe('[1]');
  });

  test('admin membuka HP lapangan → kepemilikan & data TPD tak berubah', () => {
    claimDeviceForUser(tpdA);
    localStorage.setItem('tpd_notifications', '[1]');
    claimDeviceForUser({ id: 'x', role: 'admin', email: 'admin@populi.com' });
    expect(localStorage.getItem(OWNER_KEY)).toBe('tpd1@populi.com');
    expect(localStorage.getItem('tpd_notifications')).toBe('[1]');
  });
});

test('maskEmail', () => {
  expect(maskEmail('tpd1@populi.com')).toBe('t***1@populi.com');
  expect(maskEmail('ab@x.id')).toBe('a***@x.id');
  expect(maskEmail('')).toBe('akun lain');
});
