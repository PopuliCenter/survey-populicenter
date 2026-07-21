import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { SENTRY_DASHBOARD_URL } from '../config/appLinks';

function StatusPill({ ok }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Sehat' : 'Bermasalah'}
    </span>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function fmtUptime(sec) {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d ? `${d}h` : '', h ? `${h}j` : '', `${m}m`].filter(Boolean).join(' ');
}

function SystemStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/monitoring/status');
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Gagal memuat status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = data?.queue?.counts;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Status Sistem</h1>
            <p className="text-sm text-gray-500">
              {data ? `Data per ${new Date(data.generated_at).toLocaleString('id-ID')}` : 'Kesehatan server, basis data, dan antrean.'}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg"
          >
            {loading ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4" role="alert">{error}</div>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Aplikasi">
              <Row label="Versi" value={data.app?.version || '—'} />
              <Row label="Lingkungan" value={data.app?.env || '—'} />
              <Row label="Node.js" value={data.app?.node || '—'} />
              <Row label="Uptime" value={fmtUptime(data.app?.uptime_seconds)} />
              <Row label="Memori (RSS)" value={data.app?.memory_mb != null ? `${data.app.memory_mb} MB` : '—'} />
            </Card>

            <Card title="Basis Data (PostgreSQL)">
              <div className="flex items-center justify-between">
                <StatusPill ok={data.db?.ok} />
                <span className="text-sm text-gray-500">{data.db?.latency_ms} ms</span>
              </div>
              {data.db?.error && <p className="text-xs text-red-600 mt-2">{data.db.error}</p>}
            </Card>

            <Card title="Redis (cache & antrean)">
              <div className="flex items-center justify-between">
                <StatusPill ok={data.redis?.ok} />
                <span className="text-sm text-gray-500">{data.redis?.latency_ms} ms · {data.redis?.status}</span>
              </div>
              {data.redis?.error && <p className="text-xs text-red-600 mt-2">{data.redis.error}</p>}
            </Card>

            <Card title="Antrean Ekspor (BullMQ)">
              {q ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[['Menunggu', q.waiting], ['Aktif', q.active], ['Selesai', q.completed], ['Gagal', q.failed], ['Tunda', q.delayed]].map(([l, v]) => (
                    <div key={l} className="bg-gray-50 rounded-lg py-2">
                      <p className={`text-lg font-bold ${l === 'Gagal' && v > 0 ? 'text-red-600' : 'text-gray-800'}`}>{v ?? 0}</p>
                      <p className="text-2xs text-gray-500">{l}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{data.queue?.error || 'Tidak tersedia.'}</p>
              )}
            </Card>

            <Card title="Ringkasan Operasional">
              {data.summary?.error ? (
                <p className="text-xs text-red-600">{data.summary.error}</p>
              ) : (
                <>
                  <Row label="Survei aktif" value={data.summary?.activeSurveys ?? '—'} />
                  <Row label="TPD aktif" value={data.summary?.activeSurveyors ?? '—'} />
                  <Row label="Responden hari ini" value={data.summary?.todayResponses ?? '—'} />
                  <Row label="Total responden" value={(data.summary?.totalResponses ?? 0).toLocaleString('id-ID')} />
                </>
              )}
            </Card>

            <Card title="Monitoring Error (Sentry)">
              <p className="text-sm text-gray-500 mb-3">
                Crash & error mendetail (per perangkat/TPD, session replay) tersedia di dashboard Sentry.
              </p>
              {SENTRY_DASHBOARD_URL ? (
                <a
                  href={SENTRY_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
                >
                  Buka Dashboard Sentry ↗
                </a>
              ) : (
                <p className="text-xs text-amber-600">
                  Belum dikonfigurasi. Isi <code>SENTRY_DASHBOARD_URL</code> di <code>src/config/appLinks.js</code> dan DSN di env.
                </p>
              )}
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default SystemStatus;
