import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../services/api';

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * DashboardTimePattern — pola waktu responden masuk: per hari & per jam (WIB).
 * @param {{ surveyId?: string }} props
 */
function DashboardTimePattern({ surveyId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = surveyId ? { survey_id: surveyId } : {};
    api
      .get('/dashboard/time-pattern', { params })
      .then((res) => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [surveyId]);

  const weekday = (data?.by_weekday || []).map((d) => ({ label: WEEKDAYS[d.dow] || d.dow, count: d.count }));
  const hour = (data?.by_hour || []).map((h) => ({ label: `${h.hour}`, count: h.count }));
  const hasData = weekday.some((d) => d.count > 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Pola waktu masuk">
      <h2 className="text-base font-semibold text-gray-700 mb-4">Pola Waktu Responden Masuk</h2>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Memuat…</p>
      ) : !hasData ? (
        <p className="text-sm text-gray-500 text-center py-8">Belum ada data.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Per hari (WIB)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${v} responden`, 'Jumlah']} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Per jam (WIB)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${v} responden`, 'Jumlah']} labelFormatter={(l) => `Jam ${l}:00`} />
                <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

export default DashboardTimePattern;
