import React from 'react';

// ─── Status Badge ─────────────────────────────────────────────────────────────
/**
 * Renders a colored badge for survey status.
 * draft = gray, active = green, inactive = yellow
 *
 * @param {{ status: 'draft' | 'active' | 'inactive' }} props
 */
export function SurveyStatusBadge({ status }) {
  const dot = {
    draft: 'bg-gray-400',
    active: 'bg-green-500',
    inactive: 'bg-yellow-400',
  };
  const label = {
    draft: 'Draft',
    active: 'Aktif',
    inactive: 'Nonaktif',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] || dot.draft}`} aria-hidden="true" />
      {label[status] || status}
    </span>
  );
}

// ─── Temporal Badge ───────────────────────────────────────────────────────────
/**
 * Badge status PERIODE survei berdasarkan start_date dan end_date.
 * - "Akan Datang": start_date di masa depan
 * - "Berjalan": dalam periode tanggal
 * - "Berakhir": end_date di masa lalu
 * - null: survei tanpa start/end date — tak ada info periode, jangan render.
 *
 * Sengaja teks polos tanpa titik & tanpa kata "Aktif": itu milik SurveyStatusBadge
 * (status yang disetel admin). Dua penanda "Aktif" berdampingan membingungkan,
 * apalagi kombinasi "Nonaktif"+"Aktif" yang tampak kontradiktif.
 *
 * @param {{ startDate: string|null, endDate: string|null }} props
 */
export function TemporalBadge({ startDate, endDate }) {
  if (!startDate && !endDate) return null;

  const now = new Date();

  if (startDate && new Date(startDate) > now) {
    return (
      <span className="text-xs text-gray-600 whitespace-nowrap">
        Akan Datang
      </span>
    );
  }

  if (endDate && new Date(endDate) < now) {
    return (
      <span className="text-xs font-medium text-red-700 whitespace-nowrap">
        Berakhir
      </span>
    );
  }

  return (
    <span
      className="text-xs text-gray-600 whitespace-nowrap"
      title="Dalam periode tanggal survei"
    >
      Berjalan
    </span>
  );
}
