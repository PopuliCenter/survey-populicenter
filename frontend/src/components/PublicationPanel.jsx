import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast';
import api from '../services/api';

/**
 * PublicationPanel — panel admin untuk menayangkan hasil survei (agregat) ke
 * publik di website (populicenter.org).
 *
 * Alur: GET status publikasi → admin isi pengantar (opsional) → "Publikasikan"
 * membekukan snapshot agregat. Setelah tayang, tampilkan URL embed + cuplikan
 * iframe siap-tempel untuk WordPress/Elementor.
 *
 * @param {{ surveyId: string, surveyTitle: string }} props
 */
function PublicationPanel({ surveyId, surveyTitle }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [pub, setPub] = useState(null); // null = belum pernah dipublikasikan
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const loadStatus = useCallback(async () => {
    if (!surveyId) return;
    setLoading(true);
    try {
      const res = await api.get(`/surveys/${surveyId}/publication`);
      setPub(res.data);
      setSummary(res.data?.summary || '');
    } catch {
      setPub(null);
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const embedUrl = pub?.slug
    ? `${window.location.origin}/embed/results/${pub.slug}`
    : '';
  const iframeSnippet = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="800" style="border:0;width:100%" loading="lazy" title="Hasil ${surveyTitle}"></iframe>`
    : '';

  async function handlePublish() {
    setBusy(true);
    try {
      const res = await api.post(`/surveys/${surveyId}/publish`, { summary });
      setPub(res.data);
      toast.success(
        pub?.is_published
          ? 'Snapshot hasil diperbarui.'
          : 'Hasil survei berhasil dipublikasikan.'
      );
      // Ambil ulang agar summary/slug tersinkron.
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mempublikasikan hasil.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpublish() {
    setBusy(true);
    try {
      await api.post(`/surveys/${surveyId}/unpublish`);
      toast.success('Hasil dicabut dari publik.');
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mencabut publikasi.');
    } finally {
      setBusy(false);
    }
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(''), 1500);
      },
      () => toast.error('Gagal menyalin.')
    );
  }

  if (!surveyId) {
    return (
      <p className="text-sm text-gray-400">Pilih survei terlebih dahulu untuk mengelola publikasi hasil.</p>
    );
  }

  const isLive = pub?.is_published;

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">Status:</span>
        {loading ? (
          <span className="text-sm text-gray-400">Memeriksa…</span>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Tayang publik
          </span>
        ) : pub ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
            Dicabut (snapshot tersimpan)
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
            Belum dipublikasikan
          </span>
        )}
        {pub?.published_at && (
          <span className="text-xs text-gray-400">
            · {pub.response_count?.toLocaleString('id-ID')} responden · diperbarui{' '}
            {new Date(pub.published_at).toLocaleString('id-ID')}
          </span>
        )}
      </div>

      {/* Pengantar opsional */}
      <div>
        <label htmlFor="pub-summary" className="block text-xs font-medium text-gray-600 mb-1">
          Pengantar singkat (opsional) — naratif lengkap dikelola di WordPress
        </label>
        <textarea
          id="pub-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="Mis. Ringkasan temuan utama survei ini…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      {/* Aksi */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handlePublish}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          {busy ? 'Memproses…' : isLive ? 'Perbarui snapshot' : 'Publikasikan hasil'}
        </button>
        {pub && isLive && (
          <button
            type="button"
            onClick={handleUnpublish}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            Cabut dari publik
          </button>
        )}
      </div>

      {/* Snapshot membekukan angka — penjelasan */}
      <p className="text-xs text-gray-400">
        "Publikasikan" membekukan angka agregat saat ini. Bila ada responden baru,
        klik "Perbarui snapshot" untuk menayangkan angka terkini. Hanya data agregat
        yang ditayangkan — tidak ada jawaban individual, identitas, atau lokasi mentah.
      </p>

      {/* URL + embed */}
      {isLive && embedUrl && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tautan publik</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={embedUrl}
                className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copy(embedUrl, 'url')}
                className="px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg whitespace-nowrap"
              >
                {copied === 'url' ? 'Tersalin ✓' : 'Salin'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cuplikan embed untuk WordPress/Elementor (HTML widget)
            </label>
            <div className="flex gap-2">
              <textarea
                readOnly
                value={iframeSnippet}
                rows={2}
                className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 resize-none"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copy(iframeSnippet, 'embed')}
                className="px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg whitespace-nowrap self-start"
              >
                {copied === 'embed' ? 'Tersalin ✓' : 'Salin'}
              </button>
            </div>
          </div>

          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary-600 hover:underline"
          >
            Pratinjau halaman embed ↗
          </a>
        </div>
      )}
    </div>
  );
}

export default PublicationPanel;
