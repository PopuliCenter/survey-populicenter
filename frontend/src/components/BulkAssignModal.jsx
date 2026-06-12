import React, { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import useModalA11y from '../hooks/useModalA11y';

/**
 * Generate and download a CSV template for bulk TPD assignment.
 * Columns: email_surveyor, kuota
 */
function downloadTemplate() {
  const header = 'email_surveyor,kuota';
  const example = 'john@example.com,50';
  const content = `${header}\n${example}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template_penugasan_tpd.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Modal dialog for bulk assigning TPD to a survey with quotas via CSV/Excel file.
 *
 * @param {{
 *   open: boolean,
 *   surveyId: string | null,
 *   surveyTitle?: string,
 *   surveys?: Array<{ id: string, title: string }>,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }} props
 */
function BulkAssignModal({ open, surveyId: propSurveyId, surveyTitle, surveys, onClose, onSuccess }) {
  const [selectedSurveyId, setSelectedSurveyId] = useState(propSurveyId || '');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [result, setResult] = useState(null);
  const [generalError, setGeneralError] = useState(null);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const stableClose = useCallback(() => closeRef.current?.(), []);
  useModalA11y(open, stableClose, dialogRef);

  // Use prop surveyId if provided, otherwise use selected from dropdown
  const activeSurveyId = propSurveyId || selectedSurveyId;

  function reset() {
    setFile(null);
    setUploading(false);
    setErrors([]);
    setResult(null);
    setGeneralError(null);
    if (!propSurveyId) setSelectedSurveyId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setErrors([]);
    setResult(null);
    setGeneralError(null);
  }

  async function handleUpload() {
    if (!file || !activeSurveyId) return;

    setUploading(true);
    setErrors([]);
    setResult(null);
    setGeneralError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(
        `/surveyors/bulk-assign/${activeSurveyId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(res.data);
      onSuccess();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors && Array.isArray(data.errors)) {
        setErrors(data.errors);
      } else {
        setGeneralError(
          data?.error || data?.message || err.message || 'Terjadi kesalahan saat upload penugasan.'
        );
      }
    } finally {
      setUploading(false);
    }
  }

  closeRef.current = handleClose;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-assign-modal-title"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6"
      >
        <h2
          id="bulk-assign-modal-title"
          className="text-lg font-semibold text-gray-800 mb-4"
        >
          Upload Penugasan TPD
        </h2>

        {/* Success state */}
        {result && (
          <div className="space-y-4">
            <div
              className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">Penugasan berhasil!</p>
              <p className="mt-1">
                {result.assigned_count} TPD berhasil ditugaskan.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Upload form */}
        {!result && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload file CSV (.csv) atau Excel (.xlsx) berisi penugasan TPD beserta kuota.
            </p>

            {/* Survey selector — only shown when surveyId is not provided via prop */}
            {!propSurveyId && surveys && surveys.length > 0 && (
              <div>
                <label
                  htmlFor="bulk-assign-survey"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Pilih Survei <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <select
                  id="bulk-assign-survey"
                  value={selectedSurveyId}
                  onChange={(e) => setSelectedSurveyId(e.target.value)}
                  disabled={uploading}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                >
                  <option value="">— Pilih survei —</option>
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Show selected survey title when provided via prop */}
            {propSurveyId && surveyTitle && (
              <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-2 text-sm text-primary-700">
                Survei: <span className="font-medium">{surveyTitle}</span>
              </div>
            )}

            {/* Download template */}
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 underline focus:outline-none focus:ring-2 focus:ring-primary-300 rounded"
            >
              Download template CSV
            </button>

            {/* File input */}
            <div>
              <label
                htmlFor="bulk-assign-file"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Pilih file
              </label>
              <input
                id="bulk-assign-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 focus:outline-none"
                aria-describedby="bulk-assign-file-hint"
              />
              <p id="bulk-assign-file-hint" className="mt-1 text-xs text-gray-400">
                Format: CSV atau Excel (.xlsx). Kolom: email_surveyor, kuota
              </p>
            </div>

            {/* General error */}
            {generalError && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"
                role="alert"
              >
                {generalError}
              </div>
            )}

            {/* Row-level errors */}
            {errors.length > 0 && (
              <div
                className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"
                role="alert"
              >
                <p className="text-sm font-medium text-red-700 mb-2">
                  Ditemukan {errors.length} error. Tidak ada data yang disimpan.
                </p>
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {errors.map((err, idx) => (
                    <li key={idx} className="text-xs text-red-600">
                      <span className="font-medium">Baris {err.row}:</span>{' '}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || !activeSurveyId || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {uploading ? 'Mengupload…' : 'Upload Penugasan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkAssignModal;
