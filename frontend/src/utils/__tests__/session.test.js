/**
 * Sesi login sadar-cold-start: token yang masih valid harus dianggap "login"
 * saat aplikasi dibuka ulang (RootRedirect & Login memakai getValidSession).
 * Regresi bug: TPD selalu dilempar ke /login tiap buka aplikasi.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { isTokenExpired, getValidSession, homePathForUser, HOME_BY_ROLE } from '../session';

function makeToken(expSec, extra = {}) {
  const payload = btoa(JSON.stringify({ exp: expSec, ...extra }));
  return `hdr.${payload}.sig`;
}
const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 10;

beforeEach(() => {
  localStorage.clear();
});

describe('isTokenExpired', () => {
  test('token masa depan → belum kedaluwarsa', () => {
    expect(isTokenExpired(makeToken(future()))).toBe(false);
  });
  test('token lampau → kedaluwarsa', () => {
    expect(isTokenExpired(makeToken(past()))).toBe(true);
  });
  test('token rusak → dianggap kedaluwarsa', () => {
    expect(isTokenExpired('bukan.token')).toBe(true);
  });
  test('tanpa exp → biarkan server memutuskan (tidak dianggap expired)', () => {
    expect(isTokenExpired(`h.${btoa(JSON.stringify({ role: 'surveyor' }))}.s`)).toBe(false);
  });
});

describe('getValidSession', () => {
  test('token valid + user tersimpan → mengembalikan sesi', () => {
    localStorage.setItem('token', makeToken(future(), { role: 'surveyor' }));
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'surveyor' }));
    const s = getValidSession();
    expect(s).not.toBeNull();
    expect(s.user.role).toBe('surveyor');
  });
  test('token kedaluwarsa → null (harus login ulang)', () => {
    localStorage.setItem('token', makeToken(past()));
    localStorage.setItem('user', JSON.stringify({ role: 'surveyor' }));
    expect(getValidSession()).toBeNull();
  });
  test('tanpa token → null', () => {
    expect(getValidSession()).toBeNull();
  });
  test('user JSON rusak → sesi tetap valid dengan user null', () => {
    localStorage.setItem('token', makeToken(future()));
    localStorage.setItem('user', '{bukan json');
    const s = getValidSession();
    expect(s).not.toBeNull();
    expect(s.user).toBeNull();
  });
});

describe('homePathForUser', () => {
  test('tiap role → beranda sesuai', () => {
    expect(homePathForUser({ role: 'surveyor' })).toBe('/surveyor');
    expect(homePathForUser({ role: 'admin' })).toBe(HOME_BY_ROLE.admin);
    expect(homePathForUser({ role: 'supervisor' })).toBe('/surveys');
  });
  test('user null / role tak dikenal → fallback /surveyor', () => {
    expect(homePathForUser(null)).toBe('/surveyor');
    expect(homePathForUser({ role: 'apa' })).toBe('/surveyor');
  });
});
