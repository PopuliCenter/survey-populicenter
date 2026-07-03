import React, { useState, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

async function downloadArchive(survey, onProgress) {
  onProgress?.(survey.id, true);
  try {
    const res = await api.get(`/storage/survey/${survey.id}/archive`, { responseType: 'blob', timeout: 600000 });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    const safe = (survey.title || 'survei').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 40);
    a.href = url;
    a.download = `arsip-${safe}-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    onProgress?.(survey.id, false);
  }
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

  async function handleDownloadSelected() {
    for (const id of selected) {
      const s = surveys.find((x) => x.id === id);
      if (s) await downloadArchive(s, setBusyId); // berurutan agar tidak membebani
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
              {data ? `Total media di server: ${formatBytes(data.uploads_bytes)}` : 'Kelola data & media per survei (arsip / hapus).'}
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg">
            {loading ? 'Memuat…' : data ? 'Perbarui' : 'Muat'}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4">{message}</div>}

        {data && (
          <>
            {/* Aksi massal */}
            {selected.size > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-600">{selected.size} survei terpilih</span>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={handleDownloadSelected}
                    className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg">
                    Unduh arsip terpilih
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
                        <button type="button" onClick={() => downloadArchive(s, setBusyId)} disabled={busy.has(s.id)}
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
