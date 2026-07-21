import React, { useEffect, useState } from 'react';
import ProvinceBubbleMap from '../public/ProvinceBubbleMap';
import api from '../services/api';

/**
 * DashboardProvinceMap — peta sebaran responden per provinsi untuk dashboard.
 * Dimuat MANUAL (tombol) agar tidak membebani server; backend men-cache 10 menit.
 *
 * @param {{ surveyId?: string }} props
 */
function DashboardProvinceMap({ surveyId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Saat scope survei berubah, kosongkan agar pengguna memuat ulang manual.
  useEffect(() => { setData(null); setError(null); }, [surveyId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = surveyId ? { survey_id: surveyId } : {};
      const res = await api.get('/dashboard/responses-by-province', { params });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Gagal memuat peta.');
    } finally {
      setLoading(false);
    }
  }

  const regions = (data?.regions || []).map((r) => ({ name: r.province, count: r.count }));
  const top = (data?.regions || []).slice(0, 8);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" aria-label="Peta sebaran provinsi">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-700">Peta Sebaran per Provinsi</h2>
          <p className="text-xs text-gray-500">
            {data
              ? `Data per ${new Date(data.generated_at).toLocaleString('id-ID')}${data.cached ? ' (cache)' : ''}`
              : 'Dimuat manual untuk menghemat server.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg"
        >
          {loading ? 'Memuat…' : data ? 'Perbarui peta' : 'Muat peta'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!data && !error && (
        <p className="text-sm text-gray-500 text-center py-8">
          Klik "Muat peta" untuk melihat sebaran responden per provinsi.
        </p>
      )}

      {data && regions.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          Belum ada data wilayah. Pastikan survei memuat pertanyaan tipe wilayah (provinsi).
        </p>
      )}

      {data && regions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ProvinceBubbleMap regions={regions} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Provinsi teratas</p>
            <div className="space-y-1.5">
              {top.map((r) => (
                <div key={r.province} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate mr-2">{r.province}</span>
                  <span className="font-semibold text-gray-800">{r.count.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default DashboardProvinceMap;
