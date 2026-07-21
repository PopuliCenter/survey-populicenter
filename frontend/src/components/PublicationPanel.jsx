import React, { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import api from '../services/api';

// Tipe pertanyaan yang bisa diagregasi & ditayangkan (selaras dengan backend).
const AGG_TYPES = ['single_choice', 'multiple_choice', 'rating_scale', 'numeric_scale', 'matrix', 'indonesia_region'];

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
  const [questions, setQuestions] = useState([]); // pertanyaan yang bisa diagregasi
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  // Urutan tampilan hasil di embed: 'urutan' (asli) | 'terbanyak' (peringkat).
  const [embedOrder, setEmbedOrder] = useState('urutan');

  const loadStatus = useCallback(async () => {
    if (!surveyId) return;
    setLoading(true);
    try {
      const [pubRes, qRes] = await Promise.all([
        api.get(`/surveys/${surveyId}/publication`),
        api.get(`/surveys/${surveyId}/questions`),
      ]);
      const aggQuestions = (qRes.data || []).filter((q) => AGG_TYPES.includes(q.type));
      setQuestions(aggQuestions);
      setPub(pubRes.data);
      setSummary(pubRes.data?.summary || '');
      // Pra-centang dari publikasi sebelumnya; bila belum ada → centang semua.
      const preset = pubRes.data?.question_ids;
      setSelectedIds(
        Array.isArray(preset) && preset.length > 0
          ? preset.filter((id) => aggQuestions.some((q) => q.id === id))
          : aggQuestions.map((q) => q.id)
      );
    } catch {
      setPub(null);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  function toggleQuestion(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  const allSelected = questions.length > 0 && selectedIds.length === questions.length;
  function toggleAll() {
    setSelectedIds(allSelected ? [] : questions.map((q) => q.id));
  }

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const embedUrl = pub?.slug
    ? `${window.location.origin}/embed/results/${pub.slug}`
    : '';
  // Tambahkan ?urut=terbanyak hanya bila admin memilih urut peringkat (frekuensi).
  const embedUrlWithOrder = embedUrl
    ? (embedOrder === 'terbanyak' ? `${embedUrl}?urut=terbanyak` : embedUrl)
    : '';
  const iframeSnippet = embedUrlWithOrder
    ? `<iframe src="${embedUrlWithOrder}" width="100%" height="800" style="border:0;width:100%" loading="lazy" title="Hasil ${surveyTitle}"></iframe>`
    : '';

  async function handlePublish() {
    if (questions.length > 0 && selectedIds.length === 0) {
      toast.error('Pilih minimal satu pertanyaan untuk ditampilkan.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/surveys/${surveyId}/publish`, {
        summary,
        question_ids: selectedIds,
      });
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
      <p className="text-sm text-gray-500">Pilih survei terlebih dahulu untuk mengelola publikasi hasil.</p>
    );
  }

  const isLive = pub?.is_published;

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">Status:</span>
        {loading ? (
          <span className="text-sm text-gray-500">Memeriksa…</span>
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
          <span className="text-xs text-gray-500">
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

      {/* Pilih pertanyaan yang tampil */}
      {questions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">
              Pertanyaan yang ditampilkan ({selectedIds.length}/{questions.length})
            </label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary-600 hover:underline"
            >
              {allSelected ? 'Kosongkan' : 'Pilih semua'}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {questions.map((q) => (
              <label
                key={q.id}
                className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(q.id)}
                  onChange={() => toggleQuestion(q.id)}
                  className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                />
                <span className="text-gray-700">{q.text}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Hanya pertanyaan pilihan/skala/matriks/wilayah yang bisa ditayangkan (teks bebas &amp; media dikecualikan demi privasi).
          </p>
        </div>
      )}

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
      <p className="text-xs text-gray-500">
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
                value={embedUrlWithOrder}
                className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copy(embedUrlWithOrder, 'url')}
                className="px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg whitespace-nowrap"
              >
                {copied === 'url' ? <><Icon name="check" className="w-3.5 h-3.5" />Tersalin</> : 'Salin'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="embed-order" className="block text-xs font-medium text-gray-600 mb-1">
              Urutan tampilan jawaban di embed
            </label>
            <select
              id="embed-order"
              value={embedOrder}
              onChange={(e) => setEmbedOrder(e.target.value)}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 mb-2"
            >
              <option value="urutan">Urutan asli (sesuai susunan pertanyaan/matriks)</option>
              <option value="terbanyak">Peringkat (dari jawaban terbanyak)</option>
            </select>
            <p className="text-2xs text-gray-500 mb-2">
              "Urutan asli" cocok untuk skala & matriks; "Peringkat" mengurutkan dari yang paling banyak dipilih.
            </p>
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
                {copied === 'embed' ? <><Icon name="check" className="w-3.5 h-3.5" />Tersalin</> : 'Salin'}
              </button>
            </div>
          </div>

          <a
            href={embedUrlWithOrder}
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
