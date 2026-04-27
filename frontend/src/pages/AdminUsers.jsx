import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
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

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      Aktif
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      Nonaktif
    </span>
  );
}

// ─── Admin Form Modal ─────────────────────────────────────────────────────────
/**
 * Modal form for creating or editing an admin account.
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: object | null,
 *   onClose: () => void,
 *   onSaved: () => void,
 * }} props
 */
function AdminFormModal({ mode, initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
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

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/admins/${initial.id}`, payload);
      } else {
        await api.post('/admins', payload);
      }
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
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2
          id="admin-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          {isEdit ? 'Edit Admin' : 'Tambah Admin Baru'}
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
              htmlFor="admin-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nama <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="admin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.name ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="name"
              aria-describedby={fieldErrors.name ? 'admin-name-error' : undefined}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p id="admin-name-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="admin-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.email ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="email"
              aria-describedby={fieldErrors.email ? 'admin-email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p id="admin-email-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="admin-password"
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
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                fieldErrors.password ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete={isEdit ? 'new-password' : 'new-password'}
              aria-describedby="admin-password-hint admin-password-error"
              aria-invalid={!!fieldErrors.password}
            />
            <p id="admin-password-hint" className="mt-1 text-xs text-gray-400">
              Min. 8 karakter, huruf besar, huruf kecil, dan angka
            </p>
            {fieldErrors.password && (
              <p id="admin-password-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.password}
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
              {submitting ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Buat Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── AdminUsers Page ──────────────────────────────────────────────────────────
/**
 * Admin management page.
 *
 * Features:
 * - Table listing all admins: Name, Email, Status badge, Created At
 * - "Tambah Admin" button opens a create modal
 * - Edit button per row opens an edit modal
 * - Deactivate button per row with confirmation dialog
 * - Prevents deactivating own account
 * - Success / error feedback messages
 */
function AdminUsers() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);

  // Inline deactivate confirmation state: stores the admin id being confirmed
  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  // Current logged-in user
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  // ── Fetch admins ────────────────────────────────────────────────────────────
  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/admins');
      setAdmins(res.data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat daftar admin.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // ── Auto-dismiss success message ────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Deactivate handler ──────────────────────────────────────────────────────
  async function handleDeactivate(admin) {
    setActionError(null);
    try {
      await api.patch(`/admins/${admin.id}/deactivate`);
      setSuccessMsg(`Akun "${admin.name}" berhasil dinonaktifkan.`);
      setConfirmDeactivateId(null);
      fetchAdmins();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan admin.'
      );
      setConfirmDeactivateId(null);
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen Admin</h1>
          <button
            onClick={() => {
              setEditTarget(null);
              setModalMode('create');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <span aria-hidden="true">+</span> Tambah Admin
          </button>
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
              Memuat daftar admin…
            </div>
          ) : fetchError ? (
            <div
              className="flex flex-col items-center justify-center h-48 gap-3"
              role="alert"
            >
              <p className="text-red-600 text-sm">{fetchError}</p>
              <button
                onClick={fetchAdmins}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Coba lagi
              </button>
            </div>
          ) : admins.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Belum ada data admin.
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
                      Tanggal Dibuat
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {admins.map((admin) => {
                    const isSelf = String(admin.id) === String(currentUser.id);
                    const isConfirming = confirmDeactivateId === admin.id;

                    return (
                      <tr
                        key={admin.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Name */}
                        <td className="px-5 py-3 font-medium text-gray-800">
                          {admin.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-blue-500 font-normal">
                              (Anda)
                            </span>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3 text-gray-600">{admin.email}</td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <StatusBadge isActive={admin.is_active} />
                        </td>

                        {/* Created At */}
                        <td className="px-5 py-3 text-gray-500">
                          {formatDate(admin.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {/* Edit button */}
                            <button
                              onClick={() => {
                                setEditTarget(admin);
                                setModalMode('edit');
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                              aria-label={`Edit admin ${admin.name}`}
                            >
                              Edit
                            </button>

                            {/* Deactivate / confirm */}
                            {admin.is_active && !isSelf && (
                              <>
                                {isConfirming ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-600">
                                      Nonaktifkan?
                                    </span>
                                    <button
                                      onClick={() => handleDeactivate(admin)}
                                      className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                      aria-label={`Konfirmasi nonaktifkan ${admin.name}`}
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
                                      setConfirmDeactivateId(admin.id)
                                    }
                                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                    aria-label={`Nonaktifkan admin ${admin.name}`}
                                  >
                                    Nonaktifkan
                                  </button>
                                )}
                              </>
                            )}

                            {/* Self-deactivate prevention tooltip */}
                            {admin.is_active && isSelf && (
                              <span
                                className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 rounded-md cursor-not-allowed"
                                title="Anda tidak dapat menonaktifkan akun Anda sendiri"
                                aria-label="Tidak dapat menonaktifkan akun sendiri"
                              >
                                Nonaktifkan
                              </span>
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

      {/* Modal */}
      {modalMode && (
        <AdminFormModal
          mode={modalMode}
          initial={editTarget}
          onClose={() => {
            setModalMode(null);
            setEditTarget(null);
          }}
          onSaved={() => {
            setModalMode(null);
            setEditTarget(null);
            setSuccessMsg(
              modalMode === 'edit'
                ? 'Data admin berhasil diperbarui.'
                : 'Admin baru berhasil dibuat.'
            );
            fetchAdmins();
          }}
        />
      )}
    </Layout>
  );
}

export default AdminUsers;
