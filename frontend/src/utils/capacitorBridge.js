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
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      width: 1280,
      height: 1280,
    });

    if (image.dataUrl) {
      // Convert data URL to Blob
      const response = await fetch(image.dataUrl);
      const blob = await response.blob();
      return { dataUrl: image.dataUrl, blob };
    }
    return null;
  } catch (err) {
    console.warn('Camera capture failed:', err);
    return null;
  }
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
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: options.timeout || 15000,
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
