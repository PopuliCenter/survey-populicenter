import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import Layout from '../components/Layout';
import SurveyProgressCard from '../components/SurveyProgressCard';
import SurveyorProgressTable from '../components/SurveyorProgressTable';
import api from '../services/api';

// ─── Stat Card ────────────────────────────────────────────────────────────────
/**
 * Displays a single summary statistic.
 *
 * @param {{ title: string, value: number|string, icon: string, color: string }} props
 */
function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${color}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">
          {value !== null && value !== undefined ? value : '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
/**
 * Admin dashboard page.
 * Displays 4 summary stat cards, a 7-day response trend chart, and a top-5
 * surveyors table.
 *
 * Data is fetched from:
 *   GET /dashboard/stats
 *   GET /dashboard/trend
 *   GET /dashboard/top-surveyors
 */
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topSurveyors, setTopSurveyors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Progress section state (independent from stats/trend/top-surveyors)
  const [activeSurveys, setActiveSurveys] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [selectedSurvey, setSelectedSurvey] = useState('');
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, trendRes, topRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/trend'),
          api.get('/dashboard/top-surveyors'),
        ]);

        if (!cancelled) {
          setStats(statsRes.data);
          setTrend(trendRes.data);
          setTopSurveyors(topRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.message ||
              err.message ||
              'Gagal memuat data dashboard.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Independent fetch for progress section
  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      setProgressLoading(true);
      setProgressError(null);
      try {
        // Fetch active surveys list
        const surveysRes = await api.get('/surveys');
        const active = surveysRes.data.filter((s) => s.status === 'active');
        if (cancelled) return;
        setActiveSurveys(active);

        // Fetch progress for each active survey
        const progressResults = await Promise.all(
          active.map((s) =>
            api.get(`/dashboard/survey-progress/${s.id}`)
              .then((r) => ({ id: s.id, data: r.data }))
              .catch(() => ({ id: s.id, data: null }))
          )
        );

        if (cancelled) return;
        const map = {};
        progressResults.forEach((r) => { if (r.data) map[r.id] = r.data; });
        setProgressMap(map);
      } catch (err) {
        if (!cancelled) {
          setProgressError(err.response?.data?.error || err.message || 'Gagal memuat data progress.');
        }
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }

    fetchProgress();
    return () => { cancelled = true; };
  }, []);

  // Handler for survey filter dropdown
  async function handleSurveyFilter(surveyId) {
    setSelectedSurvey(surveyId);
    if (surveyId) {
      setDetailLoading(true);
      try {
        const res = await api.get(`/dashboard/survey-progress/${surveyId}`);
        setSelectedProgress(res.data);
      } catch {
        setSelectedProgress(null);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setSelectedProgress(null);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
          <div className="text-gray-500 text-sm">Memuat data dashboard…</div>
        </div>
      </Layout>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Layout>
        <div
          className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4"
          role="alert"
        >
          <p className="font-medium">Terjadi kesalahan</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </Layout>
    );
  }

  // ── Format trend dates for display ────────────────────────────────────────
  const trendData = trend.map((item) => ({
    ...item,
    label: item.date
      ? new Date(item.date).toLocaleDateString('id-ID', {
          month: 'short',
          day: 'numeric',
        })
      : item.date,
  }));

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Page title ── */}
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

        {/* ── Summary stat cards ── */}
        <section aria-label="Statistik ringkasan">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Survei Aktif"
              value={stats?.activeSurveys}
              icon="📋"
              color="bg-blue-100"
            />
            <StatCard
              title="Surveyor Aktif"
              value={stats?.activeSurveyors}
              icon="🧑‍💼"
              color="bg-green-100"
            />
            <StatCard
              title="Responden Hari Ini"
              value={stats?.todayResponses}
              icon="📝"
              color="bg-yellow-100"
            />
            <StatCard
              title="Total Responden"
              value={stats?.totalResponses}
              icon="👥"
              color="bg-purple-100"
            />
          </div>
        </section>

        {/* ── 7-day trend chart ── */}
        <section
          className="bg-white rounded-lg shadow p-5"
          aria-label="Grafik tren pengisian responden 7 hari terakhir"
        >
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Tren Pengisian Responden (7 Hari Terakhir)
          </h2>
          {trendData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Belum ada data tren.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={trendData}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value) => [value, 'Responden']}
                  labelFormatter={(label) => `Tanggal: ${label}`}
                />
                <Legend
                  formatter={() => 'Jumlah Responden'}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* ── Top 5 surveyors ── */}
        <section
          className="bg-white rounded-lg shadow p-5"
          aria-label="Daftar 5 surveyor teratas"
        >
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Top 5 Surveyor
          </h2>
          {topSurveyors.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Belum ada data surveyor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium text-gray-500 w-8">#</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500">Nama</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500">Email</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">
                      Jumlah Responden
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topSurveyors.map((surveyor, index) => (
                    <tr
                      key={surveyor.email}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2.5 pr-4 text-gray-400 font-medium">
                        {index + 1}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-800 font-medium">
                        {surveyor.name}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{surveyor.email}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {surveyor.responseCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Progress Survei Aktif ── */}
        <section className="bg-white rounded-lg shadow p-5" aria-label="Progress survei aktif">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Progress Survei Aktif</h2>

          {/* Filter Dropdown */}
          <div className="mb-4">
            <label htmlFor="survey-filter" className="block text-xs font-medium text-gray-600 mb-1">
              Pilih Survei
            </label>
            <select
              id="survey-filter"
              value={selectedSurvey}
              onChange={(e) => handleSurveyFilter(e.target.value)}
              disabled={progressLoading}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64"
            >
              {progressLoading ? (
                <option>Memuat...</option>
              ) : (
                <>
                  <option value="">Semua Survei</option>
                  {activeSurveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Content */}
          {progressLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Memuat data progress...</p>
          ) : progressError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4" role="alert">
              <p className="text-sm">{progressError}</p>
            </div>
          ) : activeSurveys.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Tidak ada survei aktif saat ini.</p>
          ) : selectedSurvey ? (
            /* Selected survey view + breakdown table */
            <div>
              {progressMap[selectedSurvey] && (
                <SurveyProgressCard {...progressMap[selectedSurvey]} />
              )}
              {detailLoading ? (
                <p className="text-sm text-gray-400 text-center py-4 mt-4">Memuat data breakdown...</p>
              ) : selectedProgress ? (
                <div className="mt-4">
                  <SurveyorProgressTable surveyors={selectedProgress.surveyors} />
                </div>
              ) : null}
            </div>
          ) : (
            /* All surveys card grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeSurveys.map((s) => {
                const progress = progressMap[s.id];
                return progress ? (
                  <SurveyProgressCard
                    key={s.id}
                    surveyTitle={progress.surveyTitle}
                    totalQuota={progress.totalQuota}
                    totalCollected={progress.totalCollected}
                    completionPercentage={progress.completionPercentage}
                    onClick={() => handleSurveyFilter(s.id)}
                  />
                ) : null;
              })}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

export default Dashboard;
