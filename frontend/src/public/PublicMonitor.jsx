import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import publicApi from '../services/publicApi';
import ProvinceBubbleMap from './ProvinceBubbleMap';

function pctColor(pct) {
  if (pct == null) return '#9ca3af';
  if (pct >= 90) return '#10b981';
  if (pct >= 70) return '#2563eb';
  return '#f59e0b';
}

// Bar capaian vs target satu provinsi.
function RegionRow({ r }) {
  const width = r.target > 0 ? Math.min(100, Math.round((r.actual / r.target) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700">{r.province}</span>
        <span className="text-gray-500">
          {r.actual.toLocaleString('id-ID')}
          {r.target > 0 ? ` / ${r.target.toLocaleString('id-ID')}` : ''}
          {r.pct != null && ` (${r.pct}%)`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: pctColor(r.pct) }} />
      </div>
    </div>
  );
}

/**
 * PublicMonitor — embed MONITORING klien (link bertoken). Menampilkan capaian
 * vs target sampling (total + per provinsi) + peta sebaran. Auto-refresh berkala.
 */
function PublicMonitor() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let alive = true;
    function load(initial) {
      if (initial) setStatus('loading');
      publicApi
        .get(`/public/monitor/${token}`)
        .then((res) => {
          if (!alive) return;
          setData(res.data);
          setStatus('ok');
        })
        .catch((err) => {
          if (!alive) return;
          if (initial) setStatus(err.response?.status === 404 ? 'notfound' : 'error');
        });
    }
    load(true);
    // Snapshot berkala: refresh tiap 5 menit selama halaman terbuka.
    const iv = setInterval(() => load(false), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    if (status !== 'ok') return;
    const notify = () => {
      try {
        window.parent?.postMessage(
          { type: 'populi-embed-height', token, height: document.body.scrollHeight },
          '*'
        );
      } catch { /* ignore */ }
    };
    notify();
    window.addEventListener('resize', notify);
    return () => window.removeEventListener('resize', notify);
  }, [status, token, data]);

  const mapRegions = useMemo(
    () => (data?.regions || []).filter((r) => r.actual > 0).map((r) => ({ name: r.province, count: r.actual })),
    [data]
  );

  if (status === 'loading') {
    return <div className="min-h-[200px] flex items-center justify-center text-gray-500 text-sm">Memuat monitoring…</div>;
  }
  if (status === 'notfound') {
    return <div className="min-h-[200px] flex items-center justify-center text-gray-500 text-sm">Tautan monitoring tidak valid atau dinonaktifkan.</div>;
  }
  if (status === 'error') {
    return <div className="min-h-[200px] flex items-center justify-center text-red-400 text-sm">Gagal memuat. Coba muat ulang.</div>;
  }

  const total = data.total || { target: 0, achieved: 0, pct: null };
  const regions = data.regions || [];

  return (
    <div className="bg-transparent p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <header>
        <h2 className="text-xl font-bold text-gray-900">{data.survey?.title}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Monitoring capaian pengumpulan data
          {data.snapshot_at && (
            <span> · diperbarui {new Date(data.snapshot_at).toLocaleString('id-ID')}</span>
          )}
        </p>
      </header>

      {/* Capaian total */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Responden masuk</p>
            <p className="text-2xl font-semibold text-gray-800">{total.achieved?.toLocaleString('id-ID')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Target sampel</p>
            <p className="text-2xl font-semibold text-gray-800">{total.target?.toLocaleString('id-ID')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Capaian</p>
            <p className="text-2xl font-semibold" style={{ color: pctColor(total.pct) }}>
              {total.pct != null ? `${total.pct}%` : '—'}
            </p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, total.pct || 0)}%`, background: pctColor(total.pct) }}
          />
        </div>
      </section>

      {/* Peta sebaran aktual */}
      {mapRegions.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Sebaran responden masuk</h3>
          <ProvinceBubbleMap regions={mapRegions} />
        </section>
      )}

      {/* Capaian per provinsi */}
      {regions.length > 0 ? (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Capaian vs target per provinsi</h3>
          <div className="space-y-3">
            {regions.map((r, i) => <RegionRow key={i} r={r} />)}
          </div>
        </section>
      ) : (
        <p className="text-sm text-gray-500">
          {data.has_region_data
            ? 'Belum ada target per provinsi. Atur target sampling di dashboard.'
            : 'Survei ini tidak punya pertanyaan wilayah, sehingga capaian hanya ditampilkan total.'}
        </p>
      )}

      <footer className="text-center text-xs text-gray-300 pt-2">Sumber data: Populi Center</footer>
    </div>
  );
}

export default PublicMonitor;
