import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ReviewStatusBadge from '../components/ReviewStatusBadge';
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
 * - Filter controls: date range, surveyor, status (geo_status)
 * - Table: Questionnaire Number, Surveyor Name, Survey Title, Start Time,
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

  // ── Dropdown data ───────────────────────────────────────────────────────────
  const [surveys, setSurveys] = useState([]);
  const [surveyors, setSurveyors] = useState([]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [selectedSurveyorId, setSelectedSurveyorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [geoStatusFilter, setGeoStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');

  // ── Table data ──────────────────────────────────────────────────────────────
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // ── Load dropdown data on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [surveysRes, surveyorsRes] = await Promise.all([
          api.get('/surveys'),
          api.get('/surveyors'),
        ]);
        setSurveys(surveysRes.data || []);
        setSurveyors(surveyorsRes.data || []);
      } catch {
        // Non-critical; filters will just be empty
      }
    }
    loadDropdowns();
  }, []);

  // ── Fetch responses ─────────────────────────────────────────────────────────
  const fetchResponses = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = {};
      if (selectedSurveyId) params.survey_id = selectedSurveyId;
      if (selectedSurveyorId) params.surveyor_id = selectedSurveyorId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (reviewStatusFilter && !isSurveyor) params.review_status = reviewStatusFilter;

      const res = await api.get('/responses', { params });
      let data = res.data || [];

      // Client-side geo_status filter (if backend doesn't support it)
      if (geoStatusFilter) {
        data = data.filter((r) => r.geo_status === geoStatusFilter);
      }

      setResponses(data);
    } catch (err) {
      setFetchError(
        err.response?.data?.message ||
          err.message ||
          'Gagal memuat data responden.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedSurveyId, selectedSurveyorId, startDate, endDate, geoStatusFilter, reviewStatusFilter, isSurveyor]);

  // Fetch on mount
  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function formatTimestamp(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleString('id-ID');
  }

  function formatDuration(seconds) {
    if (seconds == null) return '—';
    return `${seconds} dtk`;
  }

  function handleApplyFilter(e) {
    e.preventDefault();
    fetchResponses();
  }

  function handleResetFilter() {
    setSelectedSurveyId('');
    setSelectedSurveyorId('');
    setStartDate('');
    setEndDate('');
    setGeoStatusFilter('');
    setReviewStatusFilter('');
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Semua Survei</option>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Surveyor selector */}
            <div>
              <label
                htmlFor="filter-surveyor"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Surveyor
              </label>
              <select
                id="filter-surveyor"
                value={selectedSurveyorId}
                onChange={(e) => setSelectedSurveyorId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Semua Surveyor</option>
                {surveyors.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                  </option>
                ))}
              </select>
            </div>

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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Semua Status</option>
                <option value="available">Tersedia</option>
                <option value="lokasi_tidak_tersedia">Ditolak</option>
                <option value="tidak_didukung">Tidak Didukung</option>
                <option value="timeout">Timeout</option>
              </select>
            </div>

            {/* Review status filter — hidden for surveyor */}
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
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

        {/* Table card */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div
              className="flex items-center justify-center h-48 text-gray-400 text-sm"
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
                onClick={fetchResponses}
                className="text-sm text-blue-600 underline hover:text-blue-800"
              >
                Coba lagi
              </button>
            </div>
          ) : responses.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Tidak ada data responden yang sesuai filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      No. Kuesioner
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Surveyor
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Judul Survei
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Waktu Mulai
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Waktu Selesai
                    </th>
                    <th className="px-5 py-3 font-medium text-gray-500 whitespace-nowrap">
                      Durasi
                    </th>
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
                  {responses.map((response) => (
                    <tr
                      key={response.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Questionnaire Number */}
                      <td className="px-5 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {response.questionnaire_number || '—'}
                      </td>

                      {/* Surveyor Name */}
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

                      {/* Review Status — hidden for surveyor */}
                      {!isSurveyor && (
                        <td className="px-5 py-3">
                          <ReviewStatusBadge status={response.review_status} />
                        </td>
                      )}

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => navigate(`/responses/${response.id}`)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                          aria-label={`Lihat detail responden ${response.questionnaire_number}`}
                        >
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Result count */}
        {!loading && !fetchError && responses.length > 0 && (
          <p className="text-xs text-gray-400 text-right">
            Menampilkan {responses.length} responden
          </p>
        )}
      </div>
    </Layout>
  );
}

export default Responses;
