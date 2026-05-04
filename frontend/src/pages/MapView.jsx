import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import GeoMap from '../components/GeoMap';
import api from '../services/api';

/**
 * MapView — halaman peta sebaran lokasi wawancara.
 * Supports filtering by survey, TPD, and date range.
 * Map kosong saat pertama dibuka — user harus pilih survei dan klik filter.
 */
function MapView() {
  // Current user role
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const isViewer = currentUser.role === 'viewer';

  const [surveys, setSurveys] = useState([]);
  const [tpdList, setTpdList] = useState([]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFiltered, setHasFiltered] = useState(false);

  // Filter state
  const [surveyId, setSurveyId] = useState('');
  const [tpdId, setTpdId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load dropdown data — fetch surveys dan TPD secara terpisah agar satu gagal tidak mempengaruhi yang lain
  useEffect(() => {
    async function loadSurveys() {
      try {
        const res = await api.get('/surveys');
        let data = res.data?.surveys || res.data || [];
        // Viewer hanya lihat survei aktif
        if (isViewer) {
          data = data.filter((s) => s.status === 'active');
        }
        setSurveys(data);
      } catch {
        // Non-critical
      }
    }

    async function loadTPD() {
      // Viewer tidak punya akses ke /surveyors
      if (isViewer) return;
      try {
        const res = await api.get('/surveyors');
        setTpdList(res.data || []);
      } catch {
        // Non-critical
      }
    }

    loadSurveys();
    loadTPD();
  }, [isViewer]);

  const fetchPoints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (surveyId) params.survey_id = surveyId;
      if (tpdId) params.surveyor_id = tpdId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await api.get('/map/points', { params });
      setPoints(res.data || []);
      setHasFiltered(true);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Gagal memuat data titik lokasi.');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilter = (e) => {
    e.preventDefault();
    fetchPoints();
  };

  const handleResetFilter = () => {
    setSurveyId('');
    setTpdId('');
    setStartDate('');
    setEndDate('');
    setPoints([]);
    setHasFiltered(false);
    setError('');
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peta Sebaran</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pilih survei dan klik filter untuk melihat titik lokasi wawancara.
          </p>
        </div>

        {/* Filter panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <form onSubmit={handleApplyFilter}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              {/* Survey dropdown */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-survey" className="text-xs font-medium text-gray-600">
                  Survei <span className="text-red-500">*</span>
                </label>
                <select
                  id="filter-survey"
                  value={surveyId}
                  onChange={(e) => setSurveyId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— Pilih Survei —</option>
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>

              {/* TPD dropdown — hidden for viewer */}
              {!isViewer && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="filter-tpd" className="text-xs font-medium text-gray-600">
                    TPD
                  </label>
                  <select
                    id="filter-tpd"
                    value={tpdId}
                    onChange={(e) => setTpdId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">Semua TPD</option>
                    {tpdList.map((sv) => (
                      <option key={sv.id} value={sv.id}>{sv.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-start-date" className="text-xs font-medium text-gray-600">
                  Tanggal Mulai
                </label>
                <input
                  id="filter-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* End date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-end-date" className="text-xs font-medium text-gray-600">
                  Tanggal Selesai
                </label>
                <input
                  id="filter-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !surveyId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {loading ? 'Memuat…' : 'Tampilkan'}
                </button>
                {hasFiltered && (
                  <button
                    type="button"
                    onClick={handleResetFilter}
                    className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {!surveyId && !hasFiltered && (
              <p className="text-xs text-amber-600 mt-2">
                Pilih survei terlebih dahulu untuk menampilkan titik lokasi.
              </p>
            )}
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Point count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {loading
              ? 'Memuat titik lokasi…'
              : !hasFiltered
                ? ''
                : points.length > 0
                  ? `Menampilkan ${points.length} titik lokasi`
                  : 'Tidak ada titik lokasi ditemukan untuk filter ini.'}
          </p>
        </div>

        {/* Map */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          {!hasFiltered ? (
            <div className="w-full h-[500px] rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 gap-3">
              <span className="text-5xl">🗺️</span>
              <p className="text-sm">Pilih survei dan klik <strong className="text-gray-600">Tampilkan</strong> untuk melihat peta.</p>
            </div>
          ) : (
            <GeoMap points={points} />
          )}
        </div>
      </div>
    </Layout>
  );
}

export default MapView;
