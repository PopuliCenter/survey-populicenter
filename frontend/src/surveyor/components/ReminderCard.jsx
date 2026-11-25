/**
 * ReminderCard — kartu pengingat satu baris di atas Daftar Survei TPD
 * (izin/GPS/notifikasi/pembaruan). Satu tindakan + tutup (tunda).
 *
 * @param {{
 *   icon: string,
 *   title: string,
 *   desc: string,
 *   actionLabel: string,
 *   onAction: () => void,
 *   onDismiss?: () => void,
 *   busy?: boolean,
 * }} props
 */
import React from 'react';
import Icon from '../../components/Icon';

function ReminderCard({ icon, title, desc, actionLabel, onAction, onDismiss, busy = false }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3" role="region" aria-label={title}>
      <span className="shrink-0 w-10 h-10 rounded-full bg-accent-50 text-accent-700 flex items-center justify-center" aria-hidden="true">
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-600">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className="shrink-0 min-h-[40px] px-3 rounded-lg text-sm font-semibold text-accent-700 bg-accent-50 hover:bg-accent-100 disabled:opacity-60"
      >
        {busy ? '…' : actionLabel}
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Tutup pengingat: ${title}`}
          className="shrink-0 min-h-[40px] min-w-[32px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default ReminderCard;
