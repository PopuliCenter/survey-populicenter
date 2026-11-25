/**
 * SetupReminders — satu kartu pengingat kesiapan HP (GPS, izin lokasi,
 * notifikasi, kamera & mikrofon) di atas Daftar Survei. Logika di
 * utils/deviceSetup.js.
 *
 * @param {{ refreshSignal?: number, hidden?: boolean }} props
 *   refreshSignal — naikkan untuk membaca ulang status (mis. saat aplikasi
 *   kembali ke depan setelah TPD mengubah pengaturan).
 *   hidden — sembunyikan (mis. saat layar izin pertama-kali masih tampil).
 */
import React, { useCallback, useEffect, useState } from 'react';
import ReminderCard from './ReminderCard';
import {
  buildReminders, dismissReminder, getSetupStatus, readDismissed, runReminderAction,
} from '../../utils/deviceSetup';

function SetupReminders({ refreshSignal = 0, hidden = false }) {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    setStatus(await getSetupStatus());
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshSignal]);

  if (hidden) return null;
  const top = buildReminders(status, dismissed)[0];
  if (!top) return null;

  async function act() {
    setBusyId(top.id);
    try {
      await runReminderAction(top.id);
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  return (
    <ReminderCard
      icon={top.icon}
      title={top.title}
      desc={top.desc}
      actionLabel={top.action}
      busy={busyId === top.id}
      onAction={act}
      onDismiss={() => setDismissed(dismissReminder(top.id))}
    />
  );
}

export default SetupReminders;
