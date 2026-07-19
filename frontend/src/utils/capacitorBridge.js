/**
 * capacitorBridge.js
 *
 * Utility untuk mendeteksi apakah app berjalan di Capacitor (native Android)
 * dan menyediakan akses ke native API melalui Capacitor plugins.
 *
 * Jika berjalan di browser biasa, fallback ke Web API standar.
 */

/**
 * Cek apakah app berjalan di dalam Capacitor native shell.
 * @returns {boolean}
 */
export function isNativePlatform() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;
}

/**
 * Cek apakah platform adalah Android.
 * @returns {boolean}
 */
export function isAndroid() {
  return isNativePlatform() && window.Capacitor?.getPlatform?.() === 'android';
}

/**
 * Get current platform: 'android', 'ios', or 'web'.
 * @returns {string}
 */
export function getPlatform() {
  if (!isNativePlatform()) return 'web';
  return window.Capacitor?.getPlatform?.() || 'web';
}

/**
 * Request camera permission and take photo using Capacitor Camera plugin.
 * Falls back to file input on web.
 *
 * @returns {Promise<{ dataUrl: string, blob: Blob } | null>}
 */
export async function takePhoto() {
  if (!isNativePlatform()) return null; // fallback ke web file input

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      // PENTING: Uri, BUKAN DataUrl. DataUrl menahan seluruh foto sebagai string
      // base64 raksasa di heap JS WebView → di HP RAM kecil (Realme Narzo 50,
      // IQOO) Android membunuh activity saat kamera di depan → app reload dingin
      // → tertendang ke login & jawaban hilang. Uri hanya mengembalikan path
      // file; blob dibaca dari disk saat dibutuhkan (jejak memori kecil).
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 1280,
      height: 1280,
    });

    // webPath: URL lokal yang bisa di-fetch (mis. capacitor://... / file://...)
    const path = image?.webPath || image?.path;
    if (path) {
      const response = await fetch(path);
      const blob = await response.blob();
      return { path, blob };
    }
    return null;
  } catch (err) {
    console.warn('Camera capture failed:', err);
    return null;
  }
}

/**
 * Minta izin MIKROFON & KAMERA di awal (priming), agar dialog izin muncul saat
 * form dibuka — bukan di tengah wawancara (mengganggu, apalagi di web iPhone).
 * GPS tidak perlu di sini: alur startGeo sudah memintanya saat form dibuka.
 *
 * Penolakan BUKAN error: alur masing-masing fitur tetap menangani izin yang
 * ditolak saat benar-benar dipakai.
 *
 * @param {{ audio?: boolean, camera?: boolean }} opts
 */
export async function primeMediaPermissions({ audio = false, camera = false } = {}) {
  // Native: izin kamera lewat plugin Capacitor (dialog OS sekali di awal;
  // takePhoto berikutnya tidak bertanya lagi).
  if (camera && isNativePlatform()) {
    try {
      const { Camera } = await import('@capacitor/camera');
      await Camera.requestPermissions({ permissions: ['camera'] });
    } catch { /* non-kritis */ }
  }

  // getUserMedia memicu dialog izin browser/OS; track langsung dihentikan.
  // Web: audio+video digabung satu panggilan → satu dialog (lebih ramah iOS).
  const wantVideo = camera && !isNativePlatform();
  if (!audio && !wantVideo) return;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      ...(audio ? { audio: true } : {}),
      ...(wantVideo ? { video: true } : {}),
    });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Gabungan bisa gagal total bila salah satu perangkat tak ada (mis. laptop
    // tanpa kamera) — coba audio saja agar izin rekaman tetap ter-prime.
    if (audio && wantVideo) {
      try {
        const s2 = await navigator.mediaDevices.getUserMedia({ audio: true });
        s2.getTracks().forEach((t) => t.stop());
      } catch { /* ditolak/tak tersedia — abaikan */ }
    }
  }
}

/**
 * Minta izin LOKASI di awal (priming) — dipakai layar izin pertama-kali agar
 * dialog GPS tidak muncul di tengah wawancara. Penolakan bukan error.
 */
export async function primeLocationPermission() {
  if (isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      await Geolocation.requestPermissions();
    } catch { /* ditolak/tak tersedia — abaikan */ }
    return;
  }
  // Web: prompt hanya muncul lewat panggilan getCurrentPosition (butuh gesture
  // pengguna — tombol layar izin memenuhinya). Hasil posisinya dibuang.
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      navigator.geolocation.getCurrentPosition(finish, finish, { timeout: 8000, maximumAge: 60000 });
      setTimeout(finish, 9000); // jaring pengaman bila callback tak terpanggil
    } catch { finish(); }
  });
}

/**
 * Get current geolocation using Capacitor Geolocation plugin.
 * Falls back to browser Geolocation API on web.
 *
 * @param {{ timeout?: number }} options
 * @returns {Promise<{ lat: number, lng: number, accuracy: number } | null>}
 */
export async function getCurrentPosition(options = {}) {
  if (!isNativePlatform()) return null; // fallback ke browser API

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    try { await Geolocation.requestPermissions(); } catch { /* lanjut — getCurrentPosition akan gagal jika ditolak */ }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      // Timeout lebih panjang untuk kondisi offline (fix satelit bisa lambat).
      timeout: options.timeout || 30000,
      maximumAge: options.maximumAge != null ? options.maximumAge : 0,
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch (err) {
    console.warn('Geolocation failed:', err);
    return null;
  }
}

/**
 * Pantau posisi terus-menerus (watchPosition). Berguna untuk mendapatkan fix
 * GPS offline yang lambat: pantau di latar belakang selama wawancara berlangsung.
 *
 * @param {(pos: { lat: number, lng: number, accuracy: number }) => void} onUpdate
 * @param {{ timeout?: number }} options
 * @returns {Promise<() => void>} fungsi untuk menghentikan pantauan
 */
export async function watchPosition(onUpdate, options = {}) {
  // Web / non-native → navigator.geolocation.watchPosition
  if (!isNativePlatform()) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
    const id = navigator.geolocation.watchPosition(
      (pos) => onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => { /* abaikan error; tetap memantau */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: options.timeout || 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }

  // Native → plugin Capacitor Geolocation
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    try { await Geolocation.requestPermissions(); } catch { /* lanjut */ }
    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: options.timeout || 30000 },
      (position, err) => {
        if (err || !position) return;
        onUpdate({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      }
    );
    return () => {
      try { Geolocation.clearWatch({ id: watchId }); } catch { /* abaikan */ }
    };
  } catch (err) {
    console.warn('Geolocation watch failed:', err);
    return () => {};
  }
}

/**
 * Check network status using Capacitor Network plugin.
 * Falls back to navigator.onLine on web.
 *
 * @returns {Promise<{ connected: boolean, connectionType: string }>}
 */
export async function getNetworkStatus() {
  if (!isNativePlatform()) {
    return { connected: navigator.onLine, connectionType: 'unknown' };
  }

  try {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType,
    };
  } catch {
    return { connected: navigator.onLine, connectionType: 'unknown' };
  }
}

/**
 * Pantau perubahan status jaringan. Native: plugin @capacitor/network
 * (akurat di WebView Android). Web: event 'online'/'offline'.
 *
 * @param {(status: { connected: boolean, connectionType: string }) => void} callback
 * @returns {Promise<() => void>} fungsi berhenti memantau
 */
export async function addNetworkListener(callback) {
  if (!isNativePlatform()) {
    const on = () => callback({ connected: true, connectionType: 'unknown' });
    const off = () => callback({ connected: false, connectionType: 'none' });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }

  try {
    const { Network } = await import('@capacitor/network');
    const handle = await Network.addListener('networkStatusChange', (status) => {
      callback({ connected: status.connected, connectionType: status.connectionType });
    });
    return () => { try { handle.remove(); } catch { /* abaikan */ } };
  } catch {
    return () => {};
  }
}

/**
 * Getaran umpan balik (haptics). Hanya aktif di native; no-op di web.
 * @param {'success'|'warning'|'error'|'light'} kind
 */
export async function hapticNotify(kind = 'success') {
  if (!isNativePlatform()) return;
  try {
    const { Haptics, NotificationType, ImpactStyle } = await import('@capacitor/haptics');
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      const type = kind === 'success'
        ? NotificationType.Success
        : kind === 'warning'
          ? NotificationType.Warning
          : NotificationType.Error;
      await Haptics.notification({ type });
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch { /* non-kritis */ }
}

/**
 * Pantau saat aplikasi kembali ke depan (resume). Native: event 'resume'
 * (@capacitor/app). Web: 'visibilitychange' → visible.
 *
 * @param {() => void} callback
 * @returns {Promise<() => void>} fungsi berhenti memantau
 */
export async function addResumeListener(callback) {
  if (!isNativePlatform()) {
    const handler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') callback();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }

  try {
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('resume', () => callback());
    return () => { try { listener.remove(); } catch { /* abaikan */ } };
  } catch {
    return () => {};
  }
}

/**
 * Versi aplikasi untuk ditampilkan. Native: dari APK (versionName + build) via
 * @capacitor/app — sumber kebenaran yang sama dengan yang dilihat di Play.
 * Web/PWA: dari package.json (di-inject saat build sebagai __APP_VERSION__).
 *
 * @returns {Promise<{ version: string, build: string }>}
 */
export async function getAppVersion() {
  if (isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      return { version: info.version || '', build: info.build != null ? String(info.build) : '' };
    } catch { /* fallback ke versi web */ }
  }
  const webVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
  return { version: webVersion, build: '' };
}

/**
 * Set status bar style for Android.
 * @param {{ style?: 'DARK' | 'LIGHT', color?: string }} options
 */
export async function setStatusBarStyle(options = {}) {
  if (!isAndroid()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (options.color) {
      await StatusBar.setBackgroundColor({ color: options.color });
    }
    await StatusBar.setStyle({
      style: options.style === 'DARK' ? Style.Dark : Style.Light,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Handle Android back button behavior.
 * @param {() => boolean} handler - Return true to prevent default back behavior
 */
export async function addBackButtonListener(handler) {
  if (!isAndroid()) return () => {};

  try {
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('backButton', ({ canGoBack }) => {
      const handled = handler();
      if (!handled && canGoBack) {
        window.history.back();
      } else if (!handled) {
        App.exitApp();
      }
    });
    return () => listener.remove();
  } catch {
    return () => {};
  }
}
