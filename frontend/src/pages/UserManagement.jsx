import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import IconButton from '../components/IconButton';
import api from '../services/api';

// ─── Tab Configuration ────────────────────────────────────────────────────────
const ALL_TABS = [
  { key: 'admin',      label: 'Admin',      endpoint: '/admins' },
  { key: 'supervisor', label: 'Supervisor',  endpoint: '/supervisors' },
  { key: 'viewer',     label: 'Viewer',      endpoint: '/viewers' },
];

// ─── Role options for the form modal ─────────────────────────────────────────
const ROLE_OPTIONS_BY_CURRENT_ROLE = {
  admin:      ALL_TABS,
  supervisor: ALL_TABS.filter(t => t.key === 'viewer'),
};

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

// ─── User Form Modal ──────────────────────────────────────────────────────────
/**
 * Unified modal form for creating or editing a user account.
 *
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: object | null,
 *   tabKey: string,
 *   currentUserRole: string,
 *   onClose: () => void,
 *   onSaved: () => void,
 * }} props
 */
function UserFormModal({ mode, initial, tabKey, currentUserRole, onClose, onSaved }) {
  const isEdit = mode === 'edit';

  // In create mode, default role is the current tab's key
  const roleOptions = ROLE_OPTIONS_BY_CURRENT_ROLE[currentUserRole] || [];
  const defaultRole = isEdit
    ? tabKey
    : (roleOptions.find(r => r.key === tabKey)?.key || roleOptions[0]?.key || tabKey);

  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState(defaultRole);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Derive the endpoint from the selected role
  const endpoint = ALL_TABS.find(t => t.key === selectedRole)?.endpoint || `/${selectedRole}s`;

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
        await api.put(`${endpoint}/${initial.id}`, payload);
      } else {
        await api.post(endpoint, payload);
      }
      onSaved(selectedRole);
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

  // Determine modal title
  const roleLabel = ALL_TABS.find(t => t.key === (isEdit ? tabKey : selectedRole))?.label || '';
  const modalTitle = isEdit ? `Edit ${roleLabel}` : `Tambah ${roleLabel} Baru`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2
          id="user-modal-title"
          className="text-lg font-semibold text-gray-800 mb-5"
        >
          {modalTitle}
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
          {/* Role dropdown — only in create mode */}
          {!isEdit && (
            <div>
              <label
                htmlFor="user-role"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Role <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              {roleOptions.length > 1 ? (
                <select
                  id="user-role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {roleOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                /* Supervisor: only Viewer option — show as read-only */
                <input
                  id="user-role"
                  type="text"
                  value={roleOptions[0]?.label || ''}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  aria-label="Role (hanya Viewer)"
                />
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label
              htmlFor="user-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nama <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="user-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                fieldErrors.name ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="name"
              aria-describedby={fieldErrors.name ? 'user-name-error' : undefined}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p id="user-name-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="user-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                fieldErrors.email ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="email"
              aria-describedby={fieldErrors.email ? 'user-email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p id="user-email-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="user-password"
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
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                fieldErrors.password ? 'border-red-400' : 'border-gray-300'
              }`}
              autoComplete="new-password"
              aria-describedby="user-password-hint user-password-error"
              aria-invalid={!!fieldErrors.password}
            />
            <p id="user-password-hint" className="mt-1 text-xs text-gray-400">
              Min. 8 karakter, huruf besar, huruf kecil, dan angka
            </p>
            {fieldErrors.password && (
              <p id="user-password-error" className="mt-1 text-xs text-red-600">
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
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {submitting ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Buat Akun'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── UserManagement Page ──────────────────────────────────────────────────────
/**
 * Unified user management page with tab navigation for Admin, Supervisor,
 * and Viewer accounts.
 *
 * - Admin: sees all three tabs (Admin, Supervisor, Viewer)
 * - Supervisor: sees only the Viewer tab
 *
 * Features:
 * - Tab navigation per role
 * - Table listing users per tab: Name, Email, Status, Created At, Actions
 * - "Tambah" button opens a create modal with role dropdown filtered by current user's role
 * - Edit button per row opens an edit modal
 * - Nonaktifkan button with inline confirmation; self-deactivation is prevented
 * - Success / error feedback messages
 */
function UserManagement() {
  // Current logged-in user
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  // Compute visible tabs based on current user's role
  const visibleTabs =
    currentUser.role === 'supervisor'
      ? ALL_TABS.filter(t => t.key === 'viewer')
      : ALL_TABS;

  // Active tab — default to first visible tab
  const [activeTabKey, setActiveTabKey] = useState(visibleTabs[0]?.key || 'admin');

  const activeTab = ALL_TABS.find(t => t.key === activeTabKey) || visibleTabs[0];

  // Data state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);

  // Inline deactivate confirmation state: stores the user id being confirmed
  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  // Inline delete confirmation state: stores the user id being confirmed for deletion
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // ── Fetch users for active tab ──────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    if (!activeTab) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get(activeTab.endpoint);
      setUsers(res.data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          `Gagal memuat daftar ${activeTab.label.toLowerCase()}.`
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchUsers();
    // Reset confirmation state when tab changes
    setConfirmDeactivateId(null);
    setConfirmDeleteId(null);
  }, [fetchUsers]);

  // ── Auto-dismiss success message ────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Deactivate handler ──────────────────────────────────────────────────────
  async function handleDeactivate(user) {
    setActionError(null);
    try {
      await api.patch(`${activeTab.endpoint}/${user.id}/deactivate`);
      setSuccessMsg(`Akun "${user.name}" berhasil dinonaktifkan.`);
      setConfirmDeactivateId(null);
      fetchUsers();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          err.message ||
          'Gagal menonaktifkan akun.'
      );
      setConfirmDeactivateId(null);
    }
  }

  // ── Delete handler ───────────────────────────────────────────────────────────
  async function handleDelete(user) {
    setActionError(null);
    try {
      await api.delete(`${activeTab.endpoint}/${user.id}`);
      setSuccessMsg(`Akun "${user.name}" berhasil dihapus.`);
      setConfirmDeleteId(null);
      fetchUsers();
    } catch (err) {
      setActionError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Gagal menghapus akun.'
      );
      setConfirmDeleteId(null);
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

  // ── Handle tab change ───────────────────────────────────────────────────────
  function handleTabChange(tabKey) {
    setActiveTabKey(tabKey);
    setActionError(null);
    setSuccessMsg(null);
    setConfirmDeactivateId(null);
    setConfirmDeleteId(null);
    setModalMode(null);
    setEditTarget(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Manajemen Pengguna</h1>
          <button
            onClick={() => {
              setEditTarget(null);
              setModalMode('create');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <span aria-hidden="true">+</span> Tambah
          </button>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-1" aria-label="Tab navigasi pengguna">
            {visibleTabs.map(tab => {
              const isActive = tab.key === activeTabKey;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1 ${
                    isActive
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
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
              Memuat daftar {activeTab?.label.toLowerCase()}…
            </div>
          ) : fetchError ? (
            <div
              className="flex flex-col items-center justify-center h-48 gap-3"
              role="alert"
            >
              <p className="text-red-600 text-sm">{fetchError}</p>
              <button
                onClick={fetchUsers}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                Coba lagi
              </button>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Belum ada data {activeTab?.label.toLowerCase()}.
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
                  {users.map((user) => {
                    const isSelf = String(user.id) === String(currentUser.id);
                    const isConfirming = confirmDeactivateId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Name */}
                        <td className="px-5 py-3 font-medium text-gray-800">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-primary-500 font-normal">
                              (Anda)
                            </span>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3 text-gray-600">{user.email}</td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <StatusBadge isActive={user.is_active} />
                        </td>

                        {/* Created At */}
                        <td className="px-5 py-3 text-gray-500">
                          {formatDate(user.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit */}
                            <IconButton
                              icon="edit"
                              variant="primary"
                              label={`Edit ${activeTab?.label.toLowerCase()} ${user.name}`}
                              onClick={() => {
                                setEditTarget(user);
                                setModalMode('edit');
                              }}
                            />

                            {/* Nonaktifkan — hanya akun aktif & bukan diri sendiri */}
                            {user.is_active && !isSelf && (
                              isConfirming ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600">Nonaktifkan?</span>
                                  <button
                                    onClick={() => handleDeactivate(user)}
                                    className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                    aria-label={`Konfirmasi nonaktifkan ${user.name}`}
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
                                <IconButton
                                  icon="deactivate"
                                  variant="danger"
                                  label={`Nonaktifkan ${activeTab?.label.toLowerCase()} ${user.name}`}
                                  onClick={() => setConfirmDeactivateId(user.id)}
                                />
                              )
                            )}

                            {/* Tidak dapat menonaktifkan akun sendiri */}
                            {user.is_active && isSelf && (
                              <IconButton
                                icon="deactivate"
                                variant="default"
                                label="Tidak dapat menonaktifkan akun sendiri"
                                onClick={() => {}}
                                disabled
                              />
                            )}

                            {/* Hapus — admin only */}
                            {currentUser.role === 'admin' && (
                              confirmDeleteId === user.id ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600">Hapus permanen?</span>
                                  <button
                                    onClick={() => handleDelete(user)}
                                    className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                                    aria-label={`Konfirmasi hapus ${user.name}`}
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
                                <IconButton
                                  icon="trash"
                                  variant="danger"
                                  label={isSelf ? 'Tidak dapat menghapus akun sendiri' : `Hapus ${activeTab?.label.toLowerCase()} ${user.name}`}
                                  onClick={() => !isSelf && setConfirmDeleteId(user.id)}
                                  disabled={isSelf}
                                />
                              )
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
        <UserFormModal
          mode={modalMode}
          initial={editTarget}
          tabKey={activeTabKey}
          currentUserRole={currentUser.role}
          onClose={() => {
            setModalMode(null);
            setEditTarget(null);
          }}
          onSaved={(savedRole) => {
            const savedLabel = ALL_TABS.find(t => t.key === savedRole)?.label || savedRole;
            setModalMode(null);
            setEditTarget(null);
            setSuccessMsg(
              modalMode === 'edit'
                ? `Data ${savedLabel.toLowerCase()} berhasil diperbarui.`
                : `Akun ${savedLabel.toLowerCase()} baru berhasil dibuat.`
            );
            // If the saved role matches the active tab, refresh the list
            if (savedRole === activeTabKey) {
              fetchUsers();
            }
          }}
        />
      )}
    </Layout>
  );
}

export default UserManagement;
