import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, QuotaPanel } from '../components/SurveyorBadges';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import SurveyorCard from '../components/SurveyorCard';
import BulkUploadModal from '../components/BulkUploadModal';
import BulkAssignModal from '../components/BulkAssignModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import useModalA11y from '../hooks/useModalA11y';
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

// ─── TPD Form Modal ──────────────────────────────────────────────────────
/**
 * Modal form for creating or editing a TPD account.
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: object | null,
 *   onClose: () => void,
 *   onSaved: () => void,
 * }} props
 */
function TPDFormModal({ mode, initial, onClose, onSaved, surveys }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [surveyId, setSurveyId] = useState('');
  const [quota, setQuota] = useState('');
  // Fitur #1: nomor kuesioner yang ditugaskan ke surveyor
  const [assignedNumbersText, setAssignedNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = mode === 'edit';

  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  // Parse assigned numbers dari textarea (satu per baris atau koma-separated)
  function parseAssignedNumbers(text) {
    if (!text.trim()) return null;
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function validate() {
    const errors = {};
    if (!name.trim()) errors.name = 'Nama wajib diisi';
    if (!email.trim()) {
      errors.email = 'Email wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Format email tidak valid';
    }

    if (!isEdit) {
      if (!password) {
        errors.password = 'Password wajib diisi';
      } else {
        const { valid, errors: pwErrors } = validatePassword(password);
        if (!valid) errors.password = pwErrors.join(', ');
      }
    } else if (password) {
      const { valid, errors: pwErrors } = validatePassword(password);
      if (!valid) errors.password = pwErrors.join(', ');
    }

    if (surveyId) {
      const q = Number(quota);
      if (!quota || !Number.isInteger(q) || q <= 0) {
        errors.quota = 'Kuota harus berupa bilangan bulat positif lebih dari 0';
      }
      // Validasi nomor kuesioner jika diisi
      if (assignedNumbersText.trim()) {
        const nums = parseAssignedNumbers(assignedNumbersText);
        if (nums) {
          const unique = new Set(nums);
          if (unique.size !== nums.length) {
            errors.assignedNumbers = 'Nomor kuesioner tidak boleh duplikat';
          }
        }
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
      let surveyorId;
      if (isEdit) {
        await api.put(`/surveyors/${initial.id}`, payload);
        surveyorId = initial.id;
        if (surveyId && quota) {
          const assignedNums = parseAssignedNumbers(assignedNumbersText);
          await api.post(`/surveyors/${initial.id}/quota`, {
            survey_id: surveyId,
            quota: Number(quota),
            assigned_numbers: assignedNums,
          });
        }
      } else {
        const res = await api.post('/surveyors', payload);
        surveyorId = res.data.id;
        // Jika ada nomor kuesioner yang ditugaskan, update quota record
        if (surveyId && assignedNumbersText.trim()) {
          const assignedNums = parseAssignedNumbers(assignedNumbersText);
          await api.post(`/surveyors/${surveyorId}/quota`, {
            survey_id: surveyId,
            quota: Number(quota),
            assigned_numbers: assignedNums,
          });
        }
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpd-modal-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 focus:outline-none"
      >
        <h2
          id="tpd-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          {isEdit ? 'Edit TPD' : 'Tambah TPD Baru'}
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
            <label htmlFor="tpd-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nama <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="tpd-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${fieldErrors.name ? 'border-red-400' : 'border-gray-300'}`}
              autoComplete="name"
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="tpd-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="tpd-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${fieldErrors.email ? 'border-red-400' : 'border-gray-300'}`}
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="tpd-password" className="block text-sm font-medium text-gray-700 mb-1">
              Password{' '}
              {!isEdit && <span aria-hidden="true" className="text-red-500">*</span>}
              {isEdit && <span className="text-gray-400 font-normal text-xs ml-1">(kosongkan jika tidak ingin mengubah)</span>}
            </label>
            <input
              id="tpd-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${fieldErrors.password ? 'border-red-400' : 'border-gray-300'}`}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
            />
            <p className="mt-1 text-xs text-gray-400">Min. 8 karakter, huruf besar, huruf kecil, dan angka</p>
            {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
          </div>

          {/* Survey selector */}
          <div>
            <label htmlFor="tpd-survey" className="block text-sm font-medium text-gray-700 mb-1">
              Tugaskan ke Survei{' '}
              <span className="text-gray-400 font-normal text-xs ml-1">(opsional)</span>
            </label>
            <select
              id="tpd-survey"
              value={surveyId}
              onChange={(e) => { setSurveyId(e.target.value); setAssignedNumbersText(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="">— Pilih survei —</option>
              {(surveys || []).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-gray-400">Pilih survei untuk menambah/memperbarui kuota TPD ini</p>
            )}
          </div>

          {surveyId && (
            <>
              {/* Kuota */}
              <div>
                <label htmlFor="tpd-quota" className="block text-sm font-medium text-gray-700 mb-1">
                  Kuota <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <input
                  id="tpd-quota"
                  type="number"
                  min="1"
                  step="1"
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  placeholder="Contoh: 10"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${fieldErrors.quota ? 'border-red-400' : 'border-gray-300'}`}
                  aria-invalid={!!fieldErrors.quota}
                />
                <p className="mt-1 text-xs text-gray-400">Jumlah maksimum kuesioner yang boleh diisi TPD untuk survei ini</p>
                {fieldErrors.quota && <p className="mt-1 text-xs text-red-600">{fieldErrors.quota}</p>}
              </div>

              {/* Nomor kuesioner yang ditugaskan (Fitur #1) */}
              <div>
                <label htmlFor="tpd-assigned-numbers" className="block text-sm font-medium text-gray-700 mb-1">
                  Nomor Kuesioner yang Ditugaskan{' '}
                  <span className="text-gray-400 font-normal text-xs ml-1">(opsional)</span>
                </label>
                <textarea
                  id="tpd-assigned-numbers"
                  value={assignedNumbersText}
                  onChange={(e) => setAssignedNumbersText(e.target.value)}
                  rows={4}
                  placeholder={'Masukkan nomor kuesioner, satu per baris atau pisahkan dengan koma:\n001\n002\n003\natau: 001, 002, 003'}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono resize-none ${fieldErrors.assignedNumbers ? 'border-red-400' : 'border-gray-300'}`}
                  aria-invalid={!!fieldErrors.assignedNumbers}
                />
                <p className="mt-1 text-xs text-gray-400">
                  TPD akan melihat daftar nomor ini sebagai tugas yang harus diisi.
                  Kosongkan jika tidak ingin menentukan nomor spesifik.
                </p>
                {assignedNumbersText.trim() && (
                  <p className="mt-1 text-xs text-blue-600">
                    {parseAssignedNumbers(assignedNumbersText)?.length || 0} nomor kuesioner akan ditugaskan
                  </p>
                )}
                {fieldErrors.assignedNumbers && <p className="mt-1 text-xs text-red-600">{fieldErrors.assignedNumbers}</p>}
              </div>
            </>
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
              {submitting ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Buat TPD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── TPD Page ───────────────────────────────────────────────────────────────
/**
 * TPD management page.
 *
 * Features:
 * - Table listing all TPD: Name, Email, Status badge, Response Count, Joined Date
 * - "Tambah TPD" button opens a create modal
 * - Edit button per row opens an edit modal
 * - Deactivate/Activate toggle button per row (with inline confirmation for deactivate)
 * - Delete button per row (admin only) with inline confirmation
 * - Expandable quota summary per TPD via "Lihat Kuota" button
 */
function Surveyors() {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const toast = useToast();

  const [viewMode, handleViewChange] = useViewMode('surveyors_view_mode');
  const [tpdList, setTpdList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);

  // Deactivate confirmation: stores the TPD object being confirmed
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  // Delete confirmation: stores the TPD object being confirmed for deletion
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded quota panel: stores the TPD id whose quota panel is open
  const [expandedQuotaId, setExpandedQuotaId] = useState(null);

  // Client-side pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

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

  // ── Fetch TPD ─────────────────────────────────────────────────────────────
  const fetchSurveyors = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/surveyors');
      setTpdList(res.data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat daftar TPD.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveyors();
    fetchSurveys();
  }, [fetchSurveyors, fetchSurveys]);

  // ── Deactivate handler ──────────────────────────────────────────────────────
  async function handleDeactivate(tpd) {
    setDeactivating(true);
    try {
      await api.patch(`/surveyors/${tpd.id}/deactivate`);
      toast.success(`Akun "${tpd.name}" berhasil dinonaktifkan.`);
      setDeactivateTarget(null);
      fetchSurveyors();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan TPD.'
      );
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  }

  // ── Activate handler ────────────────────────────────────────────────────────
  async function handleActivate(tpd) {
    try {
      await api.patch(`/surveyors/${tpd.id}/activate`);
      toast.success(`Akun "${tpd.name}" berhasil diaktifkan kembali.`);
      fetchSurveyors();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.message ||
          'Gagal mengaktifkan TPD.'
      );
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────
  async function handleDeleteSurveyor(tpd) {
    setDeleting(true);
    try {
      await api.delete(`/surveyors/${tpd.id}`);
      toast.success(`Akun "${tpd.name}" berhasil dihapus.`);
      setDeleteTarget(null);
      fetchSurveyors();
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Gagal menghapus TPD.'
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // ── Toggle quota panel ──────────────────────────────────────────────────────
  function toggleQuotaPanel(tpdId) {
    setExpandedQuotaId((prev) => (prev === tpdId ? null : tpdId));
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

  // ── Filtered TPD ────────────────────────────────────────────────────────────
  const filteredSurveyors = tpdList.filter((tpd) => {
    if (filterName) {
      const q = filterName.toLowerCase();
      const matchName = (tpd.name || '').toLowerCase().includes(q);
      const matchEmail = (tpd.email || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    if (filterSurveyId && Array.isArray(tpd.quotas)) {
      const hasSurvey = tpd.quotas.some((q) => q.survey_id === filterSurveyId);
      if (!hasSurvey) return false;
    }
    if (filterYear || filterMonth) {
      const date = new Date(tpd.created_at);
      if (filterYear && date.getFullYear() !== parseInt(filterYear, 10)) return false;
      if (filterMonth && (date.getMonth() + 1) !== parseInt(filterMonth, 10)) return false;
    }
    return true;
  });

  // ── Client-side pagination ──────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredSurveyors.length / PAGE_SIZE));
  // Clamp current page if the filtered set shrank (e.g. after delete/filter).
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedSurveyors = filteredSurveyors.slice(pageStart, pageStart + PAGE_SIZE);

  // Reset to page 1 whenever the search/filter changes.
  useEffect(() => {
    setPage(1);
  }, [filterName, filterSurveyId, filterYear, filterMonth]);

  // Get unique years from TPD list for the dropdown
  const availableYears = [...new Set(tpdList.map((tpd) => new Date(tpd.created_at).getFullYear()))].sort((a, b) => b - a);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen TPD</h1>
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
              Upload TPD
            </button>
            <button
              onClick={() => {
                setEditTarget(null);
                setModalMode('create');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <span aria-hidden="true">+</span> Tambah TPD
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Cari nama / email TPD…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
            aria-label="Cari nama atau email TPD"
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
            {filteredSurveyors.length} dari {tpdList.length} TPD
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
              Memuat daftar TPD…
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
          ) : tpdList.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Belum ada data TPD.
            </div>
          ) : filteredSurveyors.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Tidak ada TPD yang sesuai filter.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {paginatedSurveyors.map((tpd) => (
                <SurveyorCard
                  key={tpd.id}
                  surveyor={tpd}
                  currentUser={currentUser}
                  onEdit={(s) => { setEditTarget(s); setModalMode('edit'); }}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  onDelete={handleDeleteSurveyor}
                  confirmDeactivateId={null}
                  onConfirmDeactivate={() => setDeactivateTarget(tpd)}
                  onCancelDeactivate={() => setDeactivateTarget(null)}
                  confirmDeleteId={null}
                  onConfirmDelete={() => setDeleteTarget(tpd)}
                  onCancelDelete={() => setDeleteTarget(null)}
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
                  {paginatedSurveyors.map((tpd) => {
                    const isQuotaExpanded = expandedQuotaId === tpd.id;

                    return (
                      <React.Fragment key={tpd.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          {/* Name */}
                          <td className="px-5 py-3 font-medium text-gray-800">
                            {tpd.name}
                          </td>

                          {/* Email */}
                          <td className="px-5 py-3 text-gray-600">
                            {tpd.email}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3">
                            <StatusBadge isActive={tpd.is_active} />
                          </td>

                          {/* Response Count */}
                          <td className="px-5 py-3 text-gray-600">
                            {tpd.response_count ?? 0}
                          </td>

                          {/* Joined Date */}
                          <td className="px-5 py-3 text-gray-500">
                            {formatDate(tpd.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Lihat Kuota button */}
                              <button
                                onClick={() => toggleQuotaPanel(tpd.id)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                                  isQuotaExpanded
                                    ? 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200'
                                    : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                }`}
                                aria-expanded={isQuotaExpanded}
                                aria-label={`${isQuotaExpanded ? 'Sembunyikan' : 'Lihat'} kuota ${tpd.name}`}
                              >
                                {isQuotaExpanded ? 'Sembunyikan Kuota' : 'Lihat Kuota'}
                              </button>

                              {/* Edit button */}
                              <button
                                onClick={() => {
                                  setEditTarget(tpd);
                                  setModalMode('edit');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                                aria-label={`Edit TPD ${tpd.name}`}
                              >
                                Edit
                              </button>

                              {/* Deactivate / Activate toggle */}
                              {tpd.is_active ? (
                                <button
                                  onClick={() => setDeactivateTarget(tpd)}
                                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                  aria-label={`Nonaktifkan TPD ${tpd.name}`}
                                >
                                  Nonaktifkan
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleActivate(tpd)}
                                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
                                  aria-label={`Aktifkan kembali TPD ${tpd.name}`}
                                >
                                  Aktifkan
                                </button>
                              )}

                              {/* Delete button — only for admin role */}
                              {currentUser.role === 'admin' && (
                                <button
                                  onClick={() => setDeleteTarget(tpd)}
                                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                  aria-label={`Hapus TPD ${tpd.name}`}
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable quota panel row */}
                        {isQuotaExpanded && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <QuotaPanel surveyorId={tpd.id} />
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

        {/* Pagination controls */}
        {!loading && !fetchError && filteredSurveyors.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-500">
              Menampilkan {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredSurveyors.length)} dari {filteredSurveyors.length} TPD
            </span>
            <div className="flex items-center gap-2">
              <button
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

      {/* Modal */}
      {modalMode && (
        <TPDFormModal
          mode={modalMode}
          initial={editTarget}
          surveys={surveys}
          onClose={() => {
            setModalMode(null);
            setEditTarget(null);
          }}
          onSaved={() => {
            const wasEdit = modalMode === 'edit';
            setModalMode(null);
            setEditTarget(null);
            toast.success(
              wasEdit
                ? 'Data TPD berhasil diperbarui.'
                : 'TPD baru berhasil dibuat.'
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
          toast.success('TPD berhasil diupload secara massal.');
          fetchSurveyors();
        }}
      />

      {/* Bulk Assign Modal */}
      <BulkAssignModal
        open={bulkAssignOpen}
        surveys={surveys}
        onClose={() => setBulkAssignOpen(false)}
        onSuccess={() => {
          toast.success('Penugasan TPD berhasil diupload.');
          fetchSurveyors();
        }}
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={!!deactivateTarget}
        title="Nonaktifkan TPD?"
        description={
          deactivateTarget
            ? `Akun "${deactivateTarget.name}" akan dinonaktifkan dan tidak dapat login hingga diaktifkan kembali. Anda bisa mengaktifkannya lagi nanti.`
            : ''
        }
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        tone="danger"
        loading={deactivating}
        onConfirm={() => deactivateTarget && handleDeactivate(deactivateTarget)}
        onCancel={() => setDeactivateTarget(null)}
      />

      {/* Permanent delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus TPD permanen?"
        description={
          deleteTarget
            ? `Akun "${deleteTarget.name}" akan dihapus secara permanen beserta data terkaitnya. Tindakan ini tidak dapat dibatalkan.`
            : ''
        }
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        tone="danger"
        loading={deleting}
        onConfirm={() => deleteTarget && handleDeleteSurveyor(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </Layout>
  );
}

export default Surveyors;
