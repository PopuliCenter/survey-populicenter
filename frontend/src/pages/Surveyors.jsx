import React, { useEffect, useState, useCallback, useRef } from 'react';
import Icon from '../components/Icon';
import Layout from '../components/Layout';
import { StatusBadge, QuotaPanel } from '../components/SurveyorBadges';
import { SurveyStatusBadge } from '../components/SurveyBadges';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import SurveyorCard from '../components/SurveyorCard';
import BulkUploadModal from '../components/BulkUploadModal';
import BulkAssignModal from '../components/BulkAssignModal';
import ConfirmDialog from '../components/ConfirmDialog';
import IconButton from '../components/IconButton';
import PasswordInput from '../components/PasswordInput';
import BulkActionBar from '../components/BulkActionBar';
import { useToast } from '../components/Toast';
import useModalA11y from '../hooks/useModalA11y';
import api from '../services/api';

// Tipe/skala survei — selaras dengan halaman Manajemen Survei (nasional/daerah/lainnya).
const SURVEY_TYPE_META = [
  { value: 'nasional', label: 'Nasional', dot: 'bg-primary-500' },
  { value: 'daerah', label: 'Daerah', dot: 'bg-emerald-500' },
  { value: 'lainnya', label: 'Lainnya', dot: 'bg-gray-400' },
];

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
  // Generator rentang nomor kuesioner (agar tak perlu ketik satu per satu)
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangePrefix, setRangePrefix] = useState('');
  const [rangePad, setRangePad] = useState('3');
  const [rangeError, setRangeError] = useState('');
  // Nomor yang sudah ditugaskan di survei terpilih (lanjut-terakhir & deteksi bentrok)
  const [surveyAssignments, setSurveyAssignments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = mode === 'edit';

  const dialogRef = useRef(null);
  useModalA11y(true, onClose, dialogRef);

  // Muat nomor yang sudah ditugaskan di survei ini saat survei dipilih.
  useEffect(() => {
    if (!surveyId) { setSurveyAssignments([]); return undefined; }
    let cancelled = false;
    api.get(`/surveyors/assigned-numbers/${surveyId}`)
      .then((res) => { if (!cancelled) setSurveyAssignments(res.data?.assignments || []); })
      .catch(() => { if (!cancelled) setSurveyAssignments([]); });
    return () => { cancelled = true; };
  }, [surveyId]);

  // Himpunan nomor yang dipakai TPD LAIN (kecuali TPD yang sedang diedit).
  function otherAssignedSet() {
    const others = new Set();
    for (const a of surveyAssignments) {
      if (String(a.surveyor_id) === String(initial?.id)) continue;
      for (const n of (a.assigned_numbers || [])) others.add(String(n).trim());
    }
    return others;
  }
  // Nomor pada daftar saat ini yang bentrok dengan TPD lain.
  function conflictNumbers() {
    const mine = parseAssignedNumbers(assignedNumbersText) || [];
    const others = otherAssignedSet();
    return [...new Set(mine.filter((n) => others.has(n)))];
  }
  // Angka tertinggi (suffix digit) di seluruh penugasan survei ini.
  function maxAssignedNumeric() {
    let mx = 0;
    for (const a of surveyAssignments) {
      for (const n of (a.assigned_numbers || [])) {
        const m = String(n).match(/(\d+)$/);
        if (m) mx = Math.max(mx, parseInt(m[1], 10));
      }
    }
    return mx;
  }
  // Isi rentang mulai dari nomor terakhir + 1 (hindari bentrok antar-TPD).
  function handleContinueFromLast() {
    const mx = maxAssignedNumeric();
    const q = parseInt(quota, 10);
    setRangeFrom(String(mx + 1));
    if (Number.isInteger(q) && q > 0) setRangeTo(String(mx + q));
    setRangeError('');
  }
  // Buang nomor yang bentrok dari daftar.
  function handleRemoveConflicts() {
    const conf = new Set(conflictNumbers());
    const kept = (parseAssignedNumbers(assignedNumbersText) || []).filter((n) => !conf.has(n));
    setAssignedNumbersText(kept.join('\n'));
  }

  // Parse assigned numbers dari textarea (satu per baris atau koma-separated)
  function parseAssignedNumbers(text) {
    if (!text.trim()) return null;
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Buat daftar nomor dari rentang (Dari–Sampai) + awalan + nol di depan,
  // lalu gabungkan ke daftar yang ada (tanpa duplikat).
  function handleGenerateRange() {
    setRangeError('');
    const a = parseInt(rangeFrom, 10);
    const b = parseInt(rangeTo, 10);
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      setRangeError('Isi angka "Dari" dan "Sampai".');
      return;
    }
    if (a > b) {
      setRangeError('"Dari" harus lebih kecil atau sama dengan "Sampai".');
      return;
    }
    const count = b - a + 1;
    if (count > 2000) {
      setRangeError(`Rentang terlalu besar (${count}). Maksimal 2000 nomor sekali buat.`);
      return;
    }
    const pad = parseInt(rangePad, 10);
    const prefix = rangePrefix.trim();
    const generated = [];
    for (let i = a; i <= b; i++) {
      const num = Number.isInteger(pad) && pad > 0 ? String(i).padStart(pad, '0') : String(i);
      generated.push(`${prefix}${num}`);
    }
    const existing = parseAssignedNumbers(assignedNumbersText) || [];
    const seen = new Set(existing);
    const merged = [...existing];
    for (const n of generated) {
      if (!seen.has(n)) { seen.add(n); merged.push(n); }
    }
    setAssignedNumbersText(merged.join('\n'));
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
        if (!errors.assignedNumbers) {
          const conf = conflictNumbers();
          if (conf.length > 0) {
            errors.assignedNumbers = `Ada ${conf.length} nomor bentrok dengan TPD lain: ${conf.slice(0, 10).join(', ')}${conf.length > 10 ? '…' : ''}`;
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${fieldErrors.name ? 'border-red-400' : 'border-gray-300'}`}
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${fieldErrors.email ? 'border-red-400' : 'border-gray-300'}`}
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
              {isEdit && <span className="text-gray-500 font-normal text-xs ml-1">(kosongkan jika tidak ingin mengubah)</span>}
            </label>
            <PasswordInput
              id="tpd-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${fieldErrors.password ? 'border-red-400' : 'border-gray-300'}`}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
            />
            <p className="mt-1 text-xs text-gray-500">Min. 8 karakter, huruf besar, huruf kecil, dan angka</p>
            {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
          </div>

          {/* Survey selector */}
          <div>
            <label htmlFor="tpd-survey" className="block text-sm font-medium text-gray-700 mb-1">
              Tugaskan ke Survei{' '}
              <span className="text-gray-500 font-normal text-xs ml-1">(opsional)</span>
            </label>
            <select
              id="tpd-survey"
              value={surveyId}
              onChange={(e) => { setSurveyId(e.target.value); setAssignedNumbersText(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            >
              <option value="">— Pilih survei —</option>
              {(surveys || []).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-gray-500">Pilih survei untuk menambah/memperbarui kuota TPD ini</p>
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
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${fieldErrors.quota ? 'border-red-400' : 'border-gray-300'}`}
                  aria-invalid={!!fieldErrors.quota}
                />
                <p className="mt-1 text-xs text-gray-500">Jumlah maksimum kuesioner yang boleh diisi TPD untuk survei ini</p>
                {fieldErrors.quota && <p className="mt-1 text-xs text-red-600">{fieldErrors.quota}</p>}
              </div>

              {/* Nomor kuesioner yang ditugaskan (Fitur #1) */}
              <div>
                <label htmlFor="tpd-assigned-numbers" className="block text-sm font-medium text-gray-700 mb-1">
                  Nomor Kuesioner yang Ditugaskan{' '}
                  <span className="text-gray-500 font-normal text-xs ml-1">(opsional)</span>
                </label>

                {/* Generator rentang — isi cepat tanpa ketik satu per satu */}
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Buat cepat dari rentang</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor="range-from" className="block text-2xs text-gray-500 mb-0.5">Dari</label>
                      <input id="range-from" type="number" inputMode="numeric" value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)} placeholder="1"
                        className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>
                    <div>
                      <label htmlFor="range-to" className="block text-2xs text-gray-500 mb-0.5">Sampai</label>
                      <input id="range-to" type="number" inputMode="numeric" value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)} placeholder="50"
                        className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>
                    <div>
                      <label htmlFor="range-prefix" className="block text-2xs text-gray-500 mb-0.5">Awalan</label>
                      <input id="range-prefix" type="text" value={rangePrefix}
                        onChange={(e) => setRangePrefix(e.target.value)} placeholder="mis. SBY-"
                        className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>
                    <div>
                      <label htmlFor="range-pad" className="block text-2xs text-gray-500 mb-0.5" title="Jumlah digit dengan nol di depan; 0/kosong = tanpa nol">Digit</label>
                      <input id="range-pad" type="number" inputMode="numeric" min={0} value={rangePad}
                        onChange={(e) => setRangePad(e.target.value)} placeholder="3"
                        className="w-16 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>
                    <button type="button" onClick={handleGenerateRange}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-300">
                      Tambahkan
                    </button>
                    {maxAssignedNumeric() > 0 && (
                      <button type="button" onClick={handleContinueFromLast}
                        title="Isi rentang mulai dari nomor tertinggi + 1 agar tak bentrok dengan TPD lain"
                        className="px-2.5 py-1.5 text-xs font-medium text-primary-700 bg-primary-100 hover:bg-primary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-300">
                        Lanjut dari terakhir ({maxAssignedNumeric() + 1})
                      </button>
                    )}
                    {assignedNumbersText.trim() && (
                      <button type="button" onClick={() => setAssignedNumbersText('')}
                        className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:underline">
                        Kosongkan
                      </button>
                    )}
                  </div>
                  {rangeError && <p className="mt-1.5 text-xs text-red-600">{rangeError}</p>}
                  {surveyId && surveyAssignments.length > 0 && (
                    <p className="mt-1.5 text-2xs text-gray-500">
                      Sudah dipakai {surveyAssignments.reduce((s, a) => s + (a.assigned_numbers?.length || 0), 0)} nomor di survei ini · tertinggi <b>{maxAssignedNumeric()}</b>.
                    </p>
                  )}
                  <p className="mt-1.5 text-2xs text-gray-500">Contoh: Dari <b>1</b>, Sampai <b>50</b>, Digit <b>3</b> → 001…050. Awalan opsional (mis. "SBY-001"). Hasil bisa diedit manual di bawah.</p>
                </div>

                <textarea
                  id="tpd-assigned-numbers"
                  value={assignedNumbersText}
                  onChange={(e) => setAssignedNumbersText(e.target.value)}
                  rows={4}
                  placeholder={'Masukkan nomor kuesioner, satu per baris atau pisahkan dengan koma:\n001\n002\n003\natau: 001, 002, 003'}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono resize-none ${fieldErrors.assignedNumbers ? 'border-red-400' : 'border-gray-300'}`}
                  aria-invalid={!!fieldErrors.assignedNumbers}
                />
                <p className="mt-1 text-xs text-gray-500">
                  TPD akan melihat daftar nomor ini sebagai tugas yang harus diisi.
                  Kosongkan jika tidak ingin menentukan nomor spesifik.
                </p>
                {assignedNumbersText.trim() && (
                  <p className="mt-1 text-xs text-primary-600">
                    {parseAssignedNumbers(assignedNumbersText)?.length || 0} nomor kuesioner akan ditugaskan
                  </p>
                )}
                {conflictNumbers().length > 0 && (
                  <div className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-700 flex items-start gap-1.5">
                      <Icon name="alert" className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{conflictNumbers().length} nomor bentrok dengan TPD lain: {conflictNumbers().slice(0, 15).join(', ')}{conflictNumbers().length > 15 ? '…' : ''}</span>
                    </p>
                    <button type="button" onClick={handleRemoveConflicts}
                      className="mt-1 text-xs font-medium text-red-700 underline hover:text-red-800 focus:outline-none">
                      Buang yang bentrok
                    </button>
                  </div>
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
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
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

  // Lepas-penugasan (per survei): hapus kuota TPD untuk survei terpilih, akun tetap
  const [unassignTarget, setUnassignTarget] = useState(null);

  // Expanded quota panel: stores the TPD id whose quota panel is open
  const [expandedQuotaId, setExpandedQuotaId] = useState(null);

  // Client-side pagination — jumlah baris per halaman bisa dipilih TPD admin
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 150];
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Organisasi per survei (Opsi C): tampilkan landing pemilih survei dulu.
  // Set default ke false bila kelak ingin kembali ke daftar datar (Opsi B).
  const [projectView, setProjectView] = useState(true);
  const [surveySearch, setSurveySearch] = useState('');
  const [surveyTypeFilter, setSurveyTypeFilter] = useState(''); // '' = semua tipe

  // Bulk upload / assign modal state (berbasis file CSV)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [surveys, setSurveys] = useState([]);

  // ── Seleksi massal berbasis baris (tampilan tabel) ──────────────────────────
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null); // { type: 'deactivate'|'delete'|'unassign', ids: string[] }
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignSurveyId, setAssignSurveyId] = useState('');
  const [assignQuota, setAssignQuota] = useState('');
  // Bagi nomor kuesioner otomatis saat penugasan massal: tiap TPD mendapat blok
  // berurutan sebesar kuota (TPD1: 001–010, TPD2: 011–020, …).
  const [assignAutoNumbers, setAssignAutoNumbers] = useState(false);
  const [assignStartNumber, setAssignStartNumber] = useState('1');

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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

  // Reset seleksi saat filter/tampilan berubah (hindari aksi ke baris tak tampak).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterName, filterSurveyId, filterYear, filterMonth, viewMode]);

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

  // ── Reset perangkat (kunci perangkat 1 user = 1 device) ────────────────────
  async function handleResetDevice(tpd) {
    try {
      await api.post(`/surveyors/${tpd.id}/reset-device`);
      toast.success(`Perangkat "${tpd.name}" direset — HP baru akan terikat saat pengisian berikutnya.`);
      fetchSurveyors();
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Gagal mereset perangkat.'
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

  // ── Aksi massal (loop endpoint per-item yang sudah teruji) ──────────────────
  async function runBulk(ids, fn, verb) {
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map(fn));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (ok) toast.success(`${ok} TPD ${verb}.`);
    if (fail) toast.error(`${fail} TPD gagal diproses.`);
    setBulkBusy(false);
    setBulkConfirm(null);
    clearSelection();
    fetchSurveyors();
  }
  const bulkActivate = (ids) => runBulk(ids, (id) => api.patch(`/surveyors/${id}/activate`), 'diaktifkan');
  const bulkDeactivate = (ids) => runBulk(ids, (id) => api.patch(`/surveyors/${id}/deactivate`), 'dinonaktifkan');
  const bulkDelete = (ids) => runBulk(ids, (id) => api.delete(`/surveyors/${id}`), 'dihapus');
  const bulkUnassign = (ids) => runBulk(ids, (id) => api.delete(`/surveyors/${id}/quota/${filterSurveyId}`), 'dilepas dari survei');

  // Blok nomor per TPD saat "bagi otomatis" aktif. Urutan TPD mengikuti tampilan
  // agar pembagian mudah ditebak. { [tpdId]: ['001', ...] } atau null bila nonaktif.
  function computeBulkNumberBlocks(ids, quotaNum) {
    const start = Number(assignStartNumber);
    if (!Number.isInteger(start) || start < 1) return { error: 'Nomor awal harus bilangan bulat ≥ 1.' };
    const lastNum = start + ids.length * quotaNum - 1;
    const width = Math.max(3, String(lastNum).length);
    const pad = (n) => String(n).padStart(width, '0');
    const byTpd = {};
    let cursor = start;
    for (const id of ids) {
      const block = [];
      for (let k = 0; k < quotaNum; k += 1) { block.push(pad(cursor)); cursor += 1; }
      byTpd[id] = block;
    }
    return { byTpd };
  }

  function submitBulkAssign() {
    const quotaNum = Number(assignQuota);
    if (!assignSurveyId) { toast.error('Pilih survei tujuan dulu.'); return; }
    if (!Number.isInteger(quotaNum) || quotaNum < 1) { toast.error('Kuota harus bilangan bulat ≥ 1.'); return; }
    // Urutan TPD sesuai daftar yang tampil (fallback: urutan pilih).
    const orderedIds = filteredSurveyors.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const ids = orderedIds.length ? orderedIds : [...selectedIds];

    let numbersByTpd = null;
    if (assignAutoNumbers) {
      const res = computeBulkNumberBlocks(ids, quotaNum);
      if (res.error) { toast.error(res.error); return; }
      numbersByTpd = res.byTpd;
    }

    setAssignPickerOpen(false);
    runBulk(
      ids,
      (id) => api.post(`/surveyors/${id}/quota`, {
        survey_id: assignSurveyId,
        quota: quotaNum,
        ...(numbersByTpd ? { assigned_numbers: numbersByTpd[id] } : {}),
      }),
      'ditugaskan ke survei'
    );
    setAssignSurveyId('');
    setAssignQuota('');
    setAssignAutoNumbers(false);
    setAssignStartNumber('1');
  }

  // ── Lepas TPD dari survei terpilih (hapus penugasan, akun tetap ada) ─────────
  async function handleUnassign(tpd) {
    if (!filterSurveyId) return;
    setDeleting(true);
    try {
      await api.delete(`/surveyors/${tpd.id}/quota/${filterSurveyId}`);
      toast.success(`"${tpd.name}" dilepas dari survei ini.`);
      setUnassignTarget(null);
      fetchSurveyors();
    } catch (err) {
      toast.error(
        err.response?.data?.error || err.message || 'Gagal melepas TPD dari survei.'
      );
      setUnassignTarget(null);
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
  const totalPages = Math.max(1, Math.ceil(filteredSurveyors.length / pageSize));
  // Clamp current page if the filtered set shrank (e.g. after delete/filter).
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedSurveyors = filteredSurveyors.slice(pageStart, pageStart + pageSize);

  // Seleksi massal beroperasi pada SELURUH hasil filter (lintas halaman).
  const filteredIds = filteredSurveyors.map((t) => t.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id)) && !allSelected;
  const toggleSelectAll = () => {
    if (allSelected) clearSelection();
    else setSelectedIds(new Set(filteredIds));
  };

  // Reset to page 1 whenever the search/filter atau jumlah baris per halaman berubah.
  useEffect(() => {
    setPage(1);
  }, [filterName, filterSurveyId, filterYear, filterMonth, pageSize]);

  // Get unique years from TPD list for the dropdown
  const availableYears = [...new Set(tpdList.map((tpd) => new Date(tpd.created_at).getFullYear()))].sort((a, b) => b - a);

  // ── Organisasi per survei (Opsi C) ──────────────────────────────────────────
  // Hitung jumlah TPD unik yang ditugaskan ke tiap survei (lewat kuota).
  const tpdCountBySurvey = {};
  for (const tpd of tpdList) {
    if (!Array.isArray(tpd.quotas)) continue;
    const seen = new Set();
    for (const q of tpd.quotas) {
      if (q.survey_id && !seen.has(q.survey_id)) {
        seen.add(q.survey_id);
        tpdCountBySurvey[q.survey_id] = (tpdCountBySurvey[q.survey_id] || 0) + 1;
      }
    }
  }
  const selectedSurvey = surveys.find((s) => s.id === filterSurveyId) || null;
  const showLanding = projectView && !filterSurveyId;

  // Jumlah responden yang ditampilkan: saat drill-in ke satu survei, pakai angka
  // PER SURVEI itu (dari quota.response_count); selain itu pakai total global.
  const responseCountFor = (tpd) => {
    if (filterSurveyId && Array.isArray(tpd.quotas)) {
      const q = tpd.quotas.find((x) => x.survey_id === filterSurveyId);
      return q?.response_count ?? 0;
    }
    return tpd.response_count ?? 0;
  };
  const visibleSurveys = surveys.filter(
    (s) =>
      (!surveySearch || (s.title || '').toLowerCase().includes(surveySearch.toLowerCase())) &&
      (!surveyTypeFilter || (s.type || 'lainnya') === surveyTypeFilter)
  );
  // Kelompokkan survei per tipe (urut: Nasional, Daerah, Lainnya) agar terorganisir.
  const groupedSurveys = SURVEY_TYPE_META
    .map((t) => ({ ...t, items: visibleSurveys.filter((s) => (s.type || 'lainnya') === t.value) }))
    .filter((g) => g.items.length > 0);

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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <span aria-hidden="true">+</span> Tambah TPD
            </button>
          </div>
        </div>

        {/* Sub-header: breadcrumb (mode per survei) / kembali ke pengelompokan */}
        {projectView && filterSurveyId && selectedSurvey && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setFilterSurveyId(''); setFilterName(''); }}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Semua Survei
            </button>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-semibold text-gray-800">{selectedSurvey.title}</span>
            <SurveyStatusBadge status={selectedSurvey.status} />
          </div>
        )}
        {!projectView && (
          <div>
            <button
              onClick={() => { setProjectView(true); setFilterSurveyId(''); }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              Kelompokkan per survei
            </button>
          </div>
        )}

        {showLanding ? (
          /* ── Landing: pilih survei dulu (Opsi C) ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Pilih Survei</h2>
                <p className="text-xs text-gray-500 mt-0.5">Pilih survei untuk melihat & mengelola TPD yang ditugaskan padanya.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={surveyTypeFilter}
                  onChange={(e) => setSurveyTypeFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  aria-label="Filter tipe survei"
                >
                  <option value="">Semua Tipe</option>
                  {SURVEY_TYPE_META.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={surveySearch}
                  onChange={(e) => setSurveySearch(e.target.value)}
                  placeholder="Cari survei…"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 w-52"
                  aria-label="Cari survei"
                />
                <button
                  onClick={() => setProjectView(false)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 underline whitespace-nowrap"
                >
                  Lihat semua TPD
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 text-gray-500 text-sm" role="status" aria-live="polite">
                Memuat…
              </div>
            ) : visibleSurveys.length === 0 ? (
              <div className="bg-white rounded-xl shadow flex items-center justify-center h-40 text-gray-500 text-sm">
                {surveys.length === 0 ? 'Belum ada survei.' : 'Tidak ada survei yang cocok.'}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedSurveys.map((group) => (
                  <div key={group.value}>
                    {/* Heading kelompok tipe survei */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-2 h-2 rounded-full ${group.dot}`} aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
                      <span className="text-xs text-gray-500">({group.items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.items.map((s) => {
                        const count = tpdCountBySurvey[s.id] || 0;
                        return (
                          <button
                            key={s.id}
                            onClick={() => { setFilterSurveyId(s.id); setFilterName(''); }}
                            className="text-left bg-white rounded-xl shadow border border-gray-100 hover:shadow-md hover:border-primary-200 transition p-5 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
                          >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{s.title}</h3>
                        <SurveyStatusBadge status={s.status} />
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                            {count} TPD
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 4h6" />
                            </svg>
                            {(s.response_count ?? 0).toLocaleString('id-ID')} responden
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium shrink-0">
                          Kelola
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Cari nama / email TPD…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 w-56"
            aria-label="Cari nama atau email TPD"
          />
          {!projectView && (
            <select
              value={filterSurveyId}
              onChange={(e) => setFilterSurveyId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Filter berdasarkan survei"
            >
              <option value="">Semua Survei</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          )}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
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
          <span className="text-xs text-gray-500 ml-auto">
            {filteredSurveyors.length} dari {tpdList.length} TPD
          </span>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div
              className="flex items-center justify-center h-48 text-gray-500 text-sm"
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
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                Coba lagi
              </button>
            </div>
          ) : tpdList.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              Belum ada data TPD.
            </div>
          ) : filteredSurveyors.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              Tidak ada TPD yang sesuai filter.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {paginatedSurveyors.map((tpd) => (
                <SurveyorCard
                  key={tpd.id}
                  surveyor={tpd}
                  responseCount={responseCountFor(tpd)}
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
                  surveyContext={!!filterSurveyId}
                  onUnassign={() => setUnassignTarget(tpd)}
                  expandedQuotaId={expandedQuotaId}
                  onToggleQuota={toggleQuotaPanel}
                  formatDate={formatDate}
                />
              ))}
            </div>
          ) : (
            <div>
              <BulkActionBar count={selectedIds.size} onClear={clearSelection} busy={bulkBusy}>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkActivate([...selectedIds])}
                  className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  Aktifkan
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => setBulkConfirm({ type: 'deactivate', ids: [...selectedIds] })}
                  className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  Nonaktifkan
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => setAssignPickerOpen(true)}
                  className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-100 hover:bg-primary-200 rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  Tugaskan ke Survei
                </button>
                {filterSurveyId ? (
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setBulkConfirm({ type: 'unassign', ids: [...selectedIds] })}
                    className="px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    Lepas dari Survei
                  </button>
                ) : currentUser.role === 'admin' ? (
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setBulkConfirm({ type: 'delete', ids: [...selectedIds] })}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    Hapus
                  </button>
                ) : null}
              </BulkActionBar>
              <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        aria-label="Pilih semua TPD (semua halaman)"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                      />
                    </th>
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
                        <tr className={`transition-colors ${selectedIds.has(tpd.id) ? 'bg-primary-50/60' : 'hover:bg-gray-50'}`}>
                          {/* Pilih */}
                          <td className="px-5 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(tpd.id)}
                              onChange={() => toggleSelect(tpd.id)}
                              aria-label={`Pilih ${tpd.name}`}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                            />
                          </td>

                          {/* Name */}
                          <td className="px-5 py-3 font-medium text-gray-800">
                            {tpd.name}
                            {tpd.device_bound && (
                              <span
                                className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-2xs font-semibold align-middle"
                                title={`Terkunci ke perangkat${tpd.device_label ? `: ${tpd.device_label}` : ''}${tpd.device_bound_at ? ` (sejak ${new Date(tpd.device_bound_at).toLocaleDateString('id-ID')})` : ''}`}
                              >
                                <Icon name="lock" className="w-3 h-3" />
                                HP
                              </span>
                            )}
                          </td>

                          {/* Email */}
                          <td className="px-5 py-3 text-gray-600">
                            {tpd.email}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3">
                            <StatusBadge isActive={tpd.is_active} />
                          </td>

                          {/* Response Count (per survei saat drill-in) */}
                          <td className="px-5 py-3 text-gray-600">
                            {responseCountFor(tpd)}
                          </td>

                          {/* Joined Date */}
                          <td className="px-5 py-3 text-gray-500">
                            {formatDate(tpd.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Lihat Kuota */}
                              <IconButton
                                icon={isQuotaExpanded ? 'quotaHide' : 'quota'}
                                variant="info"
                                label={isQuotaExpanded ? `Sembunyikan kuota ${tpd.name}` : `Lihat kuota ${tpd.name}`}
                                onClick={() => toggleQuotaPanel(tpd.id)}
                                aria-expanded={isQuotaExpanded}
                              />

                              {/* Edit */}
                              <IconButton
                                icon="edit"
                                variant="primary"
                                label={`Edit TPD ${tpd.name}`}
                                onClick={() => {
                                  setEditTarget(tpd);
                                  setModalMode('edit');
                                }}
                              />

                              {/* Reset Perangkat (kunci perangkat) — hanya bila terikat */}
                              {tpd.device_bound && (
                                <IconButton
                                  icon="deviceReset"
                                  variant="warning"
                                  label={`Reset perangkat ${tpd.name} (lepas kunci HP)`}
                                  onClick={() => handleResetDevice(tpd)}
                                />
                              )}

                              {/* Nonaktifkan / Aktifkan */}
                              {tpd.is_active ? (
                                <IconButton
                                  icon="deactivate"
                                  variant="danger"
                                  label={`Nonaktifkan TPD ${tpd.name}`}
                                  onClick={() => setDeactivateTarget(tpd)}
                                />
                              ) : (
                                <IconButton
                                  icon="activate"
                                  variant="success"
                                  label={`Aktifkan kembali TPD ${tpd.name}`}
                                  onClick={() => handleActivate(tpd)}
                                />
                              )}

                              {/* Per survei: Lepas dari survei ini. Mode datar: Hapus akun (admin) */}
                              {filterSurveyId ? (
                                <IconButton
                                  icon="unassign"
                                  variant="warning"
                                  label={`Lepas ${tpd.name} dari survei ini`}
                                  onClick={() => setUnassignTarget(tpd)}
                                />
                              ) : currentUser.role === 'admin' ? (
                                <IconButton
                                  icon="trash"
                                  variant="danger"
                                  label={`Hapus akun TPD ${tpd.name}`}
                                  onClick={() => setDeleteTarget(tpd)}
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable quota panel row */}
                        {isQuotaExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
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
            </div>
          )}
        </div>

        {/* Pagination controls */}
        {!loading && !fetchError && filteredSurveyors.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500">
                Menampilkan {pageStart + 1}–{Math.min(pageStart + pageSize, filteredSurveyors.length)} dari {filteredSurveyors.length} TPD
              </span>
              {/* Pemilih jumlah baris per halaman */}
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Tampilkan
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  aria-label="Jumlah TPD per halaman"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                / halaman
              </label>
            </div>
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
        </>
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

      {/* Lepas dari survei ini (hapus penugasan, akun tetap) */}
      <ConfirmDialog
        open={!!unassignTarget}
        title="Lepas TPD dari survei ini?"
        description={
          unassignTarget
            ? `Penugasan "${unassignTarget.name}" untuk survei "${selectedSurvey?.title || 'ini'}" akan dihapus. Akun TPD TETAP ada (tidak terhapus) dan masih bisa ditugaskan ke survei lain. Respons yang sudah masuk tidak dihapus.`
            : ''
        }
        confirmLabel="Lepas dari Survei"
        cancelLabel="Batal"
        tone="danger"
        loading={deleting}
        onConfirm={() => unassignTarget && handleUnassign(unassignTarget)}
        onCancel={() => setUnassignTarget(null)}
      />

      {/* Konfirmasi aksi massal (nonaktifkan / hapus / lepas) */}
      <ConfirmDialog
        open={!!bulkConfirm}
        title={
          bulkConfirm?.type === 'delete'
            ? `Hapus ${bulkConfirm.ids.length} TPD terpilih?`
            : bulkConfirm?.type === 'unassign'
              ? `Lepas ${bulkConfirm.ids.length} TPD dari survei ini?`
              : `Nonaktifkan ${bulkConfirm?.ids.length || ''} TPD terpilih?`
        }
        description={
          bulkConfirm?.type === 'delete'
            ? `${bulkConfirm.ids.length} akun TPD akan dihapus permanen beserta data terkaitnya. Tindakan ini tidak dapat dibatalkan.`
            : bulkConfirm?.type === 'unassign'
              ? `Penugasan ${bulkConfirm.ids.length} TPD untuk survei "${selectedSurvey?.title || 'ini'}" akan dihapus. Akun TPD tetap ada.`
              : `${bulkConfirm?.ids.length || 0} akun TPD akan dinonaktifkan dan tidak dapat login hingga diaktifkan kembali.`
        }
        confirmLabel={
          bulkConfirm?.type === 'delete' ? 'Ya, Hapus'
            : bulkConfirm?.type === 'unassign' ? 'Lepas dari Survei'
              : 'Nonaktifkan'
        }
        cancelLabel="Batal"
        tone="danger"
        loading={bulkBusy}
        onConfirm={() => {
          if (!bulkConfirm) return;
          const { type, ids } = bulkConfirm;
          if (type === 'delete') bulkDelete(ids);
          else if (type === 'unassign') bulkUnassign(ids);
          else bulkDeactivate(ids);
        }}
        onCancel={() => setBulkConfirm(null)}
      />

      {/* Tugaskan massal ke survei (pilih survei + kuota, lalu loop /quota) */}
      {assignPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Tugaskan ke survei">
          <button type="button" aria-label="Tutup" onClick={() => setAssignPickerOpen(false)} className="absolute inset-0 bg-black/50 cursor-default" />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Tugaskan {selectedIds.size} TPD ke Survei</h3>
            <p className="text-sm text-gray-500 mb-4">Pilih survei tujuan dan kuota responden untuk tiap TPD terpilih.</p>

            <label htmlFor="bulk-assign-survey-pick" className="block text-sm font-medium text-gray-700 mb-1">Survei</label>
            <select
              id="bulk-assign-survey-pick"
              value={assignSurveyId}
              onChange={(e) => setAssignSurveyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">— Pilih survei —</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
              ))}
            </select>

            <label htmlFor="bulk-assign-quota" className="block text-sm font-medium text-gray-700 mb-1">Kuota per TPD</label>
            <input
              id="bulk-assign-quota"
              type="number"
              min={1}
              value={assignQuota}
              onChange={(e) => setAssignQuota(e.target.value)}
              placeholder="mis. 30"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />

            {/* Bagi nomor kuesioner otomatis: tiap TPD dapat blok berurutan */}
            <label className="flex items-start gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={assignAutoNumbers}
                onChange={(e) => setAssignAutoNumbers(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-400"
              />
              <span className="text-sm text-gray-700">
                Bagikan <b>nomor kuesioner</b> otomatis
                <span className="block text-xs text-gray-500">Tiap TPD menerima blok nomor berurutan sesuai kuota.</span>
              </span>
            </label>

            {assignAutoNumbers && (() => {
              const quotaNum = Number(assignQuota);
              const start = Number(assignStartNumber);
              const n = selectedIds.size;
              const valid = Number.isInteger(quotaNum) && quotaNum >= 1 && Number.isInteger(start) && start >= 1 && n > 0;
              const last = valid ? start + n * quotaNum - 1 : 0;
              const width = valid ? Math.max(3, String(last).length) : 3;
              const pad = (x) => String(x).padStart(width, '0');
              return (
                <div className="mb-5 pl-6">
                  <label htmlFor="bulk-assign-start" className="block text-sm font-medium text-gray-700 mb-1">Nomor awal</label>
                  <input
                    id="bulk-assign-start"
                    type="number"
                    min={1}
                    value={assignStartNumber}
                    onChange={(e) => setAssignStartNumber(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                  {valid ? (
                    <p className="text-xs text-gray-500 mt-2">
                      {n} TPD × {quotaNum} = <b>{n * quotaNum}</b> nomor: <b>{pad(start)}</b>–<b>{pad(last)}</b>.
                      TPD pertama {pad(start)}–{pad(start + quotaNum - 1)}, berikutnya menyusul berurutan.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">Isi kuota & nomor awal untuk melihat pembagian.</p>
                  )}
                  <p className="text-2xs text-amber-600 mt-1">Nomor yang sudah dipakai TPD lain akan ditolak — pilih nomor awal setelah rentang yang ada.</p>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAssignPickerOpen(false)} disabled={bulkBusy}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
                Batal
              </button>
              <button type="button" onClick={submitBulkAssign} disabled={bulkBusy}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-60">
                {bulkBusy ? 'Memproses…' : 'Tugaskan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Surveyors;
