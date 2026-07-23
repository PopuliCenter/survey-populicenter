import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { openMediaInNewTab } from '../services/mediaToken';
import Icon from '../components/Icon';
import FormAGrid, { computeFormAGridView } from '../components/FormAGrid';

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

  // Muat daftar survei.
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

  // ── Grid Form A per baris (verifikasi VISUAL, bukan hanya badge) ────────────
  // Dihitung ulang dari seed DI BROWSER pengawas — angka yang tampil bukan
  // kiriman server, melainkan hasil hitung ulang independen. Kalau kotak hijau
  // tidak sama dengan kolom "RT terpilih", ada yang salah.
  const [gridModal, setGridModal] = useState(null); // { row, view?, error? }
  async function openGrid(row) {
    setGridModal({ row });
    try {
      const view = await computeFormAGridView(row);
      setGridModal((cur) => (cur && cur.row.id === row.id ? { row, view } : cur));
    } catch {
      setGridModal((cur) => (cur && cur.row.id === row.id ? { row, error: 'Gagal menghitung grid dari seed.' } : cur));
    }
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const verified = rows.filter((r) => r.verified).length;
    const tanpaFoto = rows.filter((r) => !r.form_b_photo_path).length;
    const tpd = new Set(rows.map((r) => r.surveyor_name || '-')).size;
    return { total, verified, gagal: total - verified, tanpaFoto, tpd };
  }, [rows]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pengawasan Pemilihan RT</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hasil undian RT per kelurahan/desa, lengkap dengan verifikasi ulang dari seed dan bukti
            Form B ber-tanda tangan aparat desa.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
        )}

        {/* Filter */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Ringkasan undian RT">
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
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                    {['Kelurahan/Desa', 'Kecamatan', 'TPD', 'Total RT', 'RT terpilih', 'Grid', 'Aparat desa', 'Form B', 'Verifikasi', 'Waktu'].map((h) => (
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        {(!r.algo_version || r.algo_version >= 2) ? (
                          <button
                            type="button"
                            onClick={() => openGrid(r)}
                            title="Lihat Lembar Angka Acak (Form A digital) — dihitung ulang dari seed di browser Anda"
                            className="text-primary-600 hover:underline"
                          >
                            Lihat grid
                          </button>
                        ) : (
                          <span className="text-gray-500 text-xs" title="Undian lama (algoritma v1) — belum berbentuk grid Form A">v1</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {r.official_name || '—'}
                        {r.official_position ? <span className="text-gray-500"> · {r.official_position}</span> : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.form_b_photo_path ? (
                          // Token media diambil SAAT diklik (umur 15 mnt) — tautan yang
                          // dirakit saat mount kedaluwarsa diam-diam bila halaman lama terbuka.
                          <button
                            type="button"
                            onClick={() => openMediaInNewTab(r.form_b_photo_path)}
                            className="text-primary-600 hover:underline"
                          >
                            Lihat foto
                          </button>
                        ) : (
                          <span className="text-amber-700 text-xs">tanpa foto</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.verified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium"><Icon name="shieldCheck" className="w-3.5 h-3.5" />Terverifikasi</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-xs font-semibold"><Icon name="alert" className="w-3.5 h-3.5" />Tidak cocok</span>
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

        <p className="text-xs text-gray-500">
          &quot;Terverifikasi&quot; berarti nomor RT yang tersimpan sama persis dengan hasil hitung ulang
          dari seed undian — bukti hasil tidak dikarang. Undian terkunci satu kali per kelurahan dan
          tidak dapat diulang oleh TPD. Klik <strong>Lihat grid</strong> untuk memeriksa Lembar Angka
          Acak-nya secara visual, persis seperti mencocokkan Form A kertas.
        </p>

        {/* Modal: grid Form A — verifikasi visual undian */}
        {gridModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="grid-modal-title">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="grid-modal-title" className="text-base font-semibold text-gray-800">
                    {gridModal.row.village}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {gridModal.row.district} · {gridModal.row.total_rt} RT · TPD: {gridModal.row.surveyor_name || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGridModal(null)}
                  aria-label="Tutup"
                  className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                >
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-gray-600 mr-1">Tercatat di server:</span>
                {(gridModal.row.selected || []).map((n) => (
                  <span key={n} className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-xs font-semibold tabular-nums">
                    RT {n}
                  </span>
                ))}
              </div>

              {gridModal.error ? (
                <p className="text-sm text-red-600" role="alert">{gridModal.error}</p>
              ) : !gridModal.view ? (
                <p className="text-sm text-gray-500">Menghitung ulang grid dari seed…</p>
              ) : (
                <div className="bg-white border border-green-200 rounded-xl p-3">
                  <FormAGrid grid={gridModal.view.grid} picks={gridModal.view.picks} totalRt={gridModal.view.totalRt} />
                </div>
              )}

              <p className="text-2xs text-gray-500">
                Grid ini dihitung ulang dari seed <span className="font-mono">{String(gridModal.row.seed || '').slice(0, 12)}…</span> di
                browser Anda — bukan gambar kiriman server. Kotak hijau harus sama persis dengan
                daftar &quot;Tercatat di server&quot; di atas; bila berbeda, undian tidak sah.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default RtSelectionMonitor;
