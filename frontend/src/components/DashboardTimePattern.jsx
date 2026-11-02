import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../services/api';
import { CHART, AXIS_TICK, TOOLTIP_STYLE } from '../theme/chartTheme';

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
    <section className="bg-white rounded-lg border border-gray-200 p-5" aria-label="Pola waktu masuk">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Pola waktu responden masuk</h2>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Memuat…</p>
      ) : !hasData ? (
        <p className="text-sm text-gray-500 text-center py-8">Belum ada data.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Per hari (WIB)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekday} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(26 25 23 / 0.04)' }} formatter={(v) => [`${v} responden`, 'Jumlah']} />
                <Bar dataKey="count" fill={CHART.bar} radius={[2, 2, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Per jam (WIB)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hour} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 11 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(26 25 23 / 0.04)' }} formatter={(v) => [`${v} responden`, 'Jumlah']} labelFormatter={(l) => `Jam ${l}:00`} />
                <Bar dataKey="count" fill={CHART.bar} radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

export default DashboardTimePattern;
