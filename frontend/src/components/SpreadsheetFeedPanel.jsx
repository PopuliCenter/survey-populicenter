import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

/**
 * SpreadsheetFeedPanel — kelola "Tarik ke Spreadsheet" per survei.
 *
 * Menyediakan link CSV bertoken yang bisa ditempel ke Google Sheets
 * (=IMPORTDATA) atau Excel (Data → From Web) dan auto-refresh. Tiga umpan:
 * rekap agregat, monitoring capaian, dan data mentah (opt-in, sensitif).
 *
 * Hanya untuk admin & supervisor (dipanggil di balik gate !isViewer).
 */
function CopyButton({ text, label = 'Salin' }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: pilih via prompt bila clipboard API diblokir.
      window.prompt('Salin tautan:', text);
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md"
    >
      {copied ? 'Tersalin ✓' : label}
    </button>
  );
}

function FeedRow({ title, url, note }) {
  const formula = `=IMPORTDATA("${url}")`;
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-800">{title}</span>
      </div>
      {note}
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono text-gray-700 bg-gray-50"
        />
        <CopyButton text={url} label="Salin URL" />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={formula}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono text-gray-700 bg-gray-50"
        />
        <CopyButton text={formula} label="Salin rumus" />
      </div>
    </div>
  );
}

function SpreadsheetFeedPanel({ surveyId }) {
  const [status, setStatus] = useState(null); // { enabled, include_raw, token, paths }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!surveyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/reports/surveys/${surveyId}/feed`);
      setStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat status feed.');
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(async (body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.put(`/reports/surveys/${surveyId}/feed`, body);
      setStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }, [surveyId]);

  const rotate = useCallback(async () => {
    if (!window.confirm('Ganti token feed? Semua tautan lama akan langsung berhenti bekerja.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/reports/surveys/${surveyId}/feed/rotate`);
      setStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal memutar token.');
    } finally {
      setBusy(false);
    }
  }, [surveyId]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const abs = (p) => (p ? `${origin}${p}` : '');

  if (loading) {
    return <p className="text-sm text-gray-500">Memuat status feed…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Master toggle */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Feed CSV untuk spreadsheet</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Aktifkan untuk mendapat tautan yang bisa ditarik langsung ke Google Sheets / Excel
            dan menyegar otomatis. Tautan bertoken — hanya yang memegangnya bisa membuka.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ enabled: !status?.enabled })}
          className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
            status?.enabled
              ? 'text-red-700 bg-red-50 hover:bg-red-100'
              : 'text-white bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {status?.enabled ? 'Nonaktifkan' : 'Aktifkan feed'}
        </button>
      </div>

      {status?.enabled && status?.paths && (
        <>
          <FeedRow title="Rekap jawaban (agregat)" url={abs(status.paths.rekap)} />
          <FeedRow title="Progres / capaian (monitoring)" url={abs(status.paths.monitoring)} />

          {/* Data mentah — opt-in sensitif */}
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!status.include_raw}
                disabled={busy}
                onChange={(e) => patch({ include_raw: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-sm text-amber-900">
                <span className="font-semibold">Izinkan tarik data mentah per responden</span>
                <span className="block text-xs text-amber-800 mt-0.5">
                  SENSITIF — satu baris per responden termasuk koordinat GPS &amp; waktu. Bagikan hanya
                  ke pihak berwenang. Kalau ragu, biarkan mati.
                </span>
              </span>
            </label>
            {status.include_raw && (
              <FeedRow
                title="Data mentah per responden"
                url={abs(status.paths.mentah)}
                note={
                  <p className="text-xs text-amber-800">
                    Hanya responden committed &amp; tidak dikecualikan yang ikut.
                  </p>
                }
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={rotate}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
            >
              Ganti token (putus tautan lama)
            </button>
          </div>

          {/* Petunjuk */}
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-700">Cara menarik ke spreadsheet</p>
            <p>
              <span className="font-medium">Google Sheets:</span> tempel rumus <code className="font-mono">=IMPORTDATA("…")</code> di satu sel — data terisi &amp; menyegar berkala.
            </p>
            <p>
              <span className="font-medium">Excel:</span> menu <em>Data → Ambil Data → Dari Web</em>, tempel URL, lalu <em>Muat</em>. Klik <em>Refresh All</em> untuk memperbarui.
            </p>
            <p className="text-gray-500">
              Angka menyegar otomatis mengikuti data terbaru. Untuk mencabut akses, tekan
              &ldquo;Ganti token&rdquo; atau &ldquo;Nonaktifkan&rdquo;.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default SpreadsheetFeedPanel;
