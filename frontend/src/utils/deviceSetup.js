/**
 * deviceSetup.js — kartu pengingat kesiapan HP TPD di Daftar Survei.
 *
 * Status dibaca dari plugin native DeviceSetup (DeviceSetupPlugin.java, APK
 * code ≥ 30). APK lama/web → status null → tak ada kartu (tak menebak).
 *
 * Urutan kartu (hanya SATU yang tampil; yang lain muncul setelah beres/ditunda):
 *   GPS mati → izin lokasi → notifikasi → kamera & mikrofon.
 * Kartu pembaruan aplikasi ditangani AppUpdatePrompt (selalu di atas).
 */

import { registerPlugin } from '@capacitor/core';
import { isNativePlatform, primeMediaPermissions } from './capacitorBridge';
import { localStore } from './safeStorage';
import { retryPushRegistration } from './pushNotifications';

const DeviceSetup = registerPlugin('DeviceSetup');

const DISMISS_KEY = 'setup_reminders_dismissed';
export const REMINDER_SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Isi kartu — teks dari sisi TPD, satu tindakan per kartu. */
export const REMINDERS = {
  gps: {
    id: 'gps',
    icon: 'target',
    title: 'GPS mati',
    desc: 'Nyalakan lokasi — wawancara di aplikasi wajib berkoordinat.',
    action: 'Nyalakan',
  },
  location: {
    id: 'location',
    icon: 'map',
    title: 'Izinkan lokasi',
    desc: 'Dibutuhkan untuk menandai titik setiap wawancara.',
    action: 'Izinkan',
  },
  notifications: {
    id: 'notifications',
    icon: 'mail',
    title: 'Nyalakan notifikasi',
    desc: 'Biar tahu saat ada pesan admin atau pembaruan aplikasi.',
    action: 'Aktifkan',
  },
  media: {
    id: 'media',
    icon: 'camera',
    title: 'Izinkan kamera & mikrofon',
    desc: 'Untuk foto dan rekaman wawancara.',
    action: 'Izinkan',
  },
};

/**
 * Kartu yang perlu tampil, terurut (fungsi murni).
 * @param {null|{notifications:boolean,location:boolean,locationService:boolean,camera:boolean,microphone:boolean}} status
 * @param {Record<string, number>} dismissed id → waktu ditunda (ms)
 * @param {number} now
 */
export function buildReminders(status, dismissed = {}, now = Date.now()) {
  if (!status) return [];
  const list = [];
  if (status.locationService === false) list.push(REMINDERS.gps);
  if (status.location === false) list.push(REMINDERS.location);
  if (status.notifications === false) list.push(REMINDERS.notifications);
  if (status.camera === false || status.microphone === false) list.push(REMINDERS.media);
  return list.filter((r) => !(dismissed[r.id] && now - dismissed[r.id] < REMINDER_SNOOZE_MS));
}

export function readDismissed() {
  try { return JSON.parse(localStore.getItem(DISMISS_KEY) || '{}') || {}; } catch { return {}; }
}

export function dismissReminder(id, now = Date.now()) {
  const d = readDismissed();
  d[id] = now;
  try { localStore.setItem(DISMISS_KEY, JSON.stringify(d)); } catch { /* abaikan */ }
  return d;
}

/** Status kesiapan HP, atau null bila tak bisa dibaca (web / APK lama). */
export async function getSetupStatus() {
  if (!isNativePlatform()) return null;
  try {
    return await DeviceSetup.getStatus();
  } catch {
    return null;
  }
}

async function openSettings(target) {
  try { await DeviceSetup.openSettings({ target }); } catch { /* abaikan */ }
}

/**
 * Jalankan tindakan kartu: minta izin lewat dialog Android; bila Android sudah
 * tak memunculkannya lagi (ditolak permanen), buka halaman pengaturan yang tepat.
 * Pemanggil membaca ulang status sesudahnya (dan saat aplikasi kembali ke depan).
 */
export async function runReminderAction(id) {
  if (id === 'gps') {
    await openSettings('location');
    return;
  }
  if (id === 'location') {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const res = await Geolocation.requestPermissions();
      if (res.location === 'granted' || res.coarseLocation === 'granted') return;
    } catch { /* jatuh ke pengaturan */ }
    await openSettings('app');
    return;
  }
  if (id === 'notifications') {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const res = await PushNotifications.requestPermissions();
      if (res.receive === 'granted') {
        await retryPushRegistration();
        const after = await getSetupStatus();
        if (!after || after.notifications) return; // kanal pesan juga menyala
      }
    } catch { /* jatuh ke pengaturan */ }
    await openSettings('notifications');
    return;
  }
  if (id === 'media') {
    try {
      const { Camera } = await import('@capacitor/camera');
      await Camera.requestPermissions({ permissions: ['camera'] });
    } catch { /* lanjut ke mikrofon */ }
    await primeMediaPermissions({ audio: true });
    const after = await getSetupStatus();
    if (after && (!after.camera || !after.microphone)) await openSettings('app');
  }
}
