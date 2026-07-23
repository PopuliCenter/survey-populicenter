/**
 * pushNotifications.js — registrasi push FCM di APK Android (Capacitor).
 *
 * Push hanya LAPISAN PEMBANGUNKAN HP: lonceng dalam-aplikasi (tpd_notifications
 * di server) tetap sumber kebenaran, jadi TPD yang menolak izin notifikasi
 * tidak kehilangan apa pun selain getaran HP-nya.
 *
 * Alur: minta izin (Android 13+ berupa dialog) → register ke FCM → token yang
 * diterima disetor ke server (POST /notifications/fcm-token). Saat push tiba
 * ketika aplikasi SEDANG DIBUKA (Android tidak menampilkan notifikasi sistem
 * untuk kondisi itu), tampilkan toast + beri tahu pemanggil agar lonceng
 * di-refresh.
 *
 * Semua kegagalan di sini senyap — di web/browser fungsi ini no-op.
 */

import { Capacitor } from '@capacitor/core';
import api from '../services/api';
import { toastInfo } from './toastBus';

let initialized = false;

/**
 * Inisialisasi push di perangkat native. Aman dipanggil berulang (sekali per
 * masa hidup aplikasi yang benar-benar jalan).
 *
 * @param {{ onNotificationReceived?: () => void }} [opts]
 *   onNotificationReceived: dipanggil saat push tiba ketika aplikasi terbuka
 *   (dipakai SurveyList untuk menyegarkan lonceng tanpa menunggu Perbarui).
 */
export async function initPushNotifications(opts = {}) {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return; // TPD menolak — lonceng tetap jalan

    await PushNotifications.removeAllListeners();

    PushNotifications.addListener('registration', async ({ value }) => {
      try {
        await api.post('/notifications/fcm-token', { token: value, platform: 'android' });
      } catch {
        // Offline / server sibuk — token akan disetor ulang pada init berikutnya.
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      // Aplikasi sedang di depan → Android tak menampilkan notifikasi sistem;
      // tampilkan toast singkat + segarkan lonceng.
      const title = notif?.title || notif?.data?.title;
      if (title) toastInfo(title, { duration: 5000 });
      try { opts.onNotificationReceived?.(); } catch { /* abaikan */ }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // TPD mengetuk notifikasi → aplikasi terbuka; cukup segarkan lonceng.
      try { opts.onNotificationReceived?.(); } catch { /* abaikan */ }
    });

    await PushNotifications.register();
  } catch {
    // Plugin tak tersedia / WebView lawas — fitur inti tidak terpengaruh.
    initialized = false;
  }
}
