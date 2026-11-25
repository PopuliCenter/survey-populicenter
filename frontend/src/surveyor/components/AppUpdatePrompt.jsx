/**
 * AppUpdatePrompt — pemberitahuan pembaruan APK di Daftar Survei TPD.
 *
 *  - 'available': banner yang bisa diketuk → lembar detail (Perbarui / Nanti).
 *  - 'required' : layar penuh, tak bisa ditutup. Data yang belum terkirim tetap
 *    bisa dikirim dulu (tombol Kirim), supaya pembaruan tak pernah memaksa TPD
 *    meninggalkan data. Memperbarui APK sendiri tidak menghapus data lokal.
 *
 * Logika unduh/pasang di utils/appUpdate.js.
 *
 * @param {{
 *   state: 'none'|'available'|'required',
 *   release: object|null,
 *   pendingCount: number,
 *   isSyncing: boolean,
 *   isOnline: boolean,
 *   onSync: () => void,
 * }} props
 */
import React, { useState } from 'react';
import Icon from '../../components/Icon';
import {
  dismissRelease, isDismissed, startUpdate, openReleasePage, openInstallSettings,
  installDownloaded, updateErrorMessage,
} from '../../utils/appUpdate';

function AppUpdatePrompt({ state, release, pendingCount = 0, isSyncing = false, isOnline = true, onSync }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => (release ? isDismissed(release) : false));
  const [phase, setPhase] = useState('idle'); // idle | downloading | needs_permission | done | error
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  if (!release || state === 'none') return null;
  const required = state === 'required';
  const label = release.version_name ? `versi ${release.version_name}` : 'versi baru';

  async function update() {
    setError('');
    setProgress(null);
    setPhase('downloading');
    try {
      const status = await startUpdate(release, { onProgress: setProgress });
      setPhase(status === 'needs_permission' ? 'needs_permission' : 'done');
    } catch (err) {
      setError(updateErrorMessage(err));
      setPhase('error');
    }
  }

  async function installAfterPermission() {
    setError('');
    try {
      const status = await installDownloaded(release);
      setPhase(status === 'needs_permission' ? 'needs_permission' : 'done');
    } catch (err) {
      setError(updateErrorMessage(err));
      setPhase('error');
    }
  }

  const busy = phase === 'downloading';

  const body = (
    <div className="space-y-4">
      <div>
        <h2 id="app-update-title" className="text-lg font-bold text-gray-900">
          {required ? 'Aplikasi perlu diperbarui' : `Pembaruan tersedia — ${label}`}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {required
            ? `Versi aplikasi ini sudah tidak didukung. Perbarui ke ${label} untuk melanjutkan survei.`
            : 'Perbarui agar mendapat perbaikan terbaru. Data di HP ini tetap aman.'}
        </p>
      </div>

      {release.notes && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">Yang baru</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{release.notes}</p>
        </div>
      )}

      {required && pendingCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2" role="status">
          <p className="text-sm text-amber-900">
            Masih ada <strong>{pendingCount}</strong> data belum terkirim. Data itu tetap aman saat aplikasi
            diperbarui, tapi sebaiknya dikirim dulu.
          </p>
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing || !isOnline}
            className="w-full h-11 border border-amber-400 text-amber-900 font-semibold rounded-xl disabled:opacity-50"
          >
            {isSyncing ? 'Mengirim…' : isOnline ? `Kirim ${pendingCount} data sekarang` : 'Menunggu sinyal untuk mengirim'}
          </button>
        </div>
      )}

      {phase === 'downloading' && (
        <div aria-live="polite">
          <p className="text-sm text-gray-700 mb-1.5">
            Mengunduh pembaruan{progress != null ? ` — ${progress}%` : '…'}
          </p>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-accent-600 transition-[width]"
              style={{ width: `${progress ?? 15}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'needs_permission' && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <p className="text-sm text-gray-700">
            Unduhan selesai. Izinkan aplikasi ini memasang pembaruan: buka pengaturan, aktifkan
            <strong> Izinkan dari sumber ini</strong>, lalu kembali dan ketuk <strong>Pasang sekarang</strong>.
          </p>
          <button type="button" onClick={() => openInstallSettings().catch(() => {})}
            className="w-full h-11 border border-gray-300 text-gray-800 font-semibold rounded-xl">
            Buka pengaturan
          </button>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-sm text-gray-700" role="status">
          Ikuti layar pemasangan Android. Bila tidak muncul, ketuk Perbarui sekali lagi.
        </p>
      )}

      {error && (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => openReleasePage(release)}
            className="text-sm font-medium text-accent-700 underline">
            Buka halaman unduh resmi
          </button>
        </div>
      )}

      <div className="space-y-2.5 pt-1">
        {phase === 'needs_permission' ? (
          <button type="button" onClick={installAfterPermission}
            className="w-full h-12 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl">
            Pasang sekarang
          </button>
        ) : (
          <button type="button" onClick={update} disabled={busy || !isOnline}
            className="w-full h-12 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl disabled:opacity-60">
            {busy ? 'Mengunduh…' : isOnline ? 'Perbarui sekarang' : 'Butuh sinyal untuk memperbarui'}
          </button>
        )}
        {!required && (
          <button type="button" disabled={busy}
            onClick={() => { dismissRelease(release); setDismissed(true); setOpen(false); }}
            className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl disabled:opacity-60">
            Nanti
          </button>
        )}
      </div>
    </div>
  );

  if (required) {
    return (
      <div className="fixed inset-0 z-[90] bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="max-w-md mx-auto px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="w-14 h-14 rounded-full bg-accent-50 flex items-center justify-center mb-4">
            <Icon name="download" className="w-7 h-7 text-accent-700" />
          </div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <>
      {!dismissed && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-left"
        >
          <Icon name="download" className="w-5 h-5 text-accent-700 shrink-0" />
          <span className="flex-1 min-w-0 text-sm text-gray-800">
            <span className="font-semibold">Pembaruan tersedia ({label}).</span> Ketuk untuk memperbarui.
          </span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
          <button type="button" aria-label="Tutup" disabled={busy} onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 animate-backdrop-in cursor-default" />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-sheet-up">
            {body}
          </div>
        </div>
      )}
    </>
  );
}

export default AppUpdatePrompt;
