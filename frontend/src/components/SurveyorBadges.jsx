import React, { useEffect, useState } from 'react';
import QuotaProgress from './QuotaProgress';
import api from '../services/api';

// ─── Status Badge ─────────────────────────────────────────────────────────────
/**
 * Renders a colored badge for surveyor active/inactive status.
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
 * Expandable panel showing quota summary per survey for a surveyor.
 *
 * @param {{ surveyorId: string | number }} props
 */
export function QuotaPanel({ surveyorId }) {
  const [quotas, setQuotas] = useState([]);
  const [questionnaireMap, setQuestionnaireMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get(`/surveyors/${surveyorId}/quota`),
      api.get(`/surveyors/${surveyorId}/questionnaire-numbers`),
    ])
      .then(([quotaRes, qnRes]) => {
        if (!cancelled) {
          setQuotas(quotaRes.data);
          setQuestionnaireMap(qnRes.data || {});
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

    return () => {
      cancelled = true;
    };
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
        Belum ada data kuota untuk surveyor ini.
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Ringkasan Kuota per Survei
      </p>
      <div className="space-y-3">
        {quotas.map((item) => (
          <div key={item.survey_id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-sm font-medium text-gray-800 mb-2 truncate" title={item.survey_title}>
              {item.survey_title}
            </p>
            <QuotaProgress filled={item.filled} quota={item.quota} showLabel />
            {/* Nomor kuesioner yang sudah tersimpan */}
            {questionnaireMap[item.survey_id] && questionnaireMap[item.survey_id].length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Nomor kuesioner tersimpan:</p>
                <div className="flex flex-wrap gap-1">
                  {questionnaireMap[item.survey_id].map((qn) => (
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
        ))}
      </div>
    </div>
  );
}
