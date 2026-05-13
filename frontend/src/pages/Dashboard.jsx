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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Layout from '../components/Layout';
import SurveyProgressCard from '../components/SurveyProgressCard';
import SurveyorProgressTable from '../components/SurveyorProgressTable';
import api from '../services/api';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon, color }) {
  return (
    <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${color}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-gray-800">
          {value !== null && value !== undefined ? value.toLocaleString('id-ID') : '—'}
        </p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Mini Donut ───────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#3b82f6', '#e5e7eb'];

function MiniDonut({ percentage, size = 80 }) {
  const data = [
    { name: 'filled', value: percentage },
    { name: 'remaining', value: 100 - percentage },
  ];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}
            outerRadius={size * 0.45}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-gray-700">{percentage}%</span>
      </div>
    </div>
  );
}

// ─── Survey Overview Card ─────────────────────────────────────────────────────
function SurveyOverviewCard({ title, totalQuota, totalCollected, percentage, onClick }) {
  const remaining = Math.max(0, totalQuota - totalCollected);
  const isComplete = percentage >= 100;

  return (
    <div
      className={`bg-white rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow ${isComplete ? 'border-green-200' : 'border-gray-200'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="flex items-center gap-3">
        <MiniDonut percentage={percentage} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 truncate" title={title}>{title}</p>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{totalCollected.toLocaleString('id-ID')}</span>
              {' / '}
              <span>{totalQuota.toLocaleString('id-ID')}</span>
              {' responden'}
            </p>
            {isComplete ? (
              <p className="text-xs font-medium text-green-600">✓ Target tercapai</p>
            ) : (
              <p className="text-xs text-amber-600">Sisa {remaining.toLocaleString('id-ID')} responden</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Bar Label ─────────────────────────────────────────────────────────
function BarLabel({ x, y, width, value }) {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill="#6b7280" textAnchor="middle" fontSize={11} fontWeight={600}>
      {value}
    </text>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topTPD, setTopTPD] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeSurveys, setActiveSurveys] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [selectedSurvey, setSelectedSurvey] = useState('');
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOverview() {
      setLoading(true);
      setError(null);
      try {
        const params = selectedSurvey ? { survey_id: selectedSurvey } : {};
        const [statsRes, trendRes, topRes] = await Promise.all([
          api.get('/dashboard/stats', { params }),
          api.get('/dashboard/trend', { params }),
          api.get('/dashboard/top-surveyors', { params }),
        ]);
        if (!cancelled) {
          setStats(statsRes.data);
          setTrend(trendRes.data);
          setTopTPD(topRes.data);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Gagal memuat data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOverview();
    return () => { cancelled = true; };
  }, [selectedSurvey]);

  useEffect(() => {
    let cancelled = false;
    async function fetchProgress() {
      setProgressLoading(true);
      try {
        const surveysRes = await api.get('/surveys');
        const active = surveysRes.data.filter((s) => s.status === 'active');
        if (cancelled) return;
        setActiveSurveys(active);

        const results = await Promise.all(
          active.map((s) =>
            api.get(`/dashboard/survey-progress/${s.id}`)
              .then((r) => ({ id: s.id, data: r.data }))
              .catch(() => ({ id: s.id, data: null }))
          )
        );
        if (cancelled) return;
        const map = {};
        results.forEach((r) => { if (r.data) map[r.id] = r.data; });
        setProgressMap(map);
      } catch (err) {
        if (!cancelled) setProgressError(err.message);
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }
    fetchProgress();
    return () => { cancelled = true; };
  }, []);

  async function handleSurveyFilter(surveyId) {
    setSelectedSurvey(surveyId);
    if (surveyId) {
      setDetailLoading(true);
      try {
        const res = await api.get(`/dashboard/survey-progress/${surveyId}`);
        setSelectedProgress(res.data);
      } catch { setSelectedProgress(null); }
      finally { setDetailLoading(false); }
    } else {
      setSelectedProgress(null);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Memuat data dashboard…</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4" role="alert">
          <p className="font-medium">Terjadi kesalahan</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </Layout>
    );
  }

  // Trend data
  const trendData = trend.map((item) => ({
    ...item,
    label: item.date ? new Date(item.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) : item.date,
  }));
  const trendTotal = trend.reduce((sum, t) => sum + (t.count || 0), 0);

  const currentSurveyTitle = selectedSurvey ? activeSurveys.find((s) => s.id === selectedSurvey)?.title : null;
  const dataScopeLabel = selectedSurvey
    ? `Dari survei terpilih: ${currentSurveyTitle || selectedSurvey}`
    : 'Dari semua survei aktif';

  // Overall progress
  const totalQuotaAll = Object.values(progressMap).reduce((s, p) => s + (p.totalQuota || 0), 0);
  const totalCollectedAll = Object.values(progressMap).reduce((s, p) => s + (p.totalCollected || 0), 0);
  const overallPercentage = totalQuotaAll > 0 ? Math.min(100, Math.round((totalCollectedAll / totalQuotaAll) * 1000) / 10) : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-500">{dataScopeLabel}</p>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {selectedSurvey ? 'Survei terpilih' : 'Semua survei aktif'}
            </span>
          </div>
        </div>

        {/* ── Summary stat cards ── */}
        <section aria-label="Statistik ringkasan">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Survei Aktif" value={stats?.activeSurveys} icon="📋" color="bg-blue-100" />
            <StatCard title="TPD Aktif" value={stats?.activeSurveyors} icon="🧑‍💼" color="bg-green-100" />
            <StatCard
              title="Responden Hari Ini"
              value={stats?.todayResponses}
              subtitle={`dari total ${(stats?.totalResponses || 0).toLocaleString('id-ID')} responden`}
              icon="📝"
              color="bg-yellow-100"
            />
            <StatCard
              title="Total Responden (N)"
              value={stats?.totalResponses}
              subtitle={totalQuotaAll > 0 ? `Target: ${totalQuotaAll.toLocaleString('id-ID')} (${overallPercentage}%)` : undefined}
              icon="👥"
              color="bg-purple-100"
            />
          </div>
        </section>

        {/* ── Overall Progress Bar ── */}
        {totalQuotaAll > 0 && (
          <section className="bg-white rounded-lg shadow p-5" aria-label="Progress keseluruhan">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progress Keseluruhan</h2>
              <span className="text-sm font-bold text-blue-700">
                N = {totalCollectedAll.toLocaleString('id-ID')} / {totalQuotaAll.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full transition-all ${overallPercentage >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, overallPercentage)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">{overallPercentage}% tercapai</span>
              <span className="text-xs text-gray-500">Sisa {Math.max(0, totalQuotaAll - totalCollectedAll).toLocaleString('id-ID')} responden</span>
            </div>
          </section>
        )}

        {/* ── 7-day trend chart ── */}
        <section className="bg-white rounded-lg shadow p-5" aria-label="Tren 7 hari">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700">Tren Pengisian (7 Hari Terakhir)</h2>
            <span className="text-sm text-gray-500">
              Total: <span className="font-bold text-gray-700">{trendTotal}</span> responden
            </span>
          </div>
          {trendData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Belum ada data tren.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendData} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value) => [`${value} responden`, 'Jumlah']}
                  labelFormatter={(label) => `Tanggal: ${label}`}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Responden" label={<BarLabel />} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* ── Progress Survei Aktif ── */}
        <section className="bg-white rounded-lg shadow p-5" aria-label="Progress survei aktif">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Progress Survei Aktif</h2>

          <div className="mb-4">
            <select
              value={selectedSurvey}
              onChange={(e) => handleSurveyFilter(e.target.value)}
              disabled={progressLoading}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-72"
            >
              {progressLoading ? (
                <option>Memuat...</option>
              ) : (
                <>
                  <option value="">Semua Survei ({activeSurveys.length})</option>
                  {activeSurveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {progressLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Memuat data progress...</p>
          ) : progressError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4"><p className="text-sm">{progressError}</p></div>
          ) : activeSurveys.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Tidak ada survei aktif.</p>
          ) : selectedSurvey ? (
            <div>
              {progressMap[selectedSurvey] && (
                <div className="mb-4">
                  <SurveyOverviewCard
                    title={progressMap[selectedSurvey].surveyTitle}
                    totalQuota={progressMap[selectedSurvey].totalQuota}
                    totalCollected={progressMap[selectedSurvey].totalCollected}
                    percentage={progressMap[selectedSurvey].completionPercentage}
                  />
                </div>
              )}
              {detailLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">Memuat breakdown...</p>
              ) : selectedProgress ? (
                <SurveyorProgressTable surveyors={selectedProgress.surveyors} />
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeSurveys.map((s) => {
                const p = progressMap[s.id];
                return p ? (
                  <SurveyOverviewCard
                    key={s.id}
                    title={p.surveyTitle}
                    totalQuota={p.totalQuota}
                    totalCollected={p.totalCollected}
                    percentage={p.completionPercentage}
                    onClick={() => handleSurveyFilter(s.id)}
                  />
                ) : null;
              })}
            </div>
          )}
        </section>

        {/* ── Top 5 TPD ── */}
        <section className="bg-white rounded-lg shadow p-5" aria-label="Top 5 TPD">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Top 5 TPD</h2>
          {topTPD.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Belum ada data TPD.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium text-gray-500 w-8">#</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500">Nama</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500">Email</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Jumlah (N)</th>
                  </tr>
                </thead>
                <tbody>
                  {topTPD.map((tpd, index) => (
                    <tr key={tpd.email} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-4 text-gray-400 font-medium">{index + 1}</td>
                      <td className="py-2.5 pr-4 text-gray-800 font-medium">{tpd.name}</td>
                      <td className="py-2.5 pr-4 text-gray-500">{tpd.email}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          N={tpd.responseCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

export default Dashboard;
