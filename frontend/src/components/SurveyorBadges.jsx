import React, { useEffect, useState } from 'react';
import QuotaProgress from './QuotaProgress';
import api from '../services/api';

// ─── Status Badge ─────────────────────────────────────────────────────────────
/**
 * Renders a colored badge for TPD active/inactive status.
 *
 * @param {{ isActive: boolean }} props
 */
export function StatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      Aktif
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      Nonaktif
    </span>
  );
}

// ─── Quota Panel ──────────────────────────────────────────────────────────────
/**
 * Expandable panel showing quota summary per survey for a TPD.
 *
 * @param {{ surveyorId: string | number }} props
 */
export function QuotaPanel({ surveyorId }) {
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Quota endpoint sekarang sudah include submitted_numbers dan assigned_numbers
    api.get(`/surveyors/${surveyorId}/quota`)
      .then((quotaRes) => {
        if (!cancelled) {
          setQuotas(quotaRes.data);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              err.message ||
              'Gagal memuat data kuota.'
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [surveyorId]);

  if (loading) {
    return (
      <div className="px-5 py-3 text-xs text-gray-400" role="status" aria-live="polite">
        Memuat data kuota…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 py-3 text-xs text-red-500" role="alert">
        {error}
      </div>
    );
  }

  if (quotas.length === 0) {
    return (
      <div className="px-5 py-3 text-xs text-gray-400">
        Belum ada data kuota untuk TPD ini.
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Ringkasan Kuota per Survei
      </p>
      <div className="space-y-3">
        {quotas.map((item) => {
          const assignedNums = item.assigned_numbers || [];
          const submittedNums = item.submitted_numbers || [];
          // Hitung status per nomor yang ditugaskan
          const submittedSet = new Set(submittedNums);

          return (
            <div key={item.survey_id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-gray-800 truncate" title={item.survey_title}>
                {item.survey_title}
              </p>
              <QuotaProgress filled={item.filled} quota={item.quota} showLabel />

              {/* Nomor kuesioner yang ditugaskan (Fitur #1 & #6) */}
              {assignedNums.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">
                    Nomor kuesioner ditugaskan ({assignedNums.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assignedNums.map((num) => {
                      const isDone = submittedSet.has(num);
                      return (
                        <span
                          key={num}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            isDone
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                          title={isDone ? 'Sudah diisi' : 'Belum diisi'}
                        >
                          {isDone ? '✓' : '○'} {num}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {submittedNums.filter((n) => assignedNums.includes(n)).length}/{assignedNums.length} nomor sudah diisi
                  </p>
                </div>
              )}

              {/* Nomor kuesioner yang sudah tersimpan (tanpa penugasan spesifik) */}
              {assignedNums.length === 0 && submittedNums.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nomor kuesioner tersimpan:</p>
                  <div className="flex flex-wrap gap-1">
                    {submittedNums.map((qn) => (
                      <span
                        key={qn}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                      >
                        ✓ {qn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
