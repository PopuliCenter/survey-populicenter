import React from 'react';

// ─── Status Badge ─────────────────────────────────────────────────────────────
/**
 * Renders a colored badge for survey status.
 * draft = gray, active = green, inactive = yellow
 *
 * @param {{ status: 'draft' | 'active' | 'inactive' }} props
 */
export function SurveyStatusBadge({ status }) {
  const map = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-yellow-100 text-yellow-700',
  };
  const label = {
    draft: 'Draft',
    active: 'Aktif',
    inactive: 'Nonaktif',
  };
  const cls = map[status] || map.draft;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
    >
      {label[status] || status}
    </span>
  );
}

// ─── Temporal Badge ───────────────────────────────────────────────────────────
/**
 * Badge status PERIODE survei berdasarkan start_date dan end_date.
 * - "Akan Datang" (biru): start_date di masa depan
 * - "Berjalan" (teal): dalam periode tanggal
 * - "Berakhir" (merah): end_date di masa lalu
 * - null: survei tanpa start/end date — tak ada info periode, jangan render.
 *
 * Sengaja TIDAK memakai kata "Aktif" & warna hijau: itu milik SurveyStatusBadge
 * (status yang disetel admin). Dua badge "Aktif" hijau berdampingan membingungkan,
 * apalagi kombinasi "Nonaktif"+"Aktif" yang tampak kontradiktif.
 *
 * @param {{ startDate: string|null, endDate: string|null }} props
 */
export function TemporalBadge({ startDate, endDate }) {
  if (!startDate && !endDate) return null;

  const now = new Date();

  if (startDate && new Date(startDate) > now) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
        Akan Datang
      </span>
    );
  }

  if (endDate && new Date(endDate) < now) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        Berakhir
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200"
      title="Dalam periode tanggal survei"
    >
      Berjalan
    </span>
  );
}
