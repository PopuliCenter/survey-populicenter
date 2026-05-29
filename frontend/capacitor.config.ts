import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.populicenter.survey',
  appName: 'Populi Survey',
  webDir: 'dist',
  server: {
    cleartext: true,
    // JANGAN ubah androidScheme — biarkan default 'https' agar localStorage persist
  },
  plugins: {
    CapacitorHttp: {
      // Native HTTP engine — bypass CORS di WebView sepenuhnya
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#f9fafb',
      showSpinner: true,
      spinnerColor: '#2563eb',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#2563eb',
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    // webContentsDebuggingEnabled sengaja TIDAK di-set:
    // Capacitor otomatis MENONAKTIFKAN inspeksi WebView di build "release"
    // (apk rilis) dan hanya mengaktifkannya di build "debug". Menyetelnya
    // ke true secara eksplisit justru memaksa debugging menyala di rilis.
  },
};

export default config;
