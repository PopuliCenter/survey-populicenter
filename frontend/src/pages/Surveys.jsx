import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { SurveyStatusBadge, TemporalBadge } from '../components/SurveyBadges';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import SurveyCard from '../components/SurveyCard';
import api from '../services/api';

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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [titleError, setTitleError] = useState('');
  const [dateError, setDateError] = useState('');

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
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
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
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                  className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setFormError('Judul wajib diisi'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.put(`/surveys/${survey.id}`, {
        title: title.trim(),
        description: description.trim() || null,
      });
      onSaved();
    } catch (err) {
      setFormError(err.response?.data?.error || err.response?.data?.message || 'Gagal menyimpan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-5">Edit Survei</h2>
        {formError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{formError}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
              Judul <span className="text-red-500">*</span>
            </label>
            <input id="edit-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" autoFocus />
          </div>
          <div>
            <label htmlFor="edit-desc" className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Import Questionnaire Modal ───────────────────────────────────────────────
function ImportQuestionnaireModal({ surveys, onClose, onSuccess }) {
  const [targetSurveyId, setTargetSurveyId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = React.useRef(null);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f);
    setPreview(null);
    setError(null);
    if (!f) return;

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Import Kuesioner</h2>

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Survei Tujuan <span className="text-red-500">*</span></label>
            <select value={targetSurveyId} onChange={(e) => setTargetSurveyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Pilih survei —</option>
              {surveys.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.status})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File JSON Kuesioner</label>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <p className="mt-1 text-xs text-gray-400">Upload file .json hasil export kuesioner</p>
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
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
  const [viewMode, handleViewChange] = useViewMode('surveys_view_mode');
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Inline confirmation states
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  // Clone state
  const [cloningId, setCloningId] = useState(null);

  // Filter state
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

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

  // ── Auto-dismiss success message ────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Activate handler ────────────────────────────────────────────────────────
  async function handleActivate(survey) {
    setActionError(null);
    try {
      await api.patch(`/surveys/${survey.id}/activate`);
      setSuccessMsg(`Survei "${survey.title}" berhasil diaktifkan.`);
      fetchSurveys();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal mengaktifkan survei.'
      );
    }
  }

  // ── Deactivate handler ──────────────────────────────────────────────────────
  async function handleDeactivate(survey) {
    setActionError(null);
    try {
      await api.patch(`/surveys/${survey.id}/deactivate`);
      setSuccessMsg(`Survei "${survey.title}" berhasil dinonaktifkan.`);
      setConfirmDeactivateId(null);
      fetchSurveys();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan survei.'
      );
      setConfirmDeactivateId(null);
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────
  async function handleDelete(survey) {
    setActionError(null);
    try {
      await api.delete(`/surveys/${survey.id}`);
      setSuccessMsg(`Survei "${survey.title}" berhasil dihapus.`);
      setConfirmDeleteId(null);
      fetchSurveys();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menghapus survei.'
      );
      setConfirmDeleteId(null);
    }
  }

  // ── Clone handler ────────────────────────────────────────────────────────────
  async function handleClone(survey) {
    setCloningId(survey.id);
    setActionError(null);
    try {
      const res = await api.post(`/surveys/${survey.id}/clone`);
      setSuccessMsg(`Survei "${survey.title}" berhasil diduplikasi.`);
      navigate(`/surveys/${res.data.id}/builder`);
    } catch (err) {
      setActionError(err.response?.data?.error || err.message || 'Gagal menduplikasi survei.');
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
      setSuccessMsg(`Kuesioner "${survey.title}" berhasil diexport.`);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Gagal export kuesioner.');
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
    if (!filterYear && !filterMonth) return true;
    const date = new Date(s.created_at);
    if (filterYear && date.getFullYear() !== parseInt(filterYear, 10)) return false;
    if (filterMonth && (date.getMonth() + 1) !== parseInt(filterMonth, 10)) return false;
    return true;
  });

  // Get unique years from surveys for the dropdown
  const availableYears = [...new Set(surveys.map((s) => new Date(s.created_at).getFullYear()))].sort((a, b) => b - a);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen Survei</h1>
          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} onViewChange={handleViewChange} />
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
            >
              Import Kuesioner
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <span aria-hidden="true">+</span> Buat Survei
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          {(filterYear || filterMonth) && (
            <button
              onClick={() => { setFilterYear(''); setFilterMonth(''); }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Reset Filter
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredSurveys.length} dari {surveys.length} survei
          </span>
        </div>

        {/* Success message */}
        {successMsg && (
          <div
            className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm"
            role="status"
            aria-live="polite"
          >
            {successMsg}
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"
            role="alert"
          >
            {actionError}
            <button
              className="ml-3 underline text-red-600 hover:text-red-800 text-xs"
              onClick={() => setActionError(null)}
            >
              Tutup
            </button>
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
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
                className="text-sm text-blue-600 underline hover:text-blue-800"
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filteredSurveys.map((survey) => (
                <SurveyCard
                  key={survey.id}
                  survey={survey}
                  onBuilder={(s) => navigate(`/surveys/${s.id}/builder`)}
                  onClone={handleClone}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  onDelete={handleDelete}
                  cloningId={cloningId}
                  confirmDeleteId={confirmDeleteId}
                  onConfirmDelete={(id) => setConfirmDeleteId(id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  confirmDeactivateId={confirmDeactivateId}
                  onConfirmDeactivate={(id) => setConfirmDeactivateId(id)}
                  onCancelDeactivate={() => setConfirmDeactivateId(null)}
                  formatDate={formatDate}
                />
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
                  {filteredSurveys.map((survey) => {
                    const isConfirmingDelete = confirmDeleteId === survey.id;
                    const isConfirmingDeactivate =
                      confirmDeactivateId === survey.id;
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
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {/* Builder button */}
                            <button
                              onClick={() => navigate(`/surveys/${survey.id}/builder`)}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                              aria-label={`Buka builder untuk survei ${survey.title}`}
                            >
                              Builder
                            </button>

                            {/* Edit button */}
                            <button
                              onClick={() => setEditTarget(survey)}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                              aria-label={`Edit survei ${survey.title}`}
                            >
                              Edit
                            </button>

                            {/* Export questionnaire */}
                            {(survey.question_count ?? 0) > 0 && (
                              <button
                                onClick={() => handleExportQuestionnaire(survey)}
                                className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                                aria-label={`Export kuesioner ${survey.title}`}
                              >
                                Export
                              </button>
                            )}

                            {/* Duplikasi button */}
                            <button
                              onClick={() => handleClone(survey)}
                              disabled={cloningId === survey.id}
                              className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300"
                              aria-label={`Duplikasi survei ${survey.title}`}
                            >
                              {cloningId === survey.id ? 'Menduplikasi…' : 'Duplikasi'}
                            </button>

                            {/* Activate / Deactivate toggle */}
                            {survey.status === 'draft' && (
                              <button
                                onClick={() => handleActivate(survey)}
                                className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                                aria-label={`Aktifkan survei ${survey.title}`}
                              >
                                Aktifkan
                              </button>
                            )}

                            {survey.status === 'active' && (
                              <>
                                {isConfirmingDeactivate ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-600">
                                      Nonaktifkan?
                                    </span>
                                    <button
                                      onClick={() => handleDeactivate(survey)}
                                      className="px-2.5 py-1 text-xs font-medium text-white bg-yellow-500 hover:bg-yellow-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300"
                                      aria-label={`Konfirmasi nonaktifkan ${survey.title}`}
                                    >
                                      Ya
                                    </button>
                                    <button
                                      onClick={() =>
                                        setConfirmDeactivateId(null)
                                      }
                                      className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                                      aria-label="Batal nonaktifkan"
                                    >
                                      Batal
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setConfirmDeactivateId(survey.id)
                                    }
                                    className="px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300"
                                    aria-label={`Nonaktifkan survei ${survey.title}`}
                                  >
                                    Nonaktifkan
                                  </button>
                                )}
                              </>
                            )}

                            {survey.status === 'inactive' && (
                              <button
                                onClick={() => handleActivate(survey)}
                                className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                                aria-label={`Aktifkan kembali survei ${survey.title}`}
                              >
                                Aktifkan
                              </button>
                            )}

                            {/* Delete (only draft with no responses) */}
                            {canDelete && (
                              <>
                                {isConfirmingDelete ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-600">
                                      Hapus?
                                    </span>
                                    <button
                                      onClick={() => handleDelete(survey)}
                                      className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                      aria-label={`Konfirmasi hapus ${survey.title}`}
                                    >
                                      Ya
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                                      aria-label="Batal hapus"
                                    >
                                      Batal
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setConfirmDeleteId(survey.id)
                                    }
                                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                    aria-label={`Hapus survei ${survey.title}`}
                                  >
                                    Hapus
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Survey Modal */}
      {showCreateModal && (
        <CreateSurveyModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            setSuccessMsg('Survei baru berhasil dibuat.');
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
            setSuccessMsg('Survei berhasil diperbarui.');
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
            setSuccessMsg(msg);
            fetchSurveys();
          }}
        />
      )}
    </Layout>
  );
}

export default Surveys;
