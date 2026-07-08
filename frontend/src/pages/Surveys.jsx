import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { SurveyStatusBadge, TemporalBadge } from '../components/SurveyBadges';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import SurveyCard from '../components/SurveyCard';
import ConfirmDialog from '../components/ConfirmDialog';
import IconButton from '../components/IconButton';
import { useToast } from '../components/Toast';
import useModalA11y from '../hooks/useModalA11y';
import api from '../services/api';
import { downloadCsv, downloadXlsx, parseSpreadsheet } from '../utils/spreadsheet';

// ─── Tipe / skala survei ────────────────────────────────────────────────────────
const SURVEY_TYPES = [
  { value: 'nasional', label: 'Nasional', badge: 'bg-primary-100 text-primary-700' },
  { value: 'daerah', label: 'Daerah', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'lainnya', label: 'Lainnya', badge: 'bg-gray-100 text-gray-600' },
];

function SurveyTypeBadge({ type }) {
  const t = SURVEY_TYPES.find((x) => x.value === type) || SURVEY_TYPES[2];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${t.badge}`}>
      {t.label}
    </span>
  );
}

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function typeLabel(t) {
  return (SURVEY_TYPES.find((x) => x.value === t) || SURVEY_TYPES[2]).label;
}

function Chevron({ open }) {
  return (
    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Ikon folder (mengganti emoji 📁/📂 agar konsisten lintas platform)
function FolderIcon({ open = false }) {
  return (
    <svg className="w-4 h-4 inline-block align-text-bottom mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1H7a2 2 0 00-1.94 1.515L3 19V7z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      )}
    </svg>
  );
}

/**
 * Navigasi folder Tahun › Bulan › Tipe. Mengeklik folder memanggil onSelect
 * untuk mem-filter daftar survei (reuse render daftar yang sudah ada).
 */
function FolderTree({ surveys, selected, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (k) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const tree = {};
  for (const s of surveys) {
    const d = new Date(s.created_at);
    const y = d.getFullYear();
    const m = d.getMonth();
    const t = s.type || 'lainnya';
    tree[y] = tree[y] || { count: 0, months: {} };
    tree[y].count += 1;
    tree[y].months[m] = tree[y].months[m] || { count: 0, types: {} };
    tree[y].months[m].count += 1;
    tree[y].months[m].types[t] = (tree[y].months[m].types[t] || 0) + 1;
  }
  const years = Object.keys(tree).map(Number).sort((a, b) => b - a);
  const itemCls = (active) => `flex-1 text-left px-2 py-1.5 rounded-lg truncate ${active ? 'bg-primary-50 text-primary-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`;

  return (
    <aside className="w-56 shrink-0 border-r border-gray-100 p-2 overflow-auto text-sm" style={{ maxHeight: '70vh' }} aria-label="Navigasi folder survei">
      <button
        type="button"
        onClick={() => onSelect('', '', '')}
        className={`w-full text-left px-2 py-1.5 rounded-lg mb-1 ${!selected.year ? 'bg-primary-50 text-primary-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
      >
        Semua Survei <span className="text-xs text-gray-400">({surveys.length})</span>
      </button>
      {years.map((y) => {
        const yKey = `y${y}`;
        const yExp = expanded.has(yKey);
        const yObj = tree[y];
        const months = Object.keys(yObj.months).map(Number).sort((a, b) => b - a);
        return (
          <div key={y}>
            <div className="flex items-center">
              <button type="button" onClick={() => toggle(yKey)} className="p-1" aria-label={`Buka/tutup ${y}`}><Chevron open={yExp} /></button>
              <button type="button" onClick={() => onSelect(String(y), '', '')} className={itemCls(selected.year === String(y) && !selected.month)}>
                <FolderIcon open={yExp} /> {y} <span className="text-xs text-gray-400">({yObj.count})</span>
              </button>
            </div>
            {yExp && months.map((m) => {
              const mKey = `m${y}-${m}`;
              const mExp = expanded.has(mKey);
              const mObj = yObj.months[m];
              const types = Object.keys(mObj.types);
              return (
                <div key={m} className="pl-3">
                  <div className="flex items-center">
                    <button type="button" onClick={() => toggle(mKey)} className="p-1" aria-label={`Buka/tutup ${MONTH_NAMES[m]} ${y}`}><Chevron open={mExp} /></button>
                    <button type="button" onClick={() => onSelect(String(y), String(m + 1), '')} className={itemCls(selected.year === String(y) && selected.month === String(m + 1) && !selected.type)}>
                      <FolderIcon open={mExp} /> {MONTH_NAMES[m]} <span className="text-xs text-gray-400">({mObj.count})</span>
                    </button>
                  </div>
                  {mExp && types.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSelect(String(y), String(m + 1), t)}
                      className={`block w-full text-left pl-9 pr-2 py-1.5 rounded-lg truncate ${selected.year === String(y) && selected.month === String(m + 1) && selected.type === t ? 'bg-primary-50 text-primary-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}`}
                    >
                      {typeLabel(t)} <span className="text-xs text-gray-400">({mObj.types[t]})</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

// ─── Create Survey Modal ──────────────────────────────────────────────────────
/**
 * Modal form for creating a new survey.
 *
 * @param {{ onClose: () => void, onSaved: () => void }} props
 */
function CreateSurveyModal({ onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [type, setType] = useState('lainnya');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [titleError, setTitleError] = useState('');
  const [dateError, setDateError] = useState('');
  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    setTitleError('');
    setDateError('');

    if (!title.trim()) {
      setTitleError('Judul survei wajib diisi');
      return;
    }

    // Validate date consistency
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setDateError('Tanggal berakhir harus setelah tanggal mulai');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/surveys', {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        type,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
      });
      onSaved();
    } catch (err) {
      setFormError(
        err.response?.data?.message ||
          err.message ||
          'Terjadi kesalahan. Silakan coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-survey-modal-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
      >
        <h2
          id="create-survey-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          Buat Survei Baru
        </h2>

        {formError && (
          <div
            className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"
            role="alert"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="survey-title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Judul Survei <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="survey-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                titleError ? 'border-red-400' : 'border-gray-300'
              }`}
              aria-describedby={titleError ? 'survey-title-error' : undefined}
              aria-invalid={!!titleError}
              autoFocus
            />
            {titleError && (
              <p id="survey-title-error" className="mt-1 text-xs text-red-600">
                {titleError}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="survey-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Deskripsi{' '}
              <span className="text-gray-400 font-normal text-xs">(opsional)</span>
            </label>
            <textarea
              id="survey-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
          </div>

          {/* Tipe survei */}
          <div>
            <label htmlFor="survey-type" className="block text-sm font-medium text-gray-700 mb-1">
              Tipe Survei
            </label>
            <select
              id="survey-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {SURVEY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Section */}
          <div className="space-y-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div>
                <label
                  htmlFor="survey-start-date"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Tanggal Mulai
                </label>
                <input
                  id="survey-start-date"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label
                  htmlFor="survey-end-date"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Tanggal Berakhir
                </label>
                <input
                  id="survey-end-date"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    dateError ? 'border-red-400' : 'border-gray-300'
                  }`}
                  aria-describedby={dateError ? 'survey-date-error' : undefined}
                  aria-invalid={!!dateError}
                />
              </div>
            </div>
            {dateError && (
              <p id="survey-date-error" className="text-xs text-red-600">
                {dateError}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {submitting ? 'Menyimpan…' : 'Buat Survei'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Survey Modal ─────────────────────────────────────────────────────────
function EditSurveyModal({ survey, onClose, onSaved }) {
  const [title, setTitle] = useState(survey.title || '');
  const [description, setDescription] = useState(survey.description || '');
  const [type, setType] = useState(survey.type || 'lainnya');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setFormError('Judul wajib diisi'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.put(`/surveys/${survey.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        type,
      });
      onSaved();
    } catch (err) {
      setFormError(err.response?.data?.error || err.response?.data?.message || 'Gagal menyimpan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-5">Edit Survei</h2>
        {formError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{formError}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
              Judul <span className="text-red-500">*</span>
            </label>
            <input id="edit-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" autoFocus />
          </div>
          <div>
            <label htmlFor="edit-desc" className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
          </div>
          <div>
            <label htmlFor="edit-type" className="block text-sm font-medium text-gray-700 mb-1">Tipe Survei</label>
            <select id="edit-type" value={type} onChange={(e) => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              {SURVEY_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg">
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Import kuesioner: pemetaan spreadsheet → pertanyaan ─────────────────────
const QUESTION_TYPE_CODES = [
  'single_choice', 'multiple_choice', 'short_text', 'long_text', 'numeric_scale',
  'date', 'photo', 'rating_scale', 'phone_number', 'unique_id', 'time', 'matrix', 'indonesia_region',
];
// Alias ramah (Indonesia) → kode tipe.
const QUESTION_TYPE_ALIASES = {
  'pilihan tunggal': 'single_choice', pilihan_tunggal: 'single_choice',
  'pilihan ganda': 'multiple_choice', pilihan_ganda: 'multiple_choice',
  'teks pendek': 'short_text', teks_pendek: 'short_text',
  'teks panjang': 'long_text', teks_panjang: 'long_text',
  'skala numerik': 'numeric_scale', skala_numerik: 'numeric_scale',
  tanggal: 'date', foto: 'photo', 'upload foto': 'photo',
  rating: 'rating_scale', 'rating scale': 'rating_scale',
  'nomor telepon': 'phone_number', nomor_telepon: 'phone_number',
  'nomor unik': 'unique_id', 'nomor kuesioner unik': 'unique_id',
  waktu: 'time', matriks: 'matrix',
  wilayah: 'indonesia_region', 'wilayah indonesia': 'indonesia_region',
};

// Header template kuesioner. Kolom "opsi" dipisah tanda | untuk tipe pilihan.
const QUESTION_TPL_HEADERS = ['teks', 'tipe', 'wajib', 'opsi'];
const QUESTION_TPL_EXAMPLE = [
  ['Apa jenis kelamin Anda?', 'single_choice', 'ya', 'Laki-laki|Perempuan'],
  ['Sumber informasi yang biasa dipakai?', 'multiple_choice', 'tidak', 'TV|Media Sosial|Koran|Radio'],
  ['Nama lengkap responden', 'short_text', 'ya', ''],
  ['Saran untuk pemerintah', 'long_text', 'tidak', ''],
];

/** Konversi baris spreadsheet → array pertanyaan siap-import (+ daftar error). */
function rowsToQuestions(rows) {
  const errors = [];
  const questions = [];
  rows.forEach((r, i) => {
    const text = String(r.teks || r.text || '').trim();
    const rawType = String(r.tipe || r.type || '').trim().toLowerCase();
    const type = QUESTION_TYPE_CODES.includes(rawType)
      ? rawType
      : (QUESTION_TYPE_ALIASES[rawType] || '');
    const wajib = String(r.wajib || r.required || '').trim().toLowerCase();
    const isRequired = ['ya', 'yes', 'true', '1', 'wajib'].includes(wajib);
    const opsiRaw = String(r.opsi || r.options || '').trim();

    if (!text) { errors.push(`Baris ${i + 1}: kolom "teks" kosong`); return; }
    if (!type) { errors.push(`Baris ${i + 1}: tipe "${rawType || '(kosong)'}" tidak dikenal`); return; }

    let options = null;
    if (type === 'single_choice' || type === 'multiple_choice') {
      const opts = opsiRaw.split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) {
        errors.push(`Baris ${i + 1}: tipe pilihan butuh minimal 2 opsi (pisahkan dengan |)`);
        return;
      }
      options = opts.map((v) => ({ value: v, label: v }));
    }
    questions.push({ text, type, is_required: isRequired, options });
  });
  return { questions, errors };
}

// ─── Import Questionnaire Modal ───────────────────────────────────────────────
function ImportQuestionnaireModal({ surveys, onClose, onSuccess }) {
  const [targetSurveyId, setTargetSurveyId] = useState('');
  const [, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = React.useRef(null);
  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f);
    setPreview(null);
    setError(null);
    if (!f) return;

    const name = (f.name || '').toLowerCase();

    if (name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.questions || !Array.isArray(data.questions)) {
            setError('Format file tidak valid. Pastikan file berisi field "questions".');
            return;
          }
          setPreview(data);
        } catch {
          setError('File bukan JSON yang valid.');
        }
      };
      reader.readAsText(f);
      return;
    }

    if (name.endsWith('.csv') || name.endsWith('.xlsx')) {
      parseSpreadsheet(f)
        .then((rows) => {
          if (!rows.length) { setError('File tidak berisi baris data.'); return; }
          const { questions, errors } = rowsToQuestions(rows);
          if (errors.length > 0) {
            setError(`${errors.length} baris bermasalah — ${errors.slice(0, 6).join('; ')}${errors.length > 6 ? '…' : ''}`);
            return;
          }
          setPreview({ questions, survey_title: 'Dari spreadsheet' });
        })
        .catch((err) => setError(err.message || 'Gagal membaca file.'));
      return;
    }

    setError('Format tidak didukung. Gunakan file .json, .csv, atau .xlsx.');
  }

  async function handleImport() {
    if (!targetSurveyId || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await api.post(`/surveys/${targetSurveyId}/questions/import`, {
        questions: preview.questions,
      });
      onSuccess(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal import kuesioner.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8" role="dialog" aria-modal="true" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Import Kuesioner</h2>

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Survei Tujuan <span className="text-red-500">*</span></label>
            <select value={targetSurveyId} onChange={(e) => setTargetSurveyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="">— Pilih survei —</option>
              {surveys.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.status})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File Kuesioner (JSON / CSV / Excel)</label>
            <input ref={fileRef} type="file" accept=".json,.csv,.xlsx" onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
            <p className="mt-1 text-xs text-gray-400">
              JSON hasil export, atau spreadsheet dengan kolom: teks, tipe, wajib, opsi (opsi dipisah <b>|</b> untuk tipe pilihan).
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-xs">
              <span className="text-gray-500">Template:</span>
              <button type="button" onClick={() => downloadCsv('template_kuesioner.csv', QUESTION_TPL_HEADERS, QUESTION_TPL_EXAMPLE)}
                className="text-primary-600 hover:text-primary-800 underline">CSV</button>
              <button type="button" onClick={() => downloadXlsx('template_kuesioner.xlsx', 'Kuesioner', QUESTION_TPL_HEADERS, QUESTION_TPL_EXAMPLE)}
                className="text-primary-600 hover:text-primary-800 underline">Excel (.xlsx)</button>
            </div>
          </div>

          {preview && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">Preview: {preview.survey_title || 'Kuesioner'}</p>
              <p className="text-xs text-gray-500">{preview.question_count || preview.questions.length} pertanyaan akan diimport</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {preview.questions.map((q, i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-2">
                    <span className="text-gray-400 shrink-0">{i + 1}.</span>
                    <span className="truncate">{q.text}</span>
                    <span className="text-gray-400 shrink-0">({q.type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
            <button onClick={handleImport} disabled={!targetSurveyId || !preview || importing}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg">
              {importing ? 'Mengimport…' : `Import ${preview?.questions?.length || 0} Pertanyaan`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Surveys Page ─────────────────────────────────────────────────────────────
/**
 * Survey list page for admin.
 *
 * Features:
 * - Table: Title, Status badge, Question Count, Response Count, Created At
 * - "Buat Survei" button → modal to create new survey
 * - Per-row: "Builder" button → /surveys/:id/builder
 * - Activate / Deactivate toggle (PATCH)
 * - Delete (only draft surveys with no responses, with confirmation)
 */
function Surveys() {
  const navigate = useNavigate();
  const toast = useToast();
  const [viewMode, handleViewChange] = useViewMode('surveys_view_mode');
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Destructive-action confirmation targets (shared ConfirmDialog)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Clone state
  const [cloningId, setCloningId] = useState(null);

  // Filter state
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [explorerMode, setExplorerMode] = useState('list'); // 'list' | 'folder'

  // Pagination state (client-side, ~25 per page)
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  // ── Fetch surveys ───────────────────────────────────────────────────────────
  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/surveys');
      setSurveys(res.data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat daftar survei.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  // ── Activate handler ────────────────────────────────────────────────────────
  async function handleActivate(survey) {
    try {
      await api.patch(`/surveys/${survey.id}/activate`);
      toast.success(`Survei "${survey.title}" berhasil diaktifkan.`);
      fetchSurveys();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.message ||
          'Gagal mengaktifkan survei.'
      );
    }
  }

  // ── Deactivate handler (dipicu dari ConfirmDialog) ──────────────────────────
  async function handleDeactivate(survey) {
    setConfirmLoading(true);
    try {
      await api.patch(`/surveys/${survey.id}/deactivate`);
      toast.success(`Survei "${survey.title}" berhasil dinonaktifkan.`);
      setDeactivateTarget(null);
      fetchSurveys();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan survei.'
      );
      setDeactivateTarget(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  // ── Delete handler (dipicu dari ConfirmDialog) ──────────────────────────────
  async function handleDelete(survey) {
    setConfirmLoading(true);
    try {
      await api.delete(`/surveys/${survey.id}`);
      toast.success(`Survei "${survey.title}" berhasil dihapus.`);
      setDeleteTarget(null);
      fetchSurveys();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.message ||
          'Gagal menghapus survei.'
      );
      setDeleteTarget(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  // ── Clone handler ────────────────────────────────────────────────────────────
  async function handleClone(survey) {
    setCloningId(survey.id);
    try {
      const res = await api.post(`/surveys/${survey.id}/clone`);
      toast.success(`Survei "${survey.title}" berhasil diduplikasi.`);
      navigate(`/surveys/${res.data.id}/builder`);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Gagal menduplikasi survei.');
    } finally {
      setCloningId(null);
    }
  }

  // ── Export questionnaire handler ────────────────────────────────────────────
  async function handleExportQuestionnaire(survey) {
    try {
      const res = await api.get(`/surveys/${survey.id}/questions/export`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kuesioner-${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Kuesioner "${survey.title}" berhasil diexport.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal export kuesioner.');
    }
  }

  // ── Format date ─────────────────────────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // ── Filtered surveys ─────────────────────────────────────────────────────────
  const filteredSurveys = surveys.filter((s) => {
    if (searchQuery.trim() && !(s.title || '').toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterType && (s.type || 'lainnya') !== filterType) return false;
    if (filterYear || filterMonth) {
      const date = new Date(s.created_at);
      if (filterYear && date.getFullYear() !== parseInt(filterYear, 10)) return false;
      if (filterMonth && (date.getMonth() + 1) !== parseInt(filterMonth, 10)) return false;
    }
    return true;
  });

  // Get unique years from surveys for the dropdown
  const availableYears = [...new Set(surveys.map((s) => new Date(s.created_at).getFullYear()))].sort((a, b) => b - a);

  // ── Pagination (client-side) ────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredSurveys.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedSurveys = filteredSurveys.slice(pageStart, pageStart + PAGE_SIZE);

  // Reset ke halaman 1 saat filter/pencarian/folder berubah
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterStatus, filterType, filterYear, filterMonth]);

  // Kelompokkan survei (sudah terurut created_at DESC dari server) per Tahun · Bulan
  const surveyGroups = [];
  const groupIndex = {};
  for (const s of pagedSurveys) {
    const d = new Date(s.created_at);
    const key = `${d.getFullYear()} · ${MONTH_NAMES[d.getMonth()]}`;
    if (groupIndex[key] === undefined) {
      groupIndex[key] = surveyGroups.length;
      surveyGroups.push({ key, items: [] });
    }
    surveyGroups[groupIndex[key]].items.push(s);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen Survei</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setExplorerMode((m) => (m === 'folder' ? 'list' : 'folder'))}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${explorerMode === 'folder' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
              aria-pressed={explorerMode === 'folder'}
              title="Tampilan folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              Folder
            </button>
            <ViewToggle viewMode={viewMode} onViewChange={handleViewChange} />
            <a
              href="/panduan-survei.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
              title="Buka panduan membuat survei & menyusun pertanyaan (tab baru)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Panduan
            </a>
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
            >
              Import Kuesioner
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <span aria-hidden="true">+</span> Buat Survei
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul survei…"
              className="w-56 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Cari survei"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Filter status"
          >
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Filter tipe survei"
          >
            <option value="">Semua Tipe</option>
            {SURVEY_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Filter tahun"
          >
            <option value="">Semua Tahun</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label="Filter bulan"
          >
            <option value="">Semua Bulan</option>
            <option value="1">Januari</option>
            <option value="2">Februari</option>
            <option value="3">Maret</option>
            <option value="4">April</option>
            <option value="5">Mei</option>
            <option value="6">Juni</option>
            <option value="7">Juli</option>
            <option value="8">Agustus</option>
            <option value="9">September</option>
            <option value="10">Oktober</option>
            <option value="11">November</option>
            <option value="12">Desember</option>
          </select>
          {(filterYear || filterMonth || filterStatus || filterType || searchQuery) && (
            <button
              onClick={() => { setFilterYear(''); setFilterMonth(''); setFilterStatus(''); setFilterType(''); setSearchQuery(''); }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Reset Filter
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredSurveys.length} dari {surveys.length} survei
          </span>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden flex">
          {explorerMode === 'folder' && (
            <FolderTree
              surveys={surveys}
              selected={{ year: filterYear, month: filterMonth, type: filterType }}
              onSelect={(y, m, t) => { setFilterYear(y); setFilterMonth(m); setFilterType(t); }}
            />
          )}
          <div className="flex-1 min-w-0">
          {loading ? (
            <div
              className="flex items-center justify-center h-48 text-gray-400 text-sm"
              role="status"
              aria-live="polite"
            >
              Memuat daftar survei…
            </div>
          ) : fetchError ? (
            <div
              className="flex flex-col items-center justify-center h-48 gap-3"
              role="alert"
            >
              <p className="text-red-600 text-sm">{fetchError}</p>
              <button
                onClick={fetchSurveys}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                Coba lagi
              </button>
            </div>
          ) : surveys.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Belum ada survei. Klik "Buat Survei" untuk memulai.
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Tidak ada survei yang sesuai filter.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="p-4 space-y-6">
              {surveyGroups.map((g) => (
                <div key={g.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-bold text-gray-700">{g.key}</h3>
                    <span className="text-xs text-gray-400">· {g.items.length} survei</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {g.items.map((survey) => (
                      <SurveyCard
                        key={survey.id}
                        survey={survey}
                        onBuilder={(s) => navigate(`/surveys/${s.id}/builder`)}
                        onClone={handleClone}
                        onActivate={handleActivate}
                        onDeactivate={handleDeactivate}
                        onDelete={handleDelete}
                        cloningId={cloningId}
                        confirmDeleteId={null}
                        onConfirmDelete={() => setDeleteTarget(survey)}
                        onCancelDelete={() => setDeleteTarget(null)}
                        confirmDeactivateId={null}
                        onConfirmDeactivate={() => setDeactivateTarget(survey)}
                        onCancelDeactivate={() => setDeactivateTarget(null)}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-medium text-gray-500">Judul</th>
                    <th className="px-5 py-3 font-medium text-gray-500">Status</th>
                    <th className="px-5 py-3 font-medium text-gray-500">
                      Pertanyaan
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500">
                      Responden
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500">
                      Dibuat
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {surveyGroups.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr className="bg-gray-50/70">
                        <td colSpan={6} className="px-5 py-2 text-xs font-bold text-gray-500">
                          {g.key} <span className="font-normal text-gray-400">· {g.items.length} survei</span>
                        </td>
                      </tr>
                      {g.items.map((survey) => {
                    const canDelete =
                      survey.status === 'draft' &&
                      (survey.response_count ?? 0) === 0;

                    return (
                      <tr
                        key={survey.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Title */}
                        <td className="px-5 py-3 font-medium text-gray-800 max-w-xs">
                          <span
                            className="block truncate"
                            title={survey.title}
                          >
                            {survey.title}
                          </span>
                          <span className="mt-1 inline-block">
                            <SurveyTypeBadge type={survey.type} />
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <SurveyStatusBadge status={survey.status} />
                            <TemporalBadge startDate={survey.start_date} endDate={survey.end_date} />
                          </div>
                        </td>

                        {/* Question Count */}
                        <td className="px-5 py-3 text-gray-600">
                          {survey.question_count ?? 0}
                        </td>

                        {/* Response Count */}
                        <td className="px-5 py-3 text-gray-600">
                          {survey.response_count ?? 0}
                        </td>

                        {/* Created At */}
                        <td className="px-5 py-3 text-gray-500">
                          {formatDate(survey.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Builder */}
                            <IconButton
                              icon="builder"
                              variant="primary"
                              label={`Buka builder survei ${survey.title}`}
                              onClick={() => navigate(`/surveys/${survey.id}/builder`)}
                            />

                            {/* Edit */}
                            <IconButton
                              icon="edit"
                              variant="default"
                              label={`Edit survei ${survey.title}`}
                              onClick={() => setEditTarget(survey)}
                            />

                            {/* Export kuesioner */}
                            {(survey.question_count ?? 0) > 0 && (
                              <IconButton
                                icon="export"
                                variant="success"
                                label={`Export kuesioner ${survey.title}`}
                                onClick={() => handleExportQuestionnaire(survey)}
                              />
                            )}

                            {/* Duplikasi */}
                            <IconButton
                              icon="duplicate"
                              variant="accent"
                              label={cloningId === survey.id ? `Menduplikasi ${survey.title}…` : `Duplikasi survei ${survey.title}`}
                              onClick={() => handleClone(survey)}
                              disabled={cloningId === survey.id}
                            />

                            {/* Aktifkan / Nonaktifkan */}
                            {survey.status === 'draft' && (
                              <IconButton
                                icon="activate"
                                variant="success"
                                label={`Aktifkan survei ${survey.title}`}
                                onClick={() => handleActivate(survey)}
                              />
                            )}

                            {survey.status === 'active' && (
                              <IconButton
                                icon="deactivate"
                                variant="warning"
                                label={`Nonaktifkan survei ${survey.title}`}
                                onClick={() => setDeactivateTarget(survey)}
                              />
                            )}

                            {survey.status === 'inactive' && (
                              <IconButton
                                icon="activate"
                                variant="success"
                                label={`Aktifkan kembali survei ${survey.title}`}
                                onClick={() => handleActivate(survey)}
                              />
                            )}

                            {/* Hapus (hanya draft tanpa respons) */}
                            {canDelete && (
                              <IconButton
                                icon="trash"
                                variant="danger"
                                label={`Hapus survei ${survey.title}`}
                                onClick={() => setDeleteTarget(survey)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>

        {/* Pagination */}
        {!loading && !fetchError && filteredSurveys.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-500">
              Menampilkan {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredSurveys.length)} dari {filteredSurveys.length} survei
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Halaman sebelumnya"
              >
                Sebelumnya
              </button>
              <span className="text-sm text-gray-600" aria-live="polite">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Halaman berikutnya"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Konfirmasi hapus survei */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus survei?"
        description={
          deleteTarget ? (
            <>
              Survei <span className="font-semibold">"{deleteTarget.title}"</span> akan dihapus permanen.
              Tindakan ini tidak dapat dibatalkan.
            </>
          ) : null
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        tone="danger"
        loading={confirmLoading}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Konfirmasi nonaktifkan survei */}
      <ConfirmDialog
        open={!!deactivateTarget}
        title="Nonaktifkan survei?"
        description={
          deactivateTarget ? (
            <>
              Survei <span className="font-semibold">"{deactivateTarget.title}"</span> akan dinonaktifkan
              dan tidak lagi dapat diisi oleh surveyor. Anda dapat mengaktifkannya kembali nanti.
            </>
          ) : null
        }
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        tone="danger"
        loading={confirmLoading}
        onConfirm={() => deactivateTarget && handleDeactivate(deactivateTarget)}
        onCancel={() => setDeactivateTarget(null)}
      />

      {/* Create Survey Modal */}
      {showCreateModal && (
        <CreateSurveyModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            toast.success('Survei baru berhasil dibuat.');
            fetchSurveys();
          }}
        />
      )}

      {/* Edit Survey Modal */}
      {editTarget && (
        <EditSurveyModal
          survey={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            toast.success('Survei berhasil diperbarui.');
            fetchSurveys();
          }}
        />
      )}

      {/* Import Questionnaire Modal */}
      {showImportModal && (
        <ImportQuestionnaireModal
          surveys={surveys}
          onClose={() => setShowImportModal(false)}
          onSuccess={(msg) => {
            setShowImportModal(false);
            toast.success(msg || 'Kuesioner berhasil diimport.');
            fetchSurveys();
          }}
        />
      )}
    </Layout>
  );
}

export default Surveys;
