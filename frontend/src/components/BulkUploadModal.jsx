import React, { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import useModalA11y from '../hooks/useModalA11y';

/**
 * Generate and download a CSV template for bulk TPD upload.
 * Columns: nama, email, password
 */
function downloadTemplate() {
  const header = 'nama,email,password';
  const example = 'John Doe,john@example.com,Password123';
  const content = `${header}\n${example}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template_upload_tpd.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Modal dialog for bulk uploading TPD via CSV/Excel file.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }} props
 */
function BulkUploadModal({ open, onClose, onSuccess }) {
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

  function reset() {
    setFile(null);
    setUploading(false);
    setErrors([]);
    setResult(null);
    setGeneralError(null);
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
    if (!file) return;

    setUploading(true);
    setErrors([]);
    setResult(null);
    setGeneralError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/surveyors/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onSuccess();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors && Array.isArray(data.errors)) {
        setErrors(data.errors);
      } else {
        setGeneralError(
          data?.error || data?.message || err.message || 'Terjadi kesalahan saat upload.'
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
      aria-labelledby="bulk-upload-modal-title"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6"
      >
        <h2
          id="bulk-upload-modal-title"
          className="text-lg font-semibold text-gray-800 mb-4"
        >
          Upload TPD Massal
        </h2>

        {/* Success state */}
        {result && (
          <div className="space-y-4">
            <div
              className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">Upload berhasil!</p>
              <p className="mt-1">
                {result.created_count} TPD berhasil dibuat.
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
              Upload file CSV (.csv) atau Excel (.xlsx) berisi data TPD.
              Maksimal 500 baris per file.
            </p>

            {/* Download template */}
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-300 rounded"
            >
              Download template CSV
            </button>

            {/* File input */}
            <div>
              <label
                htmlFor="bulk-upload-file"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Pilih file
              </label>
              <input
                id="bulk-upload-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 focus:outline-none"
                aria-describedby="bulk-upload-file-hint"
              />
              <p id="bulk-upload-file-hint" className="mt-1 text-xs text-gray-400">
                Format: CSV atau Excel (.xlsx). Kolom: nama, email, password
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
                disabled={!file || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {uploading ? 'Mengupload…' : 'Upload'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkUploadModal;
