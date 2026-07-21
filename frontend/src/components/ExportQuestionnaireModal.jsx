import React, { useRef, useState } from 'react';
import api from '../services/api';
import useModalA11y from '../hooks/useModalA11y';
import { downloadJson, downloadCsv, downloadXlsx } from '../utils/spreadsheet';

/**
 * ExportQuestionnaireModal — export pertanyaan survei ke JSON / CSV / Excel.
 *
 * JSON  : fidelitas penuh (semua field, untuk backup/pindah survei).
 * CSV/XLSX : kolom teks/tipe/wajib/opsi — SELARAS dengan format Import, sehingga
 *            bisa diedit di Excel lalu diimpor kembali.
 *
 * @param {{ survey: {id: string, title: string}, onClose: () => void }} props
 */
const HEADERS = ['teks', 'tipe', 'wajib', 'opsi'];

function questionsToRows(questions) {
  return questions.map((q) => {
    let opsi = '';
    if ((q.type === 'single_choice' || q.type === 'multiple_choice') && Array.isArray(q.options)) {
      opsi = q.options
        .map((o) => (o && (o.label ?? o.value)) != null ? String(o.label ?? o.value) : '')
        .filter(Boolean)
        .join('|');
    }
    return [q.text, q.type, q.is_required ? 'ya' : 'tidak', opsi];
  });
}

export default function ExportQuestionnaireModal({ survey, onClose }) {
  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const safeTitle = String(survey?.title || 'kuesioner').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'kuesioner';

  async function run(format) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get(`/surveys/${survey.id}/questions/export`);
      const data = res.data;
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (format === 'json') {
        downloadJson(`kuesioner-${safeTitle}.json`, data);
      } else if (format === 'csv') {
        downloadCsv(`kuesioner-${safeTitle}.csv`, HEADERS, questionsToRows(questions));
      } else {
        await downloadXlsx(`kuesioner-${safeTitle}.xlsx`, 'Kuesioner', HEADERS, questionsToRows(questions));
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal export kuesioner.');
    } finally {
      setBusy(false);
    }
  }

  const btn = 'flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Export kuesioner">
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />
      <div ref={dialogRef} tabIndex={-1} className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Export Kuesioner</h3>
        <p className="text-sm text-gray-500 mb-4 truncate">{survey?.title}</p>

        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm" role="alert">{error}</div>}

        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={() => run('xlsx')}
            className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus:ring-emerald-300`}>
            Excel<span className="block text-2xs font-normal text-emerald-600/80">.xlsx</span>
          </button>
          <button type="button" disabled={busy} onClick={() => run('csv')}
            className={`${btn} border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 focus:ring-primary-300`}>
            CSV<span className="block text-2xs font-normal text-primary-600/80">.csv</span>
          </button>
          <button type="button" disabled={busy} onClick={() => run('json')}
            className={`${btn} border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-gray-300`}>
            JSON<span className="block text-2xs font-normal text-gray-500">lengkap</span>
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          CSV/Excel memakai kolom yang sama dengan Import (teks, tipe, wajib, opsi) — bisa diedit lalu diimpor lagi.
          JSON menyimpan semua field (untuk backup/pindah survei).
        </p>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
            {busy ? 'Menyiapkan…' : 'Tutup'}
          </button>
        </div>
      </div>
    </div>
  );
}
