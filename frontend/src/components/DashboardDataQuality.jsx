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
    { key: 'verified', label: 'Terverifikasi', count: review.verified, dot: 'bg-green-500' },
    { key: 'flagged', label: 'Ditandai', count: review.flagged, dot: 'bg-red-500' },
    { key: 'unreviewed', label: 'Belum ditinjau', count: review.unreviewed, dot: 'bg-gray-400' },
  ];

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5" aria-label="Kualitas data">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Kualitas data</h2>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Memuat…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-6">
          {/* Status tinjauan */}
          <div>
            <p className="text-xs text-gray-600 mb-2 tabular-nums">Status tinjauan · {total.toLocaleString('id-ID')} responden</p>
            <ul className="space-y-1.5">
              {reviewItems.map((r) => (
                <li key={r.key} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-gray-700">
                    <span className={`w-2 h-2 rounded-full ${r.dot}`} aria-hidden="true" />
                    {r.label}
                  </span>
                  <span className="font-semibold text-gray-900 tabular-nums">{r.count.toLocaleString('id-ID')}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Cakupan GPS */}
          <div>
            <p className="text-xs text-gray-600 mb-2">
              Cakupan GPS{gps.pct != null ? ` · ${gps.pct}% berlokasi` : ''}
            </p>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, gps.pct || 0)}%` }} />
            </div>
            <p className="text-xs text-gray-600 mt-2 tabular-nums">
              {gps.with.toLocaleString('id-ID')} dengan GPS · {gps.without.toLocaleString('id-ID')} tanpa GPS
            </p>
          </div>
          {/* Pending */}
          <div>
            <p className="text-xs text-gray-600 mb-1">Sesi belum selesai</p>
            <p className="text-2xl font-semibold text-gray-900 tabular-nums">{(data?.pending || 0).toLocaleString('id-ID')}</p>
            <p className="text-2xs text-gray-500 mt-0.5">Shell PENDING tanpa jawaban</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default DashboardDataQuality;
