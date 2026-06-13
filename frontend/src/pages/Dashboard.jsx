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
import DashboardProvinceMap from '../components/DashboardProvinceMap';
import DashboardTimePattern from '../components/DashboardTimePattern';
import DashboardDataQuality from '../components/DashboardDataQuality';
import LazyInView from '../components/LazyInView';
import api from '../services/api';

// ─── Ikon garis (SVG) ───────────────────────────────────────────────────────────
const DASH_ICON_PATHS = {
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a1 1 0 01.7.3l5.4 5.4a1 1 0 01.3.7V19a2 2 0 01-2 2z',
  brief: 'M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1m-9 0h14a1 1 0 011 1v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a1 1 0 011-1z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 4h6',
  users: 'M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a3 3 0 11-2 5',
};

function DIcon({ name, className = 'w-5 h-5' }) {
  const d = DASH_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, iconName, tint, trend }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`} aria-hidden="true">
          <DIcon name={iconName} />
        </div>
        {trend && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 15l7-7 7 7" />
            </svg>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-3">
        {value !== null && value !== undefined ? value.toLocaleString('id-ID') : '—'}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{title}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
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
      className={`bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${isComplete ? 'border-green-200' : 'border-gray-200'}`}
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} aria-hidden="true" />;
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <Skeleton className="h-7 w-20 mt-3" />
      <Skeleton className="h-3 w-24 mt-2" />
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
  const [statsLoading, setStatsLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
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
    const params = selectedSurvey ? { survey_id: selectedSurvey } : {};

    // Tiga permintaan independen → tiap bagian tampil begitu datanya tiba
    // (render bertahap), bukan menunggu ketiganya selesai.
    setStatsLoading(true);
    setTrendLoading(true);
    setTopLoading(true);
    setError(null);

    api.get('/dashboard/stats', { params })
      .then((r) => { if (!cancelled) setStats(r.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || err.message || 'Gagal memuat statistik.'); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });

    api.get('/dashboard/trend', { params })
      .then((r) => { if (!cancelled) setTrend(r.data); })
      .catch(() => { if (!cancelled) setTrend([]); })
      .finally(() => { if (!cancelled) setTrendLoading(false); });

    api.get('/dashboard/top-surveyors', { params })
      .then((r) => { if (!cancelled) setTopTPD(r.data); })
      .catch(() => { if (!cancelled) setTopTPD([]); })
      .finally(() => { if (!cancelled) setTopLoading(false); });

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

  // Laju & proyeksi (scope mengikuti survei terpilih bila ada)
  const paceScope = selectedSurvey ? progressMap[selectedSurvey] : null;
  const paceTarget = paceScope ? paceScope.totalQuota : totalQuotaAll;
  const paceCollected = paceScope ? paceScope.totalCollected : totalCollectedAll;
  const avgPerDay = trend.length > 0 ? trendTotal / trend.length : 0;
  const paceRemaining = Math.max(0, paceTarget - paceCollected);
  const daysNeeded = avgPerDay > 0 && paceRemaining > 0 ? Math.ceil(paceRemaining / avgPerDay) : null;
  const projectedDate = daysNeeded != null ? new Date(Date.now() + daysNeeded * 86400000) : null;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-500">{dataScopeLabel}</p>
            <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
              {selectedSurvey ? 'Survei terpilih' : 'Semua survei aktif'}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4" role="alert">
            <p className="font-medium">Terjadi kesalahan</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* ── Summary stat cards ── */}
        <section aria-label="Statistik ringkasan">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {statsLoading && !stats ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard title="Survei Aktif" value={stats?.activeSurveys} iconName="doc" tint="bg-primary-50 text-primary-600" />
                <StatCard title="TPD Aktif" value={stats?.activeSurveyors} iconName="brief" tint="bg-emerald-50 text-emerald-600" />
                <StatCard
                  title="Responden Hari Ini"
                  value={stats?.todayResponses}
                  subtitle={`dari total ${(stats?.totalResponses || 0).toLocaleString('id-ID')} responden`}
                  iconName="clipboard"
                  tint="bg-amber-50 text-amber-600"
                  trend={stats?.todayResponses > 0 ? `${stats.todayResponses.toLocaleString('id-ID')} hari ini` : undefined}
                />
                <StatCard
                  title="Total Responden (N)"
                  value={stats?.totalResponses}
                  subtitle={totalQuotaAll > 0 ? `Target: ${totalQuotaAll.toLocaleString('id-ID')} (${overallPercentage}%)` : undefined}
                  iconName="users"
                  tint="bg-violet-50 text-violet-600"
                />
              </>
            )}
          </div>
        </section>

        {/* ── Overall Progress Bar ── */}
        {totalQuotaAll > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Progress keseluruhan">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progress Keseluruhan</h2>
              <span className="text-sm font-bold text-primary-700">
                N = {totalCollectedAll.toLocaleString('id-ID')} / {totalQuotaAll.toLocaleString('id-ID')}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${overallPercentage >= 100 ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-primary-500 to-indigo-600'}`}
                style={{ width: `${Math.min(100, overallPercentage)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">{overallPercentage}% tercapai</span>
              <span className="text-xs text-gray-500">Sisa {Math.max(0, totalQuotaAll - totalCollectedAll).toLocaleString('id-ID')} responden</span>
            </div>
          </section>
        )}

        {/* ── Laju & Proyeksi ── */}
        {paceTarget > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Laju dan proyeksi">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Laju &amp; Proyeksi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Laju (7 hari)</p>
                <p className="text-xl font-bold text-gray-800">{Math.round(avgPerDay).toLocaleString('id-ID')}<span className="text-sm font-normal text-gray-400"> /hari</span></p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Sisa target</p>
                <p className="text-xl font-bold text-gray-800">{paceRemaining.toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Estimasi selesai</p>
                {paceRemaining === 0 ? (
                  <p className="text-xl font-bold text-green-600">Tercapai ✓</p>
                ) : projectedDate ? (
                  <p className="text-xl font-bold text-gray-800">
                    {projectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    <span className="text-sm font-normal text-gray-400"> · {daysNeeded} hari</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Belum bisa diestimasi (laju 0)</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── 7-day trend chart ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Tren 7 hari">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700">Tren Pengisian (7 Hari Terakhir)</h2>
            <span className="text-sm text-gray-500">
              Total: <span className="font-bold text-gray-700">{trendTotal}</span> responden
            </span>
          </div>
          {trendLoading && trend.length === 0 ? (
            <Skeleton className="w-full h-[280px]" />
          ) : trendData.length === 0 ? (
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

        {/* ── Pola waktu masuk (lazy: fetch saat di-scroll) ── */}
        <LazyInView minHeight={300}>
          <DashboardTimePattern surveyId={selectedSurvey} />
        </LazyInView>

        {/* ── Peta sebaran provinsi (manual load) ── */}
        <DashboardProvinceMap surveyId={selectedSurvey} />

        {/* ── Kualitas data (lazy: fetch saat di-scroll) ── */}
        <LazyInView minHeight={220}>
          <DashboardDataQuality surveyId={selectedSurvey} />
        </LazyInView>

        {/* ── Progress Survei Aktif ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Progress survei aktif">
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
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Top 5 TPD">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Top 5 TPD</h2>
          {topLoading && topTPD.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topTPD.length === 0 ? (
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
                  {topTPD.map((tpd, index) => {
                    const initials = (tpd.name || tpd.email || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
                    const rankTint = index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
                    return (
                    <tr key={tpd.email} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-4 text-gray-400 font-medium">{index + 1}</td>
                      <td className="py-2.5 pr-4 text-gray-800 font-medium">
                        <span className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rankTint}`}>{initials}</span>
                          {tpd.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{tpd.email}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700">
                          N={tpd.responseCount}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
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
