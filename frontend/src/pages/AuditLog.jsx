import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: '', label: 'Semua Aksi' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'CREATE_ADMIN', label: 'Buat Admin' },
  { value: 'UPDATE_ADMIN', label: 'Update Admin' },
  { value: 'DEACTIVATE_ADMIN', label: 'Nonaktifkan Admin' },
  { value: 'CREATE_SURVEYOR', label: 'Buat Surveyor' },
  { value: 'UPDATE_SURVEYOR', label: 'Update Surveyor' },
  { value: 'DEACTIVATE_SURVEYOR', label: 'Nonaktifkan Surveyor' },
  { value: 'ACTIVATE_SURVEYOR', label: 'Aktifkan Surveyor' },
  { value: 'CREATE_SURVEY', label: 'Buat Survei' },
  { value: 'UPDATE_SURVEY', label: 'Update Survei' },
  { value: 'ACTIVATE_SURVEY', label: 'Aktifkan Survei' },
  { value: 'DEACTIVATE_SURVEY', label: 'Nonaktifkan Survei' },
  { value: 'DELETE_SURVEY', label: 'Hapus Survei' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'Semua Tipe' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'surveyor', label: 'Surveyor' },
  { value: 'survey', label: 'Survei' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp to local date-time string (id-ID locale).
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Return a human-readable badge colour class for a given action.
 * @param {string} action
 * @returns {string}
 */
function actionBadgeClass(action) {
  if (!action) return 'bg-gray-100 text-gray-700';
  if (action.startsWith('LOGIN') || action.startsWith('LOGOUT')) {
    return 'bg-blue-100 text-blue-700';
  }
  if (action.startsWith('CREATE')) return 'bg-green-100 text-green-700';
  if (action.startsWith('UPDATE')) return 'bg-yellow-100 text-yellow-700';
  if (action.startsWith('DEACTIVATE') || action.startsWith('DELETE')) {
    return 'bg-red-100 text-red-700';
  }
  if (action.startsWith('ACTIVATE')) return 'bg-teal-100 text-teal-700';
  return 'bg-gray-100 text-gray-700';
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AuditLog page — displays a filterable, paginated list of audit log entries.
 */
function AuditLog() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    user_id: '',
    start_date: '',
    end_date: '',
  });

  // ── Data state ────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = { page, limit: 50 };
        if (filters.action) params.action = filters.action;
        if (filters.entity_type) params.entity_type = filters.entity_type;
        if (filters.user_id.trim()) params.user_id = filters.user_id.trim();
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;

        const res = await api.get('/audit-logs', { params });
        setLogs(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, page: 1, limit: 50, total_pages: 1 });
      } catch (err) {
        setError(err.response?.data?.error || 'Gagal memuat data audit log');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchLogs(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleReset = () => {
    setFilters({ action: '', entity_type: '', user_id: '', start_date: '', end_date: '' });
    // Fetch with empty filters after state update
    setTimeout(() => fetchLogs(1), 0);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.total_pages) return;
    fetchLogs(newPage);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Riwayat aktivitas login, logout, dan perubahan data penting
          </p>
        </div>

        {/* Filter form */}
        <form
          onSubmit={handleSearch}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
          aria-label="Filter audit log"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Action filter */}
            <div>
              <label htmlFor="action" className="block text-sm font-medium text-gray-700 mb-1">
                Aksi
              </label>
              <select
                id="action"
                name="action"
                value={filters.action}
                onChange={handleFilterChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity type filter */}
            <div>
              <label htmlFor="entity_type" className="block text-sm font-medium text-gray-700 mb-1">
                Tipe Entitas
              </label>
              <select
                id="entity_type"
                name="entity_type"
                value={filters.entity_type}
                onChange={handleFilterChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ENTITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* User ID filter */}
            <div>
              <label htmlFor="user_id" className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                id="user_id"
                name="user_id"
                type="text"
                value={filters.user_id}
                onChange={handleFilterChange}
                placeholder="UUID pengguna..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Start date */}
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Mulai
              </label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                value={filters.start_date}
                onChange={handleFilterChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* End date */}
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Selesai
              </label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                value={filters.end_date}
                onChange={handleFilterChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                Cari
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </form>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Table header with count */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {loading ? 'Memuat...' : `${pagination.total} entri ditemukan`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200" aria-label="Tabel audit log">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Timestamp
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Pengguna
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Aksi
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Tipe Entitas
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Entity ID
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      Memuat data...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      Tidak ada data audit log yang ditemukan
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {formatTimestamp(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="font-medium">{log.user_name || '-'}</div>
                        {log.user_id && (
                          <div className="text-xs text-gray-400 font-mono truncate max-w-[160px]">
                            {log.user_id}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionBadgeClass(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">
                        {log.entity_type || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                        {log.entity_id ? (
                          <span className="truncate block max-w-[160px]" title={log.entity_id}>
                            {log.entity_id}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Halaman {pagination.page} dari {pagination.total_pages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Halaman sebelumnya"
                >
                  ← Sebelumnya
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Halaman berikutnya"
                >
                  Berikutnya →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default AuditLog;
