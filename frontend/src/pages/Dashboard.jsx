import React, { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import Layout from '../components/Layout';
import SurveyorProgressTable from '../components/SurveyorProgressTable';
import DashboardProvinceMap from '../components/DashboardProvinceMap';
import DashboardTimePattern from '../components/DashboardTimePattern';
import DashboardDataQuality from '../components/DashboardDataQuality';
import LazyInView from '../components/LazyInView';
import api from '../services/api';
import { CHART, AXIS_TICK, TOOLTIP_STYLE } from '../theme/chartTheme';

const PANEL = 'bg-white rounded-lg border border-gray-200 p-5';

// ─── Metrik ───────────────────────────────────────────────────────────────────
// Angka adalah isi halaman ini: tanpa ikon hias, tabular-nums agar tidak
// "bergoyang" saat dashboard menyegarkan berkala.
function Metric({ label, value, note }) {
  return (
    <div className="bg-white px-5 py-4 min-w-0">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
        {value !== null && value !== undefined ? value.toLocaleString('id-ID') : '—'}
      </p>
      {note && <p className="text-2xs text-gray-500 mt-1 truncate" title={note}>{note}</p>}
    </div>
  );
}

// ─── Bar progres ──────────────────────────────────────────────────────────────
function ProgressBar({ percentage, height = 'h-1.5' }) {
  return (
    <div
      className={`w-full bg-gray-100 rounded-full overflow-hidden ${height}`}
      role="progressbar"
      aria-valuenow={Math.min(100, percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${percentage >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
        style={{ width: `${Math.min(100, percentage)}%` }}
      />
    </div>
  );
}

// ─── Baris progres survei ─────────────────────────────────────────────────────
function SurveyOverviewRow({ title, totalQuota, totalCollected, percentage, onClick }) {
  const remaining = Math.max(0, totalQuota - totalCollected);
  const isComplete = percentage >= 100;
  const interactive = onClick
    ? { onClick, role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && onClick() }
    : {};

  return (
    <div className={`py-3 ${onClick ? 'group cursor-pointer' : ''}`} {...interactive}>
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700" title={title}>{title}</p>
        <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{percentage}%</p>
      </div>
      <ProgressBar percentage={percentage} />
      <p className="text-xs text-gray-600 mt-1.5 tabular-nums">
        {totalCollected.toLocaleString('id-ID')} dari {totalQuota.toLocaleString('id-ID')} responden
        <span className="text-gray-500"> · </span>
        {isComplete ? (
          <span className="text-green-700 font-medium">Target tercapai</span>
        ) : (
          <>sisa {remaining.toLocaleString('id-ID')}</>
        )}
      </p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-gray-100 rounded ${className}`} aria-hidden="true" />;
}

function MetricSkeleton() {
  return (
    <div className="bg-white px-5 py-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-20 mt-2" />
    </div>
  );
}

// ─── Custom Bar Label ─────────────────────────────────────────────────────────
function BarLabel({ x, y, width, value }) {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill={CHART.axis} textAnchor="middle" fontSize={11}>
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
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-0.5">{dataScopeLabel}</p>
          </div>
          {/* Filter ini mengubah SELURUH halaman, jadi tempatnya di atas. */}
          <div className="w-full sm:w-80">
            <label htmlFor="dashboard-survey" className="sr-only">Pilih survei</label>
            <select
              id="dashboard-survey"
              value={selectedSurvey}
              onChange={(e) => handleSurveyFilter(e.target.value)}
              disabled={progressLoading}
              className="border border-gray-300 bg-white rounded-md px-3 py-2 text-sm w-full"
            >
              {progressLoading ? (
                <option>Memuat...</option>
              ) : (
                <>
                  <option value="">Semua survei aktif ({activeSurveys.length})</option>
                  {activeSurveys.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4" role="alert">
            <p className="font-medium">Terjadi kesalahan</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* ── Ringkasan ── */}
        <section aria-label="Statistik ringkasan">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {statsLoading && !stats ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <Metric label="Survei aktif" value={stats?.activeSurveys} />
                <Metric label="TPD aktif" value={stats?.activeSurveyors} />
                <Metric label="Responden hari ini" value={stats?.todayResponses} />
                <Metric
                  label="Total responden (N)"
                  value={stats?.totalResponses}
                  note={totalQuotaAll > 0 ? `Target ${totalQuotaAll.toLocaleString('id-ID')} · ${overallPercentage}%` : undefined}
                />
              </>
            )}
          </div>
        </section>

        {/* ── Progres & proyeksi ── */}
        {(totalQuotaAll > 0 || paceTarget > 0) && (
          <section className={PANEL} aria-label="Progres dan proyeksi">
            {totalQuotaAll > 0 && (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">Progres keseluruhan</h2>
                  <p className="text-sm text-gray-600 tabular-nums">
                    <span className="font-semibold text-gray-900">{overallPercentage}%</span>
                    {' · '}N = {totalCollectedAll.toLocaleString('id-ID')} dari {totalQuotaAll.toLocaleString('id-ID')}
                  </p>
                </div>
                <ProgressBar percentage={overallPercentage} height="h-2" />
              </>
            )}
            {paceTarget > 0 && (
              <dl className={`grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 ${totalQuotaAll > 0 ? 'mt-5' : ''}`}>
                <div>
                  <dt className="text-xs text-gray-600">Laju 7 hari</dt>
                  <dd className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">
                    {Math.round(avgPerDay).toLocaleString('id-ID')}
                    <span className="text-sm font-normal text-gray-600"> /hari</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-600">Sisa target</dt>
                  <dd className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">{paceRemaining.toLocaleString('id-ID')}</dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs text-gray-600">Estimasi selesai</dt>
                  {paceRemaining === 0 ? (
                    <dd className="text-lg font-semibold text-green-700 inline-flex items-center gap-1.5 mt-0.5">Tercapai<Icon name="check" className="w-4 h-4" /></dd>
                  ) : projectedDate ? (
                    <dd className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">
                      {projectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="text-sm font-normal text-gray-600"> · {daysNeeded} hari</span>
                    </dd>
                  ) : (
                    <dd className="text-sm text-gray-600 mt-1">Belum bisa diestimasi (laju 0)</dd>
                  )}
                </div>
              </dl>
            )}
          </section>
        )}

        {/* ── Tren 7 hari ── */}
        <section className={PANEL} aria-label="Tren 7 hari">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Tren pengisian, 7 hari terakhir</h2>
            <p className="text-sm text-gray-600 tabular-nums">
              Total <span className="font-semibold text-gray-900">{trendTotal.toLocaleString('id-ID')}</span> responden
            </p>
          </div>
          {trendLoading && trend.length === 0 ? (
            <Skeleton className="w-full h-[240px]" />
          ) : trendData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Belum ada data tren.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} margin={{ top: 20, right: 0, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgb(26 25 23 / 0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value} responden`, 'Jumlah']}
                  labelFormatter={(label) => `Tanggal: ${label}`}
                />
                {/* Hari terbaru disorot; hari sebelumnya jadi konteks. */}
                <Bar dataKey="count" radius={[2, 2, 0, 0]} name="Responden" maxBarSize={64} label={<BarLabel />}>
                  {trendData.map((_, i) => (
                    <Cell key={i} fill={i === trendData.length - 1 ? CHART.bar : CHART.barMuted} />
                  ))}
                </Bar>
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

        {/* ── Progres per survei ── */}
        <section className={PANEL} aria-label="Progress survei aktif">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Progres survei aktif</h2>

          {progressLoading ? (
            <p className="text-sm text-gray-500 text-center py-8">Memuat data progress...</p>
          ) : progressError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4"><p className="text-sm">{progressError}</p></div>
          ) : activeSurveys.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Tidak ada survei aktif.</p>
          ) : selectedSurvey ? (
            <div>
              {progressMap[selectedSurvey] && (
                <div className="mb-3">
                  <SurveyOverviewRow
                    title={progressMap[selectedSurvey].surveyTitle}
                    totalQuota={progressMap[selectedSurvey].totalQuota}
                    totalCollected={progressMap[selectedSurvey].totalCollected}
                    percentage={progressMap[selectedSurvey].completionPercentage}
                  />
                </div>
              )}
              {detailLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">Memuat breakdown...</p>
              ) : selectedProgress ? (
                <SurveyorProgressTable surveyors={selectedProgress.surveyors} />
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 xl:gap-x-10 divide-y divide-gray-100 xl:divide-y-0">
              {activeSurveys.map((s) => {
                const p = progressMap[s.id];
                return p ? (
                  <SurveyOverviewRow
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

        {/* ── 5 TPD teratas ── */}
        <section className={PANEL} aria-label="Top 5 TPD">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">5 TPD teratas</h2>
          {topLoading && topTPD.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : topTPD.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Belum ada data TPD.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 pr-3 font-medium text-xs text-gray-600 w-8">#</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-gray-600">Nama</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-gray-600">Email</th>
                    <th className="pb-2 font-medium text-xs text-gray-600 text-right">N</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topTPD.map((tpd, index) => (
                    <tr key={tpd.email}>
                      <td className="py-2 pr-3 text-gray-500 tabular-nums">{index + 1}</td>
                      <td className="py-2 pr-4 text-gray-900 font-medium">{tpd.name}</td>
                      <td className="py-2 pr-4 text-gray-600">{tpd.email}</td>
                      <td className="py-2 text-right font-semibold text-gray-900 tabular-nums">{tpd.responseCount.toLocaleString('id-ID')}</td>
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
