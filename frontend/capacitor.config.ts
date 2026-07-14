import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.populicenter.survey',
  appName: 'Survei Populi Center',
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
      // Latar putih + ikon gelap (style LIGHT = konten gelap untuk latar terang)
      // agar jam/baterai/sinyal jelas & menyatu dengan header — kesan enterprise.
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    // Mixed content dimatikan (keamanan rilis): aset di-bundle (skema capacitor)
    // & API lewat CapacitorHttp native, jadi tak ada subresource HTTP di laman
    // HTTPS. Catatan: bila SUATU SAAT memakai live-reload dev via server.url
    // berbasis http, set true sementara untuk dev saja.
    allowMixedContent: false,
    captureInput: true,
    // webContentsDebuggingEnabled sengaja TIDAK di-set:
    // Capacitor otomatis MENONAKTIFKAN inspeksi WebView di build "release"
    // (apk rilis) dan hanya mengaktifkannya di build "debug". Menyetelnya
    // ke true secara eksplisit justru memaksa debugging menyala di rilis.
  },
};

export default config;
