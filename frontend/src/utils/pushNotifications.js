/**
 * pushNotifications.js — registrasi push FCM di APK Android (Capacitor).
 *
 * Push hanya LAPISAN PEMBANGUNKAN HP: kotak pesan dalam-aplikasi (ikon amplop;
 * tpd_notifications di server) tetap sumber kebenaran, jadi TPD yang menolak
 * izin notifikasi tidak kehilangan apa pun selain nada & getaran HP-nya.
 *
 * Alur: minta izin (Android 13+ berupa dialog) → register ke FCM → token yang
 * diterima disetor ke server (POST /notifications/fcm-token). Saat push tiba
 * ketika aplikasi SEDANG DIBUKA (Android tidak menampilkan notifikasi sistem
 * untuk kondisi itu), tampilkan toast + beri tahu pemanggil agar kotak pesan
 * di-refresh.
 *
 * Semua kegagalan di sini senyap — di web/browser fungsi ini no-op.
 */

import { Capacitor } from '@capacitor/core';
import api from '../services/api';
import { toastInfo } from './toastBus';

let initialized = false;

// Kanal Android untuk SEMUA pesan: push dari server (backend/src/utils/push.js
// mengirim channelId yang sama) dan notifikasi lokal "cermin" saat push tiba
// ketika aplikasi SEDANG DI DEPAN. Importance 5 = banner + nada + getar.
//
// Nada & getar sebuah kanal TERKUNCI sejak kanal pertama dibuat (Android 8+):
// mengganti nada = id kanal BARU. Kanal lama 'populi-pesan' (nada bawaan, tanpa
// getar) dihapus agar pengaturan aplikasi tak menampilkan dua kanal pesan.
export const PESAN_CHANNEL_ID = 'pesan-masuk';
// Berkas android/app/src/main/res/raw/pesan_masuk.wav (dijaga keep.xml dari
// shrinkResources). Plugin membuang ekstensinya sendiri.
export const PESAN_SOUND = 'pesan_masuk.wav';
const OLD_CHANNEL_ID = 'populi-pesan';

async function mirrorToTray(title, body) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        // id int 32-bit unik per notifikasi (detik epoch cukup unik untuk ini).
        id: Math.floor(Date.now() / 1000) % 2147483647,
        channelId: PESAN_CHANNEL_ID,
        // Android 7 (tanpa kanal) memakai nada per-notifikasi ini.
        sound: PESAN_SOUND,
        title: String(title || 'Populi Survey').slice(0, 200),
        body: String(body || '').slice(0, 1000),
        // Ikon KECIL (bilah status) = siluet putih; ikon BESAR (di dalam
        // notifikasi) = ikon aplikasi berwarna agar identitas app terlihat.
        smallIcon: 'ic_stat_notify',
        largeIcon: 'ic_launcher',
        iconColor: '#EA580C',
      }],
    });
  } catch {
    // Plugin absen / izin dicabut — toast + kotak pesan tetap jalan.
  }
}

/**
 * Inisialisasi push di perangkat native. Aman dipanggil berulang (sekali per
 * masa hidup aplikasi yang benar-benar jalan).
 *
 * @param {{ onNotificationReceived?: () => void }} [opts]
 *   onNotificationReceived: dipanggil saat push tiba ketika aplikasi terbuka
 *   (dipakai SurveyList untuk menyegarkan kotak pesan tanpa menunggu Perbarui).
 */
/**
 * Bersihkan notifikasi aplikasi ini yang masih menumpuk di tray Android.
 * Dipanggil saat TPD menandai semua pemberitahuan dibaca — tray ikut bersih
 * (pola aplikasi chat). Riwayat di server TIDAK tersentuh. No-op di web.
 */
export async function clearDeliveredNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch { /* plugin absen — abaikan */ }
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.removeAllDeliveredNotifications();
  } catch { /* plugin absen — abaikan */ }
}

export async function initPushNotifications(opts = {}) {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return; // TPD menolak — kotak pesan tetap jalan

    // Kanal pesan dibuat di muka: push server menunjuk kanal ini, dan schedule
    // lokal ke kanal yang belum ada dibuang diam-diam oleh Android 8+.
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.createChannel({
        id: PESAN_CHANNEL_ID,
        name: 'Pesan Admin',
        description: 'Pesan satu arah dari admin/supervisor dan peringatan kualitas data',
        importance: 5,
        sound: PESAN_SOUND,
        vibration: true,
      });
      try { await LocalNotifications.deleteChannel({ id: OLD_CHANNEL_ID }); } catch { /* sudah tak ada */ }
    } catch { /* non-kritis */ }

    await PushNotifications.removeAllListeners();

    PushNotifications.addListener('registration', async ({ value }) => {
      try {
        await api.post('/notifications/fcm-token', { token: value, platform: 'android' });
      } catch {
        // Offline / server sibuk — token akan disetor ulang pada init berikutnya.
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      // Aplikasi sedang di depan → Android tak menampilkan notifikasi sistem.
      // Terbitkan notifikasi LOKAL ke tray (pola aplikasi chat) supaya
      // perilakunya konsisten dengan saat aplikasi tertutup, plus toast +
      // segarkan kotak pesan.
      const title = notif?.title || notif?.data?.title;
      const body = notif?.body || notif?.data?.body;
      mirrorToTray(title, body);
      if (title) toastInfo(title, { duration: 5000 });
      try { opts.onNotificationReceived?.(); } catch { /* abaikan */ }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // TPD mengetuk notifikasi → aplikasi terbuka; cukup segarkan kotak pesan.
      try { opts.onNotificationReceived?.(); } catch { /* abaikan */ }
    });

    await PushNotifications.register();
  } catch {
    // Plugin tak tersedia / WebView lawas — fitur inti tidak terpengaruh.
    initialized = false;
  }
}
