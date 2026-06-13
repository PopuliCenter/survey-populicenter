import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from './Toast';
import api from '../services/api';
import PROVINCE_CENTROIDS from '../data/provinceCentroids';

// Daftar provinsi kanonik (sama dengan yang dipakai peta sebaran).
const PROVINCES = Object.keys(PROVINCE_CENTROIDS);

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * SamplingTargetModal — atur target sampel (random sampling) per provinsi
 * untuk satu survei. Disimpan ke surveys.region_targets.
 *
 * @param {{ surveyId: string, surveyTitle: string, onClose: (saved?: boolean) => void }} props
 */
function SamplingTargetModal({ surveyId, surveyTitle, onClose }) {
  const toast = useToast();
  const [targets, setTargets] = useState({}); // { [province]: number }
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get(`/surveys/${surveyId}/region-targets`)
      .then((res) => {
        if (!alive) return;
        const map = {};
        (res.data || []).forEach((r) => { map[r.province] = r.target; });
        setTargets(map);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [surveyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return PROVINCES.filter((p) => !q || p.includes(q));
  }, [search]);

  const total = useMemo(
    () => Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0),
    [targets]
  );

  function setVal(prov, val) {
    setTargets((prev) => {
      const next = { ...prev };
      const n = parseInt(val, 10);
      if (!val || Number.isNaN(n) || n <= 0) delete next[prov];
      else next[prov] = n;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const region_targets = Object.entries(targets).map(([province, target]) => ({ province, target }));
      await api.put(`/surveys/${surveyId}/region-targets`, { region_targets });
      toast.success('Target sampling tersimpan.');
      onClose?.(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan target.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Atur target sampling per provinsi"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Target sampling per provinsi</h3>
            <p className="text-xs text-gray-400 mt-0.5">{surveyTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.(false)}
            aria-label="Tutup"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari provinsi…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {loading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Memuat…</p>
          ) : (
            filtered.map((prov) => (
              <div key={prov} className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm text-gray-700">{titleCase(prov)}</span>
                <input
                  type="number"
                  min="0"
                  value={targets[prov] ?? ''}
                  onChange={(e) => setVal(prov, e.target.value)}
                  placeholder="0"
                  className={inputCls}
                  aria-label={`Target ${titleCase(prov)}`}
                />
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Total target: <b>{total.toLocaleString('id-ID')}</b>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onClose?.(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SamplingTargetModal;
