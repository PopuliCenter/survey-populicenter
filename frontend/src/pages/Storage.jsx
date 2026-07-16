import React, { useState, useCallback, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function Storage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(new Set());
  const [purging, setPurging] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [message, setMessage] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Lacak mount agar polling async tidak setState / memaksa unduh setelah
  // pengguna meninggalkan halaman (cegah kebocoran + warning React).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage('');
    try {
      const res = await api.get('/storage/overview');
      setData(res.data);
      setSelected(new Set());
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Gagal memuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  const surveys = data?.surveys || [];
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allSelected = surveys.length > 0 && selected.size === surveys.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(surveys.map((s) => s.id)));

  const setBusyId = (id, on) => setBusy((prev) => {
    const next = new Set(prev);
    on ? next.add(id) : next.delete(id);
    return next;
  });

  function triggerBlobDownload(blob, survey) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (survey.title || 'survei').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 40);
    a.href = url;
    a.download = `arsip-${safe}-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Tunda revoke — sebagian browser butuh URL tetap hidup sampai unduhan mulai
    // (revoke segera bisa membuat file kosong/gagal untuk blob besar).
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Survei besar diproses worker → polling status tiap 3 dtk lalu unduh.
  async function pollAndDownloadJob(jobId, survey) {
    const maxAttempts = 200; // ~10 menit @ 3 dtk
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!mountedRef.current) return; // pengguna sudah pindah halaman — hentikan polling
      const st = await api.get(`/storage/archive-jobs/${jobId}`);
      if (!mountedRef.current) return;
      const status = st.data?.status;
      if (status === 'completed') {
        const dl = await api.get(`/storage/archive-jobs/${jobId}/download`, { responseType: 'blob', timeout: 600000 });
        if (!mountedRef.current) return; // jangan paksa unduh setelah keluar halaman
        triggerBlobDownload(dl.data, survey);
        setMessage(`Arsip "${survey.title}" selesai & terunduh (${formatBytes(dl.data.size)}). Cek folder Unduhan.`);
        return;
      }
      if (status === 'failed') throw new Error('Proses arsip gagal di server. Coba lagi atau cek log.');
      setMessage(`Memproses arsip "${survey.title}" di latar belakang… (${status})`);
    }
    throw new Error('Arsip masih diproses di server — tombol bisa dicoba lagi nanti.');
  }

  async function downloadArchive(survey) {
    setBusyId(survey.id, true);
    setError(null);
    try {
      const res = await api.get(`/storage/survey/${survey.id}/archive`, { responseType: 'blob', timeout: 600000 });

      // Survei besar → server balas 202 + JSON { jobId } (di dalam blob).
      if (res.status === 202) {
        let jobId;
        try { jobId = JSON.parse(await res.data.text()).jobId; } catch { /* noop */ }
        if (!jobId) throw new Error('Server tidak mengembalikan jobId untuk arsip async.');
        setMessage(`Survei besar — arsip "${survey.title}" diproses di latar belakang…`);
        await pollAndDownloadJob(jobId, survey);
        return;
      }

      // Survei kecil → blob ZIP langsung.
      const blob = res.data;
      const ct = (res.headers && res.headers['content-type']) || blob.type || '';
      // Bila server balas non-ZIP (mis. HTML SPA karena rute belum ter-deploy,
      // atau JSON error), tampilkan pesan yang jelas — bukan unduh file rusak.
      if (!/zip/i.test(ct)) {
        let msg = 'Server tidak mengembalikan file ZIP. Pastikan backend & nginx (rute /storage) sudah di-deploy ulang.';
        try { const j = JSON.parse(await blob.text()); if (j.error) msg = j.error; } catch { /* biarkan pesan default */ }
        throw new Error(msg);
      }
      triggerBlobDownload(blob, survey);
      setMessage(`Arsip "${survey.title}" berhasil diunduh (${formatBytes(blob.size)}). Cek folder Unduhan perangkat Anda.`);
    } catch (e) {
      if (mountedRef.current) setError(`Gagal mengunduh arsip "${survey.title}": ${e.message || 'kesalahan tak dikenal'}`);
    } finally {
      if (mountedRef.current) setBusyId(survey.id, false);
    }
  }

  async function handleDownloadSelected() {
    if (bulkBusy) return; // cegah klik ganda memulai loop paralel
    setBulkBusy(true);
    try {
      for (const id of selected) {
        if (!mountedRef.current) break;
        const s = surveys.find((x) => x.id === id);
        if (s) await downloadArchive(s); // berurutan agar tidak membebani
      }
    } finally {
      if (mountedRef.current) setBulkBusy(false);
    }
  }

  async function handlePurge() {
    setPurging(true);
    setError(null);
    try {
      const res = await api.post('/storage/purge', { survey_ids: [...selected] });
      setMessage(res.data.message || 'Selesai.');
      setConfirmPurge(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Gagal menghapus.');
    } finally {
      setPurging(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Penyimpanan</h1>
            <p className="text-sm text-gray-500">
              {data
                ? `Total media di ${data.storage_driver === 'minio' ? 'MinIO (object storage)' : 'server (disk)'}: ${formatBytes(data.uploads_bytes)}`
                : 'Kelola data & media per survei (arsip / hapus).'}
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg">
            {loading ? 'Memuat…' : data ? 'Perbarui' : 'Muat'}
          </button>
        </div>

        {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>}
        {message && <div role="status" aria-live="polite" className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4">{message}</div>}

        {data && (
          <>
            {/* Aksi massal */}
            {selected.size > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-600">{selected.size} survei terpilih</span>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={handleDownloadSelected} disabled={bulkBusy}
                    className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg">
                    {bulkBusy ? 'Mengunduh…' : 'Unduh arsip terpilih'}
                  </button>
                  <button type="button" onClick={() => setConfirmPurge(true)}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">
                    Hapus data terpilih
                  </button>
                </div>
              </div>
            )}

            {/* Konfirmasi hapus */}
            {confirmPurge && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-800 font-medium">Hapus permanen respons & media untuk {selected.size} survei?</p>
                <p className="text-xs text-red-600 mt-1">Definisi survei & pertanyaan tetap ada. Data respons + file media dihapus dan disk dilegakan. Tindakan ini tidak bisa dibatalkan — arsipkan dulu bila perlu.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={handlePurge} disabled={purging}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">
                    {purging ? 'Menghapus…' : 'Ya, hapus permanen'}
                  </button>
                  <button type="button" onClick={() => setConfirmPurge(false)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                    Batal
                  </button>
                </div>
              </div>
            )}

            {/* Tabel per survei */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="p-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Pilih semua" /></th>
                    <th className="p-3 font-medium">Survei</th>
                    <th className="p-3 font-medium text-right">Respons</th>
                    <th className="p-3 font-medium text-right">File media</th>
                    <th className="p-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">Belum ada survei.</td></tr>
                  )}
                  {surveys.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Pilih ${s.title}`} /></td>
                      <td className="p-3">
                        <span className="font-medium text-gray-800">{s.title}</span>
                        <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded ${s.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                      </td>
                      <td className="p-3 text-right text-gray-700">{s.responses.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right text-gray-700">{s.media_count.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => downloadArchive(s)} disabled={busy.has(s.id)}
                          className="px-3 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-md">
                          {busy.has(s.id) ? 'Menyiapkan…' : 'Unduh arsip'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400">
              Arsip berisi <code>responses.json</code> + folder <code>media/</code>. Untuk backup berkala &amp; dataset sangat besar, gunakan backup server (docs/ops/backup.md).
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

export default Storage;
