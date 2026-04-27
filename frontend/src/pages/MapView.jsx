import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import SurveySelector from '../components/SurveySelector';
import GeoMap from '../components/GeoMap';
import api from '../services/api';

/**
 * MapView — admin page showing geolocation points on an interactive map.
 * Supports filtering by survey, surveyor, and date range.
 */
function MapView() {
  const [surveys, setSurveys] = useState([]);
  const [surveyors, setSurveyors] = useState([]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter state
  const [surveyId, setSurveyId] = useState('');
  const [surveyorId, setSurveyorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load surveys and surveyors for filter dropdowns
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [surveysRes, surveyorsRes] = await Promise.all([
          api.get('/surveys'),
          api.get('/surveyors'),
        ]);
        setSurveys(surveysRes.data?.surveys || surveysRes.data || []);
        setSurveyors(surveyorsRes.data?.surveyors || surveyorsRes.data || []);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    fetchOptions();
  }, []);

  const fetchPoints = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (surveyId) params.survey_id = surveyId;
      if (surveyorId) params.surveyor_id = surveyorId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await api.get('/map/points', { params });
      setPoints(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data titik lokasi.');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  // Load all points on initial mount
  useEffect(() => {
    fetchPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    fetchPoints();
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peta Sebaran</h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualisasi titik lokasi wawancara berdasarkan data geolokasi.
          </p>
        </div>

        {/* Filter panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
          <form onSubmit={handleApplyFilter} className="space-y-4">
            {/* Survey selector — full width row */}
            <SurveySelector
              surveys={surveys}
              value={surveyId}
              onChange={(id) => setSurveyId(id)}
              label="Survei"
            />

            {/* Other filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              {/* Surveyor dropdown */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-surveyor" className="text-sm font-medium text-gray-700">
                  Surveyor
                </label>
                <select
                  id="filter-surveyor"
                  value={surveyorId}
                  onChange={(e) => setSurveyorId(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Semua Surveyor</option>
                  {surveyors.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-start-date" className="text-sm font-medium text-gray-700">
                  Tanggal Mulai
                </label>
                <input
                  id="filter-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* End date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-end-date" className="text-sm font-medium text-gray-700">
                  Tanggal Selesai
                </label>
                <input
                  id="filter-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Apply button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  {loading ? 'Memuat…' : 'Terapkan Filter'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        {/* Point count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {loading
              ? 'Memuat titik lokasi…'
              : `Menampilkan ${points.length} titik lokasi`}
          </p>
        </div>

        {/* Map */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <GeoMap points={points} />
        </div>
      </div>
    </Layout>
  );
}

export default MapView;
