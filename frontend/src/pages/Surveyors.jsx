import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, QuotaPanel } from '../components/SurveyorBadges';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import SurveyorCard from '../components/SurveyorCard';
import BulkUploadModal from '../components/BulkUploadModal';
import BulkAssignModal from '../components/BulkAssignModal';
import api from '../services/api';

// ─── Password Validation ──────────────────────────────────────────────────────
/**
 * Validates a password against the platform rules:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @param {string} password
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) {
    errors.push('Minimal 8 karakter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Minimal satu huruf besar');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Minimal satu huruf kecil');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Minimal satu angka');
  }
  return { valid: errors.length === 0, errors };
}

// ─── Surveyor Form Modal ──────────────────────────────────────────────────────
/**
 * Modal form for creating or editing a surveyor account.
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: object | null,
 *   onClose: () => void,
 *   onSaved: () => void,
 * }} props
 */
function SurveyorFormModal({ mode, initial, onClose, onSaved, surveys }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [surveyId, setSurveyId] = useState('');
  const [quota, setQuota] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = mode === 'edit';

  function validate() {
    const errors = {};
    if (!name.trim()) errors.name = 'Nama wajib diisi';
    if (!email.trim()) {
      errors.email = 'Email wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Format email tidak valid';
    }

    if (!isEdit) {
      // Password required for create
      if (!password) {
        errors.password = 'Password wajib diisi';
      } else {
        const { valid, errors: pwErrors } = validatePassword(password);
        if (!valid) errors.password = pwErrors.join(', ');
      }
    } else if (password) {
      // Password optional for edit — validate only if filled
      const { valid, errors: pwErrors } = validatePassword(password);
      if (!valid) errors.password = pwErrors.join(', ');
    }

    // Quota validation (when a survey is selected)
    if (surveyId) {
      const q = Number(quota);
      if (!quota || !Number.isInteger(q) || q <= 0) {
        errors.quota = 'Kuota harus berupa bilangan bulat positif lebih dari 0';
      }
    }

    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const payload = { name: name.trim(), email: email.trim() };
    if (!isEdit || password) payload.password = password;
    if (!isEdit && surveyId) {
      payload.survey_id = surveyId;
      payload.quota = Number(quota);
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/surveyors/${initial.id}`, payload);
        // If survey + quota selected in edit mode, assign quota separately
        if (surveyId && quota) {
          await api.post(`/surveyors/${initial.id}/quota`, {
            survey_id: surveyId,
            quota: Number(quota),
          });
        }
      } else {
        await api.post('/surveyors', payload);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Terjadi kesalahan. Silakan coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="surveyor-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2
          id="surveyor-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          {isEdit ? 'Edit Surveyor' : 'Tambah Surveyor Baru'}
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
          {/* Name */}
          <div>
            <label
              htmlFor="surveyor-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nama <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="surveyor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.name ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="name"
              aria-describedby={fieldErrors.name ? 'surveyor-name-error' : undefined}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p id="surveyor-name-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="surveyor-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="surveyor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.email ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="email"
              aria-describedby={fieldErrors.email ? 'surveyor-email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p id="surveyor-email-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="surveyor-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password{' '}
              {!isEdit && (
                <span aria-hidden="true" className="text-red-500">*</span>
              )}
              {isEdit && (
                <span className="text-gray-400 font-normal text-xs ml-1">
                  (kosongkan jika tidak ingin mengubah)
                </span>
              )}
            </label>
            <input
              id="surveyor-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.password ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="new-password"
              aria-describedby="surveyor-password-hint surveyor-password-error"
              aria-invalid={!!fieldErrors.password}
            />
            <p id="surveyor-password-hint" className="mt-1 text-xs text-gray-400">
              Min. 8 karakter, huruf besar, huruf kecil, dan angka
            </p>
            {fieldErrors.password && (
              <p id="surveyor-password-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Survey + Quota (for create and edit mode) */}
          <div>
            <label
              htmlFor="surveyor-survey"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tugaskan ke Survei{' '}
              <span className="text-gray-400 font-normal text-xs ml-1">
                (opsional)
              </span>
            </label>
            <select
              id="surveyor-survey"
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="">— Pilih survei —</option>
              {(surveys || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-gray-400">
                Pilih survei untuk menambah/memperbarui kuota surveyor ini
              </p>
            )}
          </div>

          {surveyId && (
            <div>
              <label
                htmlFor="surveyor-quota"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Kuota <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="surveyor-quota"
                type="number"
                min="1"
                step="1"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="Contoh: 10"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  fieldErrors.quota ? 'border-red-400' : 'border-gray-300'
                }`}
                aria-describedby={fieldErrors.quota ? 'surveyor-quota-error' : 'surveyor-quota-hint'}
                aria-invalid={!!fieldErrors.quota}
              />
              <p id="surveyor-quota-hint" className="mt-1 text-xs text-gray-400">
                Jumlah maksimum kuesioner yang boleh diisi surveyor untuk survei ini
              </p>
              {fieldErrors.quota && (
                <p id="surveyor-quota-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.quota}
                </p>
              )}
            </div>
          )}

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
              {submitting
                ? 'Menyimpan…'
                : isEdit
                ? 'Simpan Perubahan'
                : 'Buat Surveyor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Surveyors Page ───────────────────────────────────────────────────────────
/**
 * Surveyor management page.
 *
 * Features:
 * - Table listing all surveyors: Name, Email, Status badge, Response Count, Joined Date
 * - "Tambah Surveyor" button opens a create modal
 * - Edit button per row opens an edit modal
 * - Deactivate/Activate toggle button per row (with inline confirmation for deactivate)
 * - Delete button per row (admin only) with inline confirmation
 * - Expandable quota summary per surveyor via "Lihat Kuota" button
 */
function Surveyors() {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const [viewMode, handleViewChange] = useViewMode('surveyors_view_mode');
  const [surveyors, setSurveyors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);

  // Inline deactivate confirmation state: stores the surveyor id being confirmed
  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  // Inline delete confirmation state: stores the surveyor id being confirmed for deletion
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Expanded quota panel: stores the surveyor id whose quota panel is open
  const [expandedQuotaId, setExpandedQuotaId] = useState(null);

  // Bulk upload / assign modal state
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [surveys, setSurveys] = useState([]);

  // Filter state
  const [filterName, setFilterName] = useState('');
  const [filterSurveyId, setFilterSurveyId] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  // ── Fetch surveys (for bulk assign dropdown) ────────────────────────────────
  const fetchSurveys = useCallback(async () => {
    try {
      const res = await api.get('/surveys');
      setSurveys(res.data);
    } catch {
      // Non-critical — the dropdown will just be empty
    }
  }, []);

  // ── Fetch surveyors ─────────────────────────────────────────────────────────
  const fetchSurveyors = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/surveyors');
      setSurveyors(res.data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat daftar surveyor.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveyors();
    fetchSurveys();
  }, [fetchSurveyors, fetchSurveys]);

  // ── Auto-dismiss success message ────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Deactivate handler ──────────────────────────────────────────────────────
  async function handleDeactivate(surveyor) {
    setActionError(null);
    try {
      await api.patch(`/surveyors/${surveyor.id}/deactivate`);
      setSuccessMsg(`Akun "${surveyor.name}" berhasil dinonaktifkan.`);
      setConfirmDeactivateId(null);
      fetchSurveyors();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan surveyor.'
      );
      setConfirmDeactivateId(null);
    }
  }

  // ── Activate handler ────────────────────────────────────────────────────────
  async function handleActivate(surveyor) {
    setActionError(null);
    try {
      await api.patch(`/surveyors/${surveyor.id}/activate`);
      setSuccessMsg(`Akun "${surveyor.name}" berhasil diaktifkan kembali.`);
      fetchSurveyors();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal mengaktifkan surveyor.'
      );
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────
  async function handleDeleteSurveyor(surveyor) {
    setActionError(null);
    try {
      await api.delete(`/surveyors/${surveyor.id}`);
      setSuccessMsg(`Akun "${surveyor.name}" berhasil dihapus.`);
      setConfirmDeleteId(null);
      fetchSurveyors();
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Gagal menghapus surveyor.'
      );
      setConfirmDeleteId(null);
    }
  }

  // ── Toggle quota panel ──────────────────────────────────────────────────────
  function toggleQuotaPanel(surveyorId) {
    setExpandedQuotaId((prev) => (prev === surveyorId ? null : surveyorId));
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

  // ── Filtered surveyors ────────────────────────────────────────────────────────
  const filteredSurveyors = surveyors.filter((s) => {
    if (filterName && !s.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterSurveyId && Array.isArray(s.quotas)) {
      const hasSurvey = s.quotas.some((q) => q.survey_id === filterSurveyId);
      if (!hasSurvey) return false;
    }
    if (filterYear || filterMonth) {
      const date = new Date(s.created_at);
      if (filterYear && date.getFullYear() !== parseInt(filterYear, 10)) return false;
      if (filterMonth && (date.getMonth() + 1) !== parseInt(filterMonth, 10)) return false;
    }
    return true;
  });

  // Get unique years from surveyors for the dropdown
  const availableYears = [...new Set(surveyors.map((s) => new Date(s.created_at).getFullYear()))].sort((a, b) => b - a);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen Surveyor</h1>
          <div className="flex items-center gap-2">
            <ViewToggle viewMode={viewMode} onViewChange={handleViewChange} />
            <button
              onClick={() => setBulkAssignOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              Upload Penugasan
            </button>
            <button
              onClick={() => setBulkUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
            >
              Upload Surveyor
            </button>
            <button
              onClick={() => {
                setEditTarget(null);
                setModalMode('create');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <span aria-hidden="true">+</span> Tambah Surveyor
            </button>
          </div>
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

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Cari nama surveyor…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
            aria-label="Cari nama surveyor"
          />
          <select
            value={filterSurveyId}
            onChange={(e) => setFilterSurveyId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Filter berdasarkan survei"
          >
            <option value="">Semua Survei</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Filter tahun bergabung"
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
            aria-label="Filter bulan bergabung"
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
          {(filterName || filterSurveyId || filterYear || filterMonth) && (
            <button
              onClick={() => { setFilterName(''); setFilterSurveyId(''); setFilterYear(''); setFilterMonth(''); }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Reset Filter
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredSurveyors.length} dari {surveyors.length} surveyor
          </span>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div
              className="flex items-center justify-center h-48 text-gray-400 text-sm"
              role="status"
              aria-live="polite"
            >
              Memuat daftar surveyor…
            </div>
          ) : fetchError ? (
            <div
              className="flex flex-col items-center justify-center h-48 gap-3"
              role="alert"
            >
              <p className="text-red-600 text-sm">{fetchError}</p>
              <button
                onClick={fetchSurveyors}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Coba lagi
              </button>
            </div>
          ) : surveyors.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Belum ada data surveyor.
            </div>
          ) : filteredSurveyors.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Tidak ada surveyor yang sesuai filter.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filteredSurveyors.map((surveyor) => (
                <SurveyorCard
                  key={surveyor.id}
                  surveyor={surveyor}
                  currentUser={currentUser}
                  onEdit={(s) => { setEditTarget(s); setModalMode('edit'); }}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  onDelete={handleDeleteSurveyor}
                  confirmDeactivateId={confirmDeactivateId}
                  onConfirmDeactivate={(id) => setConfirmDeactivateId(id)}
                  onCancelDeactivate={() => setConfirmDeactivateId(null)}
                  confirmDeleteId={confirmDeleteId}
                  onConfirmDelete={(id) => setConfirmDeleteId(id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  expandedQuotaId={expandedQuotaId}
                  onToggleQuota={toggleQuotaPanel}
                  formatDate={formatDate}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-medium text-gray-500">Nama</th>
                    <th className="px-5 py-3 font-medium text-gray-500">Email</th>
                    <th className="px-5 py-3 font-medium text-gray-500">Status</th>
                    <th className="px-5 py-3 font-medium text-gray-500">
                      Jumlah Responden
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500">
                      Tanggal Bergabung
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSurveyors.map((surveyor) => {
                    const isConfirming = confirmDeactivateId === surveyor.id;
                    const isQuotaExpanded = expandedQuotaId === surveyor.id;

                    return (
                      <React.Fragment key={surveyor.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          {/* Name */}
                          <td className="px-5 py-3 font-medium text-gray-800">
                            {surveyor.name}
                          </td>

                          {/* Email */}
                          <td className="px-5 py-3 text-gray-600">
                            {surveyor.email}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3">
                            <StatusBadge isActive={surveyor.is_active} />
                          </td>

                          {/* Response Count */}
                          <td className="px-5 py-3 text-gray-600">
                            {surveyor.response_count ?? 0}
                          </td>

                          {/* Joined Date */}
                          <td className="px-5 py-3 text-gray-500">
                            {formatDate(surveyor.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Lihat Kuota button */}
                              <button
                                onClick={() => toggleQuotaPanel(surveyor.id)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                                  isQuotaExpanded
                                    ? 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200'
                                    : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                }`}
                                aria-expanded={isQuotaExpanded}
                                aria-label={`${isQuotaExpanded ? 'Sembunyikan' : 'Lihat'} kuota ${surveyor.name}`}
                              >
                                {isQuotaExpanded ? 'Sembunyikan Kuota' : 'Lihat Kuota'}
                              </button>

                              {/* Edit button */}
                              <button
                                onClick={() => {
                                  setEditTarget(surveyor);
                                  setModalMode('edit');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                                aria-label={`Edit surveyor ${surveyor.name}`}
                              >
                                Edit
                              </button>

                              {/* Deactivate / Activate toggle */}
                              {surveyor.is_active ? (
                                <>
                                  {isConfirming ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">
                                        Nonaktifkan?
                                      </span>
                                      <button
                                        onClick={() => handleDeactivate(surveyor)}
                                        className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                        aria-label={`Konfirmasi nonaktifkan ${surveyor.name}`}
                                      >
                                        Ya
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeactivateId(null)}
                                        className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                                        aria-label="Batal nonaktifkan"
                                      >
                                        Batal
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setConfirmDeactivateId(surveyor.id)
                                      }
                                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                      aria-label={`Nonaktifkan surveyor ${surveyor.name}`}
                                    >
                                      Nonaktifkan
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button
                                  onClick={() => handleActivate(surveyor)}
                                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                                  aria-label={`Aktifkan kembali surveyor ${surveyor.name}`}
                                >
                                  Aktifkan
                                </button>
                              )}

                              {/* Delete button — only for admin role */}
                              {currentUser.role === 'admin' && (
                                <>
                                  {confirmDeleteId === surveyor.id ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">Hapus permanen?</span>
                                      <button
                                        onClick={() => handleDeleteSurveyor(surveyor)}
                                        className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                        aria-label={`Konfirmasi hapus ${surveyor.name}`}
                                      >
                                        Ya, Hapus
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
                                      onClick={() => setConfirmDeleteId(surveyor.id)}
                                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                      aria-label={`Hapus surveyor ${surveyor.name}`}
                                    >
                                      Hapus
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable quota panel row */}
                        {isQuotaExpanded && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <QuotaPanel surveyorId={surveyor.id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalMode && (
        <SurveyorFormModal
          mode={modalMode}
          initial={editTarget}
          surveys={surveys}
          onClose={() => {
            setModalMode(null);
            setEditTarget(null);
          }}
          onSaved={() => {
            setModalMode(null);
            setEditTarget(null);
            setSuccessMsg(
              modalMode === 'edit'
                ? 'Data surveyor berhasil diperbarui.'
                : 'Surveyor baru berhasil dibuat.'
            );
            fetchSurveyors();
          }}
        />
      )}

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          setSuccessMsg('Surveyor berhasil diupload secara massal.');
          fetchSurveyors();
        }}
      />

      {/* Bulk Assign Modal */}
      <BulkAssignModal
        open={bulkAssignOpen}
        surveys={surveys}
        onClose={() => setBulkAssignOpen(false)}
        onSuccess={() => {
          setSuccessMsg('Penugasan surveyor berhasil diupload.');
          fetchSurveyors();
        }}
      />
    </Layout>
  );
}

export default Surveyors;
