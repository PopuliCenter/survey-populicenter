import React, { useState } from 'react';
import { primeMediaPermissions, primeLocationPermission } from '../../utils/capacitorBridge';

/**
 * PermissionOnboarding — layar izin PERTAMA KALI untuk TPD (mirip persetujuan
 * lisensi): menjelaskan izin apa saja yang dibutuhkan aplikasi, lalu meminta
 * SEMUANYA sekaligus lewat satu tombol. Tujuan: dialog izin OS tidak lagi
 * muncul di tengah pengisian survei (mengganggu responden).
 *
 * Muncul sekali setelah login TPD (flag di localStorage; priming di SurveyForm
 * tetap ada sebagai jaring pengaman bila izin ditolak/di-reset dari Setelan).
 */

export const PERM_ONBOARD_KEY = 'perm_onboard_v1';

export function permissionOnboardingDone() {
  try {
    return localStorage.getItem(PERM_ONBOARD_KEY) === '1';
  } catch {
    return true; // storage tak tersedia → jangan blokir apa pun
  }
}

const PERMS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
    tint: 'bg-red-50 text-red-600',
    title: 'Mikrofon',
    desc: 'Merekam audio wawancara untuk kendali mutu. Rekaman mulai otomatis sesuai aturan survei.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    ),
    tint: 'bg-blue-50 text-blue-600',
    title: 'Kamera',
    desc: 'Mengambil foto bukti wawancara dengan responden.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    tint: 'bg-green-50 text-green-600',
    title: 'Lokasi (GPS)',
    desc: 'Mencatat titik lokasi wawancara untuk verifikasi cakupan wilayah.',
  },
];

function PermissionOnboarding({ onDone }) {
  const [requesting, setRequesting] = useState(false);

  function markDone() {
    try { localStorage.setItem(PERM_ONBOARD_KEY, '1'); } catch { /* abaikan */ }
    onDone();
  }

  async function handleAllow() {
    setRequesting(true);
    try {
      // Berurutan agar dialog OS muncul satu per satu (tidak tumpang-tindih).
      await primeMediaPermissions({ audio: true, camera: true });
      await primeLocationPermission();
    } catch { /* penolakan bukan error — fitur meminta ulang saat dipakai */ }
    setRequesting(false);
    markDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-onboard-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <h2 id="perm-onboard-title" className="text-lg font-semibold text-gray-800">
          Persiapan izin aplikasi
        </h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Agar pengisian survei lancar <b>tanpa gangguan popup</b>, izinkan akses berikut
          sekali di awal. Tanpa izin ini, rekaman/foto/GPS bisa gagal saat wawancara.
        </p>

        <ul className="space-y-3 mb-5">
          {PERMS.map((p) => (
            <li key={p.title} className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.tint}`}>{p.icon}</span>
              <span>
                <span className="block text-sm font-medium text-gray-800">{p.title}</span>
                <span className="block text-xs text-gray-500 leading-relaxed">{p.desc}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleAllow}
          disabled={requesting}
          className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
        >
          {requesting ? 'Meminta izin…' : 'Izinkan semua & mulai'}
        </button>
        <button
          type="button"
          onClick={markDone}
          disabled={requesting}
          className="w-full py-2.5 mt-2 rounded-xl text-gray-500 hover:text-gray-700 disabled:opacity-60 text-sm transition-colors"
        >
          Nanti saja
        </button>
        <p className="text-2xs text-gray-500 mt-3 leading-relaxed">
          Pilih <b>"Saat aplikasi digunakan"</b> / <b>Izinkan</b> pada setiap dialog.
          Jika terlanjur menolak, aktifkan lewat Setelan HP → Aplikasi → Izin.
        </p>
      </div>
    </div>
  );
}

export default PermissionOnboarding;
