import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { getMediaToken } from '../services/mediaToken';

/**
 * RtSelectionMonitor — pengawasan undian RT (admin & supervisor).
 *
 * Nilai utama halaman ini bukan sekadar "melihat daftar", tapi menampilkan hasil
 * VERIFIKASI ULANG dari server: tiap baris dihitung ulang dari seed tersimpan
 * lalu dibandingkan dengan nomor RT yang tercatat. Bila cocok → hasil memang
 * keluaran algoritma, bukan angka karangan. Pemeriksaan semacam ini tidak
 * mungkin dilakukan pada Lembar Angka Acak kertas.
 *
 * Baris yang TIDAK terverifikasi berarti data di database tidak konsisten dengan
 * seed-nya (indikasi manipulasi langsung ke DB) dan harus ditindaklanjuti.
 */

function StatTile({ label, value, tone = 'default' }) {
  const tones = {
    default: 'bg-gray-50 border-gray-100 text-gray-800',
    good: 'bg-green-50 border-green-100 text-green-800',
    bad: 'bg-red-50 border-red-200 text-red-800',
    warn: 'bg-amber-50 border-amber-100 text-amber-800',
  };
  return (
    <div className={`px-4 py-3 rounded-xl border ${tones[tone]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RtSelectionMonitor() {
  const [surveys, setSurveys] = useState([]);
  const [surveyId, setSurveyId] = useState('');
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mediaToken, setMediaToken] = useState('');

  // Muat daftar survei + token media (untuk membuka foto Form B).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get('/surveys');
        if (!active) return;
        const all = res.data.surveys || res.data || [];
        setSurveys(all);
        // Utamakan survei yang memang mengaktifkan pemilihan RT.
        const aktif = all.find((s) => s.field_tools_settings?.rt_selection === 'enabled');
        if (aktif) setSurveyId(aktif.id);
        else if (all.length) setSurveyId(all[0].id);
      } catch {
        if (active) setError('Gagal memuat daftar survei.');
      }
      try {
        const mt = await getMediaToken();
        if (active) setMediaToken(mt);
      } catch { /* foto tetap bisa dicoba tanpa token */ }
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    if (!surveyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/rt-selection/survey/${surveyId}`, { params: q ? { q } : {} });
      setRows(res.data.selections || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal memuat data undian RT.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [surveyId, q]);

  useEffect(() => { load(); }, [load]);

  const survey = surveys.find((s) => s.id === surveyId);
  const rtEnabled = survey?.field_tools_settings?.rt_selection === 'enabled';

  const stats = useMemo(() => {
    const total = rows.length;
    const verified = rows.filter((r) => r.verified).length;
    const tanpaFoto = rows.filter((r) => !r.form_b_photo_path).length;
    const tpd = new Set(rows.map((r) => r.surveyor_name || '-')).size;
    return { total, verified, gagal: total - verified, tanpaFoto, tpd };
  }, [rows]);

  function mediaUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const tokenQuery = mediaToken ? `?t=${encodeURIComponent(mediaToken)}` : '';
    const serverUrl = localStorage.getItem('api_server_url');
    if (serverUrl) return `${serverUrl}/${path.replace(/^\//, '')}${tokenQuery}`;
    return `/${path.replace(/^\//, '')}${tokenQuery}`;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Pengawasan Pemilihan RT</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hasil undian RT per kelurahan/desa, lengkap dengan verifikasi ulang dari seed dan bukti
            Form B ber-tanda tangan aparat desa.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
        )}

        {/* Filter */}
        <section className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
          <label className="block flex-1 min-w-[240px]">
            <span className="text-sm text-gray-600">Survei</span>
            <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}{s.field_tools_settings?.rt_selection === 'enabled' ? '' : ' — (pemilihan RT nonaktif)'}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[200px]">
            <span className="text-sm text-gray-600">Cari kelurahan / kecamatan</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. TEGAL PARANG"
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <button type="button" onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-60">
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </section>

        {!rtEnabled && surveyId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Survei ini belum mengaktifkan pemilihan RT. Nyalakan di <strong>Survey Builder → Field Tools →
            Pemilihan RT</strong> agar tombol undi muncul di aplikasi TPD.
          </div>
        )}

        {/* Ringkasan */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Kelurahan diundi" value={stats.total} />
            <StatTile label="Terverifikasi" value={stats.verified} tone="good" />
            <StatTile label="Gagal verifikasi" value={stats.gagal} tone={stats.gagal ? 'bad' : 'default'} />
            <StatTile label="Tanpa foto Form B" value={stats.tanpaFoto} tone={stats.tanpaFoto ? 'warn' : 'default'} />
          </div>
        )}

        {stats.gagal > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            <strong>{stats.gagal} undian tidak lolos verifikasi.</strong> Nomor RT yang tercatat tidak sama
            dengan hasil hitung ulang dari seed-nya — indikasi data diubah langsung di database, bukan lewat
            aplikasi. Perlu ditindaklanjuti sebelum data dipakai.
          </div>
        )}

        {/* Tabel */}
        <section className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-500">Memuat data…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 italic">
              Belum ada undian RT untuk survei ini{q ? ' dengan kata kunci tersebut' : ''}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Kelurahan/Desa', 'Kecamatan', 'TPD', 'Total RT', 'RT terpilih', 'Aparat desa', 'Form B', 'Verifikasi', 'Waktu'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className={r.verified ? 'hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'}>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{r.village}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.district}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.surveyor_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 tabular-nums">{r.total_rt}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex gap-1">
                          {(r.selected || []).map((n) => (
                            <span key={n} className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-xs font-semibold tabular-nums">
                              RT {n}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {r.official_name || '—'}
                        {r.official_position ? <span className="text-gray-400"> · {r.official_position}</span> : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.form_b_photo_path ? (
                          <a href={mediaUrl(r.form_b_photo_path)} target="_blank" rel="noopener noreferrer"
                            className="text-primary-600 hover:underline">Lihat foto</a>
                        ) : (
                          <span className="text-amber-700 text-xs">tanpa foto</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.verified ? (
                          <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium">✓ Terverifikasi</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-xs font-semibold">✗ Tidak cocok</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {r.locked_at ? new Date(r.locked_at).toLocaleString('id-ID') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-400">
          &quot;Terverifikasi&quot; berarti nomor RT yang tersimpan sama persis dengan hasil hitung ulang
          dari seed undian — bukti hasil tidak dikarang. Undian terkunci satu kali per kelurahan dan
          tidak dapat diulang oleh TPD.
        </p>
      </div>
    </Layout>
  );
}

export default RtSelectionMonitor;
