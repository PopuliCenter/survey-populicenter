import React, { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * DashboardDataQuality — ringkasan kualitas data: status review, cakupan GPS,
 * dan jumlah sesi pending.
 * @param {{ surveyId?: string }} props
 */
function DashboardDataQuality({ surveyId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = surveyId ? { survey_id: surveyId } : {};
    api
      .get('/dashboard/data-quality', { params })
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [surveyId]);

  const review = data?.by_review || { unreviewed: 0, flagged: 0, verified: 0 };
  const gps = data?.gps || { with: 0, without: 0, pct: null };
  const total = data?.total || 0;

  const reviewItems = [
    { key: 'verified', label: 'Terverifikasi', count: review.verified, cls: 'bg-green-50 text-green-700' },
    { key: 'flagged', label: 'Ditandai', count: review.flagged, cls: 'bg-red-50 text-red-700' },
    { key: 'unreviewed', label: 'Belum ditinjau', count: review.unreviewed, cls: 'bg-gray-100 text-gray-600' },
  ];

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Kualitas data">
      <h2 className="text-base font-semibold text-gray-700 mb-4">Kualitas Data</h2>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Memuat…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Status review */}
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-gray-500 mb-2">Status tinjauan ({total.toLocaleString('id-ID')} responden)</p>
            <div className="flex flex-wrap gap-2">
              {reviewItems.map((r) => (
                <span key={r.key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${r.cls}`}>
                  {r.label}: {r.count.toLocaleString('id-ID')}
                </span>
              ))}
            </div>
            {/* Cakupan GPS */}
            <p className="text-xs font-medium text-gray-500 mt-4 mb-1">
              Cakupan GPS{gps.pct != null ? ` — ${gps.pct}% berlokasi` : ''}
            </p>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, gps.pct || 0)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {gps.with.toLocaleString('id-ID')} dengan GPS · {gps.without.toLocaleString('id-ID')} tanpa GPS
            </p>
          </div>
          {/* Pending */}
          <div className="bg-amber-50 rounded-xl p-4 flex flex-col justify-center">
            <p className="text-xs text-amber-700 mb-1">Sesi belum selesai</p>
            <p className="text-2xl font-bold text-amber-800 tabular-nums">{(data?.pending || 0).toLocaleString('id-ID')}</p>
            <p className="text-2xs text-amber-600 mt-0.5">Shell PENDING tanpa jawaban</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default DashboardDataQuality;
