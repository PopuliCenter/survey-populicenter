import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { loadRegionData } from '../../utils/regionData';
import Icon from '../../components/Icon';
import { localStore } from '../../utils/safeStorage';
import { getCachedSurvey, saveDraftMedia, getDraftMedia, deleteDraftMedia } from '../../utils/storage';
import { compressIfNeeded } from '../../utils/imageCompressor';
import { drawRtClient } from '../../utils/rtDrawClient';
import FormAGrid, { computeFormAGridView } from '../../components/FormAGrid';
import { getNetworkStatus, addNetworkListener } from '../../utils/capacitorBridge';

/**
 * RtSelection — layar TPD untuk mengundi RT (pengganti FORM A + FORM B kertas).
 *
 * BEKERJA OFFLINE. Saat online (mis. tombol Perbarui di daftar survei), server
 * menjatah "tiket" seed undian yang tersimpan di perangkat. Di pelosok tanpa
 * sinyal, aplikasi memakai tiket berikutnya SESUAI URUTAN (TPD tak bisa
 * memilih), menghitung undian lokal dengan algoritma identik server
 * (utils/rtDrawClient), dan mengunci hasilnya. Saat sinyal kembali, hasil
 * tersinkron otomatis dan server MENGHITUNG ULANG dari seed tiket — hasil yang
 * tak cocok otomatis ditandai merah di pengawasan.
 *
 * Tetap TIDAK ada tombol "acak ulang" — online maupun offline, satu kelurahan
 * satu undian. Itulah yang membuat versi digital ini lebih kuat dari kertas.
 */

const UPLOAD_OPTS = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed';
const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400';

// ── Cache lokal (localStorage via safeStorage) ────────────────────────────────
const ticketsKey = (surveyId) => `rt_tickets__${surveyId}`;
const pendingKey = (surveyId) => `rt_pending__${surveyId}`;
// Kunci media draft untuk foto Form B sebuah kelurahan (blob di SQLite/IndexedDB).
const mediaKeyOf = (village) => `rt-${String(village).toUpperCase()}`;

function readJson(key, fallback) {
  try {
    const raw = localStore.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStore.setItem(key, JSON.stringify(value)); } catch { /* penuh/blokir — abaikan */ }
}

function RtSelection() {
  const { surveyId } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState(null);
  const [regionData, setRegionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState('');

  const [region, setRegion] = useState({ province_id: '', province_name: '', regency_id: '', regency_name: '', district_id: '', district_name: '', village_id: '', village_name: '' });
  const [totalRt, setTotalRt] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialPosition, setOfficialPosition] = useState('');
  const [officialPhone, setOfficialPhone] = useState('');
  const [photoFile, setPhotoFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);   // { selection, already_locked, offline_pending? }
  // Grid Form A untuk hasil yang sedang tampil — dihitung ulang dari seed.
  const [gridView, setGridView] = useState(null); // { grid, picks, totalRt }
  useEffect(() => {
    let active = true;
    // Hanya undian v2 (Form A) yang punya grid; baris lama v1 tidak.
    computeFormAGridView(result?.selection)
      .then((view) => { if (active) setGridView(view); })
      .catch(() => { if (active) setGridView(null); });
    return () => { active = false; };
  }, [result]);
  const [history, setHistory] = useState([]);   // tersinkron di server
  const [tickets, setTickets] = useState(() => readJson(ticketsKey(surveyId), null)); // { rt_count, tickets: [...] }
  const [pending, setPending] = useState(() => readJson(pendingKey(surveyId), []));   // undian offline menunggu sinkron
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const rtCount = survey?.field_tools_settings?.rt_selection_count
    || tickets?.rt_count
    || 2;

  // ── Muat data awal: cache dulu (instan & tahan offline), lalu server ────────
  useEffect(() => {
    let active = true;
    (async () => {
      const net = await getNetworkStatus().catch(() => ({ connected: true }));
      if (active) setOnline(!!net.connected);

      // Selalu siapkan data lokal dulu.
      const [cachedSurvey, region_] = await Promise.all([
        getCachedSurvey(surveyId).catch(() => null),
        loadRegionData(),
      ]);
      if (!active) return;
      if (cachedSurvey) setSurvey(cachedSurvey);
      setRegionData(region_ || { provinces: [], regenciesByProvince: {}, districtsByRegency: {}, villagesByDistrict: {} });

      if (net.connected) {
        const [srv, hist, tik] = await Promise.all([
          api.get(`/surveys/${surveyId}`).then((r) => r.data.survey || r.data).catch(() => null),
          api.get('/rt-selection', { params: { survey_id: surveyId } }).then((r) => r.data.selections || []).catch(() => null),
          api.get('/rt-selection/tickets', { params: { survey_id: surveyId } }).then((r) => r.data).catch(() => null),
        ]);
        if (!active) return;
        if (srv) setSurvey(srv);
        if (hist) setHistory(hist);
        if (tik) { setTickets(tik); writeJson(ticketsKey(surveyId), tik); }
      }
      setLoading(false);
    })();

    // Pantau perubahan jaringan → picu sinkron saat sinyal kembali.
    let cleanup = null;
    addNetworkListener((st) => { if (active) setOnline(!!st.connected); })
      .then((c) => { cleanup = c; })
      .catch(() => {});
    return () => { active = false; if (typeof cleanup === 'function') cleanup(); };
  }, [surveyId]);

  const provinceOptions = regionData?.provinces || [];
  const regencyOptions = regionData?.regenciesByProvince?.[region.province_id] || [];
  const districtOptions = regionData?.districtsByRegency?.[region.regency_id] || [];
  const villageOptions = regionData?.villagesByDistrict?.[region.district_id] || [];

  // Kelurahan yang sudah terkunci (server + menunggu sinkron) — dilihat SEBELUM undi.
  const lockedVillages = useMemo(() => {
    const set = new Set(history.map((h) => String(h.village || '').toUpperCase()));
    pending.forEach((p) => set.add(String(p.village || '').toUpperCase()));
    return set;
  }, [history, pending]);
  const villageSudahAda = region.village_name && lockedVillages.has(region.village_name.toUpperCase());

  // Tiket yang belum terpakai (server-side used ∪ dipakai pending lokal).
  const availableTickets = useMemo(() => {
    if (!tickets?.tickets) return [];
    const usedLocally = new Set(pending.map((p) => p.ticket_id));
    return tickets.tickets.filter((t) => !t.used_village && !usedLocally.has(t.id));
  }, [tickets, pending]);

  function pick(field, value, label) {
    const next = { ...region, [field]: value, [field.replace('_id', '_name')]: label };
    if (field === 'province_id') Object.assign(next, { regency_id: '', regency_name: '', district_id: '', district_name: '', village_id: '', village_name: '' });
    if (field === 'regency_id') Object.assign(next, { district_id: '', district_name: '', village_id: '', village_name: '' });
    if (field === 'district_id') Object.assign(next, { village_id: '', village_name: '' });
    setRegion(next);
    setResult(null);
  }

  function validate() {
    if (!region.village_name) return 'Pilih wilayah sampai tingkat kelurahan/desa.';
    const n = Number(totalRt);
    if (!Number.isInteger(n) || n < 1) return 'Isi jumlah RT di kelurahan/desa (bilangan bulat).';
    if (n < rtCount) return `Survei ini memilih ${rtCount} RT, jumlah RT tidak boleh kurang dari itu.`;
    if (!officialName.trim()) return 'Isi nama aparat desa/kelurahan yang mengesahkan daftar RT.';
    if (!photoFile) return 'Ambil foto Form B yang sudah ditandatangani & distempel.';
    if (villageSudahAda) return 'Kelurahan ini sudah pernah diundi — hasilnya terkunci dan tidak bisa diulang.';
    return '';
  }

  async function uploadFormB() {
    const compressed = await compressIfNeeded(photoFile);
    const fd = new FormData();
    fd.append('photo', compressed, photoFile.name || 'form-b.jpg');
    const res = await api.post('/upload/photo', fd, UPLOAD_OPTS);
    return res.data.path;
  }

  function commonPayload() {
    return {
      survey_id: surveyId,
      province: region.province_name,
      city: region.regency_name,
      district: region.district_name,
      village: region.village_name,
      total_rt: Number(totalRt),
      official_name: officialName,
      official_position: officialPosition,
      official_phone: officialPhone,
    };
  }

  // ── Undian OFFLINE: tiket berikutnya + hitung lokal + kunci di perangkat ────
  const drawOffline = useCallback(async () => {
    const ticket = availableTickets[0]; // wajib berurutan — selalu ambil seq terkecil
    if (!ticket) {
      throw new Error(
        'Jatah undian offline habis / belum diunduh. Sambungkan internet sekali (tekan Perbarui di daftar survei), lalu coba lagi.'
      );
    }
    const selected = await drawRtClient({ seed: ticket.seed, totalRt: Number(totalRt), count: rtCount });

    // Foto Form B disimpan di perangkat (SQLite/IndexedDB) — diunggah saat sinkron.
    const compressed = await compressIfNeeded(photoFile);
    await deleteDraftMedia(surveyId, mediaKeyOf(region.village_name)).catch(() => {});
    await saveDraftMedia({
      surveyId,
      number: mediaKeyOf(region.village_name),
      type: 'photo',
      blob: compressed,
      filename: photoFile.name || 'form-b.jpg',
    });

    const record = {
      ...commonPayload(),
      ticket_id: ticket.id,
      ticket_seq: ticket.seq,
      selected,
      locked_at: new Date().toISOString(),
    };
    const nextPending = [...pending, record];
    setPending(nextPending);
    writeJson(pendingKey(surveyId), nextPending);

    setResult({
      selection: { ...record, seed: ticket.seed, total_rt: record.total_rt, algo_version: 2 },
      already_locked: false,
      offline_pending: true,
    });
  }, [availableTickets, totalRt, rtCount, photoFile, pending, surveyId, region]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDraw() {
    const invalid = validate();
    setError(invalid);
    if (invalid) return;

    setSubmitting(true);
    try {
      const net = await getNetworkStatus().catch(() => ({ connected: online }));
      if (net.connected) {
        try {
          const formBPath = await uploadFormB();
          const res = await api.post('/rt-selection', { ...commonPayload(), form_b_photo_path: formBPath });
          setResult(res.data);
          setHistory((prev) => [res.data.selection, ...prev.filter((h) => h.id !== res.data.selection.id)]);
        } catch (err) {
          // Server tak terjangkau padahal status "online" (sinyal semu di
          // lapangan) → jangan gagalkan: jatuh ke jalur offline bertiket.
          if (err.response) throw err; // error nyata dari server (422/409/…)
          await drawOffline();
        }
      } else {
        await drawOffline();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Gagal melakukan undian RT.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Sinkron otomatis undian offline saat sinyal kembali ─────────────────────
  const syncPending = useCallback(async () => {
    if (syncingRef.current || pending.length === 0) return;
    syncingRef.current = true;
    setSyncing(true);
    let remaining = [...pending];
    try {
      for (const item of pending) {
        // 1. Unggah foto Form B dari penyimpanan perangkat.
        let formBPath = null;
        try {
          const media = await getDraftMedia(surveyId, mediaKeyOf(item.village));
          const photo = (media || []).find((m) => m.type === 'photo');
          if (photo?.blob) {
            const fd = new FormData();
            fd.append('photo', photo.blob, photo.filename || 'form-b.jpg');
            const up = await api.post('/upload/photo', fd, UPLOAD_OPTS);
            formBPath = up.data.path;
          }
        } catch { /* foto gagal terunggah — tetap setor hasil undian */ }

        // 2. Setor hasil — server memverifikasi ulang dari seed tiket.
        const res = await api.post('/rt-selection/offline-sync', {
          ...item,
          form_b_photo_path: formBPath,
        });

        remaining = remaining.filter((p) => p !== item);
        setHistory((prev) => [res.data.selection, ...prev.filter((h) => h.id !== res.data.selection.id)]);
        await deleteDraftMedia(surveyId, mediaKeyOf(item.village)).catch(() => {});
      }
    } catch {
      // Jaringan putus di tengah — sisa pending dicoba lagi nanti.
    } finally {
      setPending(remaining);
      writeJson(pendingKey(surveyId), remaining);
      // Segarkan tiket (status used dari server).
      try {
        const tik = await api.get('/rt-selection/tickets', { params: { survey_id: surveyId } }).then((r) => r.data);
        setTickets(tik);
        writeJson(ticketsKey(surveyId), tik);
      } catch { /* offline lagi — biarkan */ }
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [pending, surveyId]);

  useEffect(() => {
    if (online && pending.length > 0) syncPending();
  }, [online, pending.length, syncPending]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Memuat…</div>;
  }

  const offlineReady = availableTickets.length > 0;

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
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-gray-800">Pemilihan RT</h1>
            <p className="text-xs text-gray-500 truncate">{survey?.title || 'Survei'}</p>
          </div>
          {!online && (
            <span className="shrink-0 text-xs font-medium text-accent-700 bg-accent-50 border border-accent-200 rounded-full px-2.5 py-1">
              Offline
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 flex gap-3">
          <Icon name="lock" className="w-5 h-5 text-accent-700 shrink-0 mt-0.5" />
          <div className="text-sm text-accent-900 leading-relaxed">
            <p>
              Undian dilakukan sistem, <strong>satu kali per kelurahan/desa</strong>, dan tidak bisa diulang.
              Pastikan jumlah RT sesuai daftar dari aparat desa sebelum mengundi.
            </p>
            <p className={`mt-1 text-xs inline-flex items-center gap-1 ${offlineReady ? 'text-green-700' : 'text-amber-700 font-medium'}`}>
              <Icon name={offlineReady ? 'check' : 'alert'} className="w-3.5 h-3.5 shrink-0" />
              {offlineReady
                ? `Siap dipakai tanpa sinyal — ${availableTickets.length} jatah undian offline tersedia`
                : 'Jatah undian offline belum tersedia — tekan Perbarui di daftar survei saat ada sinyal'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>
        )}

        {syncing && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Menyinkron {pending.length} undian offline ke server…
          </div>
        )}

        {/* Hasil undian */}
        {result && (
          <section className="rounded-2xl border border-green-300 bg-green-50 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-green-900">
              {result.already_locked ? 'Sudah pernah diundi — hasil terkunci' : 'Hasil undian RT'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(result.selection.selected || []).map((n) => (
                <span key={n} className="px-4 py-2 rounded-xl bg-white border-2 border-green-400 text-green-800 text-lg font-bold tabular-nums">
                  RT nomor urut {n}
                </span>
              ))}
            </div>
            <p className="text-xs text-green-900">
              {result.selection.village} · dari {result.selection.total_rt} RT ·
              dikunci {new Date(result.selection.locked_at).toLocaleString('id-ID')}
            </p>

            {/* Kotak-kotak Form A — bukti visual pilihan, seperti lembar kertas */}
            {gridView && (
              <div className="bg-white border border-green-200 rounded-xl p-3">
                <FormAGrid grid={gridView.grid} picks={gridView.picks} totalRt={gridView.totalRt} />
              </div>
            )}
            {result.offline_pending ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
                <Icon name="clock" className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  Terkunci di perangkat (tiket #{result.selection.ticket_seq}). Akan tersinkron otomatis saat
                  ada sinyal — server memverifikasi ulang hasilnya dari seed tiket.
                </span>
              </p>
            ) : (
              <p className="text-xs text-green-800">
                Catat nomor ini di Form B, lalu lanjutkan pendataan KK pada RT tersebut.
              </p>
            )}
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
              Kelurahan ini sudah pernah diundi — hasilnya terkunci dan tidak bisa diulang.
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
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent-50 file:text-accent-700 file:text-sm file:font-medium" />
            {photoFile && (
              <p className="text-xs text-green-700 mt-1 inline-flex items-center gap-1">
                <Icon name="check" className="w-3.5 h-3.5" />
                Foto siap — {photoFile.name || 'form-b.jpg'}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Bukti daftar RT sah dari aparat desa. Tanpa sinyal, foto disimpan di perangkat dan
              terunggah otomatis saat sinkron.
            </p>
          </div>

          <button type="button" onClick={handleDraw} disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors">
            <Icon name="shuffle" className="w-4 h-4" />
            {submitting ? 'Mengundi…' : `Undi ${rtCount} RT sekarang`}
          </button>
          <p className="text-xs text-gray-500 text-center">
            Hasil undian bersifat final — tercatat di server, atau terkunci di perangkat lalu
            tersinkron otomatis bila sedang tanpa sinyal.
          </p>
        </section>

        {/* Menunggu sinkron + riwayat */}
        {(pending.length > 0 || history.length > 0) && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Undian tercatat</h2>
            <ul className="divide-y divide-gray-100">
              {pending.map((p) => (
                <li key={`p-${p.ticket_id}`} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{p.village}</p>
                    <p className="text-xs text-amber-700 inline-flex items-center gap-1">
                      <Icon name="clock" className="w-3 h-3" />
                      Menunggu sinkron · dari {p.total_rt} RT
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(p.selected || []).map((n) => (
                      <span key={n} className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold tabular-nums">RT {n}</span>
                    ))}
                  </div>
                </li>
              ))}
              {history.map((h) => (
                <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{h.village}</p>
                    <p className="text-xs text-gray-500">{h.district} · dari {h.total_rt} RT</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(h.selected || []).map((n) => (
                      <span key={n} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-800 text-xs font-semibold tabular-nums">RT {n}</span>
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
