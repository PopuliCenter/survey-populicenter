/**
 * session.js — pembacaan sesi login di sisi klien (satu sumber kebenaran).
 *
 * Latar: aplikasi (khususnya APK) selalu mulai di rute "/" — sebelumnya rute
 * itu MEMBABI-BUTA melempar ke /login tanpa mengecek token, sehingga TPD
 * merasa "logout" setiap kali aplikasi ditutup/dibuka padahal sesinya masih
 * tersimpan & valid. Helper di sini dipakai App (RootRedirect) dan Login
 * (lewati form bila masih login).
 */

import { localStore } from './safeStorage';

/** Halaman awal per role (samakan dengan redirect setelah login). */
export const HOME_BY_ROLE = {
  admin: '/dashboard',
  supervisor: '/surveys',
  viewer: '/dashboard',
  surveyor: '/surveyor',
  partner_lokal: '/dashboard',
  asisten_supervisor: '/dashboard',
};

/** True bila JWT sudah kedaluwarsa (atau rusak). */
export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload || !payload.exp) return false; // tanpa exp → biarkan server memutuskan
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true; // token rusak → anggap tak valid
  }
}

/**
 * Sesi tersimpan yang masih valid, atau null.
 * @returns {{ token: string, user: object|null } | null}
 */
export function getValidSession() {
  const token = localStore.getItem('token');
  if (!token || isTokenExpired(token)) return null;
  let user = null;
  try {
    user = JSON.parse(localStore.getItem('user') || 'null');
  } catch {
    user = null;
  }
  return { token, user };
}

/** Path beranda untuk user tersimpan (fallback aman ke /surveyor). */
export function homePathForUser(user) {
  return (user && HOME_BY_ROLE[user.role]) || '/surveyor';
}
