import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import SurveySelector from '../components/SurveySelector';
import { useToast } from '../components/Toast';
import api from '../services/api';

// ─── Job Status Badge ─────────────────────────────────────────────────────────
/**
 * Renders a colored badge for export job status.
 *
 * @param {{ status: string }} props
 */
function JobStatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-primary-100 text-primary-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  const label = {
    pending: 'Menunggu',
    processing: 'Diproses',
    completed: 'Selesai',
    failed: 'Gagal',
  };
  const cls = map[status] || 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
    >
      {label[status] || status || '—'}
    </span>
  );
}

// ─── Export Job Tracker ───────────────────────────────────────────────────────
/**
 * Tracks a single async export job, polling every 3 seconds until done.
 *
 * @param {{ job: { jobId: string, format: string, surveyTitle: string, startedAt: Date }, onDone: (jobId: string) => void }} props
 */
function ExportJobTracker({ job, onDone }) {
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const BASE_URL = import.meta.env.VITE_API_URL || '';

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get(`/reports/exports/${job.jobId}`);
      const jobStatus = res.data?.status;
      setStatus(jobStatus);

      if (jobStatus === 'completed' || jobStatus === 'failed') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Gagal memeriksa status job.');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [job.jobId]);

  useEffect(() => {
    // Poll immediately, then every 3 seconds
    pollStatus();
    intervalRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pollStatus]);

  function handleDownload() {
    const token = localStorage.getItem('token');
    const url = `${BASE_URL}/reports/exports/${job.jobId}/download`;
    // Create a temporary anchor to trigger download with auth header via URL
    // Since we can't set headers on window.open, we fetch the file as blob
    api
      .get(`/reports/exports/${job.jobId}/download`, { responseType: 'blob' })
      .then((res) => {
        const contentDisposition = res.headers['content-disposition'] || '';
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        const filename =
          filenameMatch?.[1] ||
          `export_${job.jobId}.${job.format === 'xlsx' ? 'xlsx' : 'csv'}`;

        const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch((err) => {
        setError(err.response?.data?.message || err.message || 'Gagal mengunduh file.');
      });
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">
            {job.surveyTitle}
          </span>
          <span className="text-xs text-gray-500 uppercase font-mono bg-gray-200 px-1.5 py-0.5 rounded">
            {job.format}
          </span>
          <JobStatusBadge status={status} />
        </div>
        <span className="text-xs text-gray-400">
          Job ID: <span className="font-mono">{job.jobId}</span> &middot;{' '}
          {job.startedAt.toLocaleTimeString('id-ID')}
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="ml-4 flex-shrink-0">
        {status === 'completed' && (
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
            aria-label={`Unduh file ekspor ${job.format.toUpperCase()} untuk ${job.surveyTitle}`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="M7 11l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Unduh
          </button>
        )}
        {(status === 'pending' || status === 'processing') && (
          <span className="text-xs text-gray-400 animate-pulse">Memproses…</span>
        )}
        {status === 'failed' && (
          <span className="text-xs text-red-500">Ekspor gagal</span>
        )}
      </div>
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
/**
 * Reports & Export page for admin.
 *
 * Features:
 * - Survey selector dropdown (fetched from GET /surveys)
 * - Filter controls: date range (start/end date), surveyor filter
 * - "Ekspor XLSX" and "Ekspor CSV" buttons
 * - Sync export (≤1000 responses): triggers browser download directly
 * - Async export (>1000 responses): shows job status tracker with polling
 * - Multiple simultaneous jobs tracked in a list
 *
 * Requirements: 11.2, 11.3, 11.4, 11.5, 11.6
 */
function Reports() {
  const toast = useToast();

  // ── Current user ────────────────────────────────────────────────────────────
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const isViewer = currentUser.role === 'viewer';

  // ── Dropdown data ───────────────────────────────────────────────────────────
  const [surveys, setSurveys] = useState([]);
  // Viewer cannot access /surveyors endpoint (403), so TPD filter is hidden for them
  const [tpdList, setTpdList] = useState([]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [selectedTpdId, setSelectedTpdId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [responseStatus, setResponseStatus] = useState('committed');

  // ── Export state ────────────────────────────────────────────────────────────
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState(null);

  // ── Async job tracking ──────────────────────────────────────────────────────
  const [activeJobs, setActiveJobs] = useState([]);

  // ── Load dropdown data on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function loadDropdowns() {
      try {
        // Viewer cannot access /surveyors — only fetch surveys for them
        const requests = [api.get('/surveys')];
        if (!isViewer) requests.push(api.get('/surveyors'));

        const [surveysRes, tpdRes] = await Promise.all(requests);
        setSurveys(surveysRes.data || []);
        if (!isViewer && tpdRes) setTpdList(tpdRes.data || []);
      } catch {
        // Non-critical; dropdowns will just be empty
      }
    }
    loadDropdowns();
  }, [isViewer]);

  // ── Build filter params ─────────────────────────────────────────────────────
  function buildParams() {
    const params = {};
    if (selectedTpdId) params.surveyor_id = selectedTpdId;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (responseStatus) params.response_status = responseStatus;
    return params;
  }

  // ── Get selected survey title ───────────────────────────────────────────────
  function getSelectedSurveyTitle() {
    const survey = surveys.find((s) => s.id === selectedSurveyId);
    return survey?.title || selectedSurveyId;
  }

  // ── Handle sync download (blob response) ────────────────────────────────────
  function triggerBlobDownload(blobData, headers, format) {
    const contentDisposition = headers['content-disposition'] || '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    const filename = filenameMatch?.[1] || `export_${selectedSurveyId}.${ext}`;

    const blobUrl = window.URL.createObjectURL(new Blob([blobData]));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  }

  // ── Handle export ───────────────────────────────────────────────────────────
  async function handleExport(format) {
    if (!selectedSurveyId) {
      setExportError('Pilih survei terlebih dahulu sebelum mengekspor.');
      return;
    }

    setExportError(null);
    const setExporting = format === 'xlsx' ? setExportingXlsx : setExportingCsv;
    setExporting(true);

    try {
      const params = buildParams();
      const res = await api.post(
        `/reports/surveys/${selectedSurveyId}/export/${format}`,
        params,
        { responseType: 'blob' }
      );

      // Check if the response is JSON (async job) or a file (sync download)
      const contentType = res.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        // Parse the blob as JSON to get jobId
        const text = await res.data.text();
        const json = JSON.parse(text);

        if (json.jobId) {
          // Async export: add to job tracker
          setActiveJobs((prev) => [
            {
              jobId: json.jobId,
              format,
              surveyTitle: getSelectedSurveyTitle(),
              startedAt: new Date(),
            },
            ...prev,
          ]);
        } else {
          setExportError('Respons tidak terduga dari server.');
        }
      } else {
        // Sync export: trigger browser download
        triggerBlobDownload(res.data, res.headers, format);
        toast.success(`Ekspor ${format.toUpperCase()} berhasil diunduh.`);
      }
    } catch (err) {
      // If the error response is a blob, try to parse it as JSON for the error message
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);

          if (json.jobId) {
            // Actually an async job response (some servers return 202 which axios treats as success)
            setActiveJobs((prev) => [
              {
                jobId: json.jobId,
                format,
                surveyTitle: getSelectedSurveyTitle(),
                startedAt: new Date(),
              },
              ...prev,
            ]);
            return;
          }

          setExportError(json.message || 'Gagal mengekspor data.');
          toast.error(json.message || 'Gagal mengekspor data.');
        } catch {
          setExportError('Gagal mengekspor data.');
          toast.error('Gagal mengekspor data.');
        }
      } else {
        const msg = err.response?.data?.message || err.message || 'Gagal mengekspor data.';
        setExportError(msg);
        toast.error(msg);
      }
    } finally {
      setExporting(false);
    }
  }

  // ── Remove a completed/failed job from the list ─────────────────────────────
  function handleDismissJob(jobId) {
    setActiveJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Laporan &amp; Ekspor</h1>
        </div>

        {/* Export card */}
        <div className="bg-white rounded-xl shadow p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">Ekspor Data Survei</h2>

          {/* Survey selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <SurveySelector
                surveys={surveys}
                value={selectedSurveyId}
                onChange={(id) => {
                  setSelectedSurveyId(id);
                  setExportError(null);
                }}
                label="Survei"
                required
              />
            </div>

            {/* TPD filter — hidden for viewer (no access to /surveyors) */}
            {!isViewer && (
              <div>
                <label
                  htmlFor="export-tpd"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  TPD
                </label>
                <select
                  id="export-tpd"
                  value={selectedTpdId}
                  onChange={(e) => setSelectedTpdId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <option value="">Semua TPD</option>
                  {tpdList.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date range and status filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="export-start-date"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Tanggal Mulai
              </label>
              <input
                id="export-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            <div>
              <label
                htmlFor="export-end-date"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Tanggal Selesai
              </label>
              <input
                id="export-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            <div>
              <label
                htmlFor="export-status"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Status Respons
              </label>
              <select
                id="export-status"
                value={responseStatus}
                onChange={(e) => setResponseStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="committed">Sukses (Ter-commit)</option>
                <option value="pending">Sesi belum selesai (tanpa jawaban)</option>
                <option value="all">Semua</option>
              </select>
            </div>
          </div>

          {/* Export error */}
          {exportError && (
            <div
              className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              role="alert"
            >
              <svg
                className="w-4 h-4 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{exportError}</span>
            </div>
          )}

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={exportingXlsx || exportingCsv}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Ekspor data ke format Excel XLSX"
            >
              {exportingXlsx ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Mengekspor XLSX…
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                  Ekspor XLSX
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exportingXlsx || exportingCsv}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Ekspor data ke format CSV"
            >
              {exportingCsv ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Mengekspor CSV…
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                  Ekspor CSV
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Untuk survei dengan lebih dari 1.000 responden, ekspor akan diproses secara
            asinkron. Status dan link unduhan akan muncul di bawah.
          </p>
        </div>

        {/* Async job tracker */}
        {activeJobs.length > 0 && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Status Job Ekspor ({activeJobs.length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveJobs([])}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Hapus semua job ekspor dari daftar"
              >
                Hapus semua
              </button>
            </div>

            <div className="space-y-2">
              {activeJobs.map((job) => (
                <div key={job.jobId} className="relative">
                  <ExportJobTracker job={job} onDone={handleDismissJob} />
                  <button
                    type="button"
                    onClick={() => handleDismissJob(job.jobId)}
                    className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 leading-none focus:outline-none"
                    aria-label={`Hapus job ${job.jobId} dari daftar`}
                    title="Hapus dari daftar"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-primary-800 mb-1">Informasi Ekspor</h3>
          <ul className="text-xs text-primary-700 space-y-1 list-disc list-inside">
            <li>
              File ekspor mencakup semua kolom metadata: ID responden, nama TPD,
              tanggal &amp; waktu pengisian, nomor kuesioner, timestamp mulai/selesai,
              durasi, latitude, longitude, dan status geolokasi.
            </li>
            <li>
              Untuk pertanyaan bertipe foto, file ekspor menyertakan URL/path foto.
            </li>
            <li>
              Ekspor dengan lebih dari 1.000 responden diproses secara asinkron. Halaman
              ini akan menampilkan status pemrosesan dan link unduhan saat file siap.
            </li>
            <li>
              Format XLSX cocok untuk dibuka di Microsoft Excel atau Google Sheets.
              Format CSV cocok untuk diimpor ke berbagai aplikasi analisis data.
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}

export default Reports;
