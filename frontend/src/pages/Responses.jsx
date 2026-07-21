import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ReviewStatusBadge from '../components/ReviewStatusBadge';
import IconButton from '../components/IconButton';
import api from '../services/api';

// ─── Geo Status Badge ─────────────────────────────────────────────────────────
/**
 * Renders a colored badge for geo_status.
 *
 * @param {{ status: string }} props
 */
function GeoStatusBadge({ status }) {
  const map = {
    available: 'bg-green-100 text-green-700',
    lokasi_tidak_tersedia: 'bg-yellow-100 text-yellow-700',
    tidak_didukung: 'bg-gray-100 text-gray-600',
    timeout: 'bg-orange-100 text-orange-700',
  };
  const label = {
    available: 'Tersedia',
    lokasi_tidak_tersedia: 'Ditolak',
    tidak_didukung: 'Tidak Didukung',
    timeout: 'Timeout',
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

// ─── Responses Page ───────────────────────────────────────────────────────────
/**
 * Response list/report page for admin.
 *
 * Features:
 * - Survey selector dropdown
 * - Filter controls: date range, TPD, status (geo_status)
 * - Table: Questionnaire Number, TPD Name, Survey Title, Start Time,
 *          End Time, Duration, Geo Status, Actions
 * - "Lihat Detail" button per row → /responses/:id
 * - Timestamps in local timezone (id-ID)
 *
 * Requirements: 11.1, 11.7, 13.5, 15.5, 15.7, 16.6
 */
function Responses() {
  const navigate = useNavigate();

  // ── Current user (for role-based visibility) ────────────────────────────────
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const isSurveyor = currentUser.role === 'surveyor';
  const isViewer = ['viewer', 'partner_lokal'].includes(currentUser.role);

  // ── Dropdown data ───────────────────────────────────────────────────────────
  const [surveys, setSurveys] = useState([]);
  const [tpdList, setTpdList] = useState([]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [selectedSurveyorId, setSelectedSurveyorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [geoStatusFilter, setGeoStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [qualityFilter, setQualityFilter] = useState(''); // '' | 'short_duration' — chip QC
  const [searchQuery, setSearchQuery] = useState('');

  // ── Table data ──────────────────────────────────────────────────────────────
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [summary, setSummary] = useState(null); // ringkasan kualitas data (agregasi server)

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Client-side sorting (sorts the currently loaded page only) ──────────────
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  function handleSort(key) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  // ── Load dropdown data on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const surveysRes = await api.get('/surveys');
        let allSurveys = surveysRes.data || [];
        // Bug #4: viewer hanya bisa melihat survei yang aktif
        if (isViewer) {
          allSurveys = allSurveys.filter((s) => s.status === 'active');
        }
        setSurveys(allSurveys);

        // Viewer tidak perlu dropdown TPD
        if (!isViewer) {
          const tpdRes = await api.get('/surveyors');
          setTpdList(tpdRes.data || []);
        }
      } catch {
        // Non-critical; filters will just be empty
      }
    }
    loadDropdowns();
  }, [isViewer]);

  // ── Fetch responses ─────────────────────────────────────────────────────────
  // Bug #5: gunakan applied filter state terpisah agar fetch hanya terjadi saat tombol diklik
  const [appliedFilters, setAppliedFilters] = useState(null); // null = belum pernah filter

  const fetchResponses = useCallback(async (filters, pageArg = 1) => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = { page: pageArg, page_size: PAGE_SIZE };
      if (filters.survey_id) params.survey_id = filters.survey_id;
      if (filters.surveyor_id) params.surveyor_id = filters.surveyor_id;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.geo_status) params.geo_status = filters.geo_status; // server-side
      if (filters.q && filters.q.trim()) params.q = filters.q.trim();
      if (filters.review_status && !isSurveyor) params.review_status = filters.review_status;
      if (filters.quality && !isSurveyor) params.quality = filters.quality; // chip QC (server-side)

      const res = await api.get('/responses', { params });
      setResponses(res.data || []);

      // Total dari header pagination (fallback ke panjang data)
      const totalHeader = res.headers?.['x-total-count'];
      setTotal(totalHeader != null ? (parseInt(totalHeader, 10) || 0) : (res.data?.length || 0));
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat data responden.'
      );
    } finally {
      setLoading(false);
    }
  }, [isSurveyor]);

  // Ringkasan kualitas data (agregasi server, AKURAT lintas halaman). Hanya
  // memakai filter DASAR (survei/TPD/tanggal) — bukan chip quality/review — agar
  // angka breakdown tetap stabil saat chip berpindah. Khusus non-surveyor.
  const fetchSummary = useCallback(async (filters) => {
    if (isSurveyor) return;
    try {
      const params = {};
      if (filters.survey_id) params.survey_id = filters.survey_id;
      if (filters.surveyor_id) params.surveyor_id = filters.surveyor_id;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      const res = await api.get('/responses/quality-summary', { params });
      setSummary(res.data || null);
    } catch {
      setSummary(null); // kartu ringkasan tersembunyi bila gagal
    }
  }, [isSurveyor]);

  // Bug #5: jangan fetch otomatis saat mount, tunggu user klik filter.
  // Fetch juga saat halaman (page) berubah.
  useEffect(() => {
    if (appliedFilters !== null) {
      fetchResponses(appliedFilters, page);
    }
  }, [appliedFilters, page, fetchResponses]);

  // Ringkasan disegarkan saat filter dasar berubah (bukan saat ganti halaman).
  useEffect(() => {
    if (appliedFilters !== null) {
      fetchSummary(appliedFilters);
    }
  }, [appliedFilters, fetchSummary]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function formatTimestamp(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleString('id-ID');
  }

  function formatDuration(seconds) {
    if (seconds == null) return '—';
    return `${seconds} dtk`;
  }

  // ── Sort helpers ────────────────────────────────────────────────────────────
  // Map a sort key to a comparable value for a given response row.
  function sortValue(row, key) {
    switch (key) {
      case 'questionnaire_number':
        return row.questionnaire_number || '';
      case 'surveyor_name':
        return (row.surveyor_name || '').toLowerCase();
      case 'start_time':
        return row.start_time ? new Date(row.start_time).getTime() : -Infinity;
      case 'end_time':
        return row.end_time ? new Date(row.end_time).getTime() : -Infinity;
      case 'duration_seconds':
        return row.duration_seconds == null ? -Infinity : Number(row.duration_seconds);
      default:
        return '';
    }
  }

  const sortedResponses = (() => {
    if (!sort.key) return responses;
    const arr = [...responses];
    arr.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'id-ID', { numeric: true });
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  })();

  // QC: jumlah baris pada halaman ini yang jenis kelaminnya tak sesuai paritas
  // nomor kuesioner (dihitung server-side sebagai gender_parity_mismatch).
  const parityFlaggedCount = sortedResponses.filter((r) => r.gender_parity_mismatch === true).length;


  // Inline SVG sort indicator (ascending/descending chevron).
  function SortIcon({ active, dir }) {
    if (!active) {
      // Neutral up/down indicator
      return (
        <svg
          className="w-3.5 h-3.5 text-gray-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 9l4-4 4 4" />
          <path d="M16 15l-4 4-4-4" />
        </svg>
      );
    }
    return (
      <svg
        className="w-3.5 h-3.5 text-primary-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dir === 'asc' ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    );
  }

  // Renders a sortable, keyboard-accessible table header cell.
  function SortableTh({ sortKey, children, align = 'left' }) {
    const active = sort.key === sortKey;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={`px-5 py-3 font-medium text-gray-500 whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
      >
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={`inline-flex items-center gap-1 font-medium hover:text-gray-700 focus:outline-none focus:text-gray-700 ${active ? 'text-gray-700' : ''}`}
        >
          <span>{children}</span>
          <SortIcon active={active} dir={sort.dir} />
        </button>
      </th>
    );
  }

  function handleApplyFilter(e) {
    e.preventDefault();
    setPage(1); // selalu mulai dari halaman 1 saat filter baru
    setAppliedFilters({
      survey_id: selectedSurveyId,
      surveyor_id: selectedSurveyorId,
      start_date: startDate,
      end_date: endDate,
      geo_status: geoStatusFilter,
      review_status: reviewStatusFilter,
      quality: qualityFilter,
      q: searchQuery,
    });
  }

  function handleResetFilter() {
    setSelectedSurveyId('');
    setSelectedSurveyorId('');
    setStartDate('');
    setEndDate('');
    setGeoStatusFilter('');
    setReviewStatusFilter('');
    setQualityFilter('');
    setSearchQuery('');
    setPage(1);
    setAppliedFilters(null);
    setResponses([]);
    setTotal(0);
    setSummary(null);
  }

  // Chip kualitas: filter cepat lintas halaman (server-side). Mempertahankan
  // filter dasar (survei/TPD/tanggal) yang sedang aktif.
  function applyChip(chip) {
    if (!appliedFilters) return; // chip hanya aktif setelah filter dijalankan
    const review = chip === 'unreviewed' || chip === 'verified' || chip === 'flagged' ? chip : '';
    const quality = chip === 'short_duration' ? 'short_duration' : '';
    setReviewStatusFilter(review);
    setQualityFilter(quality);
    setPage(1);
    setAppliedFilters({ ...appliedFilters, review_status: review, quality });
  }

  // Chip aktif diturunkan dari state filter — tak perlu state terpisah.
  const activeChip = qualityFilter === 'short_duration'
    ? 'short_duration'
    : ['unreviewed', 'verified', 'flagged'].includes(reviewStatusFilter)
      ? reviewStatusFilter
      : 'all';

  // Verifikasi/tandai cepat dari baris (tanpa buka detail). Pakai endpoint review
  // yang sudah ada; perbarui baris & segarkan ringkasan setelah sukses.
  const [reviewingId, setReviewingId] = useState(null);
  async function quickReview(id, status) {
    setReviewingId(id);
    try {
      const res = await api.patch(`/responses/${id}/review`, { review_status: status });
      setResponses((prev) => prev.map((r) => (r.id === id ? { ...r, review_status: res.data.review_status } : r)));
      if (appliedFilters) fetchSummary(appliedFilters);
    } catch (err) {
      setFetchError(err.response?.data?.error || err.message || 'Gagal memperbarui status review.');
    } finally {
      setReviewingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Data Responden</h1>
        </div>

        {/* Filter card */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Filter</h2>
          <form
            onSubmit={handleApplyFilter}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {/* Search by questionnaire number */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="filter-q" className="block text-xs font-medium text-gray-600 mb-1">
                Cari Nomor Kuesioner
              </label>
              <input
                id="filter-q"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="mis. 0001 atau SK-YYYYMMDD-0001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            {/* Survey selector */}
            <div>
              <label
                htmlFor="filter-survey"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Survei
              </label>
              <select
                id="filter-survey"
                value={selectedSurveyId}
                onChange={(e) => setSelectedSurveyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">Semua Survei</option>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            {/* TPD selector — disembunyikan untuk viewer */}
            {!isViewer && (
            <div>
              <label
                htmlFor="filter-surveyor"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                TPD
              </label>
              <select
                id="filter-surveyor"
                value={selectedSurveyorId}
                onChange={(e) => setSelectedSurveyorId(e.target.value)}
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

            {/* Geo status filter */}
            <div>
              <label
                htmlFor="filter-geo-status"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Status Geolokasi
              </label>
              <select
                id="filter-geo-status"
                value={geoStatusFilter}
                onChange={(e) => setGeoStatusFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">Semua Status</option>
                <option value="available">Tersedia</option>
                <option value="lokasi_tidak_tersedia">Ditolak</option>
                <option value="tidak_didukung">Tidak Didukung</option>
                <option value="timeout">Timeout</option>
              </select>
            </div>

            {/* Review status filter — hidden for TPD */}
            {!isSurveyor && (
              <div>
                <label
                  htmlFor="filter-review-status"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Status Review
                </label>
                <select
                  id="filter-review-status"
                  value={reviewStatusFilter}
                  onChange={(e) => setReviewStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <option value="">Semua</option>
                  <option value="unreviewed">Unreviewed</option>
                  <option value="flagged">Flagged</option>
                  <option value="verified">Verified</option>
                </select>
              </div>
            )}

            {/* Start date */}
            <div>
              <label
                htmlFor="filter-start-date"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Tanggal Mulai
              </label>
              <input
                id="filter-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            {/* End date */}
            <div>
              <label
                htmlFor="filter-end-date"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Tanggal Selesai
              </label>
              <input
                id="filter-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                Terapkan Filter
              </button>
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* QC banner: ketidaksesuaian jenis kelamin vs paritas nomor kuesioner */}
        {!loading && !fetchError && parityFlaggedCount > 0 && (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <svg className="w-5 h-5 shrink-0 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" />
            </svg>
            <span>
              <strong>{parityFlaggedCount}</strong> baris pada halaman ini ditandai:
              jenis kelamin <strong>tidak sesuai</strong> paritas nomor kuesioner
              (ganjil = Laki-laki, genap = Perempuan). Periksa &amp; verifikasi lewat "Lihat Detail".
            </span>
          </div>
        )}

        {/* Ringkasan kualitas data — agregasi server, AKURAT lintas halaman */}
        {!isSurveyor && !fetchError && appliedFilters && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total responden', value: summary.total, cls: 'text-gray-800' },
              { label: 'Durasi singkat', value: summary.short_duration, cls: 'text-amber-600' },
              { label: 'Belum direview', value: summary.unreviewed, cls: 'text-gray-800' },
              { label: 'Terverifikasi', value: summary.verified, cls: 'text-green-600' },
              { label: 'Cakupan GPS', value: `${summary.total ? Math.round((summary.gps_with / summary.total) * 100) : 0}%`, cls: 'text-blue-600' },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{t.label}</p>
                <p className={`text-2xl font-semibold mt-0.5 ${t.cls}`}>{t.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chip filter kualitas — filter cepat lintas halaman (server-side) */}
        {!isSurveyor && !fetchError && appliedFilters && summary && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter kualitas data">
            {[
              { key: 'all', label: 'Semua', count: summary.total, dot: 'bg-gray-400' },
              { key: 'short_duration', label: 'Durasi singkat', count: summary.short_duration, dot: 'bg-amber-500' },
              { key: 'unreviewed', label: 'Belum direview', count: summary.unreviewed, dot: 'bg-gray-400' },
              { key: 'verified', label: 'Terverifikasi', count: summary.verified, dot: 'bg-green-500' },
            ].map((c) => {
              const active = activeChip === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => applyChip(c.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} aria-hidden="true"></span>
                  {c.label}
                  <span className="font-semibold tabular-nums">{c.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {appliedFilters === null ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm gap-2">
              <svg
                className="w-10 h-10 text-gray-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <p>Pilih filter dan klik <strong className="text-gray-600">Terapkan Filter</strong> untuk melihat data.</p>
            </div>
          ) : loading ? (
            <div
              className="flex items-center justify-center h-48 text-gray-500 text-sm"
              role="status"
              aria-live="polite"
            >
              Memuat data responden…
            </div>
          ) : fetchError ? (
            <div
              className="flex flex-col items-center justify-center h-48 gap-3"
              role="alert"
            >
              <p className="text-red-600 text-sm">{fetchError}</p>
              <button
                onClick={() => appliedFilters && fetchResponses(appliedFilters)}
                className="text-sm text-primary-600 underline hover:text-primary-800"
              >
                Coba lagi
              </button>
            </div>
          ) : responses.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              Tidak ada data responden yang sesuai filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <SortableTh sortKey="questionnaire_number">No. Kuesioner</SortableTh>
                    <SortableTh sortKey="surveyor_name">TPD</SortableTh>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Judul Survei
                    </th>
                    <SortableTh sortKey="start_time">Waktu Mulai</SortableTh>
                    <SortableTh sortKey="end_time">Waktu Selesai</SortableTh>
                    <SortableTh sortKey="duration_seconds">Durasi</SortableTh>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Geolokasi
                    </th>
                    {!isSurveyor && (
                      <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                        Status Review
                      </th>
                    )}
                    <th className="px-5 py-3 font-medium text-gray-500 text-right whitespace-nowrap">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedResponses.map((response) => (
                    <tr
                      key={response.id}
                      className={`group transition-colors ${
                        response.gender_parity_mismatch === true
                          ? 'bg-red-50 hover:bg-red-100'
                          : response.short_duration === true
                            ? 'bg-amber-50 hover:bg-amber-100'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Questionnaire Number */}
                      <td className="px-5 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {response.questionnaire_number || '—'}
                          {response.gender_parity_mismatch === true && (
                            <span
                              title="Jenis kelamin tidak sesuai paritas nomor kuesioner (ganjil = Laki-laki, genap = Perempuan)"
                              className="inline-flex items-center gap-0.5 rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-2xs font-semibold"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" />
                              </svg>
                              JK
                            </span>
                          )}
                          {response.short_duration === true && (
                            <span
                              title="Durasi pengisian terlalu singkat (di bawah ambang survei) — indikasi wawancara terburu-buru"
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-2xs font-semibold"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Durasi
                            </span>
                          )}
                        </span>
                      </td>

                      {/* TPD Name */}
                      <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                        {response.surveyor_name || '—'}
                      </td>

                      {/* Survey Title */}
                      <td className="px-5 py-3 text-gray-700 max-w-xs">
                        <span
                          className="block truncate"
                          title={response.survey_title}
                        >
                          {response.survey_title || '—'}
                        </span>
                      </td>

                      {/* Start Time */}
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {formatTimestamp(response.start_time)}
                      </td>

                      {/* End Time */}
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {formatTimestamp(response.end_time)}
                      </td>

                      {/* Duration */}
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {formatDuration(response.duration_seconds)}
                      </td>

                      {/* Geo Status */}
                      <td className="px-5 py-3">
                        <GeoStatusBadge status={response.geo_status} />
                      </td>

                      {/* Review Status — hidden for TPD */}
                      {!isSurveyor && (
                        <td className="px-5 py-3">
                          <ReviewStatusBadge status={response.review_status} />
                        </td>
                      )}

                      {/* Actions — verifikasi/tandai cepat muncul saat hover baris */}
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!isSurveyor && (
                            <div className="hidden group-hover:flex items-center gap-1">
                              {response.review_status !== 'verified' && (
                                <button
                                  type="button"
                                  onClick={() => quickReview(response.id, 'verified')}
                                  disabled={reviewingId === response.id}
                                  title="Verifikasi responden ini"
                                  aria-label={`Verifikasi responden ${response.questionnaire_number}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 px-2 py-1 text-xs font-medium transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  Verifikasi
                                </button>
                              )}
                              {response.review_status !== 'flagged' && (
                                <button
                                  type="button"
                                  onClick={() => quickReview(response.id, 'flagged')}
                                  disabled={reviewingId === response.id}
                                  title="Tandai responden ini untuk ditinjau"
                                  aria-label={`Tandai responden ${response.questionnaire_number}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 px-2 py-1 text-xs font-medium transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2z" />
                                  </svg>
                                  Tandai
                                </button>
                              )}
                            </div>
                          )}
                          <IconButton
                            icon="view"
                            variant="primary"
                            label={`Lihat detail responden ${response.questionnaire_number}`}
                            onClick={() => navigate(`/responses/${response.id}`)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && !fetchError && total > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-500">
              Menampilkan <strong>{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)}</strong>
              {' '}dari <strong>{total.toLocaleString('id-ID')}</strong> responden
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 h-9 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Sebelumnya
              </button>
              <span className="px-3 text-sm text-gray-600">Hal. {page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 h-9 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Berikutnya ›
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Responses;
