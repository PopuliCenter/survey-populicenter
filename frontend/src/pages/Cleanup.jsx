import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';

function CheckCircleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarnIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function StatCard({ title, count, description, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-primary-50 border-primary-200 text-primary-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{title}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{count.toLocaleString('id-ID')}</p>
      <p className="text-xs mt-1 opacity-60">{description}</p>
    </div>
  );
}

function Cleanup() {
  const [stats, setStats] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Manual response cleanup filters
  const [filterSurveyId, setFilterSurveyId] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Manual audit log cleanup filters
  const [auditYear, setAuditYear] = useState('');
  const [auditMonth, setAuditMonth] = useState('');

  // Confirmation state
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/cleanup/stats');
      setStats(res.data);
    } catch {
      // non-critical
    }
  }, []);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await api.get('/surveys');
      setSurveys(res.data || []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchStats(), fetchSurveys()]).finally(() => setLoading(false));
  }, [fetchStats, fetchSurveys]);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 5000);
    return () => clearTimeout(t);
  }, [successMsg]);

  async function handleAction(endpoint, body = {}) {
    setActionLoading(endpoint);
    setErrorMsg(null);
    setConfirmAction(null);
    try {
      const res = await api.post(endpoint, body);
      setSuccessMsg(res.data.message);
      setPreviewCount(null);
      fetchStats();
      fetchSurveys(); // Refresh daftar survei setelah aksi
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewCount(null);
    try {
      const body = {};
      if (filterSurveyId) body.survey_id = filterSurveyId;
      if (filterYear) body.year = Number(filterYear);
      if (filterMonth) body.month = Number(filterMonth);
      const res = await api.post('/cleanup/responses/preview', body);
      setPreviewCount(res.data.count);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Gagal memuat preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  // Generate year options (current year down to 5 years ago)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const months = [
    { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' }, { value: '4', label: 'April' },
    { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' }, { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          Memuat data…
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pembersihan Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola dan bersihkan data lama untuk menjaga performa server.
          </p>
        </div>

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2" role="status">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm" role="alert">
            {errorMsg}
            <button onClick={() => setErrorMsg(null)} className="ml-3 underline text-xs">Tutup</button>
          </div>
        )}

        {/* Stats overview */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Respons Pending" count={stats.pending_responses} description="Lebih dari 24 jam" color="yellow" />
            <StatCard title="Job Ekspor Lama" count={stats.old_export_jobs} description="Lebih dari 7 hari" color="red" />
            <StatCard title="Total Log Audit" count={stats.total_audit_logs} description="Semua waktu" color="blue" />
            <StatCard title="Total Respons" count={stats.total_committed_responses} description="Ter-commit" color="gray" />
            <StatCard title="Survei Nonaktif" count={stats.inactive_surveys} description="Bisa dihapus" color="red" />
            <StatCard title="TPD Nonaktif" count={stats.inactive_tpd} description={`${(stats.deletable_inactive_tpd ?? 0).toLocaleString('id-ID')} bisa dihapus · sisanya punya respons`} color="yellow" />
          </div>
        )}

        {/* Auto Cleanup Section */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Pembersihan Otomatis
          </h2>
          <p className="text-xs text-gray-500">
            Hapus data sementara yang sudah tidak diperlukan secara otomatis.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pending responses cleanup */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Respons Pending</h3>
              <p className="text-xs text-gray-500">
                Hapus respons yang belum selesai diisi dan sudah lebih dari 24 jam.
                Data ini tidak mempengaruhi laporan.
              </p>
              {confirmAction === 'pending' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Yakin hapus {stats?.pending_responses || 0} respons pending?</span>
                  <button
                    onClick={() => handleAction('/cleanup/pending-responses')}
                    disabled={actionLoading === '/cleanup/pending-responses'}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
                  >
                    {actionLoading === '/cleanup/pending-responses' ? 'Menghapus…' : 'Ya, Hapus'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmAction('pending')}
                  disabled={!stats?.pending_responses}
                  className="px-4 py-2 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Bersihkan Respons Pending ({stats?.pending_responses || 0})
                </button>
              )}
            </div>

            {/* Export jobs cleanup */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Job Ekspor Lama</h3>
              <p className="text-xs text-gray-500">
                Hapus record job ekspor yang sudah lebih dari 7 hari.
                File bisa di-generate ulang kapan saja.
              </p>
              {confirmAction === 'export' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Yakin hapus {stats?.old_export_jobs || 0} job ekspor?</span>
                  <button
                    onClick={() => handleAction('/cleanup/export-jobs')}
                    disabled={actionLoading === '/cleanup/export-jobs'}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
                  >
                    {actionLoading === '/cleanup/export-jobs' ? 'Menghapus…' : 'Ya, Hapus'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmAction('export')}
                  disabled={!stats?.old_export_jobs}
                  className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Bersihkan Job Ekspor ({stats?.old_export_jobs || 0})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Manual Cleanup: Responses */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            Pembersihan Manual — Respons
          </h2>
          <p className="text-xs text-gray-500">
            Hapus respons yang sudah ter-commit berdasarkan survei, tahun, atau bulan tertentu.
            <strong className="text-red-500"> Data yang dihapus tidak dapat dikembalikan.</strong>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cleanup-survey" className="block text-xs font-medium text-gray-600 mb-1">
                Survei
              </label>
              <select
                id="cleanup-survey"
                value={filterSurveyId}
                onChange={(e) => { setFilterSurveyId(e.target.value); setPreviewCount(null); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">Semua Survei</option>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cleanup-year" className="block text-xs font-medium text-gray-600 mb-1">
                Tahun
              </label>
              <select
                id="cleanup-year"
                value={filterYear}
                onChange={(e) => { setFilterYear(e.target.value); setPreviewCount(null); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">— Pilih Tahun —</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cleanup-month" className="block text-xs font-medium text-gray-600 mb-1">
                Bulan {!filterYear && <span className="text-gray-500">(pilih tahun dulu)</span>}
              </label>
              <select
                id="cleanup-month"
                value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value); setPreviewCount(null); }}
                disabled={!filterYear}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50"
              >
                <option value="">Semua Bulan</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handlePreview}
              disabled={(!filterSurveyId && !filterYear) || previewLoading}
              className="px-4 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {previewLoading ? 'Menghitung…' : 'Preview Jumlah'}
            </button>

            {previewCount !== null && (
              <span className="text-sm text-gray-600">
                <strong>{previewCount.toLocaleString('id-ID')}</strong> respons akan dihapus
              </span>
            )}
          </div>

          {previewCount > 0 && (
            confirmAction === 'responses' ? (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <WarnIcon className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-xs text-red-700">
                  Yakin hapus <strong>{previewCount.toLocaleString('id-ID')}</strong> respons? Tindakan ini tidak dapat dibatalkan.
                </span>
                <button
                  onClick={() => {
                    const body = {};
                    if (filterSurveyId) body.survey_id = filterSurveyId;
                    if (filterYear) body.year = Number(filterYear);
                    if (filterMonth) body.month = Number(filterMonth);
                    handleAction('/cleanup/responses', body);
                  }}
                  disabled={actionLoading === '/cleanup/responses'}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
                >
                  {actionLoading === '/cleanup/responses' ? 'Menghapus…' : 'Ya, Hapus Permanen'}
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAction('responses')}
                className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Hapus {previewCount.toLocaleString('id-ID')} Respons
              </button>
            )
          )}
        </div>

        {/* Manual Cleanup: Audit Logs */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Pembersihan Manual — Log Audit
          </h2>
          <p className="text-xs text-gray-500">
            Hapus log audit berdasarkan tahun atau bulan. Log audit yang baru akan tetap dicatat.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="audit-year" className="block text-xs font-medium text-gray-600 mb-1">
                Tahun <span className="text-red-500">*</span>
              </label>
              <select
                id="audit-year"
                value={auditYear}
                onChange={(e) => setAuditYear(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">— Pilih Tahun —</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="audit-month" className="block text-xs font-medium text-gray-600 mb-1">
                Bulan
              </label>
              <select
                id="audit-month"
                value={auditMonth}
                onChange={(e) => setAuditMonth(e.target.value)}
                disabled={!auditYear}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50"
              >
                <option value="">Semua Bulan</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {confirmAction === 'audit' ? (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <WarnIcon className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-xs text-red-700">
                Yakin hapus log audit {auditYear}{auditMonth ? ` bulan ${months.find(m => m.value === auditMonth)?.label}` : ''}?
              </span>
              <button
                onClick={() => {
                  const body = { year: Number(auditYear) };
                  if (auditMonth) body.month = Number(auditMonth);
                  handleAction('/cleanup/audit-logs', body);
                }}
                disabled={actionLoading === '/cleanup/audit-logs'}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
              >
                {actionLoading === '/cleanup/audit-logs' ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAction('audit')}
              disabled={!auditYear}
              className="px-4 py-2 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Hapus Log Audit
            </button>
          )}
        </div>

        {/* Hapus Survei Nonaktif */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Hapus Survei Nonaktif
          </h2>
          <p className="text-xs text-gray-500">
            Hapus survei yang sudah dinonaktifkan beserta <strong>semua data terkait</strong> (pertanyaan, respons, jawaban, kuota, job ekspor).
            <strong className="text-red-500"> Pastikan data sudah di-export sebelum menghapus.</strong>
          </p>

          {surveys.filter((s) => s.status === 'inactive').length === 0 ? (
            <p className="text-xs text-gray-500 italic">Tidak ada survei nonaktif.</p>
          ) : (
            <div className="space-y-3">
              {surveys.filter((s) => s.status === 'inactive').map((survey) => (
                <div key={survey.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{survey.title}</p>
                    <p className="text-xs text-gray-500">Status: Nonaktif</p>
                  </div>
                  {confirmAction === `survey-${survey.id}` ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-red-600">Hapus permanen?</span>
                      <button
                        onClick={() => handleAction(`/cleanup/survey/${survey.id}`)}
                        disabled={actionLoading === `/cleanup/survey/${survey.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
                      >
                        {actionLoading === `/cleanup/survey/${survey.id}` ? 'Menghapus…' : 'Ya, Hapus'}
                      </button>
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAction(`survey-${survey.id}`)}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                    >
                      Hapus Survei
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hapus TPD Nonaktif */}
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            Hapus TPD Nonaktif
          </h2>
          <p className="text-xs text-gray-500">
            Hapus akun TPD yang sudah dinonaktifkan. TPD yang masih memiliki data respons akan <strong>dilewati</strong> (tidak dihapus).
            Nonaktifkan TPD terlebih dahulu dari halaman Manajemen TPD sebelum menghapus.
          </p>

          {confirmAction === 'tpd' ? (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <WarnIcon className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-xs text-red-700">
                Yakin hapus {stats?.deletable_inactive_tpd || 0} TPD nonaktif? TPD dengan data respons akan dilewati.
              </span>
              <button
                onClick={() => handleAction('/cleanup/inactive-tpd')}
                disabled={actionLoading === '/cleanup/inactive-tpd'}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50"
              >
                {actionLoading === '/cleanup/inactive-tpd' ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAction('tpd')}
              disabled={!stats?.deletable_inactive_tpd}
              className="px-4 py-2 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Hapus TPD Nonaktif ({stats?.deletable_inactive_tpd || 0})
            </button>
          )}
        </div>

        {/* Info */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
            <WarnIcon className="w-4 h-4 shrink-0" />
            Perhatian
          </h3>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>Data yang dihapus tidak dapat dikembalikan. Pastikan sudah di-backup atau di-export terlebih dahulu.</li>
            <li>Pembersihan respons pending otomatis hanya menghapus yang lebih dari 24 jam.</li>
            <li>Semua aktivitas pembersihan dicatat di log audit.</li>
            <li>Hanya admin yang dapat mengakses fitur ini.</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}

export default Cleanup;
