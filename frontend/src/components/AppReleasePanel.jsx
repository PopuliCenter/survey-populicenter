/**
 * AppReleasePanel — admin mengumumkan versi terbaru aplikasi TPD (APK).
 *
 * Aplikasi TPD membaca rilis terbaru lewat /public/app-version:
 *  - versi di bawah "Kode versi"     → banner "Pembaruan tersedia" (bisa ditunda)
 *  - versi di bawah "Versi minimum"  → layar WAJIB update
 * Kode versi naik → push ke semua TPD. Kode sama → koreksi tanpa push.
 *
 * Tautan hanya https ke domain resmi (populicenter.org/.com, play.google.com) —
 * server & aplikasi sama-sama menolak domain lain.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from './Toast';

const DEFAULT_PAGE = 'https://populicenter.org/';

function fieldsFrom(latest) {
  return {
    version_code: latest ? String(latest.version_code + 1) : '',
    version_name: latest?.version_name || '',
    min_version_code: latest ? String(latest.min_version_code) : '',
    notes: '',
    page_url: latest?.page_url || DEFAULT_PAGE,
    apk_url: '',
    apk_sha256: '',
  };
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300';

function AppReleasePanel() {
  const toast = useToast();
  const [data, setData] = useState(null); // { latest, history }
  const [error, setError] = useState('');
  const [form, setForm] = useState(fieldsFrom(null));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/monitoring/app-releases');
      setData(res.data);
      setForm(fieldsFrom(res.data.latest));
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Gagal memuat rilis aplikasi.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const required = form.min_version_code && form.version_code && Number(form.min_version_code) >= Number(form.version_code);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/monitoring/app-releases', {
        ...form,
        version_code: Number(form.version_code),
        min_version_code: Number(form.min_version_code),
      });
      toast.success(res.data.announced
        ? `Versi ${res.data.release.version_code} diumumkan — notifikasi dikirim ke HP TPD.`
        : 'Rilis diperbarui (kode versi sama, tanpa notifikasi ulang).');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mengumumkan rilis.');
    } finally {
      setBusy(false);
    }
  }

  const latest = data?.latest;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Pembaruan Aplikasi TPD (Android)</h2>
        <p className="text-sm text-gray-500 mt-1">
          Umumkan APK terbaru. Aplikasi TPD menampilkan pemberitahuan yang bisa diketuk, mengunduh &amp;
          memasang langsung bila tautan berkas APK diisi, atau membuka halaman unduh resmi.
        </p>
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {latest ? (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 space-y-0.5">
          <p>
            Terbaru: <strong>kode {latest.version_code}</strong>
            {latest.version_name ? ` (${latest.version_name})` : ''} · wajib update di bawah{' '}
            <strong>kode {latest.min_version_code}</strong>
          </p>
          <p className="text-xs text-gray-500 break-all">
            {latest.apk_url ? 'Pasang langsung dari aplikasi · ' : 'Lewat halaman unduh · '}
            {latest.apk_url || latest.page_url}
          </p>
        </div>
      ) : data && (
        <p className="text-sm text-gray-500">Belum ada rilis yang diumumkan.</p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Kode versi</span>
            <input type="number" min="1" required value={form.version_code} onChange={set('version_code')} className={inputCls} />
            <span className="text-xs text-gray-500">Angka di nama berkas, mis. …-code29.apk</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Nama versi</span>
            <input type="text" maxLength={30} value={form.version_name} onChange={set('version_name')} placeholder="1.0.0" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Versi minimum</span>
            <input type="number" min="1" required value={form.min_version_code} onChange={set('min_version_code')} className={inputCls} />
            <span className="text-xs text-gray-500">Di bawah ini WAJIB update</span>
          </label>
        </div>

        {required && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Versi minimum = kode versi: semua TPD dengan versi lebih lama <strong>wajib</strong> memperbarui
            sebelum bisa lanjut survei. Pakai bila rilis ini membawa perbaikan penting.
          </p>
        )}

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Catatan perubahan (tampil di HP TPD)</span>
          <textarea rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} className={inputCls}
            placeholder="mis. Perbaikan keamanan dan nada notifikasi pesan." />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Halaman unduh resmi</span>
          <input type="url" required value={form.page_url} onChange={set('page_url')} className={inputCls}
            placeholder="https://populicenter.org/…" />
          <span className="text-xs text-gray-500">populicenter.org sekarang; kelak tautan Google Play aplikasi ini.</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Tautan berkas APK (opsional)</span>
            <input type="url" value={form.apk_url} onChange={set('apk_url')} className={inputCls}
              placeholder="https://populicenter.org/…/SurveiPopuliCenter-…apk" />
            <span className="text-xs text-gray-500">Diisi → TPD memperbarui langsung dari aplikasi.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">SHA-256 berkas APK</span>
            <input type="text" value={form.apk_sha256} onChange={set('apk_sha256')} required={!!form.apk_url}
              pattern="[0-9a-fA-F]{64}" className={`${inputCls} font-mono`} placeholder="64 karakter" />
            <span className="text-xs text-gray-500">Dicetak <code>npm run cap:release</code> (berkas .sha256).</span>
          </label>
        </div>

        <button type="submit" disabled={busy}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-60">
          {busy ? 'Menyimpan…' : 'Umumkan rilis'}
        </button>
      </form>

      {data?.history?.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Riwayat</h3>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="px-3 py-2 flex flex-wrap gap-x-3 text-gray-700">
                <span className="font-medium tabular-nums">kode {h.version_code}</span>
                <span>min {h.min_version_code}</span>
                <span className="text-gray-500">
                  {new Date(h.published_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  {h.publisher_name ? ` · ${h.publisher_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AppReleasePanel;
