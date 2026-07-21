import React, { useEffect, useState } from 'react';
import { useToast } from './Toast';
import api from '../services/api';

const AGG_TYPES = ['single_choice', 'multiple_choice', 'rating_scale', 'numeric_scale', 'matrix', 'indonesia_region'];

/**
 * ReportConfigModal — konfigurasi laporan PPTX per survei: teks metodologi,
 * penandaan pertanyaan demografi, label section (divider), dan override narasi
 * per pertanyaan. Disimpan ke surveys.report_config.
 *
 * @param {{ surveyId: string, surveyTitle: string, onClose: (saved?: boolean) => void }} props
 */
function ReportConfigModal({ surveyId, surveyTitle, onClose }) {
  const toast = useToast();
  const [questions, setQuestions] = useState([]);
  const [methodology, setMethodology] = useState('');
  const [demographics, setDemographics] = useState([]); // [qid]
  const [sections, setSections] = useState({}); // qid -> label
  const [narratives, setNarratives] = useState({}); // qid -> text
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get(`/surveys/${surveyId}/questions`),
      api.get(`/surveys/${surveyId}/report-config`),
    ])
      .then(([qRes, cRes]) => {
        if (!alive) return;
        setQuestions((qRes.data || []).filter((q) => AGG_TYPES.includes(q.type)));
        const cfg = cRes.data || {};
        setMethodology(cfg.methodology || '');
        setDemographics(Array.isArray(cfg.demographics) ? cfg.demographics : []);
        setSections(cfg.sections && typeof cfg.sections === 'object' ? cfg.sections : {});
        setNarratives(cfg.narratives && typeof cfg.narratives === 'object' ? cfg.narratives : {});
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [surveyId]);

  function toggleDemo(id) {
    setDemographics((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function setSection(id, label) {
    setSections((prev) => {
      const next = { ...prev };
      if (label.trim()) next[id] = label;
      else delete next[id];
      return next;
    });
  }
  function setNarrative(id, text) {
    setNarratives((prev) => {
      const next = { ...prev };
      if (text.trim()) next[id] = text;
      else delete next[id];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/surveys/${surveyId}/report-config`, { methodology, demographics, sections, narratives });
      toast.success('Konfigurasi laporan tersimpan.');
      onClose?.(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Konfigurasi laporan">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Konfigurasi Laporan PPTX</h3>
            <p className="text-xs text-gray-500 mt-0.5">{surveyTitle}</p>
          </div>
          <button type="button" onClick={() => onClose?.(false)} aria-label="Tutup" className="text-gray-500 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-6">Memuat…</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teks metodologi (opsional)</label>
                <textarea
                  value={methodology}
                  onChange={(e) => setMethodology(e.target.value)}
                  rows={3}
                  placeholder="Kosongkan untuk teks otomatis (n, tanggal, jumlah provinsi). Satu baris = satu poin."
                  className={inputCls}
                />
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Pengaturan per pertanyaan — centang <b>Demografi</b> untuk slide Profil Responden, isi <b>Section</b> untuk membuat divider, dan <b>Narasi</b> untuk menimpa teks otomatis.
                </p>
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={q.id} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-800 mb-2">{i + 1}. {q.text}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={demographics.includes(q.id)} onChange={() => toggleDemo(q.id)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-400" />
                          Demografi (Profil Responden)
                        </label>
                        <input
                          type="text"
                          value={sections[q.id] || ''}
                          onChange={(e) => setSection(q.id, e.target.value)}
                          placeholder="Section (mis. Kondisi Sosial Ekonomi)"
                          className={inputCls}
                          disabled={demographics.includes(q.id)}
                        />
                      </div>
                      <textarea
                        value={narratives[q.id] || ''}
                        onChange={(e) => setNarrative(q.id, e.target.value)}
                        rows={2}
                        placeholder="Narasi otomatis dari data — isi untuk menimpa."
                        className={inputCls}
                      />
                    </div>
                  ))}
                  {questions.length === 0 && <p className="text-sm text-gray-500">Tidak ada pertanyaan yang bisa ditampilkan.</p>}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button type="button" onClick={() => onClose?.(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="button" onClick={handleSave} disabled={saving || loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportConfigModal;
