import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import Icon from '../components/Icon';

/**
 * RandomSampling — antarmuka native untuk engine sampling wilayah (MFD/BPS).
 * Metodologi tetap di layanan Python (proxy /sampling); halaman ini hanya UI.
 *
 * Alur: unggah MFD → /sampling/inspect (isi provinsi/kab + status DPT/Penduduk)
 * → atur parameter → /sampling/run → tampilkan ringkasan/tabel + unduh Excel.
 */

const PRESETS = {
  'Survei Daerah (Kab/Kota) — 800': { scope: 'KABUPATEN', unit: 'DESA', n_total: 800, cluster: 10 },
  'Survei Provinsi — 1200': { scope: 'PROVINSI', unit: 'DESA', n_total: 1200, cluster: 10 },
  'Survei Nasional — 1200': { scope: 'NASIONAL', unit: 'DESA', n_total: 1200, cluster: 10 },
  'Survei Nasional — 1500': { scope: 'NASIONAL', unit: 'DESA', n_total: 1500, cluster: 10 },
  'Quick Count / Exit Poll — 2000+': { scope: 'NASIONAL', unit: 'DESA', n_total: 3000, cluster: 5 },
  Kustom: { scope: 'NASIONAL', unit: 'DESA', n_total: 1200, cluster: 10 },
};

// WAJIB untuk semua unggahan di halaman ini: instance axios memasang
// Content-Type application/json secara default, dan axios v1 MENGUBAH FormData
// jadi JSON selama tipe itu masih terpasang — berkas MFD tak pernah terkirim
// sebagai multipart dan server membalas 422 "File MFD wajib diunggah".
// Timeout dilonggarkan: MFD nasional ~84rb baris + pembuatan Excel > 30 dtk.
const UPLOAD_OPTS = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 };

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
function triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Tabel generik dari list-of-object (kolom = key baris pertama).
function DataTable({ rows, max = 200 }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-gray-500 italic">Tidak ada data.</p>;
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, max);
  return (
    <div className="overflow-x-auto border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {shown.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cols.map((c) => <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{r[c] == null ? '—' : String(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && (
        <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50">Menampilkan {max} dari {rows.length.toLocaleString('id-ID')} baris — unduh Excel untuk data lengkap.</p>
      )}
    </div>
  );
}

const SCOPES = ['NASIONAL', 'PROVINSI', 'KABUPATEN'];
const LVL_NAME = { NASIONAL: 'provinsi', PROVINSI: 'kab/kota', KABUPATEN: 'kecamatan' };

function RandomSampling() {
  const [mfdFile, setMfdFile] = useState(null);
  const [refFile, setRefFile] = useState(null);
  const [inspect, setInspect] = useState(null); // { provinces, kabupatenByProvince, hasPenduduk, hasDpt, rows, info }
  const [inspecting, setInspecting] = useState(false);

  // Parameter
  const [preset, setPreset] = useState('Survei Nasional — 1200');
  const [scope, setScope] = useState('NASIONAL');
  const [scopeFilter, setScopeFilter] = useState([]);
  const [kabProvince, setKabProvince] = useState(''); // provinsi terpilih untuk mode KABUPATEN
  const [unit, setUnit] = useState('DESA');
  const [nTotal, setNTotal] = useState(1200);
  const [clusterSize, setClusterSize] = useState(10);
  const [pps, setPps] = useState(true);
  const [wPop, setWPop] = useState(1.0);
  const [wDpt, setWDpt] = useState(0.0);
  const [wMfd, setWMfd] = useState(0.0);
  const [stratify, setStratify] = useState(true);
  const [minPer, setMinPer] = useState(1);
  const [seed, setSeed] = useState(2024);

  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null); // { preview, total, wilayah, warnings, sig }
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const hasPop = inspect?.hasPenduduk;
  const hasDpt = inspect?.hasDpt;
  const wsum = (Number(wPop) || 0) + (Number(wDpt) || 0) + (Number(wMfd) || 0);
  const nTitik = useMemo(() => Math.ceil((Number(nTotal) || 0) / Math.max(Number(clusterSize) || 1, 1)), [nTotal, clusterSize]);

  function applyPreset(name) {
    setPreset(name);
    const p = PRESETS[name];
    if (!p) return;
    setScope(p.scope);
    setUnit(p.unit);
    setNTotal(p.n_total);
    setClusterSize(p.cluster);
    setScopeFilter([]);
  }

  async function handleMfd(file) {
    setMfdFile(file);
    setInspect(null);
    setResult(null);
    setPreview(null);
    setError('');
    if (!file) return;
    setInspecting(true);
    try {
      const fd = new FormData();
      fd.append('mfd', file);
      if (refFile) fd.append('reference', refFile);
      const res = await api.post('/sampling/inspect', fd, UPLOAD_OPTS);
      setInspect(res.data);
      // Default bobot: bila ada Penduduk → 100% Penduduk, else 100% MFD.
      if (res.data?.hasPenduduk) { setWPop(1); setWDpt(0); setWMfd(0); } else { setWPop(0); setWDpt(0); setWMfd(1); }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal membaca MFD.');
    } finally {
      setInspecting(false);
    }
  }

  // Konfigurasi dikirim ke server — dipakai pratinjau maupun sampling agar
  // keduanya dijamin memakai parameter yang sama persis.
  const config = useMemo(() => ({
    scope,
    scope_filter: scope === 'NASIONAL' ? [] : scopeFilter,
    unit,
    n_total: Number(nTotal),
    cluster_size: unit === 'DESA' ? Number(clusterSize) : 1,
    weights: { PENDUDUK: Number(wPop) || 0, DPT: Number(wDpt) || 0, MFD: Number(wMfd) || 0 },
    stratify_ur: unit === 'DESA' ? !!stratify : false,
    min_per_unit: Number(minPer),
    pps: unit === 'KABUPATEN' ? !!pps : false,
    seed: Number(seed),
  }), [scope, scopeFilter, unit, nTotal, clusterSize, wPop, wDpt, wMfd, stratify, minPer, pps, seed]);

  // Tanda tangan parameter — seed tak memengaruhi alokasi, jadi tak ikut dihitung
  // (ganti seed tidak membuat pratinjau usang).
  const configSig = useMemo(() => JSON.stringify({ ...config, seed: 0 }), [config]);
  const previewStale = !!preview && preview.sig !== configSig;

  function validate() {
    if (!mfdFile) return 'Unggah file MFD dulu.';
    if (wsum <= 0) return 'Minimal satu bobot basis alokasi harus > 0.';
    if (scope === 'PROVINSI' && scopeFilter.length === 0) return 'Pilih minimal satu provinsi.';
    if (scope === 'KABUPATEN' && scopeFilter.length === 0) return 'Pilih minimal satu kabupaten/kota.';
    return '';
  }

  function buildForm() {
    const fd = new FormData();
    fd.append('mfd', mfdFile);
    fd.append('config', JSON.stringify(config));
    if (refFile) fd.append('reference', refFile);
    return fd;
  }


  async function handlePreview() {
    const invalid = validate();
    setError(invalid);
    if (invalid) return;
    setPreviewing(true);
    try {
      const res = await api.post('/sampling/preview', buildForm(), UPLOAD_OPTS);
      setPreview({ ...res.data, sig: configSig });
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.error || err.message || 'Gagal menghitung pratinjau alokasi.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleRun() {
    setResult(null);
    const invalid = validate();
    setError(invalid);
    if (invalid) return;
    setRunning(true);
    try {
      const res = await api.post('/sampling/run', buildForm(), UPLOAD_OPTS);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal menjalankan sampling.');
    } finally {
      setRunning(false);
    }
  }

  async function downloadTemplate(kind) {
    try {
      const res = await api.get(`/sampling/template/${kind}`, { responseType: 'blob' });
      triggerDownload(new Blob([res.data]), `template_${kind}.xlsx`);
    } catch {
      setError('Gagal mengunduh template.');
    }
  }
  function downloadResult(which) {
    const b64 = result?.files?.[which];
    if (!b64) return;
    const blob = b64ToBlob(b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    triggerDownload(blob, which === 'hasil' ? 'hasil_sampel.xlsx' : 'kerangka.xlsx');
  }

  const provinces = inspect?.provinces || [];
  const kabList = kabProvince ? (inspect?.kabupatenByProvince?.[kabProvince] || []) : [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Random Sampling Wilayah</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sampling multistage proporsional berbasis MFD (BPS) — terstratifikasi Kota/Desa dengan jaminan
            setiap wilayah tersampling. Metodologi SILOGNAS / SURNAS.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
        )}

        {/* 1. Data */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center">1</span>
            <h2 className="text-base font-semibold text-gray-700">Unggah data MFD</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-gray-600">File MFD (.xlsx) — wajib</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => handleMfd(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:text-sm file:font-medium hover:file:bg-primary-100" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Referensi DPT/Penduduk (opsional, .xlsx/.csv)</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setRefFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm file:font-medium hover:file:bg-gray-200" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => downloadTemplate('mfd')} className="text-primary-600 hover:underline">Unduh Template MFD</button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => downloadTemplate('reference')} className="text-primary-600 hover:underline">Unduh Template Referensi</button>
          </div>
          {inspecting && <p className="text-sm text-gray-500">Membaca MFD…</p>}
          {inspect && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700">{inspect.provinces.length} provinsi</span>
              <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700">{Number(inspect.rows).toLocaleString('id-ID')} baris desa</span>
              <span className={`px-2 py-1 rounded-lg ${hasPop ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>Penduduk {hasPop ? 'tersedia' : 'tak ada'}</span>
              <span className={`px-2 py-1 rounded-lg ${hasDpt ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>DPT {hasDpt ? 'tersedia' : 'tak ada'}</span>
            </div>
          )}
        </section>

        {/* 2. Parameter */}
        <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 ${inspect ? '' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center">2</span>
            <h2 className="text-base font-semibold text-gray-700">Rancang sampling</h2>
          </div>

          <label className="block max-w-md">
            <span className="text-sm text-gray-600">Preset jenis survei</span>
            <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <span className="text-sm text-gray-600">Cakupan survei</span>
              <div className="flex gap-2 mt-1">
                {SCOPES.map((s) => (
                  <button key={s} type="button" onClick={() => { setScope(s); setScopeFilter([]); }}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${scope === s ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {s === 'NASIONAL' ? 'Nasional' : s === 'PROVINSI' ? 'Provinsi' : 'Kab/Kota'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm text-gray-600">Unit yang disampling</span>
              <div className="flex gap-2 mt-1">
                {[['DESA', 'Desa/Kelurahan'], ['KABUPATEN', 'Kabupaten/Kota']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setUnit(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${unit === v ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Scope filter */}
          {scope === 'PROVINSI' && (
            <label className="block">
              <span className="text-sm text-gray-600">Pilih provinsi (bisa banyak)</span>
              <select multiple value={scopeFilter} onChange={(e) => setScopeFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32">
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
          {scope === 'KABUPATEN' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-600">Provinsi</span>
                <select value={kabProvince} onChange={(e) => { setKabProvince(e.target.value); setScopeFilter([]); }} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— pilih —</option>
                  {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Kabupaten/Kota (bisa banyak)</span>
                <select multiple value={scopeFilter} onChange={(e) => setScopeFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-28" disabled={!kabProvince}>
                  {kabList.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* Jumlah */}
          <div className="grid sm:grid-cols-3 gap-4">
            {unit === 'DESA' ? (
              <>
                <label className="block"><span className="text-sm text-gray-600">Target responden</span>
                  <input type="number" min="10" step="50" value={nTotal} onChange={(e) => setNTotal(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
                <label className="block"><span className="text-sm text-gray-600">Responden per titik</span>
                  <input type="number" min="1" value={clusterSize} onChange={(e) => setClusterSize(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
                <div><span className="text-sm text-gray-600">Jumlah titik (TPD)</span><p className="mt-1 text-2xl font-semibold text-primary-700">{nTitik.toLocaleString('id-ID')}</p></div>
              </>
            ) : (
              <>
                <label className="block"><span className="text-sm text-gray-600">Jumlah kab/kota disampling</span>
                  <input type="number" min="1" step="5" value={nTotal} onChange={(e) => setNTotal(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-6">
                  <input type="checkbox" checked={pps} onChange={(e) => setPps(e.target.checked)} className="accent-primary-600" /> Seleksi PPS (peluang ~ ukuran)
                </label>
              </>
            )}
          </div>

          {/* Basis alokasi */}
          <div>
            <span className="text-sm font-medium text-gray-700">Basis alokasi proporsional</span>
            {!hasPop && !hasDpt && <p className="text-xs text-amber-700 mt-1">Data Penduduk/DPT tak ada — alokasi memakai jumlah desa (MFD). Unggah referensi untuk basis Penduduk/DPT.</p>}
            <div className="grid sm:grid-cols-3 gap-4 mt-2">
              <label className="block"><span className="text-xs text-gray-500">Bobot Penduduk</span>
                <input type="range" min="0" max="1" step="0.1" value={wPop} disabled={!hasPop} onChange={(e) => setWPop(e.target.value)} className="w-full accent-primary-600" />
                <span className="text-xs text-gray-600">{Number(wPop).toFixed(1)}</span></label>
              <label className="block"><span className="text-xs text-gray-500">Bobot DPT</span>
                <input type="range" min="0" max="1" step="0.1" value={wDpt} disabled={!hasDpt} onChange={(e) => setWDpt(e.target.value)} className="w-full accent-primary-600" />
                <span className="text-xs text-gray-600">{Number(wDpt).toFixed(1)}</span></label>
              <label className="block"><span className="text-xs text-gray-500">Bobot Jumlah Desa (MFD)</span>
                <input type="range" min="0" max="1" step="0.1" value={wMfd} onChange={(e) => setWMfd(e.target.value)} className="w-full accent-primary-600" />
                <span className="text-xs text-gray-600">{Number(wMfd).toFixed(1)}</span></label>
            </div>
            {wsum > 0 && (
              <p className="text-xs text-gray-500 mt-1">Komposisi efektif → Penduduk {Math.round((wPop / wsum) * 100)}% · DPT {Math.round((wDpt / wsum) * 100)}% · MFD {Math.round((wMfd / wsum) * 100)}%</p>
            )}
          </div>

          {/* Opsi lanjutan */}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 select-none">Opsi lanjutan</summary>
            <div className="grid sm:grid-cols-3 gap-4 mt-3">
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input type="checkbox" checked={stratify} disabled={unit === 'KABUPATEN'} onChange={(e) => setStratify(e.target.checked)} className="accent-primary-600" /> Stratifikasi Kota/Desa
              </label>
              <label className="block"><span className="text-xs text-gray-500">Min. titik per {LVL_NAME[scope]} (jaminan cakupan)</span>
                <input type="number" min="0" value={minPer} onChange={(e) => setMinPer(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="block"><span className="text-xs text-gray-500">Random seed (reproducible)</span>
                <input type="number" min="0" value={seed} onChange={(e) => setSeed(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
            </div>
          </details>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={handlePreview} disabled={previewing || running || !inspect}
              className="px-5 py-2.5 rounded-xl border border-primary-300 text-primary-700 hover:bg-primary-50 disabled:opacity-60 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
              <Icon name="eye" className="w-4 h-4" />
              {previewing ? 'Menghitung alokasi…' : 'Pratinjau Alokasi'}
            </button>
            <button type="button" onClick={handleRun} disabled={running || previewing || !inspect}
              className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
              <Icon name="target" className="w-4 h-4" />
              {running ? 'Menjalankan sampling…' : 'Lakukan Sampling'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Pratinjau menghitung pembagian titik per wilayah tanpa menarik sampel — cepat, dan angkanya
            sama persis dengan hasil akhir. Pakai untuk mengecek sebaran sebelum menjalankan sampling.
          </p>
        </section>

        {/* 2b. Pratinjau alokasi (sebelum menjalankan) */}
        {preview && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
                  <Icon name="eye" className="w-3.5 h-3.5" />
                </span>
                <h2 className="text-base font-semibold text-gray-700">Pratinjau alokasi — {preview.wilayah} {LVL_NAME[scope]}</h2>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="text-sm text-gray-500 hover:text-gray-700">Tutup</button>
            </div>

            {previewStale && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Parameter sudah diubah sejak pratinjau ini dihitung — klik <strong>Pratinjau Alokasi</strong> lagi untuk angka terbaru.
              </div>
            )}

            {preview.warnings?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <ul className="list-disc pl-5 space-y-0.5">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {preview.total && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(preview.total)
                  .filter(([k, v]) => k !== 'No' && v !== '' && v != null && typeof v === 'number')
                  .map(([k, v]) => (
                    <div key={k} className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs text-gray-500">{k.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-semibold text-gray-800">{Number(v).toLocaleString('id-ID')}</p>
                    </div>
                  ))}
              </div>
            )}

            <DataTable rows={preview.preview} max={100} />
          </section>
        )}

        {/* 3. Hasil */}
        {result && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-semibold flex items-center justify-center">3</span>
                <h2 className="text-base font-semibold text-gray-700">Hasil ({Number(result.sampleTotal).toLocaleString('id-ID')} titik terpilih)</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadResult('hasil')} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">Unduh Hasil Sampel</button>
                <button type="button" onClick={() => downloadResult('kerangka')} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Unduh Format Kerangka</button>
              </div>
            </div>

            {result.warnings?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <ul className="list-disc pl-5 space-y-0.5">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Ringkasan</h3>
              <DataTable rows={result.ringkasan} max={50} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Alokasi per wilayah</h3>
              <DataTable rows={result.alokasi} max={100} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Sampel terpilih (pratinjau)</h3>
              <DataTable rows={result.sample} max={200} />
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}

export default RandomSampling;
