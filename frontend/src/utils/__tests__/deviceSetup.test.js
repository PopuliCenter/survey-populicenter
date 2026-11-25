/**
 * deviceSetup — urutan & penundaan kartu pengingat kesiapan HP TPD.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { buildReminders, dismissReminder, readDismissed, REMINDER_SNOOZE_MS } from '../deviceSetup';

const allOk = { notifications: true, location: true, locationService: true, camera: true, microphone: true };

describe('buildReminders', () => {
  test('status tak terbaca (web / APK lama) → tanpa kartu', () => {
    expect(buildReminders(null)).toEqual([]);
  });

  test('semua beres → tanpa kartu', () => {
    expect(buildReminders(allOk)).toEqual([]);
  });

  test('urutan: GPS mati → izin lokasi → notifikasi → kamera & mikrofon', () => {
    const ids = buildReminders({ notifications: false, location: false, locationService: false, camera: true, microphone: false })
      .map((r) => r.id);
    expect(ids).toEqual(['gps', 'location', 'notifications', 'media']);
  });

  test('kamera ATAU mikrofon belum diizinkan → satu kartu media', () => {
    expect(buildReminders({ ...allOk, camera: false }).map((r) => r.id)).toEqual(['media']);
  });

  test('kartu yang ditunda hilang 24 jam lalu muncul lagi', () => {
    const status = { ...allOk, notifications: false };
    const dismissed = { notifications: 1_000 };
    expect(buildReminders(status, dismissed, 1_000 + REMINDER_SNOOZE_MS - 1)).toEqual([]);
    expect(buildReminders(status, dismissed, 1_000 + REMINDER_SNOOZE_MS + 1).map((r) => r.id)).toEqual(['notifications']);
  });
});

describe('penundaan tersimpan', () => {
  beforeEach(() => localStorage.clear());

  test('dismissReminder menyimpan per id', () => {
    dismissReminder('gps', 5);
    dismissReminder('media', 7);
    expect(readDismissed()).toEqual({ gps: 5, media: 7 });
  });

  test('isi rusak → dianggap kosong', () => {
    localStorage.setItem('setup_reminders_dismissed', '{rusak');
    expect(readDismissed()).toEqual({});
  });
});
