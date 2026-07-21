import React, { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import api from '../services/api';

/**
 * MonitoringPanel — kontrol admin untuk embed MONITORING klien (link privat
 * bertoken): aktifkan/nonaktifkan + tampilkan tautan & cuplikan iframe.
 *
 * @param {{ surveyId: string, surveyTitle: string }} props
 */
function MonitoringPanel({ surveyId, surveyTitle }) {
  const toast = useToast();
  const [mon, setMon] = useState(null); // { token, is_enabled, snapshot_at } | null
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    if (!surveyId) return;
    setLoading(true);
    try {
      const res = await api.get(`/surveys/${surveyId}/monitoring`);
      setMon(res.data);
    } catch {
      setMon(null);
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { load(); }, [load]);

  const url = mon?.token ? `${window.location.origin}/embed/monitor/${mon.token}` : '';
  const snippet = url
    ? `<iframe src="${url}" width="100%" height="700" style="border:0;width:100%" loading="lazy" title="Monitoring ${surveyTitle}"></iframe>`
    : '';
  const isLive = mon?.is_enabled;

  async function enable() {
    setBusy(true);
    try {
      const res = await api.post(`/surveys/${surveyId}/monitoring/enable`);
      setMon(res.data);
      toast.success('Monitoring klien aktif.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mengaktifkan monitoring.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api.post(`/surveys/${surveyId}/monitoring/disable`);
      toast.success('Monitoring dinonaktifkan.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menonaktifkan.');
    } finally {
      setBusy(false);
    }
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(key); setTimeout(() => setCopied(''), 1500); },
      () => toast.error('Gagal menyalin.')
    );
  }

  if (!surveyId) return null;

  return (
    <div className="space-y-3 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Embed monitoring (klien)</span>
        {loading ? (
          <span className="text-xs text-gray-400">Memeriksa…</span>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Aktif
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
            Nonaktif
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Tautan privat bertoken untuk klien memantau capaian vs target (refresh berkala ±15 menit).
        Jangan sebar ke publik.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg"
        >
          {busy ? 'Memproses…' : isLive ? 'Perbarui sekarang' : 'Aktifkan monitoring'}
        </button>
        {isLive && (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg"
          >
            Nonaktifkan
          </button>
        )}
      </div>

      {isLive && url && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tautan privat klien</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700"
              />
              <button
                type="button"
                onClick={() => copy(url, 'url')}
                className="px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg whitespace-nowrap"
              >
                {copied === 'url' ? <><Icon name="check" className="w-3.5 h-3.5" />Tersalin</> : 'Salin'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cuplikan embed (HTML widget)</label>
            <div className="flex gap-2">
              <textarea
                readOnly
                rows={2}
                value={snippet}
                onFocus={(e) => e.target.select()}
                className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 resize-none"
              />
              <button
                type="button"
                onClick={() => copy(snippet, 'embed')}
                className="px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg whitespace-nowrap self-start"
              >
                {copied === 'embed' ? <><Icon name="check" className="w-3.5 h-3.5" />Tersalin</> : 'Salin'}
              </button>
            </div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary-600 hover:underline">
            Pratinjau monitoring ↗
          </a>
        </div>
      )}
    </div>
  );
}

export default MonitoringPanel;
