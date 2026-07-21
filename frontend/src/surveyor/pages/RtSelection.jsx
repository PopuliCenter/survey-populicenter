import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { loadRegionData } from '../../utils/regionData';
import Icon from '../../components/Icon';

/**
 * RtSelection — layar TPD untuk mengundi RT (pengganti FORM A + FORM B kertas).
 *
 * Undian dilakukan SERVER, sekali saja per kelurahan. Layar ini sengaja TIDAK
 * menyediakan tombol "acak ulang": kalau TPD bisa mengulang sampai dapat RT yang
 * mudah dijangkau, hasilnya jadi bias dan metodologinya lebih lemah daripada
 * lembar kertas. Setelah keluar, hasil ditampilkan sebagai keputusan final.
 *
 * Butuh koneksi — undian dilakukan sekali di kantor desa, bukan saat wawancara.
 */

const UPLOAD_OPTS = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };


const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed';
const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400';

function RtSelection() {
  const { surveyId } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState(null);
  const [regionData, setRegionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [region, setRegion] = useState({ province_id: '', province_name: '', regency_id: '', regency_name: '', district_id: '', district_name: '', village_id: '', village_name: '' });
  const [totalRt, setTotalRt] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialPosition, setOfficialPosition] = useState('');
  const [officialPhone, setOfficialPhone] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);   // { selection, already_locked }
  const [history, setHistory] = useState([]);

  const rtCount = survey?.field_tools_settings?.rt_selection_count || 2;

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get(`/surveys/${surveyId}`).then((r) => r.data.survey || r.data).catch(() => null),
      loadRegionData(),
      api.get('/rt-selection', { params: { survey_id: surveyId } }).then((r) => r.data.selections || []).catch(() => []),
    ]).then(([srv, region_, hist]) => {
      if (!active) return;
      setSurvey(srv);
      setRegionData(region_ || { provinces: [], regenciesByProvince: {}, districtsByRegency: {}, villagesByDistrict: {} });
      setHistory(hist);
      setLoading(false);
    });
    return () => { active = false; };
  }, [surveyId]);

  const provinceOptions = regionData?.provinces || [];
  const regencyOptions = regionData?.regenciesByProvince?.[region.province_id] || [];
  const districtOptions = regionData?.districtsByRegency?.[region.regency_id] || [];
  const villageOptions = regionData?.villagesByDistrict?.[region.district_id] || [];

  // Kelurahan yang sudah pernah diundi — supaya TPD tahu sebelum mencoba lagi.
  const sudahDiundi = useMemo(
    () => new Set(history.map((h) => String(h.village || '').toUpperCase())),
    [history]
  );
  const villageSudahAda = region.village_name && sudahDiundi.has(region.village_name.toUpperCase());

  function pick(field, value, label) {
    const next = { ...region, [field]: value, [field.replace('_id', '_name')]: label };
    if (field === 'province_id') Object.assign(next, { regency_id: '', regency_name: '', district_id: '', district_name: '', village_id: '', village_name: '' });
    if (field === 'regency_id') Object.assign(next, { district_id: '', district_name: '', village_id: '', village_name: '' });
    if (field === 'district_id') Object.assign(next, { village_id: '', village_name: '' });
    setRegion(next);
    setResult(null);
  }

  async function handlePhoto(file) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await api.post('/upload/photo', fd, UPLOAD_OPTS);
      setPhotoPath(res.data.path);
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mengunggah foto Form B.');
    } finally {
      setUploading(false);
    }
  }

  function validate() {
    if (!region.village_name) return 'Pilih wilayah sampai tingkat kelurahan/desa.';
    const n = Number(totalRt);
    if (!Number.isInteger(n) || n < 1) return 'Isi jumlah RT di kelurahan/desa (bilangan bulat).';
    if (n < rtCount) return `Survei ini memilih ${rtCount} RT, jumlah RT tidak boleh kurang dari itu.`;
    if (!officialName.trim()) return 'Isi nama aparat desa/kelurahan yang mengesahkan daftar RT.';
    if (!photoPath) return 'Unggah foto Form B yang sudah ditandatangani & distempel.';
    return '';
  }

  async function handleDraw() {
    const invalid = validate();
    setError(invalid);
    if (invalid) return;

    setSubmitting(true);
    try {
      const res = await api.post('/rt-selection', {
        survey_id: surveyId,
        province: region.province_name,
        city: region.regency_name,
        district: region.district_name,
        village: region.village_name,
        total_rt: Number(totalRt),
        official_name: officialName,
        official_position: officialPosition,
        official_phone: officialPhone,
        form_b_photo_path: photoPath,
      });
      setResult(res.data);
      setHistory((prev) => {
        const tanpaDuplikat = prev.filter((h) => h.id !== res.data.selection.id);
        return [res.data.selection, ...tanpaDuplikat];
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal melakukan undian RT. Pastikan ada koneksi internet.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Memuat…</div>;
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Kembali"
            className="-ml-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <Icon name="arrowLeft" className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-800">Pemilihan RT</h1>
            <p className="text-xs text-gray-500">{survey?.title || 'Survei'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 flex gap-3">
          <Icon name="lock" className="w-5 h-5 text-accent-700 shrink-0 mt-0.5" />
          <p className="text-sm text-accent-900 leading-relaxed">
            Undian dilakukan sistem, <strong>satu kali per kelurahan/desa</strong>, dan hasilnya tidak bisa
            diulang. Pastikan jumlah RT sudah sesuai daftar dari aparat desa sebelum menekan tombol undi.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
        )}

        {/* Hasil undian */}
        {result && (
          <section className="rounded-2xl border border-green-300 bg-green-50 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-green-900">
              {result.already_locked ? 'Sudah pernah diundi — hasil terkunci' : 'Hasil undian RT'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(result.selection.selected || []).map((n) => (
                <span key={n} className="px-4 py-2 rounded-xl bg-white border-2 border-green-400 text-green-800 text-lg font-bold">
                  RT nomor urut {n}
                </span>
              ))}
            </div>
            <p className="text-xs text-green-900">
              {result.selection.village} · dari {result.selection.total_rt} RT ·
              dikunci {new Date(result.selection.locked_at).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-green-800">
              Catat nomor ini di Form B, lalu lanjutkan pendataan KK pada RT tersebut.
            </p>
          </section>
        )}

        {/* Form input */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Lokasi penugasan</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
              <select value={region.province_id} onChange={(e) => pick('province_id', e.target.value, provinceOptions.find((o) => o.id === e.target.value)?.name || '')} className={selectClass}>
                <option value="">— Pilih provinsi —</option>
                {provinceOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kabupaten/Kota</label>
              <select value={region.regency_id} disabled={!region.province_id} onChange={(e) => pick('regency_id', e.target.value, regencyOptions.find((o) => o.id === e.target.value)?.name || '')} className={selectClass}>
                <option value="">— Pilih kabupaten/kota —</option>
                {regencyOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
              <select value={region.district_id} disabled={!region.regency_id} onChange={(e) => pick('district_id', e.target.value, districtOptions.find((o) => o.id === e.target.value)?.name || '')} className={selectClass}>
                <option value="">— Pilih kecamatan —</option>
                {districtOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kelurahan/Desa</label>
              <select value={region.village_id} disabled={!region.district_id} onChange={(e) => pick('village_id', e.target.value, villageOptions.find((o) => o.id === e.target.value)?.name || '')} className={selectClass}>
                <option value="">— Pilih kelurahan/desa —</option>
                {villageOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          {villageSudahAda && !result && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Kelurahan ini sudah pernah diundi. Menekan tombol undi akan menampilkan hasil yang lama, bukan hasil baru.
            </p>
          )}

          <h2 className="text-sm font-semibold text-gray-700 pt-2">Daftar RT (Form B)</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jumlah RT di kelurahan/desa <span className="text-red-500">*</span>
            </label>
            <input type="number" inputMode="numeric" min="1" value={totalRt} onChange={(e) => { setTotalRt(e.target.value); setResult(null); }} className={inputClass} placeholder="mis. 25" />
            <p className="text-xs text-gray-500 mt-1">Sesuai daftar resmi dari aparat desa/kelurahan. Sistem akan memilih {rtCount} RT.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama aparat desa/kelurahan <span className="text-red-500">*</span></label>
              <input value={officialName} onChange={(e) => setOfficialName(e.target.value)} className={inputClass} placeholder="mis. AJI" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan</label>
              <input value={officialPosition} onChange={(e) => setOfficialPosition(e.target.value)} className={inputClass} placeholder="mis. Kepala Desa" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. Telp/HP</label>
              <input value={officialPhone} onChange={(e) => setOfficialPhone(e.target.value)} className={inputClass} placeholder="08xx" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Foto Form B (ttd &amp; stempel) <span className="text-red-500">*</span>
            </label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhoto(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent-50 file:text-accent-700 file:text-sm file:font-medium" />
            {uploading && <p className="text-xs text-gray-500 mt-1">Mengunggah…</p>}
            {photoPath && (
              <p className="text-xs text-green-700 mt-1 inline-flex items-center gap-1">
                <Icon name="check" className="w-3.5 h-3.5" />
                Foto Form B terunggah
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">Bukti bahwa daftar RT memang sah dari aparat desa.</p>
          </div>

          <button type="button" onClick={handleDraw} disabled={submitting || uploading}
            className="w-full min-h-[48px] rounded-xl bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors">
            <Icon name="shuffle" className="w-4 h-4" />
            {submitting ? 'Mengundi…' : `Undi ${rtCount} RT sekarang`}
          </button>
          <p className="text-xs text-gray-500 text-center">Hasil undian bersifat final dan tercatat di server.</p>
        </section>

        {/* Riwayat */}
        {history.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Undian sebelumnya</h2>
            <ul className="divide-y divide-gray-100">
              {history.map((h) => (
                <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{h.village}</p>
                    <p className="text-xs text-gray-500">{h.district} · dari {h.total_rt} RT</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(h.selected || []).map((n) => (
                      <span key={n} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-800 text-xs font-semibold">RT {n}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

export default RtSelection;
